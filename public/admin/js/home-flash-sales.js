(() => {
  const form = document.getElementById('flashSaleCreate');
  const App = window.App || {};

  const thongBao = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    window.alert(message);
  };

  const thongBaoThanhCong = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    window.alert(message);
  };

  function laySanPhamTuSelect(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || [])
      .map((opt) => String(opt.value || '').trim())
      .filter(Boolean)
      .map((id) => ({ sanpham_id: id }));
  }

  function initSelect2() {
    if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.select2) return;
    window.jQuery('.flash-product-select').each(function init() {
      const $el = window.jQuery(this);
      if ($el.hasClass('select2-hidden-accessible')) return;
      $el.select2({
        width: '100%',
        placeholder: 'Chọn sản phẩm',
        closeOnSelect: false,
        allowClear: true
      });
    });
  }

  initSelect2();

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const selected = laySanPhamTuSelect(form.querySelector('select[name="sanpham"]'));
      const payload = {
        ten: fd.get('ten'),
        batdau: fd.get('batdau'),
        ketthuc: fd.get('ketthuc'),
        phantramgiamgia: Number(fd.get('phantramgiamgia') || 0),
        hienthi: Boolean(fd.get('hienthi')),
        sanpham: selected
      };

      const res = await App.apiFetch('/admin/api/flash-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        thongBaoThanhCong(res, 'Tạo Flash Sale thành công');
        window.location.reload();
      }
      else thongBao(res, 'Không thể tạo Flash Sale');
    });
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'delete') {
      if (!App.confirmDelete()) return;
      const res = await App.apiFetch(`/admin/api/flash-sales/${id}`, { method: 'DELETE' });
      if (res.ok) {
        row.remove();
        thongBaoThanhCong(res, 'Đã xóa Flash Sale');
      }
      else thongBao(res, 'Không thể xóa Flash Sale');
      return;
    }

    if (action === 'toggle') {
      const res = await App.apiFetch(`/admin/api/flash-sales/${id}/toggle`, { method: 'PATCH' });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="hienthi"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.hienthi);
        thongBaoThanhCong(res, checkbox && checkbox.checked ? 'Đã bật Flash Sale' : 'Đã tắt Flash Sale');
      }
      if (!res.ok) thongBao(res, 'Không thể bật/tắt Flash Sale');
      return;
    }

    if (action === 'save') {
      const payload = {
        ten: row.querySelector('input[name="ten"]')?.value,
        batdau: row.querySelector('input[name="batdau"]')?.value,
        ketthuc: row.querySelector('input[name="ketthuc"]')?.value,
        phantramgiamgia: Number(row.querySelector('input[name="phantramgiamgia"]')?.value || 0),
        hienthi: Boolean(row.querySelector('input[name="hienthi"]')?.checked),
        sanpham: laySanPhamTuSelect(row.querySelector('select[name="sanpham"]'))
      };

      const res = await App.apiFetch(`/admin/api/flash-sales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const list = row.querySelector('.flash-product-list');
        if (list) {
          const select = row.querySelector('select[name="sanpham"]');
          const names = Array.from(select.selectedOptions || []).map((opt) => opt.textContent || '').filter(Boolean);
          list.innerHTML = names.map((name) => `<div>${name}</div>`).join('');
        }
        thongBaoThanhCong(res, 'Lưu Flash Sale thành công');
        return;
      }
      thongBao(res, 'Không thể cập nhật Flash Sale');
    }
  });
})();
