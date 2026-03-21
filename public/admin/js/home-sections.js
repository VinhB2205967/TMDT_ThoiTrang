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

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

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
