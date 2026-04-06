(() => {
  const form = document.getElementById('blogCreate');
  const App = window.App || {};

  function hienToast(message, type = 'success') {
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

  const thongBao = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    hienToast(message, 'error');
  };

  const thongBaoThanhCong = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    hienToast(message, 'success');
  };

  function hienThiXemTruocAnh(fileInput) {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
    const scope = fileInput.closest('tr, form') || fileInput.parentElement;
    if (!scope) return;

    let preview = scope.querySelector('img.img-thumbnail');
    if (!preview) {
      preview = document.createElement('img');
      preview.className = 'img-thumbnail mt-2';
      preview.alt = 'preview';
      preview.style.maxWidth = '120px';
      fileInput.parentNode.insertBefore(preview, fileInput);
    }

    if (preview.dataset.previewUrl) {
      URL.revokeObjectURL(preview.dataset.previewUrl);
    }

    const nextUrl = URL.createObjectURL(fileInput.files[0]);
    preview.src = nextUrl;
    preview.dataset.previewUrl = nextUrl;
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        fd.set('xuatban', String(Boolean(fd.get('xuatban'))));

        const res = await App.apiFetch('/admin/api/blog', {
          method: 'POST',
          body: fd
        });

        if (res.ok) {
          thongBaoThanhCong(res, 'Tạo bài viết thành công');
          setTimeout(() => window.location.reload(), 450);
        } else {
          thongBao(res, 'Không thể tạo bài viết');
        }
      } catch (_error) {
        hienToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
      }
    });
  }

  document.addEventListener('change', (e) => {
    const fileInput = e.target.closest('input[name="image"][type="file"]');
    if (!fileInput) return;
    hienThiXemTruocAnh(fileInput);
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'delete') {
      if (!App.confirmDelete()) return;
      try {
        const res = await App.apiFetch(`/admin/api/blog/${id}`, { method: 'DELETE' });
        if (res.ok) {
          row.remove();
          thongBaoThanhCong(res, 'Đã xóa bài viết');
        } else {
          thongBao(res, 'Không thể xóa bài viết');
        }
      } catch (_error) {
        hienToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
      }
      return;
    }

    if (action === 'publish') {
      const xuatban = Boolean(row.querySelector('input[name="xuatban"]')?.checked);
      try {
        const res = await App.apiFetch(`/admin/api/blog/${id}/publish`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ xuatban })
        });
        if (res.ok && res.data && res.data.data) {
          const checkbox = row.querySelector('input[name="xuatban"]');
          if (checkbox) checkbox.checked = Boolean(res.data.data.xuatban);
          thongBaoThanhCong(res, checkbox && checkbox.checked ? 'Đã xuất bản bài viết' : 'Đã hủy xuất bản bài viết');
        } else if (!res.ok) {
          thongBao(res, 'Không thể cập nhật xuất bản');
        }
      } catch (_error) {
        hienToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
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

      try {
        const res = await App.apiFetch(`/admin/api/blog/${id}`, {
          method: 'PUT',
          body: fd
        });

        if (res.ok) {
          thongBaoThanhCong(res, 'Lưu bài viết thành công');
          return;
        }

        thongBao(res, 'Không thể lưu bài viết');
      } catch (_error) {
        hienToast('Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
      }
    }
  });
})();
