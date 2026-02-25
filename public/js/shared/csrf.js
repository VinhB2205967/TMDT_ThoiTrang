(() => {
  function getToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? String(meta.getAttribute('content') || '') : '';
  }

  function ensureHiddenToken(form, token) {
    if (!form || !token) return;
    const existing = form.querySelector('input[name="_csrf"]');
    if (existing) {
      existing.value = token;
      return;
    }
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = '_csrf';
    input.value = token;
    form.appendChild(input);
  }

  function injectIntoForms() {
    const token = getToken();
    if (!token) return;
    const forms = document.querySelectorAll('form[method="POST"], form[method="post"]');
    forms.forEach((form) => ensureHiddenToken(form, token));
  }

  function isSameOrigin(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.origin === window.location.origin;
    } catch {
      return true;
    }
  }

  function patchFetch() {
    const token = getToken();
    if (!token || !window.fetch) return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (url, options = {}) => {
      const opts = options || {};
      const method = String(opts.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && isSameOrigin(url)) {
        opts.headers = { ...(opts.headers || {}), 'X-CSRF-Token': token };
      }
      return originalFetch(url, opts);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectIntoForms();
    patchFetch();
  });
})();
