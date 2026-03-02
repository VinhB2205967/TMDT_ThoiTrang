(function () {
  const runtime = window.AdminChatRuntime || {};
  if (!runtime.userId || typeof io === 'undefined') return;

  const pageEl = document.querySelector('.chat-admin-page');
  const listEl = document.getElementById('adminChatList');
  const emptyEl = document.getElementById('adminChatEmpty');
  const messagesEl = document.getElementById('adminChatMessages');
  const titleEl = document.getElementById('adminChatUserName');
  const backBtn = document.getElementById('adminChatBackBtn');
  const statusEl = document.getElementById('adminChatUserStatus');
  const formEl = document.getElementById('adminChatForm');
  const inputEl = document.getElementById('adminChatInput');
  const fileEl = document.getElementById('adminChatFile');
  const fileBtn = document.getElementById('adminChatFileBtn');
  const fileLabel = document.getElementById('adminChatFileLabel');
  const previewWrap = document.getElementById('adminChatPreview');
  const previewImage = document.getElementById('adminChatPreviewImage');
  const previewVideo = document.getElementById('adminChatPreviewVideo');
  const previewRemove = document.getElementById('adminChatPreviewRemove');
  const unreadTotalEl = document.getElementById('adminChatUnreadTotal');
  const menuUnreadEl = document.getElementById('adminChatMenuUnread');

  if (!listEl || !messagesEl || !formEl || !inputEl) return;

  const socket = io({
    auth: {
      userId: runtime.userId,
      role: 'admin'
    }
  });

  let conversations = [];
  let activeUserId = '';
  let lastToastAt = 0;
  let previewObjectUrl = null;
  let imageViewerModal = null;

  function isMobileView() {
    return window.matchMedia('(max-width: 767.98px)').matches;
  }

  function setMobileChatActive(active) {
    if (!pageEl) return;
    pageEl.classList.toggle('mobile-chat-active', Boolean(active));
  }

  function syncViewportHeight() {
    const vv = window.visualViewport;
    const height = vv && vv.height ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--chat-vh', `${height * 0.01}px`);

    const keyboardOffset = vv
      ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
      : 0;
    document.documentElement.style.setProperty('--chat-safe-bottom', `${keyboardOffset}px`);
  }

  function showToast(message) {
    if (typeof bootstrap === 'undefined') return;
    const now = Date.now();
    if (now - lastToastAt < 1000) return;
    lastToastAt = now;

    let toastWrap = document.getElementById('adminChatToastWrap');
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.id = 'adminChatToastWrap';
      toastWrap.className = 'toast-container position-fixed top-0 end-0 p-3';
      toastWrap.style.zIndex = '1080';
      document.body.appendChild(toastWrap);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'toast text-bg-dark border-0';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body"></div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
    toastEl.querySelector('.toast-body').textContent = message;
    toastWrap.appendChild(toastEl);

    const toast = new bootstrap.Toast(toastEl, { delay: 2800 });
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    toast.show();
  }

  function setUnreadTotal(count) {
    const value = Math.max(0, Number(count || 0));
    if (unreadTotalEl) unreadTotalEl.textContent = String(value);
    if (menuUnreadEl) {
      menuUnreadEl.textContent = String(value);
      menuUnreadEl.classList.toggle('d-none', value <= 0);
    }
  }

  function clearPreview() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    if (fileEl) fileEl.value = '';
    if (fileLabel) fileLabel.textContent = '';
    if (previewImage) {
      previewImage.src = '';
      previewImage.classList.add('d-none');
    }
    if (previewVideo) {
      previewVideo.src = '';
      previewVideo.classList.add('d-none');
    }
    if (previewWrap) previewWrap.classList.add('d-none');
  }

  function ensureImageViewer() {
    if (imageViewerModal) return imageViewerModal;
    if (typeof bootstrap === 'undefined') return null;

    let modalEl = document.getElementById('adminChatImageViewerModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'adminChatImageViewerModal';
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-xl">
          <div class="modal-content bg-dark border-0">
            <div class="modal-body p-2 text-center">
              <button type="button" class="btn-close btn-close-white position-absolute top-0 end-0 m-2" data-bs-dismiss="modal" aria-label="Close"></button>
              <img id="adminChatImageViewerTarget" src="" alt="preview" style="max-width:100%;max-height:85vh;object-fit:contain;" />
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);
    }

    imageViewerModal = {
      modalEl,
      targetEl: modalEl.querySelector('#adminChatImageViewerTarget'),
      instance: new bootstrap.Modal(modalEl)
    };
    return imageViewerModal;
  }

  function openImageViewer(src) {
    if (!src) return;
    const viewer = ensureImageViewer();
    if (!viewer || !viewer.targetEl) {
      window.open(src, '_blank', 'noopener');
      return;
    }
    viewer.targetEl.src = src;
    viewer.instance.show();
  }

  function formatTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function uploadMedia(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${runtime.adminPath}/chats/api/upload`, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || !data.success || !data.media) {
      throw new Error((data && data.message) || 'Upload thất bại');
    }
    return data.media;
  }

  function renderConversationList() {
    listEl.innerHTML = '';
    if (!conversations.length) {
      listEl.innerHTML = '<div class="p-3 text-muted">Chưa có cuộc trò chuyện nào.</div>';
      return;
    }

    conversations.forEach((item) => {
      const row = document.createElement('div');
      row.className = `chat-list-item ${activeUserId === item.clientId ? 'active' : ''}`;
      row.dataset.userId = item.clientId;
      const avatar = item.userAvatar || item.avatar || '/images/avatar/avatar.png';
      row.innerHTML = `
        <div class="row-1">
          <div class="d-flex align-items-center gap-2 left">
            <img class="chat-list-avatar" src="${avatar}" alt="avatar" />
            <div class="name text-truncate">${item.userName || 'Khách hàng'}</div>
          </div>
          <span class="chat-online-dot ${item.online ? 'online' : ''}"></span>
        </div>
        <div class="row-2 mt-1">
          <div class="left">
            <div class="meta text-truncate">${item.lastMessage || ''}</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <small class="text-muted">${formatTime(item.lastAt)}</small>
            ${item.unreadCount > 0 ? `<span class="badge text-bg-danger">${item.unreadCount}</span>` : ''}
          </div>
        </div>
      `;
      row.addEventListener('click', () => openConversation(item.clientId));
      listEl.appendChild(row);
    });
  }

  function renderMessage(msg) {
    const role = msg.senderRole === 'admin' ? 'admin' : 'client';
    const item = document.createElement('div');
    item.className = `chat-item ${role}`;
    item.innerHTML = `
      <div class="bubble"></div>
      <div class="time">${formatTime(msg.sentAt)}</div>
    `;

    const bubble = item.querySelector('.bubble');
    const text = String(msg.content || '').trim();
    if (text) {
      const textNode = document.createElement('div');
      textNode.className = 'chat-msg-text';
      textNode.textContent = text;
      bubble.appendChild(textNode);
    }

    if (msg.mediaUrl && msg.mediaType === 'image') {
      const image = document.createElement('img');
      image.className = 'chat-msg-media';
      image.src = msg.mediaUrl;
      image.alt = msg.mediaName || 'image';
      image.style.cursor = 'zoom-in';
      image.dataset.previewSrc = msg.mediaUrl;
      bubble.appendChild(image);
    }

    if (msg.mediaUrl && msg.mediaType === 'video') {
      const video = document.createElement('video');
      video.className = 'chat-msg-media';
      video.src = msg.mediaUrl;
      video.controls = true;
      video.preload = 'metadata';
      bubble.appendChild(video);
    }

    messagesEl.appendChild(item);
  }

  function renderMessages(messages) {
    messagesEl.innerHTML = '';
    (messages || []).forEach(renderMessage);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function upsertConversationByMessage(message) {
    const index = conversations.findIndex((x) => x.clientId === message.clientId);
    const isClientMessage = message.senderRole === 'client';
    if (index >= 0) {
      const current = conversations[index];
      const summary = message.content || (message.mediaType === 'video' ? '[Video]' : message.mediaType === 'image' ? '[Hình ảnh]' : '');
      conversations[index] = {
        ...current,
        lastMessage: summary,
        lastAt: message.sentAt,
        unreadCount: isClientMessage && activeUserId !== message.clientId
          ? Number(current.unreadCount || 0) + 1
          : current.unreadCount
      };
    }
    conversations.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
    renderConversationList();
  }

  async function markRead(userId) {
    if (!userId) return;
    await fetchJson(`${runtime.adminPath}/chats/api/read/${userId}`, { method: 'POST' });
    socket.emit('mark_read', { userId });
    conversations = conversations.map((item) => (
      item.clientId === userId ? { ...item, unreadCount: 0 } : item
    ));
    renderConversationList();
    setUnreadTotal(conversations.reduce((acc, item) => acc + Number(item.unreadCount || 0), 0));
  }

  async function openConversation(userId) {
    activeUserId = userId;
    const { ok, data } = await fetchJson(`${runtime.adminPath}/chats/api/messages/${userId}`);
    if (!ok || !data.success) return;
    if (titleEl) titleEl.textContent = data.user && data.user.userName ? data.user.userName : 'Khách hàng';
    if (statusEl) {
      statusEl.textContent = data.online ? 'Online' : 'Offline';
      statusEl.className = `badge ${data.online ? 'text-bg-success' : 'text-bg-secondary'}`;
    }
    renderMessages(data.messages || []);
    if (emptyEl) emptyEl.classList.add('d-none');
    renderConversationList();
    socket.emit('join_user_room', { userId });
    markRead(userId);
    if (isMobileView()) {
      setMobileChatActive(true);
    }
  }

  async function loadConversations() {
    const { ok, data } = await fetchJson(`${runtime.adminPath}/chats/api/conversations`);
    if (!ok || !data.success) return;
    conversations = data.conversations || [];
    renderConversationList();
    setUnreadTotal(conversations.reduce((acc, item) => acc + Number(item.unreadCount || 0), 0));
    if (conversations.length && !activeUserId && !isMobileView()) {
      openConversation(conversations[0].clientId);
    }
  }

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = String(inputEl.value || '').trim();
    const file = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
    if ((!content && !file) || !activeUserId) return;

    Promise.resolve()
      .then(async () => {
        let media = null;
        if (file) media = await uploadMedia(file);
        socket.emit('send_message', { userId: activeUserId, content, media });
        inputEl.value = '';
        clearPreview();
      })
      .catch(() => {
        window.alert('Không thể gửi tệp. Vui lòng thử lại.');
      });
  });

  if (fileBtn && fileEl) {
    fileBtn.addEventListener('click', () => fileEl.click());
    fileEl.addEventListener('change', () => {
      const f = fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
      if (!f) {
        clearPreview();
        return;
      }

      if (fileLabel) fileLabel.textContent = `Đã chọn: ${f.name}`;
      if (!previewWrap || !previewImage || !previewVideo) return;

      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }

      previewObjectUrl = URL.createObjectURL(f);
      previewWrap.classList.remove('d-none');

      if (String(f.type || '').startsWith('video/')) {
        previewImage.src = '';
        previewImage.classList.add('d-none');
        previewVideo.src = previewObjectUrl;
        previewVideo.classList.remove('d-none');
      } else {
        previewVideo.src = '';
        previewVideo.classList.add('d-none');
        previewImage.src = previewObjectUrl;
        previewImage.classList.remove('d-none');
      }
    });
  }

  if (previewRemove) {
    previewRemove.addEventListener('click', clearPreview);
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      setMobileChatActive(false);
    });
  }

  messagesEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || !(target instanceof HTMLImageElement)) return;
    if (!target.classList.contains('chat-msg-media')) return;
    const src = target.dataset.previewSrc || target.getAttribute('src') || '';
    openImageViewer(src);
  });

  socket.on('receive_message', (message) => {
    if (!message || !message.clientId) return;
    upsertConversationByMessage(message);

    if (message.senderRole === 'client') {
      const senderName = message.userName || message.clientName || 'Khách hàng';
      if (String(message.clientId) !== String(activeUserId) || document.hidden) {
        showToast(`Tin nhắn mới từ ${senderName}`);
      }
    }

    if (String(message.clientId) === String(activeUserId)) {
      renderMessage(message);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (message.senderRole === 'client') markRead(activeUserId);
    }
  });

  socket.on('presence_update', (payload) => {
    if (!payload || payload.role !== 'client' || !payload.userId) return;
    conversations = conversations.map((item) => (
      item.clientId === payload.userId ? { ...item, online: Boolean(payload.online) } : item
    ));
    renderConversationList();
    if (activeUserId === payload.userId && statusEl) {
      statusEl.textContent = payload.online ? 'Online' : 'Offline';
      statusEl.className = `badge ${payload.online ? 'text-bg-success' : 'text-bg-secondary'}`;
    }
  });

  socket.on('unread_total', (payload) => {
    if (!payload) return;
    setUnreadTotal(payload.count || 0);
  });

  window.addEventListener('resize', () => {
    syncViewportHeight();
    if (!isMobileView()) {
      setMobileChatActive(false);
      if (!activeUserId && conversations.length) {
        openConversation(conversations[0].clientId);
      }
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportHeight);
    window.visualViewport.addEventListener('scroll', syncViewportHeight);
  }

  syncViewportHeight();
  loadConversations();
})();
