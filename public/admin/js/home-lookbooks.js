(() => {
  const form = document.getElementById('lookbookCreate');
  const App = window.App || {};
  const pageRoot = document.querySelector('.container-fluid.py-4');

  const thongBao = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    if (App.showAdminPageFlash) {
      App.showAdminPageFlash('error', message, { anchor: pageRoot });
      return;
    }
    window.alert(message);
  };

  const thongBaoThanhCong = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    if (App.showAdminPageFlash) {
      App.showAdminPageFlash('success', message, { anchor: pageRoot });
      return;
    }
    window.alert(message);
  };

  const thongBaoLoiMang = () => {
    const message = 'Không thể kết nối máy chủ. Vui lòng thử lại.';
    if (App.showAdminPageFlash) {
      App.showAdminPageFlash('error', message, { anchor: pageRoot });
      return;
    }
    window.alert(message);
  };

  function hienThiXemTruocAnh(fileInput) {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
    const scope = fileInput.closest('tr, form') || fileInput.parentElement;
    if (!scope) return;

    let preview = scope.querySelector('img.img-thumbnail');
    if (!preview) {
      preview = document.createElement('img');
      preview.className = 'img-thumbnail mb-2';
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

  function parseIds(raw) {
    if (!raw) return [];
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      try {
        const fd = new FormData(form);
        const selected = fd.getAll('sanpham_ids') || [];
        fd.delete('sanpham_ids');
        selected.forEach((id) => fd.append('sanpham_ids', id));
        fd.set('thuTu', String(Number(fd.get('thuTu') || 0)));
        fd.set('hienthi', String(Boolean(fd.get('hienthi'))));

        const res = await App.apiFetch('/admin/api/lookbooks', {
          method: 'POST',
          body: fd
        });

        if (res.ok) {
          thongBaoThanhCong(res, 'Tạo lookbook thành công');
          window.location.reload();
        } else {
          thongBao(res, 'Không thể tạo lookbook');
        }
      } catch (_error) {
        thongBaoLoiMang();
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

    try {
      if (action === 'delete') {
        if (!App.confirmDelete || !App.confirmDelete()) return;
        const res = await App.apiFetch(`/admin/api/lookbooks/${id}`, { method: 'DELETE' });
        if (res.ok) {
          row.remove();
          thongBaoThanhCong(res, 'Đã xóa lookbook');
        } else {
          thongBao(res, 'Không thể xóa lookbook');
        }
        return;
      }

      if (action === 'toggle') {
        const res = await App.apiFetch(`/admin/api/lookbooks/${id}/toggle`, { method: 'PATCH' });
        if (res.ok && res.data && res.data.data) {
          const checkbox = row.querySelector('input[name="hienthi"]');
          if (checkbox) checkbox.checked = Boolean(res.data.data.isActive);
          thongBaoThanhCong(
            res,
            checkbox && checkbox.checked ? 'Đã bật hiển thị lookbook' : 'Đã tắt hiển thị lookbook'
          );
        } else if (!res.ok) {
          thongBao(res, 'Không thể bật/tắt lookbook');
        }
        return;
      }

      if (action === 'save') {
        const fd = new FormData();
        fd.set('tenmua', row.querySelector('input[name="tenmua"]')?.value || '');
        fd.set('mota', row.querySelector('input[name="mota"]')?.value || '');
        fd.set('thuTu', String(Number(row.querySelector('input[name="thuTu"]')?.value || 0)));
        fd.set('hienthi', String(Boolean(row.querySelector('input[name="hienthi"]')?.checked)));

        const ids = parseIds(row.querySelector('textarea[name="sanpham_ids"]')?.value);
        ids.forEach((val) => fd.append('sanpham_ids', val));

        const fileInput = row.querySelector('input[name="image"]');
        if (fileInput && fileInput.files && fileInput.files[0]) {
          fd.set('image', fileInput.files[0]);
        }

        const res = await App.apiFetch(`/admin/api/lookbooks/${id}`, {
          method: 'PUT',
          body: fd
        });

        if (res.ok) {
          thongBaoThanhCong(res, 'Lưu lookbook thành công');
          return;
        }

        thongBao(res, 'Không thể lưu lookbook');
      }
    } catch (_error) {
      thongBaoLoiMang();
    }
  });
})();
