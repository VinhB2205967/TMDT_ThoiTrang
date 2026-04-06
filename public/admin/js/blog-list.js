(() => {
  const App = window.App || {};

  function notify(message, type = 'success') {
    if (!message) return;

    let wrap = document.getElementById('adminBlogNotifyStack');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'adminBlogNotifyStack';
      wrap.className = 'admin-notify-stack';
      document.body.appendChild(wrap);
    }

    const isError = type === 'error';
    const item = document.createElement('div');
    item.className = `admin-notify-item ${isError ? 'error' : 'success'}`;
    item.innerHTML = `
      <div class="admin-notify-inner">
        <span class="admin-notify-icon"><i class="bi ${isError ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}"></i></span>
        <div>
          <div class="admin-notify-title">${isError ? 'Thao tác thất bại' : 'Thao tác thành công'}</div>
          <div class="admin-notify-message"></div>
        </div>
        <button type="button" class="admin-notify-close" aria-label="Đóng">×</button>
      </div>
    `;
    item.querySelector('.admin-notify-message').textContent = message;
    wrap.appendChild(item);

    const close = () => item.remove();
    item.querySelector('.admin-notify-close').addEventListener('click', close);
    setTimeout(close, 3200);
  }

  function alertMessage(res, fallback) {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    notify(message, 'error');
  }

  function alertSuccess(res, fallback) {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    notify(message, 'success');
  }

  function updatePublishUi(row, isPublished) {
    const badge = row.querySelector('.badge');
    const button = row.querySelector('[data-action="publish"]');
    if (badge) {
      badge.className = isPublished ? 'badge text-bg-success' : 'badge text-bg-secondary';
      badge.textContent = isPublished ? 'Đã xuất bản' : 'Nháp';
    }
    if (button) {
      button.textContent = isPublished ? 'Hủy xuất bản' : 'Xuất bản';
      button.setAttribute('data-published', isPublished ? '1' : '0');
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const row = button.closest('tr[data-id]');
    if (!row) return;

    const id = row.getAttribute('data-id');
    const action = button.getAttribute('data-action');

    if (action === 'delete') {
      if (!App.confirmDelete || !App.confirmDelete()) return;

      const res = await App.apiFetch(`/admin/api/blog/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        alertMessage(res, 'Không thể xóa bài viết');
        return;
      }

      row.remove();
      alertSuccess(res, 'Đã xóa bài viết');
      return;
    }

    if (action === 'publish') {
      const current = button.getAttribute('data-published') === '1';
      const next = !current;

      const res = await App.apiFetch(`/admin/api/blog/${id}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xuatban: next })
      });

      if (!res.ok) {
        alertMessage(res, 'Không thể cập nhật xuất bản');
        return;
      }

      const actual = Boolean(res && res.data && res.data.data && res.data.data.xuatban);
      updatePublishUi(row, actual);
      alertSuccess(res, actual ? 'Đã xuất bản bài viết' : 'Đã hủy xuất bản bài viết');
    }
  });
})();
