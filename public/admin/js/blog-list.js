(() => {
  const App = window.App || {};
  const pageRoot = document.querySelector('.blog-page');

  function alertMessage(res, fallback) {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    if (App.showAdminPageFlash) {
      App.showAdminPageFlash('error', message, { anchor: pageRoot });
      return;
    }
    window.alert(message);
  }

  function alertSuccess(res, fallback) {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    if (App.showAdminPageFlash) {
      App.showAdminPageFlash('success', message, { anchor: pageRoot });
      return;
    }
    window.alert(message);
  }

  function alertNetworkError() {
    const message = 'Không thể kết nối máy chủ. Vui lòng thử lại.';
    if (App.showAdminPageFlash) {
      App.showAdminPageFlash('error', message, { anchor: pageRoot });
      return;
    }
    window.alert(message);
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

    try {
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
    } catch (_error) {
      alertNetworkError();
    }
  });

  document.addEventListener('change', async (event) => {
    const featuredCk = event.target.closest('input[name="noiBat"]');
    if (!featuredCk) return;

    const row = featuredCk.closest('tr[data-id]');
    if (!row) return;

    const id = row.getAttribute('data-id');

    try {
      const res = await App.apiFetch(`/admin/api/blog/${id}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noiBat: Boolean(featuredCk.checked) })
      });

      if (!res.ok) {
        featuredCk.checked = !featuredCk.checked;
        alertMessage(res, 'Không thể cập nhật nổi bật');
        return;
      }

      alertSuccess(res, featuredCk.checked ? 'Đã bật nổi bật bài viết' : 'Đã tắt nổi bật bài viết');
    } catch (_error) {
      featuredCk.checked = !featuredCk.checked;
      alertNetworkError();
    }
  });
})();
