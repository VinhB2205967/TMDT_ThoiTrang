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
    const badge = App.qs('.cart-badge');
    if (!badge) return;
    badge.textContent = String(count ?? 0);
  };

  App.wantsJsonResponse = App.wantsJsonResponse || function wantsJsonResponse(res) {
    const ct = String(res.headers.get('content-type') || '');
    return ct.includes('application/json');
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
    const opts = {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    };

    const res = await fetch(url, opts);
    const data = await App.safeJson(res);

    if (res.status === 401) {
      if (redirectOn401) {
        const redirect = data && data.redirect ? data.redirect : '/auth?mode=login';
        window.location.href = redirect;
      }
      return { ok: false, status: 401, data };
    }

    return { ok: res.ok, status: res.status, data };
  };

  const __debounceTimers = (App.__debounceTimers = App.__debounceTimers || new Map());
  App.debounce = App.debounce || function debounce(callback, delay, key = 'default') {
    const k = String(key);
    const old = __debounceTimers.get(k);
    if (old) clearTimeout(old);
    const t = setTimeout(callback, delay);
    __debounceTimers.set(k, t);
  };

  App.autoDismissAlerts = App.autoDismissAlerts || function autoDismissAlerts(selector = '.flash-alert', ms = 5000) {
    const els = App.qsa(selector);
    if (!els.length) return;

    els.forEach((el) => {
      const delayAttr = el.getAttribute('data-auto-dismiss');
      const delay = delayAttr ? Math.max(0, parseInt(delayAttr, 10) || ms) : ms;

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
      }, delay);
    });
  };
})();
