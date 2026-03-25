(function () {
  const runtime = window.AdminOrderNotifyRuntime || {};
  if (!runtime.adminPath) return;

  const badgeEl = document.getElementById('adminOrderMenuUnread');
  const hintEl = document.getElementById('adminOrderMenuHint');
  const menuLinkEl = document.getElementById('adminOrderMenuLink');
  const summaryUrl = `${runtime.adminPath}/api/orders/new-summary`;
  const storageKey = 'adminOrderLatestOrderId';
  const countKey = 'adminOrderLatestCount';
  let initialized = false;

  function setBadge(count) {
    const value = Math.max(0, Number(count || 0));
    if (badgeEl) {
      badgeEl.textContent = String(value);
      badgeEl.classList.toggle('d-none', value <= 0);
    }
    if (hintEl) {
      hintEl.classList.toggle('d-none', value <= 0);
    }
    if (menuLinkEl) {
      menuLinkEl.classList.toggle('sider-menu-alert', value > 0);
    }
  }

  function showToast(text) {
    if (typeof bootstrap === 'undefined') return;

    let wrap = document.getElementById('adminOrderToastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'adminOrderToastWrap';
      wrap.className = 'toast-container position-fixed top-0 end-0 p-3';
      wrap.style.zIndex = '1080';
      document.body.appendChild(wrap);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'toast text-bg-primary border-0';
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
    const toast = new bootstrap.Toast(toastEl, { delay: 3200 });
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    toast.show();
  }

  async function fetchSummary() {
    const res = await fetch(summaryUrl, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || !data.success) return null;

    const payload = data && data.data && typeof data.data === 'object'
      ? data.data
      : data;

    return {
      count: Math.max(0, Number(payload && payload.count ? payload.count : 0)),
      latestOrder: payload && payload.latestOrder ? payload.latestOrder : null
    };
  }

  async function poll() {
    const summary = await fetchSummary();
    if (!summary) return;

    const latestCount = Math.max(0, Number(summary.count || 0));
    setBadge(latestCount);

    const latest = summary.latestOrder || null;
    const latestId = latest && latest.id ? String(latest.id) : '';
    if (!latestId) return;

    const prevId = sessionStorage.getItem(storageKey) || '';
    const prevCount = Math.max(0, Number(sessionStorage.getItem(countKey) || 0));

    if (!initialized) {
      sessionStorage.setItem(storageKey, latestId);
      sessionStorage.setItem(countKey, String(latestCount));
      initialized = true;
      return;
    }

    if ((prevId && prevId !== latestId) || latestCount > prevCount) {
      const code = latest.madonhang ? `#${latest.madonhang}` : '';
      showToast(`Có đơn hàng mới ${code}`.trim());
    }

    sessionStorage.setItem(storageKey, latestId);
    sessionStorage.setItem(countKey, String(latestCount));
    initialized = true;
  }

  poll().catch(() => {});
  setInterval(() => {
    poll().catch(() => {});
  }, 15000);
})();
