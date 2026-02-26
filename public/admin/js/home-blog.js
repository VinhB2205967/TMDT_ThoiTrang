(() => {
  const form = document.getElementById('blogCreate');
  const App = window.App || {};

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      fd.set('xuatban', String(Boolean(fd.get('xuatban'))));

      const res = await App.apiFetch('/admin/blog', {
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
      const res = await App.apiFetch(`/admin/blog/${id}`, { method: 'DELETE' });
      if (res.ok) row.remove();
      return;
    }

    if (action === 'publish') {
      const xuatban = Boolean(row.querySelector('input[name="xuatban"]')?.checked);
      const res = await App.apiFetch(`/admin/blog/${id}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xuatban })
      });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="xuatban"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.xuatban);
      }
      return;
    }

    if (action === 'save') {
      const fd = new FormData();
      fd.set('tieude', row.querySelector('input[name="tieude"]')?.value || '');
      fd.set('tomtat', row.querySelector('input[name="tomtat"]')?.value || '');
      fd.set('noidung', row.querySelector('textarea[name="noidung"]')?.value || '');
      fd.set('xuatban', String(Boolean(row.querySelector('input[name="xuatban"]')?.checked)));

      const fileInput = row.querySelector('input[name="image"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.set('image', fileInput.files[0]);
      }

      const res = await App.apiFetch(`/admin/blog/${id}`, {
        method: 'PUT',
        body: fd
      });

      if (res.ok) return;
    }
  });
})();
