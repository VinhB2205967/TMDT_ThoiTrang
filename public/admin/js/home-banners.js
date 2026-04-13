(() => {
  const form = document.getElementById('bannerCreate');
  const App = window.App || {};

  function notify(message, type = 'success') {
    if (!message) return;

    let wrap = document.getElementById('adminBannerNotifyStack');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'adminBannerNotifyStack';
      wrap.className = 'admin-notify-stack';
      document.body.appendChild(wrap);
    }

    const isError = type === 'error';
    const item = document.createElement('div');
    item.className = `admin-notify-item ${isError ? 'error' : 'success'}`;
    item.innerHTML = `
      <div class="admin-notify-inner">
        <span class="admin-notify-icon"><i class="bi ${isError ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}"></i></span>
        <div>
          <div class="admin-notify-title">${isError ? 'Thao tac that bai' : 'Thanh cong'}</div>
          <div class="admin-notify-message"></div>
        </div>
        <button type="button" class="admin-notify-close" aria-label="Dong">×</button>
      </div>
    `;
    item.querySelector('.admin-notify-message').textContent = String(message);
    wrap.appendChild(item);

    const close = () => item.remove();
    item.querySelector('.admin-notify-close').addEventListener('click', close);
    setTimeout(close, 3200);
  }

  const showError = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Co loi xay ra';
    notify(message, 'error');
  };

  const showSuccess = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tac thanh cong';
    notify(message, 'success');
  };

  function showImagePreview(fileInput) {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
    const scope = fileInput.closest('tr, form') || fileInput.parentElement;
    if (!scope) return;

    let preview = scope.querySelector('img.img-thumbnail');
    if (!preview) {
      preview = document.createElement('img');
      preview.className = 'img-thumbnail mb-2';
      preview.alt = 'preview';
      preview.style.maxWidth = '120px';
      fileInput.parentNode.insertBefore(preview, fileInput);
    }

    if (preview.dataset.previewUrl) {
      URL.revokeObjectURL(preview.dataset.previewUrl);
    }

    const nextUrl = URL.createObjectURL(fileInput.files[0]);
    preview.src = nextUrl;
    preview.dataset.previewUrl = nextUrl;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      fd.set('thuTu', String(Number(fd.get('thuTu') || 0)));
      fd.set('hienthi', String(Boolean(fd.get('hienthi'))));

      const res = await App.apiFetch('/admin/api/banners', {
        method: 'POST',
        body: fd
      });

      if (res.ok) {
        showSuccess(res, 'Tao banner thanh cong');
        setTimeout(() => {
          window.location.reload();
        }, 650);
      } else {
        showError(res, 'Khong the tao banner');
      }
    });
  }

  document.addEventListener('change', (e) => {
    const fileInput = e.target.closest('input[name="image"][type="file"]');
    if (!fileInput) return;
    showImagePreview(fileInput);
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const row = btn.closest('tr');
    if (!row) return;

    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'delete') {
      if (!App.confirmDelete()) return;

      const res = await App.apiFetch(`/admin/api/banners/${id}`, { method: 'DELETE' });
      if (res.ok) {
        row.remove();
        showSuccess(res, 'Da xoa banner');
      } else {
        showError(res, 'Khong the xoa banner');
      }
      return;
    }

    if (action === 'toggle') {
      const res = await App.apiFetch(`/admin/api/banners/${id}/toggle`, { method: 'PATCH' });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="hienthi"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.hienthi);
        showSuccess(res, checkbox && checkbox.checked ? 'Da bat banner' : 'Da tat banner');
      } else if (!res.ok) {
        showError(res, 'Khong the bat/tat banner');
      }
      return;
    }

    if (action === 'save') {
      const fd = new FormData();
      fd.set('tieude', row.querySelector('input[name="tieude"]')?.value || '');
      fd.set('mota', row.querySelector('input[name="mota"]')?.value || '');
      fd.set('nut_text', row.querySelector('input[name="nut_text"]')?.value || '');
      fd.set('nut_link', row.querySelector('[name="nut_link"]')?.value || '');
      fd.set('thuTu', String(Number(row.querySelector('input[name="thuTu"]')?.value || 0)));
      fd.set('hienthi', String(Boolean(row.querySelector('input[name="hienthi"]')?.checked)));

      const fileInput = row.querySelector('input[name="image"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.set('image', fileInput.files[0]);
      }

      const res = await App.apiFetch(`/admin/api/banners/${id}`, {
        method: 'PUT',
        body: fd
      });

      if (res.ok) {
        showSuccess(res, 'Cap nhat banner thanh cong');
        return;
      }

      showError(res, 'Khong the cap nhat banner');
    }
  });
})();

