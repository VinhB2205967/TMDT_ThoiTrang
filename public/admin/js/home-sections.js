(() => {
  const App = window.App || {};

  const thongBao = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    window.alert(message);
  };

  const thongBaoThanhCong = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    window.alert(message);
  };

  function taoPayloadTuDong(row) {
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

  const headerNameEl = document.getElementById('clientHeaderName');
  const headerLogoEl = document.getElementById('clientHeaderLogo');
  const headerLogoPreviewEl = document.getElementById('clientHeaderLogoPreview');
  let logoPreviewUrl = null;

  if (headerLogoEl && headerLogoPreviewEl) {
    headerLogoEl.addEventListener('change', () => {
      const file = headerLogoEl.files && headerLogoEl.files[0];
      if (!file) return;

      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      logoPreviewUrl = URL.createObjectURL(file);
      headerLogoPreviewEl.src = logoPreviewUrl;
    });
  }

  async function luuHeaderClient(btn) {
    if (!headerNameEl) {
      thongBao(null, 'Không tìm thấy ô tên header');
      return;
    }

    const tenHeader = String(headerNameEl.value || '').trim();
    if (!tenHeader) {
      thongBao(null, 'Vui lòng nhập tên header');
      headerNameEl.focus();
      return;
    }

    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = 'Đang lưu...';

    const formData = new FormData();
    formData.append('client_header_name', tenHeader);

    if (headerLogoEl && headerLogoEl.files && headerLogoEl.files[0]) {
      formData.append('client_header_logo', headerLogoEl.files[0]);
    }

    const res = await App.apiFetch('/admin/api/settings/client-header', {
      method: 'PUT',
      body: formData
    });

    btn.disabled = false;
    btn.textContent = oldLabel;

    if (!res.ok) {
      thongBao(res, 'Cập nhật header client thất bại');
      return;
    }

    const logoMoi = res.data && res.data.data && res.data.data.logo ? String(res.data.data.logo) : '';
    if (headerLogoPreviewEl && logoMoi) {
      headerLogoPreviewEl.src = logoMoi;
    }

    if (headerLogoEl) {
      headerLogoEl.value = '';
      if (logoMoi) headerLogoEl.setAttribute('data-current', logoMoi);
    }

    thongBaoThanhCong(res, 'Cập nhật header client thành công');
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'save-client-header') {
      await luuHeaderClient(btn);
      return;
    }

    if (action !== 'save-all') return;

    const rows = Array.from(document.querySelectorAll('tr[data-key]'));
    if (!rows.length) {
      thongBao(null, 'Không có block để lưu');
      return;
    }

    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = 'Đang lưu...';

    const loi = [];
    let savedCount = 0;

    for (const row of rows) {
      const key = row.getAttribute('data-key');
      const payload = taoPayloadTuDong(row);

      const res = await App.apiFetch(`/admin/api/home-sections/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        savedCount += 1;
      } else {
        loi.push(key);
      }
    }

    btn.disabled = false;
    btn.textContent = oldLabel;

    if (!loi.length) {
      thongBaoThanhCong(null, `Đã lưu ${savedCount} block thành công`);
      return;
    }

    thongBao(null, `Đã lưu ${savedCount} block. Lỗi: ${loi.join(', ')}`);
  });
})();
