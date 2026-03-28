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

  // Backward-compatible alias used by some admin templates/scripts
  window.xacNhanXoa = window.xacNhanXoa || function xacNhanXoa(thongBao) {
    return App.confirmDelete(thongBao || 'Bạn có chắc muốn xóa mục này?');
  };
})();
