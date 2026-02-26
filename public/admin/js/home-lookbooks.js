(() => {
  const form = document.getElementById('lookbookCreate');
  const App = window.App || {};

  function parseIds(raw) {
    if (!raw) return [];
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const selected = fd.getAll('sanpham_ids') || [];
      fd.delete('sanpham_ids');
      selected.forEach((id) => fd.append('sanpham_ids', id));
      fd.set('thuTu', String(Number(fd.get('thuTu') || 0)));
      fd.set('hienthi', String(Boolean(fd.get('hienthi'))));

      const res = await App.apiFetch('/admin/lookbooks', {
        method: 'POST',
        body: fd
      });

      if (res.ok) window.location.reload();
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
      const res = await App.apiFetch(`/admin/lookbooks/${id}`, { method: 'DELETE' });
      if (res.ok) row.remove();
      return;
    }

    if (action === 'toggle') {
      const res = await App.apiFetch(`/admin/lookbooks/${id}/toggle`, { method: 'PATCH' });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="hienthi"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.hienthi);
      }
      return;
    }

    if (action === 'save') {
      const fd = new FormData();
      fd.set('tenmua', row.querySelector('input[name="tenmua"]')?.value || '');
      fd.set('mota', row.querySelector('input[name="mota"]')?.value || '');
      fd.set('thuTu', String(Number(row.querySelector('input[name="thuTu"]')?.value || 0)));
      fd.set('hienthi', String(Boolean(row.querySelector('input[name="hienthi"]')?.checked)));

      const ids = parseIds(row.querySelector('textarea[name="sanpham_ids"]')?.value);
      ids.forEach((val) => fd.append('sanpham_ids', val));

      const fileInput = row.querySelector('input[name="image"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.set('image', fileInput.files[0]);
      }

      const res = await App.apiFetch(`/admin/lookbooks/${id}`, {
        method: 'PUT',
        body: fd
      });

      if (res.ok) return;
    }
  });
})();
