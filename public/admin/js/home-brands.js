(() => {
  const form = document.getElementById('brandCreate');
  const App = window.App || {};

  const toBoolString = (value) => String(Boolean(value));
  const thongBao = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    window.alert(message);
  };

  async function capNhatToggle(id, loai, value) {
    const endpoint = loai === 'featured' ? `/admin/brands/${id}/featured` : `/admin/brands/${id}/active`;
    const body = loai === 'featured' ? { noiBat: value } : { hienthi: value };
    return App.apiFetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      fd.set('thuTu', String(Number(fd.get('thuTu') || 0)));
      fd.set('noiBat', toBoolString(fd.get('noiBat')));
      fd.set('hienthi', toBoolString(fd.get('hienthi')));

      const res = await App.apiFetch('/admin/brands', {
        method: 'POST',
        body: fd
      });

      if (res.ok) window.location.reload();
      else thongBao(res, 'Không thể tạo thương hiệu');
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
      const res = await App.apiFetch(`/admin/brands/${id}`, { method: 'DELETE' });
      if (res.ok) row.remove();
      else thongBao(res, 'Không thể xóa thương hiệu');
      return;
    }

    if (action === 'featured') {
      const checkbox = row.querySelector('input[name="noiBat"]');
      const noiBat = !Boolean(checkbox?.checked);
      const res = await capNhatToggle(id, 'featured', noiBat);
      if (res.ok && res.data && res.data.data) {
        if (checkbox) checkbox.checked = Boolean(res.data.data.noiBat);
      }
      if (!res.ok) thongBao(res, 'Không thể cập nhật nổi bật');
      return;
    }

    if (action === 'save') {
      const fd = new FormData();
      fd.set('ten', row.querySelector('input[name="ten"]')?.value || '');
      fd.set('thuTu', String(Number(row.querySelector('input[name="thuTu"]')?.value || 0)));
      fd.set('noiBat', toBoolString(row.querySelector('input[name="noiBat"]')?.checked));
      fd.set('hienthi', toBoolString(row.querySelector('input[name="hienthi"]')?.checked));

      const fileInput = row.querySelector('input[name="logo"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.set('logo', fileInput.files[0]);
      }

      const res = await App.apiFetch(`/admin/brands/${id}`, {
        method: 'PUT',
        body: fd
      });

      if (res.ok) return;
      thongBao(res, 'Không thể cập nhật thương hiệu');
    }
  });

  document.addEventListener('change', async (e) => {
    const featuredCk = e.target.closest('input[name="noiBat"]');
    if (featuredCk) {
      const row = featuredCk.closest('tr[data-id]');
      if (!row) return;
      const id = row.getAttribute('data-id');
      const res = await capNhatToggle(id, 'featured', Boolean(featuredCk.checked));
      if (!res.ok) {
        featuredCk.checked = !featuredCk.checked;
        thongBao(res, 'Không thể cập nhật nổi bật');
      }
      return;
    }

    const activeCk = e.target.closest('input[name="hienthi"]');
    if (activeCk) {
      const row = activeCk.closest('tr[data-id]');
      if (!row) return;
      const id = row.getAttribute('data-id');
      const res = await capNhatToggle(id, 'active', Boolean(activeCk.checked));
      if (!res.ok) {
        activeCk.checked = !activeCk.checked;
        thongBao(res, 'Không thể cập nhật hiển thị');
      }
    }
  });
})();
