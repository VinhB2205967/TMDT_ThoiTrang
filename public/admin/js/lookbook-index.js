(() => {
  const App = window.App || {};
  const pageRoot = document.querySelector('.container-fluid.py-4');

  function showFlash(type, message) {
    if (App.showAdminPageFlash) {
      App.showAdminPageFlash(type, message, { anchor: pageRoot });
      return;
    }
    window.alert(message);
  }

  async function handleAuthOrCsrf(res) {
    if (!res || res.status !== 403) return false;
    const msg = (res.data && res.data.message) || 'Phiên làm việc đã hết hạn. Trang sẽ được tải lại.';
    showFlash('error', msg);
    window.setTimeout(() => window.location.reload(), 500);
    return true;
  }

  async function removeLookbook(id, row) {
    const ok = window.confirm('Bạn có chắc muốn xóa lookbook này?');
    if (!ok) return;

    const res = await App.apiFetch(`/admin/api/lookbooks/${id}`, {
      method: 'DELETE'
    });

    if (await handleAuthOrCsrf(res)) return;
    if (!res.ok) {
      showFlash('error', (res.data && res.data.message) || 'Không thể xóa lookbook');
      return;
    }

    if (row) row.remove();
    showFlash('success', (res.data && res.data.message) || 'Đã xóa lookbook');
  }

  async function toggleLookbook(id, button) {
    const res = await App.apiFetch(`/admin/api/lookbooks/${id}/toggle`, {
      method: 'PATCH'
    });

    if (await handleAuthOrCsrf(res)) return;
    if (!res.ok || !res.data || !res.data.data) {
      showFlash('error', (res.data && res.data.message) || 'Không thể cập nhật trạng thái lookbook');
      return;
    }

    const active = Boolean(res.data.data.isActive);
    button.dataset.active = String(active);
    button.className = `btn btn-sm ${active ? 'btn-success' : 'btn-outline-secondary'} js-toggle`;
    const icon = button.querySelector('i');
    const text = button.querySelector('span');
    if (icon) icon.className = `bi ${active ? 'bi-eye-fill' : 'bi-eye-slash-fill'}`;
    if (text) text.textContent = active ? 'Hiển thị' : 'Ẩn';
    showFlash('success', active ? 'Đã bật hiển thị lookbook' : 'Đã tắt hiển thị lookbook');
  }

  async function toggleFeatured(id, checkbox) {
    const res = await App.apiFetch(`/admin/api/lookbooks/${id}/featured`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noiBat: Boolean(checkbox.checked) })
    });

    if (await handleAuthOrCsrf(res)) return;
    if (!res.ok) {
      checkbox.checked = !checkbox.checked;
      showFlash('error', (res.data && res.data.message) || 'Không thể cập nhật nổi bật lookbook');
      return;
    }

    showFlash('success', checkbox.checked ? 'Đã bật nổi bật lookbook' : 'Đã tắt nổi bật lookbook');
  }

  document.addEventListener('click', async (event) => {
    const toggleBtn = event.target.closest('.js-toggle');
    if (toggleBtn) {
      const row = toggleBtn.closest('tr');
      const id = row?.dataset?.id;
      if (!id) return;

      try {
        await toggleLookbook(id, toggleBtn);
      } catch (_error) {
        showFlash('error', 'Không thể kết nối máy chủ. Vui lòng thử lại.');
      }
      return;
    }

    const deleteBtn = event.target.closest('.js-delete');
    if (!deleteBtn) return;

    const row = deleteBtn.closest('tr');
    const id = row?.dataset?.id;
    if (!id) return;

    try {
      await removeLookbook(id, row);
    } catch (_error) {
      showFlash('error', 'Không thể kết nối máy chủ. Vui lòng thử lại.');
    }
  });

  document.addEventListener('change', async (event) => {
    const featuredCk = event.target.closest('input[name="noiBat"]');
    if (!featuredCk) return;

    const row = featuredCk.closest('tr[data-id]');
    const id = row?.dataset?.id;
    if (!id) return;

    try {
      await toggleFeatured(id, featuredCk);
    } catch (_error) {
      featuredCk.checked = !featuredCk.checked;
      showFlash('error', 'Không thể kết nối máy chủ. Vui lòng thử lại.');
    }
  });
})();
