(function () {
  const runtime = window.AdminChatRuntime || {};
  if (!runtime.userId || typeof io === 'undefined') return;

  const listEl = document.getElementById('adminChatList');
  const emptyEl = document.getElementById('adminChatEmpty');
  const messagesEl = document.getElementById('adminChatMessages');
  const titleEl = document.getElementById('adminChatUserName');
  const statusEl = document.getElementById('adminChatUserStatus');
  const formEl = document.getElementById('adminChatForm');
  const inputEl = document.getElementById('adminChatInput');
  const fileEl = document.getElementById('adminChatFile');
  const fileBtn = document.getElementById('adminChatFileBtn');
  const fileLabel = document.getElementById('adminChatFileLabel');
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

  function setUnreadTotal(count) {
    const value = Math.max(0, Number(count || 0));
    if (unreadTotalEl) unreadTotalEl.textContent = String(value);
    if (menuUnreadEl) {
      menuUnreadEl.textContent = String(value);
      menuUnreadEl.classList.toggle('d-none', value <= 0);
    }
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
      row.innerHTML = `
        <div class="row-1">
          <div class="name">${item.userName || 'Khách hàng'}</div>
          <span class="chat-online-dot ${item.online ? 'online' : ''}"></span>
        </div>
        <div class="row-2 mt-1">
          <div class="meta text-truncate" style="max-width: 190px">${item.lastMessage || ''}</div>
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
  }

  async function loadConversations() {
    const { ok, data } = await fetchJson(`${runtime.adminPath}/chats/api/conversations`);
    if (!ok || !data.success) return;
    conversations = data.conversations || [];
    renderConversationList();
    setUnreadTotal(conversations.reduce((acc, item) => acc + Number(item.unreadCount || 0), 0));
    if (conversations.length && !activeUserId) {
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
        if (fileEl) fileEl.value = '';
        if (fileLabel) fileLabel.textContent = '';
      })
      .catch(() => {
        window.alert('Không thể gửi tệp. Vui lòng thử lại.');
      });
  });

  if (fileBtn && fileEl) {
    fileBtn.addEventListener('click', () => fileEl.click());
    fileEl.addEventListener('change', () => {
      const f = fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
      if (!fileLabel) return;
      fileLabel.textContent = f ? `Đã chọn: ${f.name}` : '';
    });
  }

  socket.on('receive_message', (message) => {
    if (!message || !message.clientId) return;
    upsertConversationByMessage(message);
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

  loadConversations();
})();
