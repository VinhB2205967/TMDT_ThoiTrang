(() => {
  const previewImage = document.getElementById('accountAvatarPreview');
  const fileInput = document.getElementById('accountAvatarFileInput');
  if (!previewImage || !fileInput) return;

  const defaultAvatar = '/images/avatar/avatar.png';
  let objectUrl = null;

  function revokeObjectUrl() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function setPreview(src) {
    previewImage.src = src || defaultAvatar;
  }

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
})();
