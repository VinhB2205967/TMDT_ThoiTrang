(() => {
  const form = document.getElementById('bannerCreate');
  const App = window.App || {};

  const thongBao = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    window.alert(message);
  };

  const thongBaoThanhCong = (res, fallback) => {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
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

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      fd.set('thuTu', String(Number(fd.get('thuTu') || 0)));
      fd.set('hienthi', String(Boolean(fd.get('hienthi'))));

      const res = await App.apiFetch('/admin/banners', {
        method: 'POST',
        body: fd
      });

      if (res.ok) {
        thongBaoThanhCong(res, 'Tạo banner thành công');
        window.location.reload();
      } else {
        thongBao(res, 'Không thể tạo banner');
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
      const res = await App.apiFetch(`/admin/banners/${id}`, { method: 'DELETE' });
      if (res.ok) {
        row.remove();
        thongBaoThanhCong(res, 'Đã xóa banner');
      } else {
        thongBao(res, 'Không thể xóa banner');
      }
      return;
    }

    if (action === 'toggle') {
      const res = await App.apiFetch(`/admin/banners/${id}/toggle`, { method: 'PATCH' });
      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="hienthi"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.hienthi);
        thongBaoThanhCong(res, checkbox && checkbox.checked ? 'Đã bật banner' : 'Đã tắt banner');
      } else if (!res.ok) {
        thongBao(res, 'Không thể bật/tắt banner');
      }
      return;
    }

    if (action === 'save') {
      const fd = new FormData();
      fd.set('tieude', row.querySelector('input[name="tieude"]')?.value || '');
      fd.set('mota', row.querySelector('input[name="mota"]')?.value || '');
      fd.set('nut_text', row.querySelector('input[name="nut_text"]')?.value || '');
      fd.set('nut_link', row.querySelector('input[name="nut_link"]')?.value || '');
      fd.set('loai', row.querySelector('select[name="loai"]')?.value || '');
      fd.set('thuTu', String(Number(row.querySelector('input[name="thuTu"]')?.value || 0)));
      fd.set('hienthi', String(Boolean(row.querySelector('input[name="hienthi"]')?.checked)));

      const fileInput = row.querySelector('input[name="image"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.set('image', fileInput.files[0]);
      }

      const res = await App.apiFetch(`/admin/banners/${id}`, {
        method: 'PUT',
        body: fd
      });

      if (res.ok) {
        thongBaoThanhCong(res, 'Lưu banner thành công');
        return;
      }

      thongBao(res, 'Không thể lưu banner');
    }
  });
})();
