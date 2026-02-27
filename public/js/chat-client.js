(function () {
  const runtime = window.ChatRuntime || {};
  if (!runtime.userId || runtime.role !== 'client') return;
  if (typeof io === 'undefined') return;

  const toggleBtn = document.getElementById('chatWidgetToggle');
  const panel = document.getElementById('chatWidgetPanel');
  const closeBtn = document.getElementById('chatWidgetClose');
  const expandBtn = document.getElementById('chatWidgetExpand');
  const listEl = document.getElementById('chatWidgetMessages');
  const formEl = document.getElementById('chatWidgetForm');
  const inputEl = document.getElementById('chatWidgetInput');
  const fileEl = document.getElementById('chatWidgetFile');
  const fileBtn = document.getElementById('chatWidgetFileBtn');
  const fileLabel = document.getElementById('chatWidgetFileLabel');
  const previewWrap = document.getElementById('chatWidgetPreview');
  const previewImage = document.getElementById('chatWidgetPreviewImage');
  const previewVideo = document.getElementById('chatWidgetPreviewVideo');
  const previewRemove = document.getElementById('chatWidgetPreviewRemove');
  const unreadBadge = document.getElementById('chatWidgetUnread');
  const statusEl = document.getElementById('chatWidgetStatus');
  const toastWrap = document.getElementById('chatClientToastWrap');

  if (!toggleBtn || !panel || !listEl || !formEl || !inputEl || !unreadBadge) return;

  let isOpen = false;
  let loaded = false;
  let unread = 0;
  let historyLoading = null;
  let previewObjectUrl = null;

  const socket = io({
    auth: {
      userId: runtime.userId,
      role: 'client'
    }
  });

  function formatTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function scrollBottom() {
    listEl.scrollTop = listEl.scrollHeight;
  }

  function renderMessage(message) {
    const role = message.senderRole === 'client' ? 'client' : 'admin';
    const item = document.createElement('div');
    item.className = `chat-msg ${role}`;
    item.innerHTML = `
      <div class="bubble"></div>
      <div class="time"></div>
    `;
    const bubble = item.querySelector('.bubble');
    const text = String(message.content || '').trim();
    if (text) {
      const textNode = document.createElement('div');
      textNode.className = 'chat-msg-text';
      textNode.textContent = text;
      bubble.appendChild(textNode);
    }

    if (message.mediaUrl && message.mediaType === 'image') {
      const image = document.createElement('img');
      image.className = 'chat-msg-media';
      image.src = message.mediaUrl;
      image.alt = message.mediaName || 'image';
      bubble.appendChild(image);
    }

    if (message.mediaUrl && message.mediaType === 'video') {
      const video = document.createElement('video');
      video.className = 'chat-msg-media';
      video.src = message.mediaUrl;
      video.controls = true;
      video.preload = 'metadata';
      bubble.appendChild(video);
    }

    item.querySelector('.time').textContent = formatTime(message.sentAt);
    listEl.appendChild(item);
  }

  function renderMessages(messages) {
    listEl.innerHTML = '';
    (messages || []).forEach(renderMessage);
    scrollBottom();
  }

  function setUnread(value) {
    unread = Math.max(0, Number(value || 0));
    unreadBadge.textContent = String(unread);
    unreadBadge.classList.toggle('d-none', unread <= 0);
    document.title = unread > 0 ? `(${unread}) Tin nhắn mới` : runtime.defaultTitle || document.title;
  }

  function showToast(message) {
    if (!toastWrap || typeof bootstrap === 'undefined') return;
    const id = `chat-toast-${Date.now()}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'toast align-items-center text-bg-dark border-0';
    wrapper.id = id;
    wrapper.setAttribute('role', 'alert');
    wrapper.setAttribute('aria-live', 'assertive');
    wrapper.setAttribute('aria-atomic', 'true');
    wrapper.innerHTML = `
      <div class="d-flex">
        <div class="toast-body"></div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
    wrapper.querySelector('.toast-body').textContent = message;
    toastWrap.appendChild(wrapper);
    const toast = new bootstrap.Toast(wrapper, { delay: 2800 });
    wrapper.addEventListener('hidden.bs.toast', () => wrapper.remove());
    toast.show();
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
    const res = await fetch('/chat/upload', {
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

  async function loadHistory(force = false) {
    if (historyLoading) return historyLoading;
    if (loaded && !force) return;

    historyLoading = (async () => {
    const { ok, data } = await fetchJson('/chat/messages?limit=100');
      if (!ok || !data.success) return;
      renderMessages(data.messages || []);
      if (statusEl) {
        statusEl.textContent = data.adminOnline ? 'Online' : 'Offline';
        statusEl.className = `badge ${data.adminOnline ? 'text-bg-success' : 'text-bg-secondary'}`;
      }
      loaded = true;
    })();

    try {
      await historyLoading;
    } finally {
      historyLoading = null;
    }
  }

  async function loadUnread() {
    const { ok, data } = await fetchJson('/chat/unread-count');
    if (!ok || !data.success) return;
    setUnread(data.count || 0);
  }

  async function markRead() {
    await fetchJson('/chat/read', { method: 'POST' });
    socket.emit('mark_read');
    setUnread(0);
  }

  async function openPanel() {
    panel.classList.add('open');
    isOpen = true;
    await loadHistory(true);
    await markRead();
  }

  function closePanel() {
    panel.classList.remove('open');
    isOpen = false;
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

  toggleBtn.addEventListener('click', () => {
    if (isOpen) {
      closePanel();
      return;
    }
    openPanel();
  });

  closeBtn.addEventListener('click', closePanel);

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      const expanded = panel.classList.toggle('expanded');
      const icon = expandBtn.querySelector('i');
      if (icon) {
        icon.className = expanded ? 'bi bi-arrows-angle-contract' : 'bi bi-arrows-angle-expand';
      }
      scrollBottom();
    });
  }

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = String(inputEl.value || '').trim();
    const file = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
    if (!content && !file) return;

    Promise.resolve()
      .then(async () => {
        let media = null;
        if (file) media = await uploadMedia(file);
        socket.emit('send_message', { content, media });
        inputEl.value = '';
        clearPreview();
      })
      .catch((err) => {
        showToast(err && err.message ? err.message : 'Không thể gửi tệp');
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

  socket.on('receive_message', (message) => {
    if (!message || String(message.clientId) !== String(runtime.userId)) return;
    const fromAdmin = message.senderRole === 'admin';
    if (!loaded) loaded = true;

    if (isOpen) {
      renderMessage(message);
      scrollBottom();
      if (fromAdmin) markRead();
      return;
    }

    if (fromAdmin) {
      setUnread(unread + 1);
      if (document.hidden) {
        showToast('Bạn có tin nhắn mới từ Admin');
      }
    }
  });

  socket.on('unread_count', (payload) => {
    if (!payload) return;
    setUnread(payload.count || 0);
  });

  socket.on('presence_update', (payload) => {
    if (!payload || payload.role !== 'admin' || !statusEl) return;
    statusEl.textContent = payload.online ? 'Online' : 'Offline';
    statusEl.className = `badge ${payload.online ? 'text-bg-success' : 'text-bg-secondary'}`;
  });

  loadUnread();
  loadHistory();
})();
