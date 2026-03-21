(() => {
  const App = window.App || {};

  async function handleAuthOrCsrf(res) {
    if (!res || res.status !== 403) return false;
    const msg = (res.data && res.data.message) || 'Phiên làm việc đã hết hạn. Trang sẽ được tải lại.';
    window.alert(msg);
    window.location.reload();
    return true;
  }

  async function removeLookbook(id, row) {
    const ok = window.confirm('Bạn có chắc muốn xóa lookbook này?');
    if (!ok) return;

    const res = await App.apiFetch(`/admin/api/lookbooks/${id}`, {
      method: 'DELETE'
    });

    if (await handleAuthOrCsrf(res)) return;
    if (res.ok && row) row.remove();
  }

  async function toggleLookbook(id, button) {
    const res = await App.apiFetch(`/admin/api/lookbooks/${id}/toggle`, {
      method: 'PATCH'
    });

    if (await handleAuthOrCsrf(res)) return;
    if (!res.ok || !res.data || !res.data.data) return;

    const active = Boolean(res.data.data.isActive);
    button.dataset.active = String(active);
    button.className = `btn btn-sm ${active ? 'btn-success' : 'btn-outline-secondary'} js-toggle`;
    const icon = button.querySelector('i');
    const text = button.querySelector('span');
    if (icon) icon.className = `bi ${active ? 'bi-eye-fill' : 'bi-eye-slash-fill'}`;
    if (text) text.textContent = active ? 'Hiển thị' : 'Ẩn';
  }

  document.addEventListener('click', async (event) => {
    const toggleBtn = event.target.closest('.js-toggle');
    if (toggleBtn) {
      const row = toggleBtn.closest('tr');
      const id = row?.dataset?.id;
      if (id) await toggleLookbook(id, toggleBtn);
      return;
    }

    const deleteBtn = event.target.closest('.js-delete');
    if (!deleteBtn) return;

    const row = deleteBtn.closest('tr');
    const id = row?.dataset?.id;
    if (id) await removeLookbook(id, row);
  });
})();
