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
    const huyHieu = App.qs('.cart-badge');
    if (!huyHieu) return;
    huyHieu.textContent = String(count ?? 0);
  };

  App.setFavoriteBadge = App.setFavoriteBadge || function setFavoriteBadge(count) {
    const huyHieu = App.qs('.favorite-badge');
    if (!huyHieu) return;
    huyHieu.textContent = String(count ?? 0);
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
    const tuyChon = {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    };

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
})();
