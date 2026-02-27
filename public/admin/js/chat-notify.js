(function () {
  const runtime = window.AdminChatNotifyRuntime || {};
  if (!runtime.userId || typeof io === 'undefined') return;

  const isChatPage = String(window.location.pathname || '').startsWith(`${runtime.adminPath}/chats`);
  if (isChatPage) return;

  const menuUnreadEl = document.getElementById('adminChatMenuUnread');

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  function setUnread(count) {
    if (!menuUnreadEl) return;
    const value = Math.max(0, Number(count || 0));
    menuUnreadEl.textContent = String(value);
    menuUnreadEl.classList.toggle('d-none', value <= 0);
  }

  function showToast(text) {
    if (typeof bootstrap === 'undefined') return;

    let wrap = document.getElementById('adminChatToastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'adminChatToastWrap';
      wrap.className = 'toast-container position-fixed top-0 end-0 p-3';
      wrap.style.zIndex = '1080';
      document.body.appendChild(wrap);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'toast text-bg-dark border-0';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${text}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;

    wrap.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: 2800 });
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    toast.show();
  }

  const socket = io({
    auth: {
      userId: runtime.userId,
      role: 'admin'
    }
  });

  socket.on('receive_message', (message) => {
    if (!message || message.senderRole !== 'client') return;
    showToast('Bạn có tin nhắn mới từ khách hàng');
  });

  socket.on('unread_total', (payload) => {
    if (!payload) return;
    setUnread(payload.count || 0);
  });

  fetchJson(`${runtime.adminPath}/chats/api/unread-total`).then(({ ok, data }) => {
    if (!ok || !data || !data.success) return;
    setUnread(data.count || 0);
  });
})();
