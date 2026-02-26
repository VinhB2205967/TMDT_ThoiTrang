(() => {
  const form = document.getElementById('brandCreate');
  const App = window.App || {};

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      fd.set('thuTu', String(Number(fd.get('thuTu') || 0)));
      fd.set('noiBat', String(Boolean(fd.get('noiBat'))));
      fd.set('hienthi', String(Boolean(fd.get('hienthi'))));

      const res = await App.apiFetch('/admin/brands', {
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
      const res = await App.apiFetch(`/admin/brands/${id}`, { method: 'DELETE' });
      if (res.ok) row.remove();
      return;
    }

    if (action === 'featured') {
      const noiBat = Boolean(row.querySelector('input[name="noiBat"]')?.checked);
      const res = await App.apiFetch(`/admin/brands/${id}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noiBat })
      });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="noiBat"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.noiBat);
      }
      return;
    }

    if (action === 'save') {
      const fd = new FormData();
      fd.set('ten', row.querySelector('input[name="ten"]')?.value || '');
      fd.set('thuTu', String(Number(row.querySelector('input[name="thuTu"]')?.value || 0)));
      fd.set('noiBat', String(Boolean(row.querySelector('input[name="noiBat"]')?.checked)));
      fd.set('hienthi', String(Boolean(row.querySelector('input[name="hienthi"]')?.checked)));

      const fileInput = row.querySelector('input[name="logo"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.set('logo', fileInput.files[0]);
      }

      const res = await App.apiFetch(`/admin/brands/${id}`, {
        method: 'PUT',
        body: fd
      });

      if (res.ok) return;
    }
  });
})();
