(() => {
  const App = (window.App = window.App || {});

  App.qs = App.qs || function qs(selector, root = document) {
    return root.querySelector(selector);
  };

  App.qsa = App.qsa || function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  };

  App.formatNumberVI = App.formatNumberVI || function formatNumberVI(n) {
    try {
      return new Intl.NumberFormat('vi-VN').format(Number(n || 0));
    } catch {
      return String(Number(n || 0));
    }
  };

  App.formatVND = App.formatVND || function formatVND(n) {
    return App.formatNumberVI(n) + 'đ';
  };

  App.setCartBadge = App.setCartBadge || function setCartBadge(count) {
    const value = String(count ?? 0);
    const nodes = [
      ...App.qsa('.cart-badge'),
      ...App.qsa('a[href="/cart"] .badge-counter')
    ];
    if (!nodes.length) return;
    nodes.forEach((node) => {
      node.textContent = value;
    });
  };

  App.setFavoriteBadge = App.setFavoriteBadge || function setFavoriteBadge(count) {
    const value = String(count ?? 0);
    const nodes = [
      ...App.qsa('.favorite-badge'),
      ...App.qsa('.badge-favorite'),
      ...App.qsa('a[href="/favorites"] .badge-counter')
    ];
    if (!nodes.length) return;
    nodes.forEach((node) => {
      node.textContent = value;
    });
  };

  App.getFavoriteBadgeCount = App.getFavoriteBadgeCount || function getFavoriteBadgeCount() {
    const node = App.qs('.badge-favorite')
      || App.qs('.favorite-badge')
      || App.qs('a[href="/favorites"] .badge-counter');
    if (!node) return 0;
    const value = parseInt(String(node.textContent || '0').trim(), 10);
    return Number.isFinite(value) ? value : 0;
  };

  App.flyToCart = App.flyToCart || function flyToCart(sourceEl, targetEl) {
    if (!sourceEl || !(sourceEl instanceof Element)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const target = targetEl || App.qs('.header-nav a[href="/cart"], .cart-badge');
    if (!target) return;

    const img = sourceEl instanceof HTMLImageElement ? sourceEl : sourceEl.querySelector('img');
    if (!img) return;

    const start = img.getBoundingClientRect();
    const end = target.getBoundingClientRect();
    if (!start || !end) return;

    const ghost = img.cloneNode(true);
    ghost.classList.add('fly-to-cart');
    ghost.style.left = `${start.left}px`;
    ghost.style.top = `${start.top}px`;
    ghost.style.width = `${start.width}px`;
    ghost.style.height = `${start.height}px`;

    document.body.appendChild(ghost);

    const deltaX = (end.left + end.width / 2) - (start.left + start.width / 2);
    const deltaY = (end.top + end.height / 2) - (start.top + start.height / 2);

    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.15)`;
      ghost.style.opacity = '0.2';
    });

    setTimeout(() => {
      ghost.remove();
    }, 700);
  };

  App.wantsJsonResponse = App.wantsJsonResponse || function wantsJsonResponse(res) {
    const kieuNoiDung = String(res.headers.get('content-type') || '');
    return kieuNoiDung.includes('application/json');
  };

  App.safeJson = App.safeJson || async function safeJson(res) {
    if (!App.wantsJsonResponse(res)) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  App.apiFetch = App.apiFetch || async function apiFetch(url, options = {}, cfg = {}) {
    const { redirectOn401 = true } = cfg;
    const meta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = meta ? String(meta.getAttribute('content') || '') : '';
    const tuyChon = {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    };

    if (csrfToken && !tuyChon.headers['X-CSRF-Token']) {
      const method = String(tuyChon.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        tuyChon.headers['X-CSRF-Token'] = csrfToken;
      }
    }

    const phanHoi = await fetch(url, tuyChon);
    const duLieu = await App.safeJson(phanHoi);

    if (phanHoi.status === 401) {
      if (redirectOn401) {
        const chuyenHuong = duLieu && duLieu.redirect ? duLieu.redirect : '/auth?mode=login';
        window.location.href = chuyenHuong;
      }
      return { ok: false, status: 401, data: duLieu };
    }

    return { ok: phanHoi.ok, status: phanHoi.status, data: duLieu };
  };

  App.confirmDelete = App.confirmDelete || function confirmDelete(message = 'Bạn có chắc muốn xóa mục này?') {
    return window.confirm(message);
  };

  App.isDeleteActionUrl = App.isDeleteActionUrl || function isDeleteActionUrl(rawUrl) {
    if (!rawUrl) return false;
    try {
      const u = new URL(String(rawUrl), window.location.href);
      const p = u.pathname || '';
      return /\/(delete|hard-delete)$/.test(p);
    } catch {
      return false;
    }
  };

  App.installAutoDeleteConfirm = App.installAutoDeleteConfirm || function installAutoDeleteConfirm(options = {}) {
    const cfg = {
      root: document.body,
      defaultMessage: 'Bạn có chắc muốn xóa mục này?',
      ...options
    };

    const root = cfg.root || document.body;
    if (!root || !(root instanceof Element)) return;

    // Prevent installing multiple times on the same root.
    if (root.__autoDeleteConfirmInstalled) return;
    root.__autoDeleteConfirmInstalled = true;

    const getMessage = (el) => {
      if (!el || !(el instanceof Element)) return cfg.defaultMessage;
      return el.getAttribute('data-confirm')
        || el.getAttribute('data-confirm-message')
        || el.getAttribute('data-confirm-delete')
        || cfg.defaultMessage;
    };

    root.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // 1) <a href=".../delete">...</a>
      const link = target.closest('a[href]');
      if (link && App.isDeleteActionUrl(link.getAttribute('href'))) {
        // If inline onclick already calls xacNhanXoa, skip to avoid double popup.
        const onClick = link.getAttribute('onclick') || '';
        if (onClick.includes('xacNhanXoa')) return;

        if (!App.confirmDelete(getMessage(link))) e.preventDefault();
        return;
      }

      // 2) <button> inside a form[action=".../delete"]
      const btn = target.closest('button');
      const form = btn && btn.form ? btn.form : null;
      const action = form ? (form.getAttribute('action') || form.action) : '';
      if (form && App.isDeleteActionUrl(action)) {
        if (!App.confirmDelete(getMessage(btn))) e.preventDefault();
      }
    });
  };

  const boHenGio = (App.__debounceTimers = App.__debounceTimers || new Map());
  App.debounce = App.debounce || function debounce(callback, delay, key = 'default') {
    const khoa = String(key);
    const henGioCu = boHenGio.get(khoa);
    if (henGioCu) clearTimeout(henGioCu);
    const henGioMoi = setTimeout(callback, delay);
    boHenGio.set(khoa, henGioMoi);
  };

  App.autoDismissAlerts = App.autoDismissAlerts || function autoDismissAlerts(selector = '.flash-alert', ms = 5000) {
    const danhSach = App.qsa(selector);
    if (!danhSach.length) return;

    danhSach.forEach((el) => {
      const thuocTinhTre = el.getAttribute('data-auto-dismiss');
      const thoiGian = thuocTinhTre ? Math.max(0, parseInt(thuocTinhTre, 10) || ms) : ms;

      setTimeout(() => {
        try {
          // Bootstrap 5 Alert (if available)
          if (window.bootstrap && window.bootstrap.Alert) {
            const inst = window.bootstrap.Alert.getOrCreateInstance(el);
            inst.close();
            return;
          }
        } catch {
          // ignore
        }

        // Fallback: remove element
        el.remove();
      }, thoiGian);
    });
  };

  App.notify = App.notify || function notify(message, options = {}) {
    const text = String(message || '').trim() || 'Thông báo';
    const cfg = {
      type: 'info',
      title: '',
      duration: 3200,
      actionText: '',
      onAction: null,
      ...options
    };

    const styleId = 'app-notify-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .app-notify-wrap{position:fixed;top:18px;right:18px;z-index:1080;display:flex;flex-direction:column;gap:10px;max-width:min(92vw,380px)}
        .app-notify{display:flex;gap:12px;align-items:flex-start;padding:12px 12px 12px 10px;border-radius:14px;border:1px solid #bfdbfe;box-shadow:0 14px 28px rgba(29,78,216,.14);background:linear-gradient(135deg,#f8fbff 0%,#eff6ff 100%);animation:appNotifyIn .22s ease}
        .app-notify__dot{width:10px;height:10px;border-radius:999px;flex:0 0 auto;margin-top:7px;background:#2563eb}
        .app-notify__content{flex:1 1 auto;min-width:0}
        .app-notify__title{font-weight:700;font-size:14px;line-height:1.35;color:#1e3a8a;margin:0 0 2px}
        .app-notify__message{font-size:14px;line-height:1.4;color:#1e40af;margin:0}
        .app-notify__btn{border:none;background:#2563eb;color:#fff;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;align-self:center}
        .app-notify__btn:hover{background:#1d4ed8}
        .app-notify--success .app-notify__dot{background:#1d4ed8}
        .app-notify--warning .app-notify__dot{background:#3b82f6}
        .app-notify--error .app-notify__dot{background:#1e40af}
        .app-notify--info .app-notify__dot{background:#2563eb}
        @keyframes appNotifyIn{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
      `;
      document.head.appendChild(style);
    }

    let wrap = App.qs('.app-notify-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'app-notify-wrap';
      document.body.appendChild(wrap);
    }

    const root = document.createElement('div');
    root.className = `app-notify app-notify--${String(cfg.type || 'info').toLowerCase()}`;

    const dot = document.createElement('span');
    dot.className = 'app-notify__dot';

    const content = document.createElement('div');
    content.className = 'app-notify__content';

    const title = document.createElement('p');
    title.className = 'app-notify__title';
    title.textContent = String(cfg.title || (cfg.type === 'error' ? 'Không thành công' : 'Thông báo'));

    const msg = document.createElement('p');
    msg.className = 'app-notify__message';
    msg.textContent = text;

    content.appendChild(title);
    content.appendChild(msg);
    root.appendChild(dot);
    root.appendChild(content);

    if (cfg.actionText && typeof cfg.onAction === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-notify__btn';
      btn.textContent = String(cfg.actionText);
      btn.addEventListener('click', () => {
        try { cfg.onAction(); } catch {}
      });
      root.appendChild(btn);
    }

    wrap.appendChild(root);

    const timeout = Math.max(800, parseInt(String(cfg.duration), 10) || 3200);
    setTimeout(() => {
      root.remove();
      if (wrap && !wrap.children.length) wrap.remove();
    }, timeout);
  };

  // Backward-compatible alias used by some admin templates/scripts
  window.xacNhanXoa = window.xacNhanXoa || function xacNhanXoa(thongBao) {
    return App.confirmDelete(thongBao || 'Bạn có chắc muốn xóa mục này?');
  };
})();
