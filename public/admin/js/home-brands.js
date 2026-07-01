(() => {
  const form = document.getElementById('brandCreate');
  const App = window.App || {};
  const pageRoot = document.querySelector('.brands-admin-page');

  const toBoolString = (value) => String(Boolean(value));
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

  async function capNhatToggle(id, loai, value) {
    const endpoint = loai === 'featured' ? `/admin/api/brands/${id}/featured` : `/admin/api/brands/${id}/active`;
    const body = loai === 'featured' ? { noiBat: value } : { hienthi: value };
    return App.apiFetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      try {
        const fd = new FormData(form);
        fd.set('thuTu', String(Number(fd.get('thuTu') || 0)));
        fd.set('noiBat', toBoolString(fd.get('noiBat')));
        fd.set('hienthi', toBoolString(fd.get('hienthi')));

        const res = await App.apiFetch('/admin/api/brands', {
          method: 'POST',
          body: fd
        });

        if (res.ok) {
          thongBaoThanhCong(res, 'Tạo thương hiệu thành công');
          window.location.reload();
        } else {
          thongBao(res, 'Không thể tạo thương hiệu');
        }
      } catch (_error) {
        thongBaoLoiMang();
      }
    });
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('[data-id]');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    try {
      if (action === 'delete') {
        if (!App.confirmDelete || !App.confirmDelete()) return;
        const res = await App.apiFetch(`/admin/api/brands/${id}`, { method: 'DELETE' });
        if (res.ok) {
          row.remove();
          thongBaoThanhCong(res, 'Đã xóa thương hiệu');
        } else {
          thongBao(res, 'Không thể xóa thương hiệu');
        }
        return;
      }

      if (action === 'featured') {
        const checkbox = row.querySelector('input[name="noiBat"]');
        const noiBat = !Boolean(checkbox?.checked);
        const res = await capNhatToggle(id, 'featured', noiBat);
        if (res.ok && res.data && res.data.data) {
          if (checkbox) checkbox.checked = Boolean(res.data.data.noiBat);
          thongBaoThanhCong(
            res,
            checkbox && checkbox.checked
              ? 'Đã bật nổi bật thương hiệu'
              : 'Đã tắt nổi bật thương hiệu'
          );
        }
        if (!res.ok) thongBao(res, 'Không thể cập nhật nổi bật');
        return;
      }

      if (action === 'save') {
        const fd = new FormData();
        fd.set('ten', row.querySelector('input[name="ten"]')?.value || '');
        fd.set('thuTu', String(Number(row.querySelector('input[name="thuTu"]')?.value || 0)));
        fd.set('noiBat', toBoolString(row.querySelector('input[name="noiBat"]')?.checked));
        fd.set('hienthi', toBoolString(row.querySelector('input[name="hienthi"]')?.checked));

        const fileInput = row.querySelector('input[name="logo"]');
        if (fileInput && fileInput.files && fileInput.files[0]) {
          fd.set('logo', fileInput.files[0]);
        }

        const res = await App.apiFetch(`/admin/api/brands/${id}`, {
          method: 'PUT',
          body: fd
        });

        if (res.ok) {
          thongBaoThanhCong(res, 'Lưu thương hiệu thành công');
          return;
        }
        thongBao(res, 'Không thể cập nhật thương hiệu');
      }
    } catch (_error) {
      thongBaoLoiMang();
    }
  });

  document.addEventListener('change', async (e) => {
    const featuredCk = e.target.closest('input[name="noiBat"]');
    if (featuredCk) {
      const row = featuredCk.closest('[data-id]');
      if (!row) return;
      const id = row.getAttribute('data-id');

      try {
        const res = await capNhatToggle(id, 'featured', Boolean(featuredCk.checked));
        if (!res.ok) {
          featuredCk.checked = !featuredCk.checked;
          thongBao(res, 'Không thể cập nhật nổi bật');
        } else {
          thongBaoThanhCong(
            res,
            featuredCk.checked ? 'Đã bật nổi bật thương hiệu' : 'Đã tắt nổi bật thương hiệu'
          );
        }
      } catch (_error) {
        featuredCk.checked = !featuredCk.checked;
        thongBaoLoiMang();
      }
      return;
    }

    const activeCk = e.target.closest('input[name="hienthi"]');
    if (activeCk) {
      const row = activeCk.closest('[data-id]');
      if (!row) return;
      const id = row.getAttribute('data-id');

      try {
        const res = await capNhatToggle(id, 'active', Boolean(activeCk.checked));
        if (!res.ok) {
          activeCk.checked = !activeCk.checked;
          thongBao(res, 'Không thể cập nhật hiển thị');
        } else {
          thongBaoThanhCong(
            res,
            activeCk.checked ? 'Đã bật hiển thị thương hiệu' : 'Đã tắt hiển thị thương hiệu'
          );
        }
      } catch (_error) {
        activeCk.checked = !activeCk.checked;
        thongBaoLoiMang();
      }
      return;
    }

    const fileInput = e.target.closest('input[name="logo"][type="file"]');
    if (fileInput) {
      hienThiXemTruocAnh(fileInput);
    }
  });
})();
