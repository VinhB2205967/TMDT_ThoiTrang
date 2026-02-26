(() => {
  const App = window.App || {};

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const key = row.getAttribute('data-key');
    const action = btn.getAttribute('data-action');

    if (action === 'toggle') {
      const res = await App.apiFetch(`/admin/home-sections/${key}/toggle`, { method: 'PATCH' });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="hienthi"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.hienthi);
      }
      return;
    }

    if (action === 'save') {
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

      const res = await App.apiFetch(`/admin/home-sections/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) return;
    }
  });
})();
