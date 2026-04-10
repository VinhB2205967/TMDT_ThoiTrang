(() => {
  const App = window.App || {};

  const pageRoot = document.querySelector('.home-sections-page');
  const headerLogoEl = document.getElementById('clientHeaderLogo');
  const headerLogoPreviewEl = document.getElementById('clientHeaderLogoPreview');
  let logoPreviewUrl = null;

  function clearRuntimeFlash() {
    document.querySelectorAll('.runtime-flash-home-sections').forEach((node) => node.remove());
  }

  function showRuntimeFlash(type, message) {
    if (!message || !pageRoot) return;

    clearRuntimeFlash();

    const wrap = document.createElement('div');
    wrap.className = 'container mt-3 runtime-flash-home-sections';

    const alertClass = type === 'success'
      ? 'alert-success'
      : (type === 'info' ? 'alert-info' : 'alert-danger');
    const iconClass = type === 'success'
      ? 'bi-check-circle-fill'
      : (type === 'info' ? 'bi-info-circle-fill' : 'bi-exclamation-triangle-fill');

    wrap.innerHTML = `
      <div class="alert ${alertClass} alert-dismissible fade show flash-alert" role="alert" data-auto-dismiss="5000">
        <i class="bi ${iconClass} me-2"></i>${message}
        <button class="btn-close" type="button" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;

    pageRoot.parentNode.insertBefore(wrap, pageRoot);

    if (App.autoDismissAlerts) {
      App.autoDismissAlerts('.runtime-flash-home-sections .flash-alert', 5000);
    }
  }

  function getMessage(res, fallback) {
    return (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
  }

  function buildRowPayload(row) {
    const limitEl = row.querySelector('input[name="limit"]');
    const payload = {
      hienthi: Boolean(row.querySelector('input[name="hienthi"]')?.checked),
      thuTu: Number(row.querySelector('input[name="thuTu"]')?.value || 0),
      config: {}
    };

    if (limitEl) {
      const limitVal = Number(limitEl.value || 0);
      if (limitVal > 0) payload.config.limit = limitVal;
    }

    return payload;
  }

  if (headerLogoEl && headerLogoPreviewEl) {
    headerLogoEl.addEventListener('change', () => {
      const file = headerLogoEl.files && headerLogoEl.files[0];
      if (!file) return;

      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      logoPreviewUrl = URL.createObjectURL(file);
      headerLogoPreviewEl.src = logoPreviewUrl;
    });
  }

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    if (action !== 'save-all') return;

    const rows = Array.from(document.querySelectorAll('tr[data-key]'));
    if (!rows.length) {
      showRuntimeFlash('error', 'Không có block để lưu');
      return;
    }

    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = 'Đang lưu...';

    const failedKeys = [];
    let savedCount = 0;

    for (const row of rows) {
      const key = row.getAttribute('data-key');
      const payload = buildRowPayload(row);

      const res = await App.apiFetch(`/admin/api/home-sections/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        savedCount += 1;
      } else {
        failedKeys.push(key);
      }
    }

    btn.disabled = false;
    btn.textContent = oldLabel;

    if (!failedKeys.length) {
      showRuntimeFlash('success', `Đã lưu ${savedCount} block thành công`);
      return;
    }

    showRuntimeFlash('error', `Đã lưu ${savedCount} block. Lỗi: ${failedKeys.join(', ')}`);
  });
})();
