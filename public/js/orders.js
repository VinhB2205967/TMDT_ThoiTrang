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

  const pendingEls = Array.from(document.querySelectorAll('[data-payment-pending="1"][data-order-id][data-payment-method]'));
  const momoPending = pendingEls
    .filter((el) => el.getAttribute('data-payment-method') === 'momo')
    .map((el) => String(el.getAttribute('data-order-id') || '').trim())
    .filter(Boolean);

  if (momoPending.length) {
    let stopped = false;
    const startedAt = Date.now();
    const MAX_MS = 2 * 60 * 1000;

    async function checkOne(orderId) {
      const res = await fetch(`/orders/${orderId}/payment-status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      });
      const json = await res.json().catch(() => null);
      return json;
    }

    async function tick() {
      if (stopped) return;
      if (Date.now() - startedAt > MAX_MS) {
        stopped = true;
        return;
      }

      for (const orderId of momoPending) {
        try {
          const json = await checkOne(orderId);
          if (json && json.success && json.paid) {
            stopped = true;
            window.location.href = `/orders/${orderId}?paid=1`;
            return;
          }
        } catch {
          // ignore
        }
      }
    }

    tick();
    setInterval(tick, 4000);
  }

  // Countdown 24h for MoMo/VNPAY pending
  const deadlineEls = Array.from(document.querySelectorAll('[data-payment-deadline][data-payment-countdown="1"]'));
  function formatMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  function updateCountdown() {
    const now = Date.now();
    let shouldReload = false;

    for (const el of deadlineEls) {
      const deadline = Number(el.getAttribute('data-payment-deadline') || 0);
      if (!deadline) continue;
      const remain = deadline - now;
      if (remain <= 0) {
        el.textContent = 'Hết hạn thanh toán (tự hủy)';
        shouldReload = true;
      } else {
        // Giữ prefix nếu có ("Còn: ")
        const prefix = String(el.textContent || '').includes('Còn:') ? 'Còn: ' : '';
        el.textContent = `${prefix}${formatMs(remain)}`;
      }
    }

    if (shouldReload) {
      setTimeout(() => window.location.reload(), 1500);
    }
  }

  if (deadlineEls.length) {
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }
});
