import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

// --- Types & In-Memory Structures ---

export interface Participant {
  sessionId: string;
  socketId: string;
  name: string;
  isOwner: boolean;
  canInvite: boolean;
  avatarColor: string;
  joinedAt: number;
  lastSeen: number;
  online: boolean;
}

export interface MessageMedia {
  fileId: string;
  type: 'image' | 'file' | 'gif' | 'sticker';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
  localPath?: string;
}

export interface Message {
  id: string;
  senderSessionId: string;
  senderName: string;
  senderIsOwner: boolean;
  text: string;
  media?: MessageMedia;
  timestamp: number;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  } | null;
  reactions: { [emoji: string]: string[] }; // emoji -> array of participant names
  expiresAt?: number | null;
  edited?: boolean;
}

export interface ActiveCall {
  active: boolean;
  isAudioOnly: boolean;
  initiatedBySessionId: string;
  initiatedByName: string;
  participants: Set<string>; // set of sessionIds
  startedAt: number;
}

export interface Room {
  id: string;
  code: string; // 8-character uppercase alphanumeric code (e.g. K7M4P9XA)
  name: string;
  inviteToken: string;
  ownerSessionId: string;
  createdAt: number;
  expiresAt: number;
  lifetimeMinutes: number;
  disappearingTimerSec: number; // 0 = off, 10, 30, 300
  participants: Map<string, Participant>; // sessionId -> Participant
  messages: Message[];
  mediaFiles: Map<string, { path: string; name: string; mimeType: string }>;
  terminated: boolean;
  ownerDisconnectTimer?: NodeJS.Timeout;
  activeCall?: ActiveCall | null;
}

// In-Memory Storage
const rooms = new Map<string, Room>();

// Storage directory for temporary uploads
const TEMP_UPLOAD_DIR = path.resolve(process.cwd(), 'temp_uploads');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

// Multer setup for temporary uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, TEMP_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
  },
});

// App & Server Setup
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e7,
});

app.use(express.json());

// 8-character uppercase alphanumeric without O, 0, I, 1 (32 unambiguous chars)
const SHORT_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateShortInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    const randIndex = crypto.randomInt(0, SHORT_CODE_CHARSET.length);
    code += SHORT_CODE_CHARSET[randIndex];
  }
  return code;
}

function getUniqueRoomCode(): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = generateShortInviteCode();
    let collision = false;
    for (const r of rooms.values()) {
      if (!r.terminated && (r.code === code || r.id === code)) {
        collision = true;
        break;
      }
    }
    if (!collision) return code;
  }
  return generateShortInviteCode();
}

const AVATAR_COLORS = [
  '#4a6b53', // Sage
  '#5a6b7c', // Slate blue
  '#7c6853', // Warm cedar
  '#65537c', // Muted dusk
  '#7c5353', // Muted clay
  '#476963', // Deep pine
];

function getRandomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// Clean up a room and its temporary media completely
function destroyRoom(roomId: string, reason = 'Room ended') {
  const room = rooms.get(roomId);
  if (!room) return;

  room.terminated = true;

  if (room.ownerDisconnectTimer) {
    clearTimeout(room.ownerDisconnectTimer);
  }

  // Terminate active call if any
  if (room.activeCall?.active) {
    io.to(roomId).emit('call:ended', {
      reason: 'Room has ended.',
    });
    room.activeCall = null;
  }

  // Broadcast termination to everyone
  io.to(roomId).emit('room:terminated', {
    message: 'That was nice. This conversation has ended. Nothing was saved.',
    reason,
  });

  // Disconnect all sockets in this room
  io.in(roomId).disconnectSockets(true);

  // Delete all temporary uploaded files from disk
  for (const [, media] of room.mediaFiles) {
    try {
      if (fs.existsSync(media.path)) {
        fs.unlinkSync(media.path);
      }
    } catch (err) {
      console.error(`Error deleting temp file ${media.path}:`, err);
    }
  }

  // Clear all RAM data
  room.participants.clear();
  room.messages = [];
  room.mediaFiles.clear();
  rooms.delete(roomId);
  console.log(`[EPHEMERAL] Room ${roomId} (Code: ${room.code}) completely purged from memory and disk.`);
}

// --- REST API Endpoints ---

// WebRTC ICE Configuration (Free Google STUN + optional TURN from env)
app.get('/api/rtc-config', (_req: Request, res: Response) => {
  const iceServers: any[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  if (process.env.TURN_URL) {
    const turnServer: any = {
      urls: process.env.TURN_URL,
    };
    if (process.env.TURN_USERNAME) {
      turnServer.username = process.env.TURN_USERNAME;
    }
    if (process.env.TURN_CREDENTIAL) {
      turnServer.credential = process.env.TURN_CREDENTIAL;
    }
    iceServers.push(turnServer);
  }

  res.json({
    iceServers,
    turnConfigured: Boolean(process.env.TURN_URL),
  });
});

// Direct invitation link route: /join/K7M4P9XA
app.get('/join/:code', (req: Request, res: Response) => {
  const code = (req.params.code || '').trim().toUpperCase();
  res.redirect(`/?join=${encodeURIComponent(code)}`);
});

// 1. Create a new room
app.post('/api/rooms', (req: Request, res: Response) => {
  try {
    const { userName, roomName, lifetimeMinutes } = req.body;

    if (!userName || typeof userName !== 'string' || !userName.trim()) {
      return res.status(400).json({ error: 'Display name is required.' });
    }

    const trimmedUser = userName.trim().slice(0, 30);
    const trimmedRoom = (roomName && typeof roomName === 'string' && roomName.trim())
      ? roomName.trim().slice(0, 40)
      : 'Quiet Space';

    const lifetime = Number(lifetimeMinutes) || 60; // default 1 hour
    const validLifetime = Math.min(Math.max(lifetime, 5), 1440); // 5 mins to 24h

    // Generate unique 8-character code as both room ID and invite code
    const code = getUniqueRoomCode();
    const roomId = code;
    const ownerSessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + validLifetime * 60 * 1000;

    const newRoom: Room = {
      id: roomId,
      code,
      name: trimmedRoom,
      inviteToken: code,
      ownerSessionId,
      createdAt: now,
      expiresAt,
      lifetimeMinutes: validLifetime,
      disappearingTimerSec: 0,
      participants: new Map(),
      messages: [],
      mediaFiles: new Map(),
      terminated: false,
    };

    // Add owner to participants map immediately
    newRoom.participants.set(ownerSessionId, {
      sessionId: ownerSessionId,
      socketId: '',
      name: trimmedUser,
      isOwner: true,
      canInvite: true,
      avatarColor: getRandomAvatarColor(),
      joinedAt: now,
      lastSeen: now,
      online: false,
    });

    rooms.set(roomId, newRoom);

    return res.status(201).json({
      roomId: newRoom.id,
      roomCode: newRoom.code,
      roomName: newRoom.name,
      inviteCode: newRoom.code,
      inviteToken: newRoom.inviteToken,
      sessionId: ownerSessionId,
      isOwner: true,
      expiresAt,
    });
  } catch (err: any) {
    console.error('Room creation error:', err);
    return res.status(500).json({ error: 'Failed to create room.' });
  }
});

// 2. Check room status before joining (supports case-insensitive lookup by code or id)
app.get('/api/rooms/:id/check', (req: Request, res: Response) => {
  const rawId = (req.params.id || '').trim();
  const upperId = rawId.toUpperCase();
  const { sessionId } = req.query;

  // Search in memory by exact ID, uppercase ID, or room code
  let room = rooms.get(rawId) || rooms.get(upperId);
  if (!room) {
    for (const r of rooms.values()) {
      if (!r.terminated && (r.id.toUpperCase() === upperId || r.code === upperId)) {
        room = r;
        break;
      }
    }
  }

  if (!room || room.terminated) {
    return res.status(404).json({ error: 'This conversation does not exist or has already ended.' });
  }

  if (Date.now() >= room.expiresAt) {
    destroyRoom(room.id, 'Room lifetime expired');
    return res.status(410).json({ error: 'This room has expired and its contents were cleared.' });
  }

  // If already an existing participant reconnecting
  const existingParticipant = sessionId ? room.participants.get(sessionId as string) : null;

  // Check participant limit (strictly maximum 5 people)
  if (!existingParticipant && room.participants.size >= 5) {
    return res.status(403).json({
      error: 'This room has reached its limit of 5 people. EPHEMERAL keeps spaces intimate.',
      isFull: true,
    });
  }

  return res.json({
    roomId: room.id,
    roomCode: room.code,
    roomName: room.name,
    participantCount: room.participants.size,
    maxParticipants: 5,
    expiresAt: room.expiresAt,
    isOwner: existingParticipant ? existingParticipant.isOwner : false,
    requiresToken: false,
  });
});

// 3. Upload temporary media (image or file)
app.post('/api/rooms/:roomId/upload', upload.single('media'), (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { sessionId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const upperId = roomId.trim().toUpperCase();
  let room = rooms.get(roomId) || rooms.get(upperId);
  if (!room) {
    for (const r of rooms.values()) {
      if (!r.terminated && (r.id.toUpperCase() === upperId || r.code === upperId)) {
        room = r;
        break;
      }
    }
  }

  if (!room || room.terminated) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(404).json({ error: 'Room does not exist or has ended.' });
  }

  const participant = room.participants.get(sessionId);
  if (!participant) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(403).json({ error: 'Unauthorized to upload in this room.' });
  }

  const fileId = crypto.randomUUID();
  const mimeType = req.file.mimetype;
  let type: 'image' | 'file' | 'gif' = 'file';

  if (mimeType.startsWith('image/')) {
    type = 'image';
    if (mimeType === 'image/gif') {
      type = 'gif';
    }
  }

  room.mediaFiles.set(fileId, {
    path: req.file.path,
    name: req.file.originalname,
    mimeType,
  });

  const url = `/api/media/${room.id}/${fileId}`;

  return res.json({
    fileId,
    type,
    url,
    name: req.file.originalname,
    size: req.file.size,
    mimeType,
  });
});

// 4. Serve temporary media
app.get('/api/media/:roomId/:fileId', (req: Request, res: Response) => {
  const { roomId, fileId } = req.params;

  const upperId = roomId.trim().toUpperCase();
  let room = rooms.get(roomId) || rooms.get(upperId);
  if (!room) {
    for (const r of rooms.values()) {
      if (!r.terminated && (r.id.toUpperCase() === upperId || r.code === upperId)) {
        room = r;
        break;
      }
    }
  }

  if (!room || room.terminated) {
    return res.status(404).send('Not found');
  }

  const media = room.mediaFiles.get(fileId);
  if (!media || !fs.existsSync(media.path)) {
    return res.status(404).send('File not found or expired');
  }

  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  return res.sendFile(media.path);
});

// Curated Sticker and GIF list for built-in library
const CURATED_STICKERS = [
  { id: 'st_warm_coffee', name: 'Warm Coffee', emoji: '☕', label: 'Coffee break' },
  { id: 'st_campfire', name: 'Campfire', emoji: '🔥', label: 'Cozy vibes' },
  { id: 'st_gentle_hug', name: 'Gentle Hug', emoji: '🫂', label: 'Big hug' },
  { id: 'st_laugh', name: 'Laughter', emoji: '😄', label: 'So funny' },
  { id: 'st_sparkles', name: 'Sparkles', emoji: '✨', label: 'Pure magic' },
  { id: 'st_peace', name: 'Peace', emoji: '✌️', label: 'Peace out' },
  { id: 'st_listening', name: 'I am listening', emoji: '👂', label: 'All ears' },
  { id: 'st_applause', name: 'Applause', emoji: '👏', label: 'Bravo' },
  { id: 'st_zen', name: 'Quiet Calm', emoji: '🌿', label: 'Breathe' },
  { id: 'st_cat', name: 'Cat Smile', emoji: '🐱', label: 'Purr' },
  { id: 'st_thoughtful', name: 'Thinking', emoji: '🤔', label: 'Interesting' },
  { id: 'st_toast', name: 'Cheers', emoji: '🥂', label: 'Cheers!' },
];

const CURATED_GIFS = [
  {
    id: 'gif_nod',
    title: 'Warm nod of agreement',
    url: 'https://media.giphy.com/media/NEvPzZ8bd1V4Y/giphy.gif',
    preview: 'https://media.giphy.com/media/NEvPzZ8bd1V4Y/200w.gif',
    category: 'agree',
  },
  {
    id: 'gif_applause',
    title: 'Subtle appreciative clapping',
    url: 'https://media.giphy.com/media/nbvFVPiEiJH6hI50HN/giphy.gif',
    preview: 'https://media.giphy.com/media/nbvFVPiEiJH6hI50HN/200w.gif',
    category: 'applause',
  },
  {
    id: 'gif_tea',
    title: 'Sipping tea in peace',
    url: 'https://media.giphy.com/media/3o85xGocUH8RYoDKKs/giphy.gif',
    preview: 'https://media.giphy.com/media/3o85xGocUH8RYoDKKs/200w.gif',
    category: 'peace',
  },
  {
    id: 'gif_laugh',
    title: 'Warm chuckling laugh',
    url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
    preview: 'https://media.giphy.com/media/10JhviFuU2gWD6/200w.gif',
    category: 'laugh',
  },
  {
    id: 'gif_cheers',
    title: 'Raising a glass',
    url: 'https://media.giphy.com/media/Zw3oBUuIg231S/giphy.gif',
    preview: 'https://media.giphy.com/media/Zw3oBUuIg231S/200w.gif',
    category: 'cheers',
  },
  {
    id: 'gif_hug',
    title: 'Comforting warm hug',
    url: 'https://media.giphy.com/media/l8ooTpH62ae44oDHnv/giphy.gif',
    preview: 'https://media.giphy.com/media/l8ooTpH62ae44oDHnv/200w.gif',
    category: 'hug',
  },
  {
    id: 'gif_cat_chill',
    title: 'Cat resting quietly',
    url: 'https://media.giphy.com/media/BzyTuYCmvSORqs1ABM/giphy.gif',
    preview: 'https://media.giphy.com/media/BzyTuYCmvSORqs1ABM/200w.gif',
    category: 'cat',
  },
  {
    id: 'gif_wave',
    title: 'Friendly greeting wave',
    url: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
    preview: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/200w.gif',
    category: 'wave',
  },
];

// 5. GIF & Sticker search endpoint
app.get('/api/media-library', (req: Request, res: Response) => {
  const { query } = req.query;
  const q = typeof query === 'string' ? query.toLowerCase().trim() : '';

  let filteredGifs = CURATED_GIFS;
  if (q) {
    filteredGifs = CURATED_GIFS.filter(g => g.title.toLowerCase().includes(q) || g.category.includes(q));
  }

  return res.json({
    stickers: CURATED_STICKERS,
    gifs: filteredGifs,
  });
});

// --- Socket.IO Real-Time Engine ---

io.on('connection', (socket: Socket) => {
  let currentRoomId: string | null = null;
  let currentSessionId: string | null = null;

  // 1. Join room
  socket.on('room:join', (data: { roomId: string; sessionId?: string; userName: string; token?: string }, callback) => {
    try {
      const rawRoomId = (data.roomId || '').trim();
      const upperRoomId = rawRoomId.toUpperCase();
      let room = rooms.get(rawRoomId) || rooms.get(upperRoomId);
      if (!room) {
        for (const r of rooms.values()) {
          if (!r.terminated && (r.id.toUpperCase() === upperRoomId || r.code === upperRoomId)) {
            room = r;
            break;
          }
        }
      }

      if (!room || room.terminated) {
        return callback?.({ success: false, error: 'Room does not exist or has ended.' });
      }

      if (Date.now() >= room.expiresAt) {
        destroyRoom(room.id, 'Room expired');
        return callback?.({ success: false, error: 'This room has expired.' });
      }

      const roomId = room.id;
      let participant: Participant | undefined;
      let effectiveSessionId = data.sessionId;

      // Existing participant reconnecting?
      if (effectiveSessionId && room.participants.has(effectiveSessionId)) {
        participant = room.participants.get(effectiveSessionId)!;
        participant.socketId = socket.id;
        participant.online = true;
        participant.lastSeen = Date.now();
      } else {
        // Strict capacity check: max 5 participants
        if (room.participants.size >= 5) {
          return callback?.({
            success: false,
            error: 'Room is full (maximum 5 participants allowed).',
          });
        }

        const cleanName = (data.userName || 'Guest').trim().slice(0, 30) || 'Guest';
        effectiveSessionId = crypto.randomUUID();

        participant = {
          sessionId: effectiveSessionId,
          socketId: socket.id,
          name: cleanName,
          isOwner: false,
          canInvite: false,
          avatarColor: getRandomAvatarColor(),
          joinedAt: Date.now(),
          lastSeen: Date.now(),
          online: true,
        };

        room.participants.set(effectiveSessionId, participant);

        // Notify room about new arrival
        socket.to(roomId).emit('participant:joined', {
          name: participant.name,
          participantCount: room.participants.size,
        });
      }

      // If owner was disconnected and had a timer, cancel it
      if (participant.isOwner && room.ownerDisconnectTimer) {
        clearTimeout(room.ownerDisconnectTimer);
        room.ownerDisconnectTimer = undefined;
      }

      currentRoomId = roomId;
      currentSessionId = effectiveSessionId;
      socket.join(roomId);

      // Prepare participants list for client
      const participantsList = Array.from(room.participants.values()).map(p => ({
        sessionId: p.sessionId,
        name: p.name,
        isOwner: p.isOwner,
        canInvite: p.canInvite,
        online: p.online,
        avatarColor: p.avatarColor,
      }));

      // Acknowledge join with full state
      callback?.({
        success: true,
        room: {
          id: room.id,
          code: room.code,
          name: room.name,
          inviteToken: room.code,
          expiresAt: room.expiresAt,
          disappearingTimerSec: room.disappearingTimerSec,
          isOwner: participant.isOwner,
          canInvite: participant.canInvite,
          sessionId: participant.sessionId,
          participants: participantsList,
          messages: room.messages,
          activeCall: room.activeCall?.active ? {
            active: true,
            isAudioOnly: room.activeCall.isAudioOnly,
            initiatedByName: room.activeCall.initiatedByName,
            participantCount: room.activeCall.participants.size,
            participants: Array.from(room.activeCall.participants),
          } : null,
        },
      });

      // Broadcast updated participant list to everyone in room
      io.to(roomId).emit('room:participants_updated', {
        participants: participantsList,
        count: room.participants.size,
      });
    } catch (err: any) {
      console.error('Join error:', err);
      callback?.({ success: false, error: 'Could not join room.' });
    }
  });

  // 2. Send message
  socket.on('message:send', (payload: { text?: string; media?: MessageMedia; replyToId?: string }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const participant = room.participants.get(currentSessionId);
    if (!participant) return;

    const rawText = (payload.text || '').trim();
    if (!rawText && !payload.media) {
      return callback?.({ success: false, error: 'Message cannot be empty.' });
    }

    let replyInfo: Message['replyTo'] = null;
    if (payload.replyToId) {
      const orig = room.messages.find(m => m.id === payload.replyToId);
      if (orig) {
        replyInfo = {
          id: orig.id,
          senderName: orig.senderName,
          text: orig.text ? orig.text.slice(0, 100) : (orig.media ? `[${orig.media.type}]` : ''),
        };
      }
    }

    const now = Date.now();
    let expiresAt: number | null = null;
    if (room.disappearingTimerSec > 0) {
      expiresAt = now + room.disappearingTimerSec * 1000;
    }

    const newMessage: Message = {
      id: crypto.randomUUID(),
      senderSessionId: participant.sessionId,
      senderName: participant.name,
      senderIsOwner: participant.isOwner,
      text: rawText,
      media: payload.media,
      timestamp: now,
      reactions: {},
      replyTo: replyInfo,
      expiresAt,
    };

    room.messages.push(newMessage);

    // Broadcast new message to all in room
    io.to(currentRoomId).emit('message:new', newMessage);

    callback?.({ success: true, messageId: newMessage.id });
  });

  // 3. Edit message (own message only)
  socket.on('message:edit', (payload: { messageId: string; text: string }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const msg = room.messages.find(m => m.id === payload.messageId);
    if (!msg) return callback?.({ success: false, error: 'Message not found.' });

    if (msg.senderSessionId !== currentSessionId) {
      return callback?.({ success: false, error: 'You can only edit your own messages.' });
    }

    const newText = (payload.text || '').trim();
    if (!newText) {
      return callback?.({ success: false, error: 'Message cannot be empty.' });
    }

    msg.text = newText;
    msg.edited = true;

    io.to(currentRoomId).emit('message:edited', {
      id: msg.id,
      text: msg.text,
      edited: true,
    });

    callback?.({ success: true });
  });

  // 4. Delete message (own message or room owner)
  socket.on('message:delete', (payload: { messageId: string }, callback) => {
    if (!currentRoomId || !currentSessionId) {
      return callback?.({ success: false, error: 'Not connected to an active room.' });
    }
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) {
      return callback?.({ success: false, error: 'Room does not exist or has ended.' });
    }

    const participant = room.participants.get(currentSessionId);
    if (!participant) {
      return callback?.({ success: false, error: 'Participant not recognized.' });
    }

    const idx = room.messages.findIndex(m => m.id === payload.messageId);
    if (idx === -1) {
      // Prevent duplicate deletion request errors gracefully
      return callback?.({ success: false, error: 'Message already deleted or not found.' });
    }

    const msg = room.messages[idx];
    const isOwner = participant.isOwner || room.ownerSessionId === currentSessionId;
    const isSender = msg.senderSessionId === currentSessionId;

    if (!isSender && !isOwner) {
      return callback?.({ success: false, error: 'Permission denied. Only the author or room owner can delete this message.' });
    }

    // If message had a local uploaded file, delete it immediately from disk
    if (msg.media && msg.media.fileId) {
      const fileEntry = room.mediaFiles.get(msg.media.fileId);
      if (fileEntry) {
        try {
          if (fs.existsSync(fileEntry.path)) fs.unlinkSync(fileEntry.path);
        } catch {}
        room.mediaFiles.delete(msg.media.fileId);
      }
    }

    // Remove from server RAM
    room.messages.splice(idx, 1);

    // Broadcast deletion event to ALL connected participants in this room
    io.to(currentRoomId).emit('message:deleted', {
      id: payload.messageId,
      deletedBy: participant.name,
    });

    callback?.({ success: true, messageId: payload.messageId });
  });

  // 5. React to message
  socket.on('message:react', (payload: { messageId: string; emoji: string }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const participant = room.participants.get(currentSessionId);
    if (!participant) return;

    const msg = room.messages.find(m => m.id === payload.messageId);
    if (!msg) return callback?.({ success: false, error: 'Message not found.' });

    const emoji = payload.emoji.slice(0, 4);
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const existingIdx = msg.reactions[emoji].indexOf(participant.name);
    if (existingIdx >= 0) {
      // Toggle off
      msg.reactions[emoji].splice(existingIdx, 1);
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji];
      }
    } else {
      // Add reaction
      msg.reactions[emoji].push(participant.name);
    }

    io.to(currentRoomId).emit('message:reaction_updated', {
      messageId: msg.id,
      reactions: msg.reactions,
    });

    callback?.({ success: true, reactions: msg.reactions });
  });

  // 6. Typing indicators
  socket.on('typing:start', () => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const participant = room.participants.get(currentSessionId);
    if (!participant) return;

    socket.to(currentRoomId).emit('typing:status', {
      sessionId: participant.sessionId,
      name: participant.name,
      isTyping: true,
    });
  });

  socket.on('typing:stop', () => {
    if (!currentRoomId || !currentSessionId) return;
    socket.to(currentRoomId).emit('typing:status', {
      sessionId: currentSessionId,
      isTyping: false,
    });
  });

  // 7. Owner permission: Kick/remove participant
  socket.on('participant:kick', (payload: { targetSessionId: string }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const currentParticipant = room.participants.get(currentSessionId);
    if (!currentParticipant || !currentParticipant.isOwner) {
      return callback?.({ success: false, error: 'Only the room owner can remove participants.' });
    }

    const target = room.participants.get(payload.targetSessionId);
    if (!target) return callback?.({ success: false, error: 'Participant not found.' });
    if (target.isOwner) return callback?.({ success: false, error: 'Cannot remove the room owner.' });

    // Disconnect target socket and notify them
    if (target.socketId) {
      io.to(target.socketId).emit('participant:kicked_self', {
        reason: 'You were removed from this room by the owner.',
      });
      io.sockets.sockets.get(target.socketId)?.leave(currentRoomId);
    }

    room.participants.delete(payload.targetSessionId);

    const participantsList = Array.from(room.participants.values()).map(p => ({
      sessionId: p.sessionId,
      name: p.name,
      isOwner: p.isOwner,
      canInvite: p.canInvite,
      online: p.online,
      avatarColor: p.avatarColor,
    }));

    io.to(currentRoomId).emit('participant:kicked', {
      targetName: target.name,
      participants: participantsList,
      count: room.participants.size,
    });

    callback?.({ success: true });
  });

  // 8. Owner permission: Delegate or revoke invite permission
  socket.on('participant:toggle_invite', (payload: { targetSessionId: string; canInvite: boolean }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const currentParticipant = room.participants.get(currentSessionId);
    if (!currentParticipant || !currentParticipant.isOwner) {
      return callback?.({ success: false, error: 'Only the room owner can manage permissions.' });
    }

    const target = room.participants.get(payload.targetSessionId);
    if (!target) return callback?.({ success: false, error: 'Participant not found.' });

    target.canInvite = Boolean(payload.canInvite);

    // Notify target directly
    if (target.socketId) {
      io.to(target.socketId).emit('permission:invite_updated', {
        canInvite: target.canInvite,
        inviteToken: room.code,
      });
    }

    const participantsList = Array.from(room.participants.values()).map(p => ({
      sessionId: p.sessionId,
      name: p.name,
      isOwner: p.isOwner,
      canInvite: p.canInvite,
      online: p.online,
      avatarColor: p.avatarColor,
    }));

    io.to(currentRoomId).emit('room:participants_updated', {
      participants: participantsList,
      count: room.participants.size,
    });

    io.to(currentRoomId).emit('system:notification', {
      text: target.canInvite
        ? `${target.name} was granted permission to invite others.`
        : `${target.name}'s invite permission was revoked.`,
    });

    callback?.({ success: true });
  });

  // 9. Owner permission: Update room disappearing message timer
  socket.on('room:update_timer', (payload: { seconds: number }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const currentParticipant = room.participants.get(currentSessionId);
    if (!currentParticipant || !currentParticipant.isOwner) {
      return callback?.({ success: false, error: 'Only the room owner can configure timers.' });
    }

    const validSec = [0, 10, 30, 300].includes(payload.seconds) ? payload.seconds : 0;
    room.disappearingTimerSec = validSec;

    io.to(currentRoomId).emit('room:timer_updated', {
      disappearingTimerSec: room.disappearingTimerSec,
    });

    callback?.({ success: true });
  });

  // 10. Owner permission: Terminate conversation
  socket.on('room:end', (_data, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const currentParticipant = room.participants.get(currentSessionId);
    if (!currentParticipant || !currentParticipant.isOwner) {
      return callback?.({ success: false, error: 'Only the room owner can end the conversation.' });
    }

    destroyRoom(currentRoomId, 'Owner ended the conversation');
    callback?.({ success: true });
  });

  // Helper to remove participant from active call
  function removeParticipantFromCall(room: Room, roomId: string, sessionId: string, participantName: string) {
    if (!room.activeCall || !room.activeCall.participants.has(sessionId)) return;

    room.activeCall.participants.delete(sessionId);

    io.to(roomId).emit('call:participant-left', {
      sessionId,
      name: participantName,
      remainingParticipants: Array.from(room.activeCall.participants),
      totalParticipants: room.activeCall.participants.size,
    });

    if (room.activeCall.participants.size === 0) {
      room.activeCall = null;
      io.to(roomId).emit('call:ended', {
        reason: 'All participants left the call.',
      });
      io.to(roomId).emit('call:status_updated', {
        active: false,
        participantCount: 0,
      });
    } else {
      io.to(roomId).emit('call:status_updated', {
        active: true,
        isAudioOnly: room.activeCall.isAudioOnly,
        participantCount: room.activeCall.participants.size,
        participants: Array.from(room.activeCall.participants),
      });
    }
  }

  // 11. WebRTC Signaling: Start Call
  socket.on('call:start', (payload: { isAudioOnly?: boolean }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) {
      return callback?.({ success: false, error: 'Room does not exist or has ended.' });
    }

    const participant = room.participants.get(currentSessionId);
    if (!participant) {
      return callback?.({ success: false, error: 'Participant not recognized.' });
    }

    if (room.activeCall && room.activeCall.active) {
      // Call is already active; join caller to existing call
      room.activeCall.participants.add(currentSessionId);
      return callback?.({
        success: true,
        alreadyActive: true,
        isAudioOnly: room.activeCall.isAudioOnly,
        existingParticipants: Array.from(room.activeCall.participants).filter(id => id !== currentSessionId),
      });
    }

    room.activeCall = {
      active: true,
      isAudioOnly: Boolean(payload?.isAudioOnly),
      initiatedBySessionId: currentSessionId,
      initiatedByName: participant.name,
      participants: new Set([currentSessionId]),
      startedAt: Date.now(),
    };

    // Broadcast incoming call to other participants in the room
    socket.to(currentRoomId).emit('call:incoming', {
      callerSessionId: currentSessionId,
      callerName: participant.name,
      isAudioOnly: room.activeCall.isAudioOnly,
    });

    // Notify room of active call status
    io.to(currentRoomId).emit('call:status_updated', {
      active: true,
      isAudioOnly: room.activeCall.isAudioOnly,
      initiatedByName: participant.name,
      participantCount: 1,
      participants: [currentSessionId],
    });

    callback?.({
      success: true,
      isAudioOnly: room.activeCall.isAudioOnly,
    });
  });

  // 12. WebRTC Signaling: Accept Call
  socket.on('call:accept', (payload: { isAudioOnly?: boolean }, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated || !room.activeCall || !room.activeCall.active) {
      return callback?.({ success: false, error: 'No active call to join.' });
    }

    const participant = room.participants.get(currentSessionId);
    if (!participant) {
      return callback?.({ success: false, error: 'Participant not recognized.' });
    }

    if (room.activeCall.participants.size >= 5) {
      return callback?.({ success: false, error: 'Call is full (max 5 participants).' });
    }

    const existingParticipants = Array.from(room.activeCall.participants).filter(id => id !== currentSessionId);
    room.activeCall.participants.add(currentSessionId);

    // Notify existing call participants that a new peer joined
    socket.to(currentRoomId).emit('call:participant-joined', {
      sessionId: currentSessionId,
      name: participant.name,
      avatarColor: participant.avatarColor,
      isAudioOnly: Boolean(payload?.isAudioOnly),
      totalParticipants: room.activeCall.participants.size,
    });

    // Broadcast updated call status to room
    io.to(currentRoomId).emit('call:status_updated', {
      active: true,
      isAudioOnly: room.activeCall.isAudioOnly,
      initiatedByName: room.activeCall.initiatedByName,
      participantCount: room.activeCall.participants.size,
      participants: Array.from(room.activeCall.participants),
    });

    callback?.({
      success: true,
      isAudioOnly: room.activeCall.isAudioOnly,
      existingParticipants,
    });
  });

  // 13. WebRTC Signaling: Decline Call
  socket.on('call:decline', () => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !room.activeCall) return;

    const participant = room.participants.get(currentSessionId);
    if (!participant) return;

    socket.to(currentRoomId).emit('call:declined', {
      sessionId: currentSessionId,
      name: participant.name,
    });
  });

  // 14. WebRTC Signaling: SDP Offer
  socket.on('call:offer', (payload: { targetSessionId: string; sdp: any }) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const target = room.participants.get(payload.targetSessionId);
    const sender = room.participants.get(currentSessionId);
    if (target && target.socketId && sender) {
      io.to(target.socketId).emit('call:offer', {
        senderSessionId: currentSessionId,
        senderName: sender.name,
        sdp: payload.sdp,
      });
    }
  });

  // 15. WebRTC Signaling: SDP Answer
  socket.on('call:answer', (payload: { targetSessionId: string; sdp: any }) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const target = room.participants.get(payload.targetSessionId);
    if (target && target.socketId) {
      io.to(target.socketId).emit('call:answer', {
        senderSessionId: currentSessionId,
        sdp: payload.sdp,
      });
    }
  });

  // 16. WebRTC Signaling: ICE Candidate
  socket.on('call:ice-candidate', (payload: { targetSessionId: string; candidate: any }) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const target = room.participants.get(payload.targetSessionId);
    if (target && target.socketId) {
      io.to(target.socketId).emit('call:ice-candidate', {
        senderSessionId: currentSessionId,
        candidate: payload.candidate,
      });
    }
  });

  // 17. WebRTC Signaling: Toggle Audio/Video State
  socket.on('call:toggle-media', (payload: { isAudioMuted?: boolean; isVideoMuted?: boolean }) => {
    if (!currentRoomId || !currentSessionId) return;
    socket.to(currentRoomId).emit('call:participant-media-toggled', {
      sessionId: currentSessionId,
      isAudioMuted: payload.isAudioMuted,
      isVideoMuted: payload.isVideoMuted,
    });
  });

  // 18. WebRTC Signaling: Leave Call
  socket.on('call:leave', (_data, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const participant = room.participants.get(currentSessionId);
    if (participant) {
      removeParticipantFromCall(room, currentRoomId, currentSessionId, participant.name);
    }
    callback?.({ success: true });
  });

  // 19. WebRTC Signaling: End Call for All (Owner or Initiator)
  socket.on('call:end', (_data, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || !room.activeCall) return;

    const participant = room.participants.get(currentSessionId);
    if (!participant) return;

    const canEnd = participant.isOwner || room.activeCall.initiatedBySessionId === currentSessionId;
    if (!canEnd) {
      return callback?.({ success: false, error: 'Only the room owner or call initiator can end the call for everyone.' });
    }

    room.activeCall = null;
    io.to(currentRoomId).emit('call:ended', {
      reason: `${participant.name} ended the call.`,
    });
    io.to(currentRoomId).emit('call:status_updated', {
      active: false,
      participantCount: 0,
    });

    callback?.({ success: true });
  });

  // 20. Participant voluntarily leaves room
  socket.on('room:leave', (_data, callback) => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const participant = room.participants.get(currentSessionId);
    if (!participant) return;

    // Clean up from active call if in one
    removeParticipantFromCall(room, currentRoomId, currentSessionId, participant.name);

    if (participant.isOwner) {
      // If owner leaves voluntarily, room ends
      destroyRoom(currentRoomId, 'Room owner left the conversation');
    } else {
      room.participants.delete(currentSessionId);
      socket.leave(currentRoomId);

      const participantsList = Array.from(room.participants.values()).map(p => ({
        sessionId: p.sessionId,
        name: p.name,
        isOwner: p.isOwner,
        canInvite: p.canInvite,
        online: p.online,
        avatarColor: p.avatarColor,
      }));

      io.to(currentRoomId).emit('participant:left', {
        name: participant.name,
        participants: participantsList,
        count: room.participants.size,
      });
    }

    currentRoomId = null;
    currentSessionId = null;
    callback?.({ success: true });
  });

  // 21. Handle socket disconnection
  socket.on('disconnect', () => {
    if (!currentRoomId || !currentSessionId) return;
    const room = rooms.get(currentRoomId);
    if (!room || room.terminated) return;

    const participant = room.participants.get(currentSessionId);
    if (!participant) return;

    participant.online = false;
    participant.lastSeen = Date.now();

    // Clean up from active call if in one
    removeParticipantFromCall(room, currentRoomId, currentSessionId, participant.name);

    const participantsList = Array.from(room.participants.values()).map(p => ({
      sessionId: p.sessionId,
      name: p.name,
      isOwner: p.isOwner,
      canInvite: p.canInvite,
      online: p.online,
      avatarColor: p.avatarColor,
    }));

    io.to(currentRoomId).emit('room:participants_updated', {
      participants: participantsList,
      count: room.participants.size,
    });

    // If owner disconnected, give a 15-minute grace period before terminating
    // to prevent premature destruction when switching apps to copy/send invitations
    if (participant.isOwner) {
      if (room.ownerDisconnectTimer) clearTimeout(room.ownerDisconnectTimer);
      room.ownerDisconnectTimer = setTimeout(() => {
        const checkRoom = rooms.get(currentRoomId!);
        if (checkRoom && !checkRoom.terminated) {
          const owner = checkRoom.participants.get(currentSessionId!);
          if (owner && !owner.online) {
            destroyRoom(currentRoomId!, 'Owner disconnected and did not return.');
          }
        }
      }, 15 * 60 * 1000);
    }
  });
});

// Periodic in-memory sweep:
// 1. Room expiration
// 2. Disappearing messages
// 3. Orphaned temp files older than 1 hour
setInterval(() => {
  const now = Date.now();

  // 1. Rooms check
  for (const [roomId, room] of rooms.entries()) {
    if (room.terminated || now >= room.expiresAt) {
      destroyRoom(roomId, 'Room lifetime has expired');
      continue;
    }

    // 2. Disappearing messages check
    if (room.disappearingTimerSec > 0 && room.messages.length > 0) {
      const expiredIndices: number[] = [];
      for (let i = 0; i < room.messages.length; i++) {
        const m = room.messages[i];
        if (m.expiresAt && now >= m.expiresAt) {
          expiredIndices.push(i);
        }
      }

      if (expiredIndices.length > 0) {
        // Collect ids to notify clients
        const expiredIds: string[] = [];
        // Remove in reverse
        for (let i = expiredIndices.length - 1; i >= 0; i--) {
          const idx = expiredIndices[i];
          const [removed] = room.messages.splice(idx, 1);
          expiredIds.push(removed.id);

          // If it had a temp file, delete from disk
          if (removed.media && removed.media.fileId) {
            const f = room.mediaFiles.get(removed.media.fileId);
            if (f) {
              try {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
              } catch {}
              room.mediaFiles.delete(removed.media.fileId);
            }
          }
        }

        io.to(roomId).emit('messages:disappeared', { ids: expiredIds });
      }
    }
  }

  // 3. Sweep orphaned temp files
  try {
    const files = fs.readdirSync(TEMP_UPLOAD_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      // If older than 2 hours, remove
      if (now - stats.mtimeMs > 2 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (e) {
    // ignore sweep errors
  }
}, 5000);

// --- Vite Middleware in Dev or Static in Production ---
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[EPHEMERAL] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
