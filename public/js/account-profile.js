(() => {
  const previewImage = document.getElementById('accountAvatarPreview');
  const fileInput = document.getElementById('accountAvatarFileInput');
  const copyButtons = Array.from(document.querySelectorAll('[data-copy-text]'));

  const defaultAvatar = '/images/avatar/avatar.png';
  let objectUrl = null;

  function revokeObjectUrl() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function setPreview(src) {
    if (!previewImage) return;
    previewImage.src = src || defaultAvatar;
  }

  if (previewImage && fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        revokeObjectUrl();
        setPreview(defaultAvatar);
        return;
      }

      if (!String(file.type || '').startsWith('image/')) {
        fileInput.value = '';
        revokeObjectUrl();
        setPreview(defaultAvatar);
        window.alert('Vui lòng chọn file ảnh hợp lệ.');
        return;
      }

      revokeObjectUrl();
      objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
    });

    window.addEventListener('beforeunload', revokeObjectUrl);
  }

  async function copyToClipboard(text) {
    const value = String(text || '').trim();
    if (!value) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return Boolean(ok);
      } catch {
        return false;
      }
    }
  }

  copyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy-text') || '';
      const label = btn.getAttribute('data-copy-label') || 'Nội dung';
      const oldHtml = btn.innerHTML;
      const ok = await copyToClipboard(text);

      btn.innerHTML = ok ? '<i class="bi bi-check2"></i>' : '<i class="bi bi-x-lg"></i>';
      btn.classList.toggle('is-copied', ok);
      btn.classList.toggle('is-failed', !ok);
      btn.setAttribute('title', ok ? `${label} đã được sao chép` : `Không thể sao chép ${label.toLowerCase()}`);

      setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.classList.remove('is-copied', 'is-failed');
        btn.setAttribute('title', `Sao chép ${label.toLowerCase()}`);
      }, 1200);
    });
  });
})();
