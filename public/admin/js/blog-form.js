(() => {
  const App = window.App || {};
  const form = document.getElementById('blogCreate');
  const titleInput = document.getElementById('blogTitle');
  const summaryInput = document.getElementById('blogSummary');
  const contentInput = document.getElementById('blogContent');
  const publishInput = document.getElementById('blogPublish');
  const imageInput = document.getElementById('blogImageInput');
  const resetBtn = document.getElementById('blogResetBtn');

  const previewImage = document.getElementById('blogPreviewImage');
  const previewEmpty = document.getElementById('blogPreviewEmpty');
  const previewTitle = document.getElementById('blogPreviewTitle');
  const previewSummary = document.getElementById('blogPreviewSummary');
  const previewContent = document.getElementById('blogPreviewContent');
  const previewStatus = document.getElementById('blogPreviewStatus');

  const DEFAULT_TITLE = 'Chưa có tiêu đề';
  const DEFAULT_SUMMARY = 'Chưa có tóm tắt.';
  const DEFAULT_CONTENT = 'Nội dung bài viết sẽ hiển thị tại đây.';

  function alertMessage(res, fallback) {
    const message = (res && res.data && res.data.message) || fallback || 'Có lỗi xảy ra';
    window.alert(message);
  }

  function alertSuccess(res, fallback) {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    window.alert(message);
  }

  function updatePreview() {
    if (previewTitle) {
      previewTitle.textContent = (titleInput && titleInput.value.trim()) || DEFAULT_TITLE;
    }
    if (previewSummary) {
      previewSummary.textContent = (summaryInput && summaryInput.value.trim()) || DEFAULT_SUMMARY;
    }
    if (previewContent) {
      const text = (contentInput && contentInput.value.trim()) || DEFAULT_CONTENT;
      previewContent.textContent = text;
    }
    if (previewStatus) {
      const isPublished = Boolean(publishInput && publishInput.checked);
      previewStatus.textContent = isPublished ? 'Đã chọn xuất bản' : 'Nháp';
      previewStatus.className = isPublished ? 'badge text-bg-success' : 'badge text-bg-secondary';
    }
  }

  function clearPreviewImage() {
    if (!previewImage) return;
    if (previewImage.dataset.previewUrl) {
      URL.revokeObjectURL(previewImage.dataset.previewUrl);
      delete previewImage.dataset.previewUrl;
    }
    previewImage.src = '';
    previewImage.classList.add('d-none');
    if (previewEmpty) previewEmpty.classList.remove('d-none');
  }

  function updatePreviewImage(fileInput) {
    if (!previewImage) return;
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      clearPreviewImage();
      return;
    }
    if (previewImage.dataset.previewUrl) {
      URL.revokeObjectURL(previewImage.dataset.previewUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    previewImage.src = objectUrl;
    previewImage.dataset.previewUrl = objectUrl;
    previewImage.classList.remove('d-none');
    if (previewEmpty) previewEmpty.classList.add('d-none');
  }

  function showInlinePreview(fileInput) {
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

  function validateCreateForm() {
    if (!form) return false;
    form.classList.add('was-validated');
    return form.checkValidity();
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!validateCreateForm()) return;

      const fd = new FormData(form);
      fd.set('xuatban', String(Boolean(fd.get('xuatban'))));

      const res = await App.apiFetch('/admin/blog', {
        method: 'POST',
        body: fd
      });

      if (res.ok) {
        alertSuccess(res, 'Tạo bài viết thành công');
        window.location.reload();
        return;
      }

      alertMessage(res, 'Không thể tạo bài viết');
    });
  }

  if (resetBtn && form) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      form.classList.remove('was-validated');
      clearPreviewImage();
      updatePreview();
    });
  }

  [titleInput, summaryInput, contentInput, publishInput].forEach((element) => {
    if (!element) return;
    element.addEventListener('input', updatePreview);
    element.addEventListener('change', updatePreview);
  });

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      updatePreviewImage(imageInput);
      showInlinePreview(imageInput);
    });
  }

  if (contentInput && typeof window.Quill !== 'undefined' && contentInput.dataset.richtext === 'quill') {
    const editorRoot = document.getElementById('blogContentEditor');
    if (editorRoot) {
      const quill = new window.Quill(editorRoot, { theme: 'snow' });
      quill.on('text-change', () => {
        contentInput.value = quill.root.innerHTML;
        updatePreview();
      });
    }
  }

  document.addEventListener('change', (event) => {
    const fileInput = event.target.closest('input[name="image"][type="file"]');
    if (!fileInput) return;
    if (fileInput === imageInput) return;
    showInlinePreview(fileInput);
  });

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    const row = btn.closest('tr');
    if (!row) return;

    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'delete') {
      if (!App.confirmDelete()) return;
      const res = await App.apiFetch(`/admin/blog/${id}`, { method: 'DELETE' });
      if (res.ok) {
        row.remove();
        alertSuccess(res, 'Đã xóa bài viết');
      } else {
        alertMessage(res, 'Không thể xóa bài viết');
      }
      return;
    }

    if (action === 'publish') {
      const xuatban = Boolean(row.querySelector('input[name="xuatban"]')?.checked);
      const res = await App.apiFetch(`/admin/blog/${id}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xuatban })
      });

      if (res.ok && res.data && res.data.data) {
        const checkbox = row.querySelector('input[name="xuatban"]');
        if (checkbox) checkbox.checked = Boolean(res.data.data.xuatban);
        alertSuccess(res, checkbox && checkbox.checked ? 'Đã xuất bản bài viết' : 'Đã hủy xuất bản bài viết');
      } else if (!res.ok) {
        alertMessage(res, 'Không thể cập nhật xuất bản');
      }
      return;
    }

    if (action === 'save') {
      const title = row.querySelector('input[name="tieude"]')?.value?.trim() || '';
      const content = row.querySelector('textarea[name="noidung"]')?.value?.trim() || '';
      if (!title || !content) {
        window.alert('Tiêu đề và nội dung không được để trống.');
        return;
      }

      const fd = new FormData();
      fd.set('tieude', title);
      fd.set('tomtat', row.querySelector('textarea[name="tomtat"]')?.value || '');
      fd.set('noidung', content);
      fd.set('xuatban', String(Boolean(row.querySelector('input[name="xuatban"]')?.checked)));

      const fileInput = row.querySelector('input[name="image"]');
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fd.set('image', fileInput.files[0]);
      }

      const res = await App.apiFetch(`/admin/blog/${id}`, {
        method: 'PUT',
        body: fd
      });

      if (res.ok) {
        alertSuccess(res, 'Lưu bài viết thành công');
        return;
      }

      alertMessage(res, 'Không thể lưu bài viết');
    }
  });

  updatePreview();
})();