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

  const runtime = window.BlogFormRuntime || {};
  const form = document.getElementById('blogForm');
  const titleInput = document.getElementById('blogTitle');
  const summaryInput = document.getElementById('blogSummary');
  const contentInput = document.getElementById('blogContent');
  const publishInput = document.getElementById('blogPublish');
  const imageInput = document.getElementById('blogImageInput');
  const resetBtn = document.getElementById('blogResetBtn');
  const richEditorRoot = document.getElementById('blogContentEditor');

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
    notify(message, 'error');
  }

  function alertSuccess(res, fallback) {
    const message = (res && res.data && res.data.message) || fallback || 'Thao tác thành công';
    notify(message, 'success');
  }

  function getPreviewContentHtml() {
    const richHtml = String(contentInput?.dataset?.previewHtml || '').trim();
    if (richHtml) return richHtml;

    const plainText = String(contentInput?.value || '').trim();
    if (!plainText) return '';

    return plainText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line}</p>`)
      .join('');
  }

  function updatePreview() {
    if (previewTitle) {
      previewTitle.textContent = (titleInput && titleInput.value.trim()) || DEFAULT_TITLE;
    }
    if (previewSummary) {
      previewSummary.textContent = (summaryInput && summaryInput.value.trim()) || DEFAULT_SUMMARY;
    }
    if (previewContent) {
      const previewHtml = getPreviewContentHtml();
      if (previewHtml) {
        previewContent.innerHTML = previewHtml;
      } else {
        previewContent.textContent = DEFAULT_CONTENT;
      }
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

  function getSubmitConfig() {
    const mode = runtime.mode === 'edit' ? 'edit' : 'create';
    return {
      mode,
      submitUrl: runtime.submitUrl || '/admin/api/blog',
      submitMethod: String(runtime.submitMethod || (mode === 'edit' ? 'PUT' : 'POST')).toUpperCase(),
      redirectUrl: runtime.redirectUrl || '/admin/blog'
    };
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!validateCreateForm()) return;

      const submitConfig = getSubmitConfig();

      const fd = new FormData(form);
      fd.set('xuatban', String(Boolean(fd.get('xuatban'))));

      const res = await App.apiFetch(submitConfig.submitUrl, {
        method: submitConfig.submitMethod,
        body: fd
      });

      if (res.ok) {
        alertSuccess(res, submitConfig.mode === 'edit' ? 'Cập nhật bài viết thành công' : 'Tạo bài viết thành công');
        window.location.href = submitConfig.redirectUrl;
        return;
      }

      alertMessage(res, submitConfig.mode === 'edit' ? 'Không thể cập nhật bài viết' : 'Không thể tạo bài viết');
    });
  }

  if (resetBtn && form) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      form.classList.remove('was-validated');
      if (window.blogContentEditorApi && typeof window.blogContentEditorApi.reset === 'function') {
        window.blogContentEditorApi.reset();
      }
      clearPreviewImage();
      updatePreview();
    });
  }

  [titleInput, summaryInput, contentInput, publishInput].forEach((element) => {
    if (!element) return;
    element.addEventListener('input', updatePreview);
    element.addEventListener('change', updatePreview);
  });

  if (contentInput && richEditorRoot) {
    contentInput.addEventListener('richtext:change', updatePreview);
  }

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      updatePreviewImage(imageInput);
      showInlinePreview(imageInput);
    });
  }

  document.addEventListener('change', (event) => {
    const fileInput = event.target.closest('input[name="image"][type="file"]');
    if (!fileInput) return;
    if (fileInput === imageInput) return;
    showInlinePreview(fileInput);
  });

  if (runtime.initialImage && previewImage && !previewImage.getAttribute('src')) {
    previewImage.src = runtime.initialImage;
    previewImage.classList.remove('d-none');
    if (previewEmpty) previewEmpty.classList.add('d-none');
  }

  updatePreview();
})();
