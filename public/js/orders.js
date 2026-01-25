document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('form[data-auto-submit="payment-method"]');
  forms.forEach((form) => {
    const select = form.querySelector('select[name="phuongthucthanhtoan"]');
    if (!select) return;

    select.addEventListener('change', () => {
      if (form.dataset.submitting === '1') return;
      form.dataset.submitting = '1';
      form.submit();
    });
  });
});
