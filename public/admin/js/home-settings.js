(() => {
  const form = document.getElementById('homeSettingsForm');
  const App = window.App || {};

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      home_new_limit: Number(fd.get('home_new_limit') || 8),
      home_best_limit: Number(fd.get('home_best_limit') || 8),
      home_blog_limit: Number(fd.get('home_blog_limit') || 6)
    };

    const res = await App.apiFetch('/admin/api/settings/home', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) window.location.reload();
  });
})();
