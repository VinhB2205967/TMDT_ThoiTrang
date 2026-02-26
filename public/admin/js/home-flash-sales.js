(() => {
  const form = document.getElementById('flashSaleCreate');
  const App = window.App || {};

  function parseIds(raw) {
    if (!raw) return [];
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => ({ sanpham_id: id }));
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const selected = fd.getAll('sanpham') || [];
      const payload = {
        ten: fd.get('ten'),
        batdau: fd.get('batdau'),
        ketthuc: fd.get('ketthuc'),
        phantramgiamgia: Number(fd.get('phantramgiamgia') || 0),
        hienthi: Boolean(fd.get('hienthi')),
        sanpham: selected.map((id) => ({ sanpham_id: id }))
      };

      const res = await App.apiFetch('/admin/flash-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      const res = await App.apiFetch(`/admin/flash-sales/${id}`, { method: 'DELETE' });
      if (res.ok) row.remove();
      return;
    }

    if (action === 'toggle') {
      const res = await App.apiFetch(`/admin/flash-sales/${id}/toggle`, { method: 'PATCH' });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="hienthi"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.hienthi);
      }
      return;
    }

    if (action === 'save') {
      const payload = {
        ten: row.querySelector('input[name="ten"]')?.value,
        batdau: row.querySelector('input[name="batdau"]')?.value,
        ketthuc: row.querySelector('input[name="ketthuc"]')?.value,
        phantramgiamgia: Number(row.querySelector('input[name="phantramgiamgia"]')?.value || 0),
        hienthi: Boolean(row.querySelector('input[name="hienthi"]')?.checked),
        sanpham: parseIds(row.querySelector('textarea[name="sanpham_ids"]')?.value)
      };

      const res = await App.apiFetch(`/admin/flash-sales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) return;
    }
  });
})();
