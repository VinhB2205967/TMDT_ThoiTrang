(() => {
  const $ = window.jQuery;
  if ($ && $.fn && $.fn.select2) {
    $('.js-select-products').select2({
      width: '100%',
      placeholder: 'Chọn sản phẩm',
      allowClear: true
    });
  }

  const imageInput = document.getElementById('lookbookImage');
  const preview = document.getElementById('lookbookPreview');

  if (!imageInput || !preview) return;

  imageInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      preview.innerHTML = `<img src="${reader.result}" alt="Preview"/>`;
    };
    reader.readAsDataURL(file);
  });
})();
