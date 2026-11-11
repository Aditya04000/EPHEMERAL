/**
 * EPHEMERAL - Vanilla JavaScript Client
 * Real-time private group messaging that leaves no trace.
 */

// Application State
const state = {
  socket: null,
  view: 'landing', // 'landing' | 'chat' | 'ended'
  room: null,
  sessionId: null,
  userName: '',
  isOwner: false,
  canInvite: false,
  participants: [],
  messages: [],
  activeReply: null,
  editingMessageId: null,
  pendingDeleteMessageId: null,
  typingTimeout: null,
  isTyping: false,
  countdownInterval: null,
  mediaLibrary: { stickers: [], gifs: [] },
};

// Curated Emojis for quick reactions and picker
const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😮', '👏'];
const POPULAR_EMOJIS = [
  '😊', '😂', '🥰', '😍', '😌', '😎',
  '☕', '🌿', '✨', '🔥', '🫂', '✌️',
  '👍', '🙏', '👏', '🎉', '💡', '💬',
  '🌙', '⭐', '🌊', '🐱', '🐶', '🍕',
];

// Elements Cache
const el = {
  landingView: document.getElementById('landing-view'),
  chatView: document.getElementById('chat-view'),
  endedView: document.getElementById('ended-view'),

  // Modals
  modalCreate: document.getElementById('modal-create'),
  modalJoin: document.getElementById('modal-join'),
  modalConfirmDelete: document.getElementById('modal-confirm-delete'),
  modalConfirmEnd: document.getElementById('modal-confirm-end'),
  modalMediaPicker: document.getElementById('modal-media-picker'),
  modalTimerSetting: document.getElementById('modal-timer-setting'),
  modalLightbox: document.getElementById('modal-lightbox'),
  modalEditMsg: document.getElementById('modal-edit-msg'),

  // Popovers & Drawers
  roomDropdownMenu: document.getElementById('room-dropdown-menu'),
  attachmentMenu: document.getElementById('attachment-menu'),
  emojiPickerPopover: document.getElementById('emoji-picker-popover'),
  emojiGrid: document.getElementById('emoji-grid'),
  participantPanel: document.getElementById('participant-panel'),

  // Chat Elements
  topRoomName: document.getElementById('top-room-name'),
  topRoomId: document.getElementById('top-room-id'),
  ownerBadge: document.getElementById('owner-badge'),
  countdownText: document.getElementById('countdown-text'),
  roomCountdownPill: document.getElementById('room-countdown-pill'),
  headerAvatarStack: document.getElementById('header-avatar-stack'),
  participantCountLabel: document.getElementById('participant-count-label'),
  messagesContainer: document.getElementById('messages-container'),
  messagesList: document.getElementById('messages-list'),
  roomEmptyState: document.getElementById('room-empty-state'),
  scrollBottomBtn: document.getElementById('scroll-bottom-btn'),
  typingBar: document.getElementById('typing-bar'),
  typingText: document.getElementById('typing-text'),
  replyBanner: document.getElementById('reply-banner'),
  replyTargetName: document.getElementById('reply-target-name'),
  replyTargetSnippet: document.getElementById('reply-target-snippet'),
  messageInput: document.getElementById('message-input'),
  messageSendBtn: document.getElementById('message-send-btn'),
  headerDisappearBtn: document.getElementById('header-disappear-btn'),
  headerDisappearLabel: document.getElementById('header-disappear-label'),

  // File Inputs
  imageFileInput: document.getElementById('image-file-input'),
  docFileInput: document.getElementById('doc-file-input'),

  // Media Pickers
  stickersContainer: document.getElementById('stickers-container'),
  gifsContainer: document.getElementById('gifs-container'),
  gifSearchInput: document.getElementById('gif-search-input'),

  // Toast
  toastContainer: document.getElementById('toast-container'),

  // Mobile Header & Dropdown Elements
  menuCountdownText: document.getElementById('menu-countdown-text'),
  menuCountdownRow: document.getElementById('menu-countdown-row'),
  menuAudioCallBtn: document.getElementById('menu-audio-call-btn'),
  menuCopyLinkBtn: document.getElementById('menu-copy-link-btn'),
  headerActiveCallJoinBtn: document.getElementById('header-active-call-join-btn'),

  // Video & Audio Calling Elements
  headerVideoCallBtn: document.getElementById('header-video-call-btn'),
  headerAudioCallBtn: document.getElementById('header-audio-call-btn'),
  headerActiveCallPill: document.getElementById('header-active-call-pill'),
  headerActiveCallLabel: document.getElementById('header-active-call-label'),
  modalIncomingCall: document.getElementById('modal-incoming-call'),
  incomingCallerAvatar: document.getElementById('incoming-caller-avatar'),
  incomingCallerName: document.getElementById('incoming-caller-name'),
  incomingCallType: document.getElementById('incoming-call-type'),
  acceptCallBtn: document.getElementById('accept-call-btn'),
  acceptAudioCallBtn: document.getElementById('accept-audio-call-btn'),
  declineCallBtn: document.getElementById('decline-call-btn'),
  activeCallOverlay: document.getElementById('active-call-overlay'),
  callVideoGrid: document.getElementById('call-video-grid'),
  callDurationText: document.getElementById('call-duration-text'),
  callParticipantSummary: document.getElementById('call-participant-summary'),
  callBtnToggleMic: document.getElementById('call-btn-toggle-mic'),
  callBtnToggleCamera: document.getElementById('call-btn-toggle-camera'),
  callBtnFlipCamera: document.getElementById('call-btn-flip-camera'),
  callBtnToggleSize: document.getElementById('call-btn-toggle-size'),
  callBtnLeave: document.getElementById('call-btn-leave'),
  callBtnEndAll: document.getElementById('call-btn-end-all'),
  callBtnAddParticipants: document.getElementById('call-btn-add-participants'),
  callBtnAddParticipantsBottom: document.getElementById('call-btn-add-participants-bottom'),
  modalCallAddParticipants: document.getElementById('modal-call-add-participants'),
  callAddParticipantsList: document.getElementById('call-add-participants-list'),
  closeCallAddModalBtn: document.getElementById('close-call-add-modal-btn'),
  doneCallAddModalBtn: document.getElementById('done-call-add-modal-btn'),
  iconMicOn: document.getElementById('icon-mic-on'),
  iconMicOff: document.getElementById('icon-mic-off'),
  iconCameraOn: document.getElementById('icon-camera-on'),
  iconCameraOff: document.getElementById('icon-camera-off'),
  iconMinimize: document.getElementById('icon-minimize'),
  iconExpand: document.getElementById('icon-expand'),
};

// WebRTC Calling State
const callState = {
  inCall: false,
  isAudioOnly: false,
  isMuted: false,
  isVideoOff: false,
  currentFacingMode: 'user', // 'user' | 'environment'
  isMinimized: false,
  callStartTime: null,
  durationInterval: null,
  localStream: null,
  peers: new Map(), // sessionId -> { pc, remoteStream, candidateQueue: [], isRemoteDescriptionSet: false, isAudioMuted: false, isVideoMuted: false }
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
  incomingCallData: null,
  roomCallActive: false,
  roomCallParticipantCount: 0,
};

// ==========================================
// Initialization & Routing
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupEmojiPicker();
  loadMediaLibrary();
  loadRtcConfig();
  checkUrlParamsForInvite();
});

// Extracts room code from either /join/CODE, ?join=CODE, ?code=CODE, or ?room=CODE
function checkUrlParamsForInvite() {
  const urlParams = new URLSearchParams(window.location.search);
  const queryCode = urlParams.get('join') || urlParams.get('code') || urlParams.get('room');
  
  let pathCode = '';
  if (window.location.pathname.startsWith('/join/')) {
    const rawPath = window.location.pathname.replace('/join/', '').split('/')[0].split('?')[0];
    pathCode = rawPath.trim();
  }

  const codeToUse = (queryCode || pathCode || '').trim().toUpperCase();

  if (codeToUse) {
    const inputRoom = document.getElementById('join-room-id-input');
    if (inputRoom) inputRoom.value = codeToUse;
    
    const inviteNotice = document.getElementById('join-invite-notice');
    if (inviteNotice) {
      inviteNotice.innerHTML = `You've been invited to join space <span class="font-mono font-bold tracking-wider">${escapeHtml(codeToUse)}</span>. Choose your display name to enter:`;
      inviteNotice.classList.remove('hidden');
    }
    openModal(el.modalJoin);
  }
}

// Show Toast Notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgClass = type === 'error' ? 'bg-red-800 text-white' : 'bg-[#24221f] text-white';
  toast.className = `px-4 py-2 rounded-xl text-xs font-medium shadow-lg transition-all transform animate-pop-in pointer-events-auto ${bgClass} flex items-center gap-2`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// ==========================================
// Event Listeners Setup
// ==========================================
function setupEventListeners() {
  // Navigation & Landing actions
  document.getElementById('nav-join-btn')?.addEventListener('click', () => openModal(el.modalJoin));
  document.getElementById('hero-create-btn')?.addEventListener('click', () => openModal(el.modalCreate));
  document.getElementById('hero-join-btn')?.addEventListener('click', () => openModal(el.modalJoin));
  
  // Invite copying triggers
  document.getElementById('welcome-invite-btn')?.addEventListener('click', copyInviteLink);
  document.getElementById('welcome-copy-code-btn')?.addEventListener('click', copyInviteCode);
  document.getElementById('quick-copy-link-btn')?.addEventListener('click', copyInviteLink);
  document.getElementById('quick-copy-code-btn')?.addEventListener('click', copyInviteCode);
  document.getElementById('panel-copy-invite-btn')?.addEventListener('click', copyInviteLink);
  document.getElementById('panel-copy-code-btn')?.addEventListener('click', copyInviteCode);

  document.getElementById('ended-return-home-btn')?.addEventListener('click', () => showView('landing'));

  // Modals close buttons
  document.getElementById('close-modal-create')?.addEventListener('click', () => closeModal(el.modalCreate));
  document.getElementById('cancel-create-btn')?.addEventListener('click', () => closeModal(el.modalCreate));
  document.getElementById('close-modal-join')?.addEventListener('click', () => closeModal(el.modalJoin));
  document.getElementById('cancel-join-btn')?.addEventListener('click', () => closeModal(el.modalJoin));
  document.getElementById('close-modal-media')?.addEventListener('click', () => closeModal(el.modalMediaPicker));
  document.getElementById('close-lightbox-btn')?.addEventListener('click', () => closeModal(el.modalLightbox));
  document.getElementById('cancel-edit-btn')?.addEventListener('click', () => closeModal(el.modalEditMsg));
  document.getElementById('cancel-end-btn')?.addEventListener('click', () => closeModal(el.modalConfirmEnd));
  document.getElementById('cancel-timer-btn')?.addEventListener('click', () => closeModal(el.modalTimerSetting));

  // Delete message modal handlers
  document.getElementById('cancel-delete-msg-btn')?.addEventListener('click', () => {
    closeModal(el.modalConfirmDelete);
    state.pendingDeleteMessageId = null;
  });
  document.getElementById('confirm-delete-msg-btn')?.addEventListener('click', () => {
    if (state.pendingDeleteMessageId) {
      executeDeleteMessage(state.pendingDeleteMessageId);
      closeModal(el.modalConfirmDelete);
      state.pendingDeleteMessageId = null;
    }
  });

  // Forms
  document.getElementById('create-room-form')?.addEventListener('submit', handleCreateRoom);
  document.getElementById('join-room-form')?.addEventListener('submit', handleJoinRoom);

  // Top Bar & Menu
  document.getElementById('header-back-home')?.addEventListener('click', handleLeavePrompt);
  document.getElementById('room-options-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    el.roomDropdownMenu.classList.toggle('hidden');
    el.attachmentMenu.classList.add('hidden');
    el.emojiPickerPopover.classList.add('hidden');
  });

  document.getElementById('menu-invite-btn')?.addEventListener('click', () => {
    el.roomDropdownMenu.classList.add('hidden');
    copyInviteLink();
  });

  document.getElementById('menu-timer-btn')?.addEventListener('click', () => {
    el.roomDropdownMenu.classList.add('hidden');
    openModal(el.modalTimerSetting);
  });

  document.getElementById('header-disappear-btn')?.addEventListener('click', () => {
    if (state.isOwner) openModal(el.modalTimerSetting);
  });

  document.getElementById('menu-leave-btn')?.addEventListener('click', () => {
    el.roomDropdownMenu.classList.add('hidden');
    handleLeavePrompt();
  });

  document.getElementById('menu-end-room-btn')?.addEventListener('click', () => {
    el.roomDropdownMenu.classList.add('hidden');
    openModal(el.modalConfirmEnd);
  });

  document.getElementById('confirm-end-btn')?.addEventListener('click', handleEndConversation);

  // Participant Drawer
  document.getElementById('open-participants-btn')?.addEventListener('click', () => {
    el.participantPanel.classList.remove('hidden');
  });
  document.getElementById('close-panel-btn')?.addEventListener('click', () => {
    el.participantPanel.classList.add('hidden');
  });

  // Composer attachments
  document.getElementById('composer-attach-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    el.attachmentMenu.classList.toggle('hidden');
    el.emojiPickerPopover.classList.add('hidden');
    el.roomDropdownMenu.classList.add('hidden');
  });

  document.getElementById('attach-photo-btn')?.addEventListener('click', () => {
    el.attachmentMenu.classList.add('hidden');
    el.imageFileInput.click();
  });

  document.getElementById('attach-file-btn')?.addEventListener('click', () => {
    el.attachmentMenu.classList.add('hidden');
    el.docFileInput.click();
  });

  document.getElementById('attach-sticker-btn')?.addEventListener('click', () => {
    el.attachmentMenu.classList.add('hidden');
    openMediaPicker('stickers');
  });

  document.getElementById('attach-gif-btn')?.addEventListener('click', () => {
    el.attachmentMenu.classList.add('hidden');
    openMediaPicker('gifs');
  });

  // Media tabs
  document.getElementById('tab-stickers')?.addEventListener('click', () => switchMediaTab('stickers'));
  document.getElementById('tab-gifs')?.addEventListener('click', () => switchMediaTab('gifs'));
  el.gifSearchInput?.addEventListener('input', handleGifSearch);

  // File Inputs change
  el.imageFileInput?.addEventListener('change', handleFileUpload);
  el.docFileInput?.addEventListener('change', handleFileUpload);

  // Emoji picker
  document.getElementById('composer-emoji-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    el.emojiPickerPopover.classList.toggle('hidden');
    el.attachmentMenu.classList.add('hidden');
    el.roomDropdownMenu.classList.add('hidden');
  });

  // Composer Input
  el.messageInput?.addEventListener('input', () => {
    autoResizeTextarea(el.messageInput);
    handleTyping();
  });

  el.messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  el.messageSendBtn?.addEventListener('click', handleSendMessage);

  // Reply Banner cancel
  document.getElementById('cancel-reply-btn')?.addEventListener('click', cancelReply);

  // Scroll to bottom button
  el.messagesContainer?.addEventListener('scroll', handleMessagesScroll);
  el.scrollBottomBtn?.addEventListener('click', scrollToBottom);

  // Disappearing messages settings
  document.getElementById('save-timer-btn')?.addEventListener('click', handleSaveTimerSetting);

  // Edit message submit
  document.getElementById('save-edit-btn')?.addEventListener('click', handleSaveEditMessage);

  // Video & Audio Calling Listeners
  el.headerVideoCallBtn?.addEventListener('click', () => startCall(false));
  el.headerAudioCallBtn?.addEventListener('click', () => startCall(true));
  el.menuAudioCallBtn?.addEventListener('click', () => {
    el.roomDropdownMenu.classList.add('hidden');
    startCall(true);
  });
  el.menuCopyLinkBtn?.addEventListener('click', () => {
    el.roomDropdownMenu.classList.add('hidden');
    copyInviteLink();
  });

  el.headerActiveCallJoinBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (callState.roomCallActive && !callState.inCall) {
      acceptCall(callState.isAudioOnly);
    }
  });

  el.headerActiveCallPill?.addEventListener('click', () => {
    if (callState.roomCallActive && !callState.inCall) {
      acceptCall(callState.isAudioOnly);
    }
  });

  el.acceptCallBtn?.addEventListener('click', () => acceptCall(false));
  el.acceptAudioCallBtn?.addEventListener('click', () => acceptCall(true));
  el.declineCallBtn?.addEventListener('click', declineCall);

  el.callBtnToggleMic?.addEventListener('click', toggleCallMic);
  el.callBtnToggleCamera?.addEventListener('click', toggleCallCamera);
  el.callBtnFlipCamera?.addEventListener('click', flipCallCamera);
  el.callBtnToggleSize?.addEventListener('click', toggleCallMinimized);
  el.callBtnLeave?.addEventListener('click', () => leaveCall(true));
  el.callBtnEndAll?.addEventListener('click', endCallForAll);

  // In-Call Add Participant Modal Listeners
  el.callBtnAddParticipants?.addEventListener('click', openAddParticipantsToCallModal);
  el.callBtnAddParticipantsBottom?.addEventListener('click', openAddParticipantsToCallModal);
  el.closeCallAddModalBtn?.addEventListener('click', () => closeModal(el.modalCallAddParticipants));
  el.doneCallAddModalBtn?.addEventListener('click', () => closeModal(el.modalCallAddParticipants));

  // Close menus on outside click
  document.addEventListener('click', (e) => {
    if (!el.attachmentMenu.contains(e.target) && e.target !== document.getElementById('composer-attach-btn')) {
      el.attachmentMenu.classList.add('hidden');
    }
    if (!el.emojiPickerPopover.contains(e.target) && e.target !== document.getElementById('composer-emoji-btn')) {
      el.emojiPickerPopover.classList.add('hidden');
    }
    if (!el.roomDropdownMenu.contains(e.target) && !document.getElementById('room-options-menu-btn')?.contains(e.target)) {
      el.roomDropdownMenu.classList.add('hidden');
    }
  });
}

function openModal(modal) {
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modal) {
  if (modal) modal.classList.add('hidden');
}

function showView(view) {
  state.view = view;
  el.landingView.classList.toggle('hidden', view !== 'landing');
  el.chatView.classList.toggle('hidden', view !== 'chat');
  el.endedView.classList.toggle('hidden', view !== 'ended');

  if (view === 'landing' || view === 'ended') {
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }
    // Clean up any ongoing calls and release microphone and camera
    if (callState.inCall || callState.localStream) {
      leaveCall(false);
    }
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// ==========================================
// Room Creation & Joining
// ==========================================

async function handleCreateRoom(e) {
  e.preventDefault();
  const userName = document.getElementById('create-name-input').value.trim();
  const roomName = document.getElementById('create-room-name-input').value.trim();
  const lifetime = document.getElementById('create-lifetime-select').value;
  const submitBtn = document.getElementById('submit-create-btn');

  if (!userName) return;

  try {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Creating...';

    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName,
        roomName: roomName || 'Quiet Space',
        lifetimeMinutes: Number(lifetime),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create room.');

    state.userName = userName;
    state.sessionId = data.sessionId;
    state.isOwner = true;
    state.canInvite = true;

    closeModal(el.modalCreate);
    initSocketAndJoin(data.roomId, data.sessionId, userName, data.roomCode || data.inviteCode);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Create space';
  }
}

async function handleJoinRoom(e) {
  e.preventDefault();
  const roomIdInput = document.getElementById('join-room-id-input').value.trim();
  const userName = document.getElementById('join-name-input').value.trim();
  const errorBox = document.getElementById('join-error-msg');
  const submitBtn = document.getElementById('submit-join-btn');

  errorBox.classList.add('hidden');
  if (!userName || !roomIdInput) return;

  // Robust code cleaner: handles /join/CODE, ?join=CODE, https://.../join/CODE, and raw CODE
  let cleanId = roomIdInput;
  if (cleanId.includes('/')) {
    const parts = cleanId.split('/').filter(Boolean);
    cleanId = parts[parts.length - 1].split('?')[0];
  }
  if (cleanId.includes('=')) {
    const eqParts = cleanId.split('=');
    cleanId = eqParts[eqParts.length - 1].split('&')[0];
  }
  cleanId = cleanId.trim().toUpperCase();

  try {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Checking space...';

    const checkUrl = `/api/rooms/${encodeURIComponent(cleanId)}/check`;
    const checkRes = await fetch(checkUrl);
    const checkData = await checkRes.json();

    if (!checkRes.ok) {
      throw new Error(checkData.error || 'This conversation does not exist or has already ended.');
    }

    state.userName = userName;
    closeModal(el.modalJoin);
    initSocketAndJoin(checkData.roomId || cleanId, null, userName, checkData.roomCode || cleanId);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Enter conversation';
  }
}

// ==========================================
// Socket.IO Real-Time Engine
// ==========================================

function initSocketAndJoin(roomId, initialSessionId, userName, token) {
  if (state.socket) {
    state.socket.disconnect();
  }

  // @ts-ignore
  state.socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  state.socket.on('connect', () => {
    // Send state.sessionId if available, otherwise initialSessionId
    const currentSessionId = state.sessionId || initialSessionId;
    state.socket.emit('room:join', { roomId, sessionId: currentSessionId, userName, token }, (response) => {
      if (!response || !response.success) {
        showToast(response?.error || 'Could not enter room.', 'error');
        showView('landing');
        return;
      }

      const r = response.room;
      state.room = {
        id: r.id,
        code: r.code || r.id,
        name: r.name,
        inviteToken: r.inviteToken || r.code,
        expiresAt: r.expiresAt,
        disappearingTimerSec: r.disappearingTimerSec || 0,
      };
      state.sessionId = r.sessionId;
      state.isOwner = r.isOwner;
      state.canInvite = r.canInvite;
      state.participants = r.participants || [];
      state.messages = r.messages || [];

      // Update URL query state to direct invitation code
      const currentUrl = new URL(window.location.href);
      currentUrl.pathname = '/';
      currentUrl.searchParams.set('join', state.room.code);
      window.history.replaceState({}, '', currentUrl.toString());

      setupActiveRoomUI();
      showView('chat');
      renderMessages();
      renderParticipants();
      startCountdownTimer(r.expiresAt);
      scrollToBottom();

      // Check if call is already in progress in this room
      if (r.activeCall && r.activeCall.active) {
        updateRoomCallBanner(true, r.activeCall.participantCount, r.activeCall.isAudioOnly);
      } else {
        updateRoomCallBanner(false);
      }
    });
  });

  // Socket Events
  state.socket.on('message:new', (msg) => {
    state.messages.push(msg);
    appendMessage(msg);
    scrollToBottom();
  });

  state.socket.on('message:edited', (data) => {
    const msg = state.messages.find(m => m.id === data.id);
    if (msg) {
      msg.text = data.text;
      msg.edited = true;
      updateMessageElement(msg);
    }
  });

  // BUG 1 FIX: Server broadcast for deleted message
  state.socket.on('message:deleted', (data) => {
    state.messages = state.messages.filter(m => m.id !== data.id);
    const msgEl = document.getElementById(`msg-${data.id}`);
    if (msgEl) {
      msgEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      msgEl.style.opacity = '0';
      msgEl.style.transform = 'scale(0.95)';
      setTimeout(() => {
        msgEl.remove();
        checkEmptyState();
      }, 250);
    } else {
      checkEmptyState();
    }
  });

  state.socket.on('messages:disappeared', (data) => {
    if (data.ids && Array.isArray(data.ids)) {
      data.ids.forEach(id => {
        state.messages = state.messages.filter(m => m.id !== id);
        const msgEl = document.getElementById(`msg-${id}`);
        if (msgEl) {
          msgEl.style.transition = 'opacity 0.4s, transform 0.4s';
          msgEl.style.opacity = '0';
          msgEl.style.transform = 'scale(0.95)';
          setTimeout(() => {
            msgEl.remove();
            checkEmptyState();
          }, 400);
        }
      });
    }
  });

  state.socket.on('typing:status', (data) => {
    if (data.isTyping && data.sessionId !== state.sessionId) {
      el.typingText.textContent = `${data.name} is typing...`;
      el.typingBar.classList.remove('hidden');
    } else {
      el.typingBar.classList.add('hidden');
    }
  });

  state.socket.on('participant:joined', (data) => {
    showToast(`${data.name} joined the conversation.`);
  });

  state.socket.on('participant:left', (data) => {
    showToast(`${data.name} left the space.`);
    state.participants = data.participants;
    renderParticipants();
  });

  state.socket.on('participant:kicked', (data) => {
    showToast(`${data.targetName} was removed by the owner.`);
    state.participants = data.participants;
    renderParticipants();
  });

  state.socket.on('participant:kicked_self', (data) => {
    showToast(data.reason || 'You were removed from this room.', 'error');
    if (callState.inCall) leaveCall(false);
    state.socket.disconnect();
    showView('landing');
  });

  state.socket.on('room:participants_updated', (data) => {
    state.participants = data.participants;
    renderParticipants();
  });

  state.socket.on('permission:invite_updated', (data) => {
    state.canInvite = data.canInvite;
    state.room.inviteToken = data.inviteToken;
    setupActiveRoomUI();
    showToast(data.canInvite ? 'You can now invite friends to this room.' : 'Your invite permission was revoked.');
  });

  state.socket.on('room:timer_updated', (data) => {
    state.room.disappearingTimerSec = data.disappearingTimerSec;
    updateDisappearTimerBadge();
    const label = data.disappearingTimerSec > 0 ? `${data.disappearingTimerSec}s` : 'Off';
    showToast(`Disappearing messages set to: ${label}`);
  });

  state.socket.on('system:notification', (data) => {
    showToast(data.text);
  });

  // WebRTC Call Signaling Listeners
  state.socket.on('call:incoming', (data) => {
    // Only show if not already in call
    if (callState.inCall) return;

    callState.incomingCallData = data;
    if (el.incomingCallerName) el.incomingCallerName.textContent = data.callerName || 'Someone';
    if (el.incomingCallerAvatar) el.incomingCallerAvatar.textContent = (data.callerName || '?')[0].toUpperCase();
    if (el.incomingCallType) {
      if (data.isDirectInvite) {
        el.incomingCallType.textContent = `is inviting you to join the ongoing ${data.isAudioOnly ? 'audio' : 'group'} call`;
      } else {
        el.incomingCallType.textContent = data.isAudioOnly
          ? 'is inviting you to an audio call'
          : 'is inviting you to a video call';
      }
    }
    openModal(el.modalIncomingCall);
  });

  state.socket.on('call:status_updated', (data) => {
    updateRoomCallBanner(data.active, data.participantCount, data.isAudioOnly);
  });

  state.socket.on('call:participant-joined', (data) => {
    if (callState.inCall) {
      showToast(`${data.name} joined the call.`);
      updateCallParticipantSummary(data.totalParticipants);
      if (el.modalCallAddParticipants && !el.modalCallAddParticipants.classList.contains('hidden')) {
        renderCallAddParticipantsList();
      }
    }
  });

  state.socket.on('call:participant-left', (data) => {
    if (callState.inCall) {
      showToast(`${data.name} left the call.`);
      removeRemoteTile(data.sessionId);
      updateCallParticipantSummary(data.totalParticipants);
      if (el.modalCallAddParticipants && !el.modalCallAddParticipants.classList.contains('hidden')) {
        renderCallAddParticipantsList();
      }
    }
  });

  state.socket.on('call:participant-media-toggled', (data) => {
    updatePeerMediaStatus(data.sessionId, data.isAudioMuted, data.isVideoMuted);
  });

  state.socket.on('call:offer', async (data) => {
    if (!callState.inCall) return;
    await handleIncomingOffer(data.senderSessionId, data.senderName, data.sdp);
  });

  state.socket.on('call:answer', async (data) => {
    if (!callState.inCall) return;
    await handleIncomingAnswer(data.senderSessionId, data.sdp);
  });

  state.socket.on('call:ice-candidate', async (data) => {
    if (!callState.inCall) return;
    await handleIncomingIceCandidate(data.senderSessionId, data.candidate);
  });

  state.socket.on('call:declined', (data) => {
    if (callState.inCall) {
      showToast(`${data.name} declined the call.`);
    }
  });

  state.socket.on('call:ended', (data) => {
    showToast(data.reason || 'The call has ended.');
    updateRoomCallBanner(false);
    if (callState.inCall) {
      leaveCall(false);
    }
  });

  state.socket.on('room:terminated', (data) => {
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    if (callState.inCall) leaveCall(false);
    state.messages = [];
    state.participants = [];
    state.room = null;
    showView('ended');
  });
}

// ==========================================
// Active Chat Room UI Management
// ==========================================

function setupActiveRoomUI() {
  if (!state.room) return;

  const roomCode = state.room.code || state.room.id;

  el.topRoomName.textContent = state.room.name;
  el.topRoomId.textContent = roomCode;

  // Owner badge & menu options
  el.ownerBadge.classList.toggle('hidden', !state.isOwner);
  const endRoomBtn = document.getElementById('menu-end-room-btn');
  if (endRoomBtn) endRoomBtn.classList.toggle('hidden', !state.isOwner);

  // Invite permission visibility in menu
  const menuInviteBtn = document.getElementById('menu-invite-btn');
  if (menuInviteBtn) {
    menuInviteBtn.classList.toggle('hidden', !state.isOwner && !state.canInvite);
  }

  // Invite section in participant drawer
  const inviteSection = document.getElementById('panel-invite-section');
  if (inviteSection) {
    inviteSection.classList.toggle('hidden', !state.isOwner && !state.canInvite);
  }

  // Display Room Code and Direct Link in Drawer
  const panelCodeInput = document.getElementById('panel-room-code-input');
  if (panelCodeInput) {
    panelCodeInput.value = roomCode;
  }

  const inviteInput = document.getElementById('panel-invite-link-input');
  if (inviteInput) {
    const inviteUrl = `${window.location.origin}/join/${encodeURIComponent(roomCode)}`;
    inviteInput.value = inviteUrl;
  }

  updateDisappearTimerBadge();
}

function updateDisappearTimerBadge() {
  const sec = state.room ? state.room.disappearingTimerSec : 0;
  if (sec > 0) {
    el.headerDisappearBtn.classList.remove('hidden');
    el.headerDisappearBtn.classList.add('flex');
    const label = sec >= 60 ? `${sec / 60}m` : `${sec}s`;
    el.headerDisappearLabel.textContent = label;
  } else {
    el.headerDisappearBtn.classList.add('hidden');
    el.headerDisappearBtn.classList.remove('flex');
  }
}

function startCountdownTimer(expiresAt) {
  if (state.countdownInterval) clearInterval(state.countdownInterval);

  function update() {
    const now = Date.now();
    const diff = Math.max(0, expiresAt - now);

    if (diff <= 0) {
      clearInterval(state.countdownInterval);
      showToast('Room lifetime expired.', 'error');
      showView('ended');
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    let formatted = `${pad(mins)}:${pad(secs)}`;
    if (hours > 0) formatted = `${hours}h ${formatted}`;

    if (el.countdownText) {
      el.countdownText.textContent = `Expires in ${formatted}`;
    }
    if (el.menuCountdownText) {
      el.menuCountdownText.textContent = `Expires in ${formatted}`;
    }

    // Keep pill hidden on mobile screens to prevent squishing the chat header
    if (el.roomCountdownPill) {
      el.roomCountdownPill.classList.remove('hidden');
      el.roomCountdownPill.classList.add('hidden', 'md:flex');
      if (diff < 5 * 60 * 1000) {
        el.roomCountdownPill.classList.add('bg-amber-100', 'text-amber-900');
      }
    }
    if (el.menuCountdownText && diff < 5 * 60 * 1000) {
      el.menuCountdownText.classList.add('text-amber-700');
    }
  }

  update();
  state.countdownInterval = setInterval(update, 1000);
}

// Render Participants in Top Bar and Side Panel
function renderParticipants() {
  const count = state.participants.length;
  el.participantCountLabel.textContent = `${count}/5`;
  document.getElementById('panel-participant-summary').textContent = `${count} of 5 maximum`;

  // If in-call add participants modal is open, refresh it as well
  if (el.modalCallAddParticipants && !el.modalCallAddParticipants.classList.contains('hidden')) {
    renderCallAddParticipantsList();
  }

  // Render top avatar stack
  el.headerAvatarStack.innerHTML = '';
  state.participants.slice(0, 3).forEach((p) => {
    const avatar = document.createElement('div');
    avatar.className = 'w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-medium ring-2 ring-white';
    avatar.style.backgroundColor = p.avatarColor || '#4a6b53';
    avatar.textContent = (p.name || '?')[0].toUpperCase();
    el.headerAvatarStack.appendChild(avatar);
  });

  // Render Panel list
  const panelList = document.getElementById('panel-participants-list');
  panelList.innerHTML = '';

  state.participants.forEach((p) => {
    const isSelf = p.sessionId === state.sessionId;
    const item = document.createElement('div');
    item.className = 'p-3 rounded-xl bg-warm-canvas border border-warm flex items-center justify-between gap-3 text-xs';

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="relative shrink-0">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold" style="background-color: ${p.avatarColor || '#4a6b53'}">
            ${escapeHtml((p.name || '?')[0].toUpperCase())}
          </div>
          <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${p.online ? 'bg-emerald-500' : 'bg-warm-dim'}"></span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-medium text-warm-main truncate">${escapeHtml(p.name)}</span>
            ${isSelf ? '<span class="text-[10px] text-warm-muted">(you)</span>' : ''}
            ${p.isOwner ? '<span class="text-[9px] font-semibold px-1 py-0.2 bg-sage-light text-sage rounded uppercase">Owner</span>' : ''}
            ${p.canInvite && !p.isOwner ? '<span class="text-[9px] font-medium px-1 py-0.2 bg-warm-subtle text-warm-muted rounded">Can invite</span>' : ''}
          </div>
          <p class="text-[10px] text-warm-dim">${p.online ? 'active now' : 'away'}</p>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0 action-buttons"></div>
    `;

    const actionsContainer = item.querySelector('.action-buttons');

    // Owner controls over other members
    if (state.isOwner && !isSelf && !p.isOwner) {
      // Toggle invite button
      const inviteBtn = document.createElement('button');
      inviteBtn.className = `p-1.5 rounded-lg border border-warm hover:bg-warm-subtle text-[10px] font-medium cursor-pointer ${p.canInvite ? 'text-sage' : 'text-warm-muted'}`;
      inviteBtn.title = p.canInvite ? 'Revoke invite privilege' : 'Grant invite privilege';
      inviteBtn.innerHTML = p.canInvite
        ? `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`
        : `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>`;
      inviteBtn.addEventListener('click', () => {
        state.socket.emit('participant:toggle_invite', {
          targetSessionId: p.sessionId,
          canInvite: !p.canInvite,
        });
      });
      actionsContainer.appendChild(inviteBtn);

      // Kick button
      const kickBtn = document.createElement('button');
      kickBtn.className = 'p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 text-[10px] cursor-pointer';
      kickBtn.title = 'Remove from room';
      kickBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
      kickBtn.addEventListener('click', () => {
        if (confirm(`Remove ${p.name} from this conversation?`)) {
          state.socket.emit('participant:kick', { targetSessionId: p.sessionId });
        }
      });
      actionsContainer.appendChild(kickBtn);
    }

    panelList.appendChild(item);
  });
}

// BUG 2 & BUG 3: Short invitation code & direct link copying
function copyInviteLink() {
  if (!state.room) return;
  const roomCode = state.room.code || state.room.id;
  const inviteUrl = `${window.location.origin}/join/${encodeURIComponent(roomCode)}`;
  copyTextToClipboard(inviteUrl, `Invitation link copied: ${inviteUrl}`);
}

function copyInviteCode() {
  if (!state.room) return;
  const roomCode = state.room.code || state.room.id;
  copyTextToClipboard(roomCode, `Room code copied: ${roomCode}`);
}

function copyTextToClipboard(text, successMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage);
    }).catch(() => {
      prompt('Copy text:', text);
    });
  } else {
    prompt('Copy text:', text);
  }
}

// ==========================================
// Messaging & Rendering
// ==========================================

function checkEmptyState() {
  if (!el.roomEmptyState) return;
  const hasMessages = state.messages && state.messages.length > 0;
  el.roomEmptyState.classList.toggle('hidden', hasMessages);
}

function renderMessages() {
  el.messagesList.innerHTML = '';
  checkEmptyState();
  state.messages.forEach((msg) => {
    appendMessage(msg);
  });
}

function appendMessage(msg) {
  checkEmptyState();
  const isSelf = msg.senderSessionId === state.sessionId;
  const wrapper = document.createElement('div');
  wrapper.id = `msg-${msg.id}`;
  wrapper.className = `group flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-full animate-fade-in`;

  const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.className = `relative max-w-[85%] sm:max-w-lg p-3 ${isSelf ? 'msg-bubble-sent' : 'msg-bubble-received'} shadow-xs cursor-pointer`;

  let senderHtml = '';
  if (!isSelf) {
    senderHtml = `
      <div class="flex items-center gap-1.5 mb-1">
        <span class="text-[11px] font-semibold text-warm-main">${escapeHtml(msg.senderName)}</span>
        ${msg.senderIsOwner ? '<span class="text-[9px] font-medium text-sage uppercase">Owner</span>' : ''}
      </div>
    `;
  }

  let replyHtml = '';
  if (msg.replyTo) {
    replyHtml = `
      <div class="mb-2 p-2 rounded-lg bg-warm-subtle/70 border-l-2 border-sage text-[11px] text-warm-muted">
        <span class="font-medium text-warm-main block">${escapeHtml(msg.replyTo.senderName)}</span>
        <p class="truncate italic">${escapeHtml(msg.replyTo.text)}</p>
      </div>
    `;
  }

  let mediaHtml = '';
  if (msg.media) {
    if (msg.media.type === 'image') {
      mediaHtml = `
        <div class="mb-2 rounded-xl overflow-hidden max-w-sm cursor-pointer bg-warm-subtle/50 border border-warm">
          <img src="${msg.media.url}" alt="Shared photo" class="w-full h-auto max-h-72 object-cover hover:opacity-95 transition-opacity chat-img-preview" data-full="${msg.media.url}" loading="lazy" />
        </div>
      `;
    } else if (msg.media.type === 'gif') {
      mediaHtml = `
        <div class="mb-2 rounded-xl overflow-hidden max-w-sm bg-warm-subtle/50 border border-warm">
          <img src="${msg.media.url}" alt="GIF" class="w-full h-auto max-h-64 object-cover" loading="lazy" />
        </div>
      `;
    } else if (msg.media.type === 'sticker') {
      mediaHtml = `
        <div class="py-2 text-center text-5xl">
          <span>${msg.media.url}</span>
        </div>
      `;
    } else if (msg.media.type === 'file') {
      const sizeStr = msg.media.size ? formatFileSize(msg.media.size) : '';
      mediaHtml = `
        <a href="${msg.media.url}" download="${escapeHtml(msg.media.name)}" class="mb-2 p-2.5 rounded-xl bg-warm-subtle/80 hover:bg-warm-subtle border border-warm flex items-center gap-3 transition-colors text-warm-main no-underline block">
          <div class="w-8 h-8 rounded-lg bg-sage-light text-sage flex items-center justify-center shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
          </div>
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium block truncate">${escapeHtml(msg.media.name)}</span>
            <span class="text-[10px] text-warm-muted">${sizeStr}</span>
          </div>
          <svg class="w-4 h-4 text-warm-muted shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
        </a>
      `;
    }
  }

  let textHtml = '';
  if (msg.text) {
    textHtml = `<div class="msg-text text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words text-warm-main">${escapeHtml(msg.text)}</div>`;
  }

  const footerHtml = `
    <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-warm-muted">
      ${msg.edited ? '<span class="italic text-[9px] text-warm-dim">edited</span>' : ''}
      ${msg.expiresAt ? '<svg class="w-2.5 h-2.5 text-amber-700" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' : ''}
      <span class="tabular-nums">${timeStr}</span>
    </div>
  `;

  bubbleWrapper.innerHTML = senderHtml + replyHtml + mediaHtml + textHtml + footerHtml;

  // Lightbox click
  bubbleWrapper.querySelectorAll('.chat-img-preview').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      const src = e.target.getAttribute('data-full');
      if (src) {
        document.getElementById('lightbox-img').src = src;
        openModal(el.modalLightbox);
      }
    });
  });

  // Action Toolbar (Hover on desktop, tap on mobile)
  const actionToolbar = document.createElement('div');
  actionToolbar.className = `hidden group-hover:flex items-center gap-1 mt-1 px-1 text-xs text-warm-muted`;

  // Toggle toolbar on mobile tap
  bubbleWrapper.addEventListener('click', () => {
    actionToolbar.classList.toggle('hidden');
    actionToolbar.classList.toggle('flex');
  });

  // 1. Quick reaction button
  const reactBtn = document.createElement('button');
  reactBtn.className = 'p-1 rounded hover:bg-warm-subtle cursor-pointer';
  reactBtn.title = 'Add reaction';
  reactBtn.innerHTML = '😊';
  reactBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleQuickReactionBar(msg.id, actionToolbar);
  });
  actionToolbar.appendChild(reactBtn);

  // 2. Reply button
  const replyBtn = document.createElement('button');
  replyBtn.className = 'p-1 rounded hover:bg-warm-subtle cursor-pointer';
  replyBtn.title = 'Reply';
  replyBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 016 6v3"/></svg>`;
  replyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setReplyTo(msg);
  });
  actionToolbar.appendChild(replyBtn);

  // 3. Edit button (own message only)
  if (isSelf && msg.text) {
    const editBtn = document.createElement('button');
    editBtn.className = 'p-1 rounded hover:bg-warm-subtle cursor-pointer';
    editBtn.title = 'Edit';
    editBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditMessage(msg);
    });
    actionToolbar.appendChild(editBtn);
  }

  // 4. BUG 1 FIX: Delete button for sender or room owner
  if (isSelf || state.isOwner) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'p-1 rounded hover:bg-red-50 text-red-600 cursor-pointer';
    deleteBtn.title = 'Delete message';
    deleteBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMessage(msg.id);
    });
    actionToolbar.appendChild(deleteBtn);
  }

  // Reactions container below bubble
  const reactionsContainer = document.createElement('div');
  reactionsContainer.id = `reactions-${msg.id}`;
  reactionsContainer.className = 'flex flex-wrap gap-1 mt-1';
  renderReactionsInContainer(reactionsContainer, msg.id, msg.reactions);

  wrapper.appendChild(bubbleWrapper);
  wrapper.appendChild(reactionsContainer);
  wrapper.appendChild(actionToolbar);

  el.messagesList.appendChild(wrapper);
}

function updateMessageElement(msg) {
  const msgEl = document.getElementById(`msg-${msg.id}`);
  if (!msgEl) return;
  const textContainer = msgEl.querySelector('.msg-text');
  if (textContainer) {
    textContainer.textContent = msg.text;
  }
}

// Reactions Rendering
function renderReactionsInContainer(container, messageId, reactions) {
  container.innerHTML = '';
  if (!reactions) return;

  Object.entries(reactions).forEach(([emoji, names]) => {
    if (!names || names.length === 0) return;
    const hasMyReaction = names.includes(state.userName);
    const badge = document.createElement('button');
    badge.className = `px-2 py-0.5 rounded-full text-xs flex items-center gap-1 border transition-colors cursor-pointer ${
      hasMyReaction ? 'bg-sage-light border-sage/30 text-sage' : 'bg-warm-surface border-warm text-warm-main'
    }`;
    badge.title = `${names.join(', ')}`;
    badge.innerHTML = `<span>${emoji}</span> <span class="text-[10px] tabular-nums">${names.length}</span>`;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      sendReaction(messageId, emoji);
    });
    container.appendChild(badge);
  });
}

function updateReactionsUI(messageId, reactions) {
  const container = document.getElementById(`reactions-${messageId}`);
  if (container) {
    renderReactionsInContainer(container, messageId, reactions);
  }
}

function toggleQuickReactionBar(messageId, toolbar) {
  const existing = toolbar.querySelector('.quick-react-palette');
  if (existing) {
    existing.remove();
    return;
  }

  const palette = document.createElement('div');
  palette.className = 'quick-react-palette flex items-center gap-1 bg-warm-surface border border-warm rounded-full px-2 py-1 shadow-md animate-pop-in';
  QUICK_REACTIONS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'hover:scale-125 transition-transform p-0.5 cursor-pointer text-sm';
    btn.textContent = emoji;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sendReaction(messageId, emoji);
      palette.remove();
    });
    palette.appendChild(btn);
  });
  toolbar.prepend(palette);
}

function sendReaction(messageId, emoji) {
  state.socket.emit('message:react', { messageId, emoji });
}

// ==========================================
// Actions: Send, Reply, Edit, Delete
// ==========================================

function handleSendMessage() {
  const text = el.messageInput.value.trim();
  if (!text) return;

  const replyToId = state.activeReply ? state.activeReply.id : undefined;

  state.socket.emit('message:send', { text, replyToId }, (response) => {
    if (!response || !response.success) {
      showToast(response?.error || 'Failed to send message.', 'error');
    }
  });

  el.messageInput.value = '';
  autoResizeTextarea(el.messageInput);
  cancelReply();
  stopTyping();
}

function setReplyTo(msg) {
  state.activeReply = {
    id: msg.id,
    senderName: msg.senderName,
    text: msg.text ? msg.text.slice(0, 80) : (msg.media ? `[${msg.media.type}]` : 'Media'),
  };
  el.replyTargetName.textContent = state.activeReply.senderName;
  el.replyTargetSnippet.textContent = state.activeReply.text;
  el.replyBanner.classList.remove('hidden');
  el.messageInput.focus();
}

function cancelReply() {
  state.activeReply = null;
  el.replyBanner.classList.add('hidden');
}

function openEditMessage(msg) {
  state.editingMessageId = msg.id;
  document.getElementById('edit-msg-input').value = msg.text;
  openModal(el.modalEditMsg);
}

function handleSaveEditMessage() {
  if (!state.editingMessageId) return;
  const newText = document.getElementById('edit-msg-input').value.trim();
  if (!newText) return;

  state.socket.emit('message:edit', { messageId: state.editingMessageId, text: newText }, (res) => {
    if (!res || !res.success) {
      showToast(res?.error || 'Failed to edit message.', 'error');
    } else {
      closeModal(el.modalEditMsg);
      state.editingMessageId = null;
    }
  });
}

// BUG 1 FIX: Iframe-safe delete dialog and execution
function deleteMessage(messageId) {
  state.pendingDeleteMessageId = messageId;
  if (el.modalConfirmDelete) {
    openModal(el.modalConfirmDelete);
  } else {
    executeDeleteMessage(messageId);
  }
}

function executeDeleteMessage(messageId) {
  if (!messageId || !state.socket) return;
  state.socket.emit('message:delete', { messageId }, (res) => {
    if (res && res.success) {
      showToast('Message deleted.');
    } else {
      showToast(res?.error || 'Could not delete message.', 'error');
    }
  });
}

// ==========================================
// Temporary File & Media Upload
// ==========================================

async function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 15 * 1024 * 1024) {
    showToast('File too large (maximum 15MB).', 'error');
    e.target.value = '';
    return;
  }

  showToast('Uploading temporary media...');
  const formData = new FormData();
  formData.append('media', file);
  formData.append('sessionId', state.sessionId);

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(state.room.id)}/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');

    state.socket.emit('message:send', {
      media: {
        fileId: data.fileId,
        type: data.type,
        url: data.url,
        name: data.name,
        size: data.size,
        mimeType: data.mimeType,
      },
      replyToId: state.activeReply ? state.activeReply.id : undefined,
    });

    cancelReply();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    e.target.value = '';
  }
}

// Media Pickers (Stickers & GIFs)
async function loadMediaLibrary() {
  try {
    const res = await fetch('/api/media-library');
    const data = await res.json();
    state.mediaLibrary = data;
    renderStickers();
    renderGifs(data.gifs);
  } catch (err) {
    console.error('Failed to load media library:', err);
  }
}

function openMediaPicker(tab = 'stickers') {
  openModal(el.modalMediaPicker);
  switchMediaTab(tab);
}

function switchMediaTab(tab) {
  const isStickers = tab === 'stickers';
  document.getElementById('media-stickers-view').classList.toggle('hidden', !isStickers);
  document.getElementById('media-gifs-view').classList.toggle('hidden', isStickers);

  document.getElementById('tab-stickers').className = isStickers
    ? 'text-xs font-semibold px-3 py-1 rounded-lg bg-warm-subtle text-warm-main cursor-pointer'
    : 'text-xs font-semibold px-3 py-1 rounded-lg hover:bg-warm-subtle text-warm-muted cursor-pointer';

  document.getElementById('tab-gifs').className = !isStickers
    ? 'text-xs font-semibold px-3 py-1 rounded-lg bg-warm-subtle text-warm-main cursor-pointer'
    : 'text-xs font-semibold px-3 py-1 rounded-lg hover:bg-warm-subtle text-warm-muted cursor-pointer';
}

function renderStickers() {
  el.stickersContainer.innerHTML = '';
  state.mediaLibrary.stickers.forEach((sticker) => {
    const btn = document.createElement('button');
    btn.className = 'p-3 rounded-xl bg-warm-canvas hover:bg-warm-subtle border border-warm flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 cursor-pointer';
    btn.innerHTML = `
      <span class="text-3xl">${sticker.emoji}</span>
      <span class="text-[10px] text-warm-muted truncate w-full text-center">${escapeHtml(sticker.label)}</span>
    `;
    btn.addEventListener('click', () => {
      sendSticker(sticker);
      closeModal(el.modalMediaPicker);
    });
    el.stickersContainer.appendChild(btn);
  });
}

function sendSticker(sticker) {
  state.socket.emit('message:send', {
    media: {
      fileId: sticker.id,
      type: 'sticker',
      url: sticker.emoji,
      name: sticker.name,
    },
    replyToId: state.activeReply ? state.activeReply.id : undefined,
  });
  cancelReply();
}

function renderGifs(gifs) {
  el.gifsContainer.innerHTML = '';
  gifs.forEach((gif) => {
    const item = document.createElement('div');
    item.className = 'rounded-xl overflow-hidden bg-warm-canvas border border-warm cursor-pointer hover:opacity-90 transition-opacity';
    item.innerHTML = `<img src="${gif.preview || gif.url}" alt="${escapeHtml(gif.title)}" class="w-full h-24 object-cover" loading="lazy" />`;
    item.addEventListener('click', () => {
      sendGif(gif);
      closeModal(el.modalMediaPicker);
    });
    el.gifsContainer.appendChild(item);
  });
}

function sendGif(gif) {
  state.socket.emit('message:send', {
    media: {
      fileId: gif.id,
      type: 'gif',
      url: gif.url,
      name: gif.title,
    },
    replyToId: state.activeReply ? state.activeReply.id : undefined,
  });
  cancelReply();
}

async function handleGifSearch(e) {
  const query = e.target.value.trim();
  try {
    const res = await fetch(`/api/media-library?query=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderGifs(data.gifs);
  } catch (err) {}
}

// Emoji Picker
function setupEmojiPicker() {
  el.emojiGrid.innerHTML = '';
  POPULAR_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'p-1 text-base hover:scale-125 transition-transform cursor-pointer';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      insertEmojiAtCursor(emoji);
      el.emojiPickerPopover.classList.add('hidden');
    });
    el.emojiGrid.appendChild(btn);
  });
}

function insertEmojiAtCursor(emoji) {
  const input = el.messageInput;
  const start = input.selectionStart || input.value.length;
  const end = input.selectionEnd || input.value.length;
  input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
  input.selectionStart = input.selectionEnd = start + emoji.length;
  input.focus();
  autoResizeTextarea(input);
}

// ==========================================
// Typing & Scroll Helpers
// ==========================================

function handleTyping() {
  if (!state.isTyping) {
    state.isTyping = true;
    state.socket.emit('typing:start');
  }

  if (state.typingTimeout) clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(stopTyping, 1500);
}

function stopTyping() {
  if (state.isTyping) {
    state.isTyping = false;
    state.socket.emit('typing:stop');
  }
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

function scrollToBottom() {
  el.messagesContainer.scrollTop = el.messagesContainer.scrollHeight;
}

function handleMessagesScroll() {
  const threshold = 150;
  const distFromBottom = el.messagesContainer.scrollHeight - el.messagesContainer.scrollTop - el.messagesContainer.clientHeight;
  el.scrollBottomBtn.classList.toggle('hidden', distFromBottom < threshold);
}

// ==========================================
// Owner & Room Settings Handlers
// ==========================================

function handleSaveTimerSetting() {
  const selected = document.querySelector('input[name="disappear-timer"]:checked');
  if (!selected) return;

  const seconds = Number(selected.value);
  state.socket.emit('room:update_timer', { seconds }, (res) => {
    if (res && res.success) {
      closeModal(el.modalTimerSetting);
    } else {
      showToast(res?.error || 'Failed to update timer.', 'error');
    }
  });
}

function handleEndConversation() {
  state.socket.emit('room:end', {}, (res) => {
    if (res && res.success) {
      closeModal(el.modalConfirmEnd);
      showView('ended');
    } else {
      showToast(res?.error || 'Could not end room.', 'error');
    }
  });
}

function handleLeavePrompt() {
  if (state.isOwner) {
    if (confirm('You are the room owner. If you leave, this conversation will end for everyone. Leave now?')) {
      state.socket.emit('room:leave');
      showView('landing');
    }
  } else {
    if (confirm('Leave this conversation?')) {
      state.socket.emit('room:leave');
      showView('landing');
    }
  }
}

// Format helpers
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================================
// WebRTC Video & Audio Calling Subsystem
// ==========================================

async function loadRtcConfig() {
  try {
    const res = await fetch('/api/rtc-config');
    if (res.ok) {
      const data = await res.json();
      if (data.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        callState.iceServers = data.iceServers;
      }
    }
  } catch (err) {
    console.warn('Could not load ICE config, using default Google STUN:', err);
  }
}

function updateRoomCallBanner(active, count = 1, isAudioOnly = false) {
  callState.roomCallActive = Boolean(active);
  callState.roomCallParticipantCount = count;

  if (active) {
    el.headerActiveCallPill?.classList.remove('hidden');
    el.headerActiveCallPill?.classList.add('flex');
    if (el.headerActiveCallLabel) {
      const typeStr = isAudioOnly ? 'Audio call' : 'Call';
      el.headerActiveCallLabel.textContent = `${typeStr} in progress (${count}/5)`;
    }
  } else {
    el.headerActiveCallPill?.classList.add('hidden');
    el.headerActiveCallPill?.classList.remove('flex');
  }
}

async function getMediaStream(audioOnly, facingMode = 'user') {
  if (audioOnly) {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: facingMode ? { ideal: facingMode } : 'user' },
    });
  } catch (videoErr) {
    console.warn('Camera failed, falling back to audio-only:', videoErr);
    showToast('Camera unavailable or permission denied. Joining with audio only.', 'info');
    callState.isAudioOnly = true;
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

async function startCall(isAudioOnly = false) {
  if (callState.inCall) {
    showToast('You are already in a call.');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Your browser does not support audio/video calls.', 'error');
    return;
  }

  try {
    callState.isAudioOnly = isAudioOnly;
    callState.isMuted = false;
    callState.isVideoOff = isAudioOnly;
    callState.currentFacingMode = 'user';

    const stream = await getMediaStream(isAudioOnly, callState.currentFacingMode);
    callState.localStream = stream;

    const hasVideo = stream.getVideoTracks().length > 0;
    if (!hasVideo) {
      callState.isAudioOnly = true;
      callState.isVideoOff = true;
    }

    state.socket.emit('call:start', { isAudioOnly: callState.isAudioOnly }, (res) => {
      if (!res || !res.success) {
        leaveCall(false);
        showToast(res?.error || 'Could not start call.', 'error');
        return;
      }

      callState.inCall = true;
      renderLocalVideoTile();
      updateCallControlsUI();
      openCallOverlay();
      startCallDurationTimer();

      if (res.alreadyActive && res.existingParticipants && Array.isArray(res.existingParticipants)) {
        res.existingParticipants.forEach((targetSessionId) => {
          createPeerConnectionAndOffer(targetSessionId);
        });
      }

      updateCallParticipantSummary(callState.peers.size + 1);
      showToast(isAudioOnly ? 'Audio call started.' : 'Video call started.');
    });
  } catch (err) {
    console.error('Call initiation error:', err);
    showToast(err.message || 'Could not access microphone/camera.', 'error');
    leaveCall(false);
  }
}

async function acceptCall(isAudioOnly = false) {
  closeModal(el.modalIncomingCall);

  if (callState.inCall) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Your browser does not support audio/video calls.', 'error');
    return;
  }

  try {
    callState.isAudioOnly = isAudioOnly;
    callState.isMuted = false;
    callState.isVideoOff = isAudioOnly;
    callState.currentFacingMode = 'user';

    const stream = await getMediaStream(isAudioOnly, callState.currentFacingMode);
    callState.localStream = stream;

    const hasVideo = stream.getVideoTracks().length > 0;
    if (!hasVideo) {
      callState.isAudioOnly = true;
      callState.isVideoOff = true;
    }

    state.socket.emit('call:accept', { isAudioOnly: callState.isAudioOnly }, (res) => {
      if (!res || !res.success) {
        leaveCall(false);
        showToast(res?.error || 'Could not join call.', 'error');
        return;
      }

      callState.inCall = true;
      renderLocalVideoTile();
      updateCallControlsUI();
      openCallOverlay();
      startCallDurationTimer();

      if (res.existingParticipants && Array.isArray(res.existingParticipants)) {
        res.existingParticipants.forEach((peerSessionId) => {
          createPeerConnectionAndOffer(peerSessionId);
        });
      }

      updateCallParticipantSummary((res.existingParticipants?.length || 0) + 1);
      showToast('Joined group call.');
    });
  } catch (err) {
    console.error('Call acceptance error:', err);
    showToast(err.message || 'Could not access microphone/camera.', 'error');
    leaveCall(false);
  }
}

function declineCall() {
  closeModal(el.modalIncomingCall);
  state.socket?.emit('call:decline');
  callState.incomingCallData = null;
}

function createPeerConnection(targetSessionId) {
  if (callState.peers.has(targetSessionId)) {
    return callState.peers.get(targetSessionId);
  }

  const pc = new RTCPeerConnection({ iceServers: callState.iceServers });
  const remoteStream = new MediaStream();
  const peerObj = {
    pc,
    remoteStream,
    candidateQueue: [],
    isRemoteDescriptionSet: false,
    isAudioMuted: false,
    isVideoMuted: false,
  };

  callState.peers.set(targetSessionId, peerObj);

  if (callState.localStream) {
    callState.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, callState.localStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      state.socket.emit('call:ice-candidate', {
        targetSessionId,
        candidate: event.candidate,
      });
    }
  };

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      event.streams[0].getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
    } else if (event.track) {
      if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
    }
    renderRemoteTile(targetSessionId, remoteStream);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removeRemoteTile(targetSessionId);
    }
  };

  return peerObj;
}

async function createPeerConnectionAndOffer(targetSessionId) {
  const peerObj = createPeerConnection(targetSessionId);
  try {
    const offer = await peerObj.pc.createOffer();
    await peerObj.pc.setLocalDescription(offer);
    state.socket.emit('call:offer', {
      targetSessionId,
      sdp: peerObj.pc.localDescription,
    });
  } catch (err) {
    console.error('Failed to create offer for peer:', targetSessionId, err);
  }
}

async function handleIncomingOffer(senderSessionId, senderName, sdp) {
  const peerObj = createPeerConnection(senderSessionId);
  try {
    await peerObj.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    peerObj.isRemoteDescriptionSet = true;

    while (peerObj.candidateQueue.length > 0) {
      const candidate = peerObj.candidateQueue.shift();
      try {
        await peerObj.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Queued ICE candidate error:', e);
      }
    }

    const answer = await peerObj.pc.createAnswer();
    await peerObj.pc.setLocalDescription(answer);

    state.socket.emit('call:answer', {
      targetSessionId: senderSessionId,
      sdp: peerObj.pc.localDescription,
    });
  } catch (err) {
    console.error('Error handling incoming offer:', err);
  }
}

async function handleIncomingAnswer(senderSessionId, sdp) {
  const peerObj = callState.peers.get(senderSessionId);
  if (!peerObj) return;

  try {
    await peerObj.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    peerObj.isRemoteDescriptionSet = true;

    while (peerObj.candidateQueue.length > 0) {
      const candidate = peerObj.candidateQueue.shift();
      try {
        await peerObj.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Queued ICE candidate error:', e);
      }
    }
  } catch (err) {
    console.error('Error handling answer:', err);
  }
}

async function handleIncomingIceCandidate(senderSessionId, candidate) {
  let peerObj = callState.peers.get(senderSessionId);
  if (!peerObj) {
    peerObj = createPeerConnection(senderSessionId);
  }

  try {
    if (peerObj.isRemoteDescriptionSet) {
      await peerObj.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      peerObj.candidateQueue.push(candidate);
    }
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
  }
}

function renderLocalVideoTile() {
  let tile = document.getElementById('local-video-tile');
  if (!tile) {
    tile = document.createElement('div');
    tile.id = 'local-video-tile';
    tile.className = 'video-tile video-mirror';
    el.callVideoGrid.prepend(tile);
  }

  const nameInitial = (state.userName || 'Y')[0].toUpperCase();

  tile.innerHTML = `
    <video autoplay playsinline muted></video>
    <div class="video-avatar-fallback ${callState.isVideoOff ? 'flex' : 'hidden'} absolute inset-0 flex flex-col items-center justify-center bg-[#292524] text-white">
      <div class="w-14 h-14 rounded-full bg-sage flex items-center justify-center text-lg font-bold mb-1 shadow-md">
        ${escapeHtml(nameInitial)}
      </div>
      <span class="text-[10px] text-warm-dim">Camera is off</span>
    </div>
    <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] pointer-events-none">
      <span class="px-2 py-0.5 rounded-md bg-black/60 text-white font-medium truncate max-w-[75%] backdrop-blur-xs">
        ${escapeHtml(state.userName)} (you)
      </span>
      <span class="mic-muted-badge ${callState.isMuted ? 'flex' : 'hidden'} px-1.5 py-0.5 rounded-md bg-red-600/80 text-white items-center justify-center backdrop-blur-xs">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M3 3l18 18M9 9v3a3 3 0 005.12 2.12M15 9.34V6a3 3 0 00-5.94-.6"/></svg>
      </span>
    </div>
  `;

  const videoEl = tile.querySelector('video');
  if (videoEl && callState.localStream) {
    videoEl.srcObject = callState.localStream;
    videoEl.play().catch(() => {});
  }

  updateCallGridColumns();
}

function renderRemoteTile(sessionId, stream) {
  let tile = document.getElementById(`remote-tile-${sessionId}`);
  const participant = state.participants.find(p => p.sessionId === sessionId);
  const displayName = participant ? participant.name : 'Participant';
  const nameInitial = displayName[0].toUpperCase();

  if (!tile) {
    tile = document.createElement('div');
    tile.id = `remote-tile-${sessionId}`;
    tile.className = 'video-tile';
    el.callVideoGrid.appendChild(tile);
  }

  const peerObj = callState.peers.get(sessionId);
  const isVideoOff = peerObj ? peerObj.isVideoMuted : false;
  const isAudioMuted = peerObj ? peerObj.isAudioMuted : false;

  tile.innerHTML = `
    <video autoplay playsinline></video>
    <div class="video-avatar-fallback ${isVideoOff ? 'flex' : 'hidden'} absolute inset-0 flex flex-col items-center justify-center bg-[#292524] text-white">
      <div class="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold mb-1 shadow-md" style="background-color: ${participant?.avatarColor || '#4a6b53'}">
        ${escapeHtml(nameInitial)}
      </div>
      <span class="text-[10px] text-warm-dim">${isVideoOff ? 'Camera is off' : 'Connected'}</span>
    </div>
    <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] pointer-events-none">
      <span class="px-2 py-0.5 rounded-md bg-black/60 text-white font-medium truncate max-w-[75%] backdrop-blur-xs">
        ${escapeHtml(displayName)}
      </span>
      <span class="mic-muted-badge ${isAudioMuted ? 'flex' : 'hidden'} px-1.5 py-0.5 rounded-md bg-red-600/80 text-white items-center justify-center backdrop-blur-xs">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M3 3l18 18M9 9v3a3 3 0 005.12 2.12M15 9.34V6a3 3 0 00-5.94-.6"/></svg>
      </span>
    </div>
  `;

  const videoEl = tile.querySelector('video');
  if (videoEl && stream) {
    videoEl.srcObject = stream;
    videoEl.play().catch(() => {});
  }

  updateCallGridColumns();
  updateCallParticipantSummary(callState.peers.size + 1);
}

function removeRemoteTile(sessionId) {
  const tile = document.getElementById(`remote-tile-${sessionId}`);
  if (tile) {
    tile.remove();
  }
  const peerObj = callState.peers.get(sessionId);
  if (peerObj) {
    try {
      peerObj.pc.close();
    } catch {}
    callState.peers.delete(sessionId);
  }
  updateCallGridColumns();
  updateCallParticipantSummary(callState.peers.size + 1);
}

function updatePeerMediaStatus(sessionId, isAudioMuted, isVideoMuted) {
  const peerObj = callState.peers.get(sessionId);
  if (peerObj) {
    if (typeof isAudioMuted === 'boolean') peerObj.isAudioMuted = isAudioMuted;
    if (typeof isVideoMuted === 'boolean') peerObj.isVideoMuted = isVideoMuted;
  }

  const tile = document.getElementById(`remote-tile-${sessionId}`);
  if (!tile) return;

  if (typeof isVideoMuted === 'boolean') {
    const fallback = tile.querySelector('.video-avatar-fallback');
    if (fallback) fallback.classList.toggle('hidden', !isVideoMuted);
    if (fallback) fallback.classList.toggle('flex', isVideoMuted);
  }

  if (typeof isAudioMuted === 'boolean') {
    const micBadge = tile.querySelector('.mic-muted-badge');
    if (micBadge) micBadge.classList.toggle('hidden', !isAudioMuted);
    if (micBadge) micBadge.classList.toggle('flex', isAudioMuted);
  }
}

function toggleCallMic() {
  if (!callState.localStream) return;
  const audioTracks = callState.localStream.getAudioTracks();
  if (audioTracks.length === 0) return;

  callState.isMuted = !callState.isMuted;
  audioTracks.forEach(t => t.enabled = !callState.isMuted);

  el.iconMicOn?.classList.toggle('hidden', callState.isMuted);
  el.iconMicOff?.classList.toggle('hidden', !callState.isMuted);

  const localTile = document.getElementById('local-video-tile');
  if (localTile) {
    const badge = localTile.querySelector('.mic-muted-badge');
    badge?.classList.toggle('hidden', !callState.isMuted);
    badge?.classList.toggle('flex', callState.isMuted);
  }

  state.socket?.emit('call:toggle-media', { isAudioMuted: callState.isMuted });
}

function toggleCallCamera() {
  if (!callState.localStream) return;
  const videoTracks = callState.localStream.getVideoTracks();
  if (videoTracks.length === 0) {
    showToast('No camera track available in audio-only mode.');
    return;
  }

  callState.isVideoOff = !callState.isVideoOff;
  videoTracks.forEach(t => t.enabled = !callState.isVideoOff);

  el.iconCameraOn?.classList.toggle('hidden', callState.isVideoOff);
  el.iconCameraOff?.classList.toggle('hidden', !callState.isVideoOff);

  const localTile = document.getElementById('local-video-tile');
  if (localTile) {
    const fallback = localTile.querySelector('.video-avatar-fallback');
    fallback?.classList.toggle('hidden', !callState.isVideoOff);
    fallback?.classList.toggle('flex', callState.isVideoOff);
  }

  state.socket?.emit('call:toggle-media', { isVideoMuted: callState.isVideoOff });
}

async function flipCallCamera() {
  if (!callState.localStream || callState.isAudioOnly) return;
  const oldTrack = callState.localStream.getVideoTracks()[0];
  if (!oldTrack) return;

  const newFacingMode = callState.currentFacingMode === 'user' ? 'environment' : 'user';

  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: newFacingMode } },
    });
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;

    callState.currentFacingMode = newFacingMode;

    callState.peers.forEach((peerObj) => {
      const sender = peerObj.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack);
      }
    });

    callState.localStream.removeTrack(oldTrack);
    oldTrack.stop();
    callState.localStream.addTrack(newTrack);

    const localTile = document.getElementById('local-video-tile');
    if (localTile) {
      localTile.classList.toggle('video-mirror', newFacingMode === 'user');
      const videoEl = localTile.querySelector('video');
      if (videoEl) videoEl.srcObject = callState.localStream;
    }

    showToast(`Switched to ${newFacingMode === 'user' ? 'front' : 'rear'} camera.`);
  } catch (err) {
    console.error('Camera switch error:', err);
    showToast('Could not switch camera.', 'error');
  }
}

function toggleCallMinimized() {
  callState.isMinimized = !callState.isMinimized;
  el.activeCallOverlay?.classList.toggle('call-minimized', callState.isMinimized);
  el.iconMinimize?.classList.toggle('hidden', callState.isMinimized);
  el.iconExpand?.classList.toggle('hidden', !callState.isMinimized);
}

function openCallOverlay() {
  el.activeCallOverlay?.classList.remove('hidden');
  el.activeCallOverlay?.classList.add('flex');
  callState.isMinimized = false;
  el.activeCallOverlay?.classList.remove('call-minimized');
  el.iconMinimize?.classList.remove('hidden');
  el.iconExpand?.classList.add('hidden');
}

function closeCallOverlay() {
  el.activeCallOverlay?.classList.add('hidden');
  el.activeCallOverlay?.classList.remove('flex', 'call-minimized');
}

function updateCallControlsUI() {
  el.iconMicOn?.classList.toggle('hidden', callState.isMuted);
  el.iconMicOff?.classList.toggle('hidden', !callState.isMuted);
  el.iconCameraOn?.classList.toggle('hidden', callState.isVideoOff);
  el.iconCameraOff?.classList.toggle('hidden', !callState.isVideoOff);
  el.callBtnFlipCamera?.classList.toggle('hidden', callState.isAudioOnly);
  el.callBtnEndAll?.classList.toggle('hidden', !state.isOwner);
}

function startCallDurationTimer() {
  stopCallDurationTimer();
  callState.callStartTime = Date.now();
  function tick() {
    const elapsed = Math.floor((Date.now() - callState.callStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (el.callDurationText) el.callDurationText.textContent = `${pad(mins)}:${pad(secs)}`;
  }
  tick();
  callState.durationInterval = setInterval(tick, 1000);
}

function stopCallDurationTimer() {
  if (callState.durationInterval) {
    clearInterval(callState.durationInterval);
    callState.durationInterval = null;
  }
}

function updateCallParticipantSummary(count) {
  if (el.callParticipantSummary) {
    el.callParticipantSummary.textContent = `${count} participant${count === 1 ? '' : 's'} (up to 5)`;
  }
}

function updateCallGridColumns() {
  if (!el.callVideoGrid) return;
  const tileCount = el.callVideoGrid.querySelectorAll('.video-tile').length;
  if (tileCount <= 1) {
    el.callVideoGrid.className = 'flex-1 my-3 w-full max-w-2xl mx-auto grid grid-cols-1 gap-3 overflow-y-auto content-center items-center justify-center';
  } else if (tileCount === 2) {
    el.callVideoGrid.className = 'flex-1 my-3 w-full max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto content-center items-center justify-center';
  } else if (tileCount <= 4) {
    el.callVideoGrid.className = 'flex-1 my-3 w-full max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto content-center items-center justify-center';
  } else {
    el.callVideoGrid.className = 'flex-1 my-3 w-full max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto content-center items-center justify-center';
  }
}

function leaveCall(notifyServer = true) {
  if (callState.localStream) {
    callState.localStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    callState.localStream = null;
  }

  callState.peers.forEach((peerObj) => {
    try {
      peerObj.pc.close();
    } catch {}
  });
  callState.peers.clear();

  stopCallDurationTimer();
  if (el.callVideoGrid) el.callVideoGrid.innerHTML = '';
  closeCallOverlay();
  callState.inCall = false;
  callState.isMinimized = false;

  if (notifyServer && state.socket) {
    state.socket.emit('call:leave');
  }
}

function endCallForAll() {
  if (!confirm('End this call for everyone in the room?')) return;
  state.socket?.emit('call:end', {}, (res) => {
    if (res && res.success) {
      showToast('Call ended for everyone.');
      leaveCall(false);
    } else {
      showToast(res?.error || 'Could not end call.', 'error');
    }
  });
}

// ==========================================
// In-Call Add Participant Feature
// ==========================================
function openAddParticipantsToCallModal() {
  renderCallAddParticipantsList();
  openModal(el.modalCallAddParticipants);
}

function renderCallAddParticipantsList() {
  if (!el.callAddParticipantsList) return;
  el.callAddParticipantsList.innerHTML = '';

  const participants = state.participants || [];
  if (participants.length === 0) {
    el.callAddParticipantsList.innerHTML = `
      <div class="text-center py-6 text-xs text-warm-muted">
        No other participants in this space right now.
      </div>
    `;
    return;
  }

  // Count how many are currently connected to call (self + remote peers)
  const activeCount = 1 + callState.peers.size;
  const isCallFull = activeCount >= 5;

  participants.forEach((p) => {
    const isSelf = p.sessionId === state.sessionId;
    const isAlreadyInCall = isSelf || callState.peers.has(p.sessionId);

    const item = document.createElement('div');
    item.className = 'p-2.5 rounded-xl bg-warm-canvas border border-warm flex items-center justify-between gap-3 text-xs';

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style="background-color: ${p.avatarColor || '#4a6b53'}">
          ${escapeHtml((p.name || '?')[0].toUpperCase())}
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-medium text-warm-main truncate">${escapeHtml(p.name)}</span>
            ${isSelf ? '<span class="text-[10px] text-warm-muted">(you)</span>' : ''}
            ${p.isOwner ? '<span class="text-[9px] font-semibold px-1 py-0.2 bg-sage-light text-sage rounded uppercase">Owner</span>' : ''}
          </div>
          <p class="text-[10px] ${isAlreadyInCall ? 'text-emerald-700 font-medium' : 'text-warm-muted'}">
            ${isAlreadyInCall ? 'In call' : (p.online ? 'In chat (not in call)' : 'Away')}
          </p>
        </div>
      </div>
      <div class="shrink-0 flex items-center">
        ${
          isAlreadyInCall
            ? '<span class="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">Connected</span>'
            : `<button class="ring-add-btn px-2.5 py-1.5 rounded-xl bg-sage hover:bg-[#374e3a] text-white text-xs font-medium cursor-pointer transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed" ${isCallFull ? 'disabled' : ''}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
                <span>${isCallFull ? 'Full' : 'Ring'}</span>
              </button>`
        }
      </div>
    `;

    const ringBtn = item.querySelector('.ring-add-btn');
    if (ringBtn && !isCallFull) {
      ringBtn.addEventListener('click', () => {
        ringParticipantToCall(p.sessionId, p.name, ringBtn);
      });
    }

    el.callAddParticipantsList.appendChild(item);
  });
}

function ringParticipantToCall(targetSessionId, targetName, buttonEl) {
  if (!state.socket || !callState.inCall) return;

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerHTML = `
      <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
      <span>Calling...</span>
    `;
  }

  showToast(`Ringing ${targetName}...`, 'info');

  state.socket.emit('call:ring-participant', { targetSessionId }, (res) => {
    if (res && res.success) {
      showToast(`Invited ${targetName} to join the call.`);
      setTimeout(() => {
        if (buttonEl) {
          buttonEl.innerHTML = `<span>Ringing...</span>`;
        }
      }, 500);
    } else {
      showToast(res?.error || `Could not call ${targetName}.`, 'error');
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.innerHTML = `<span>Ring</span>`;
      }
    }
  });
}

