document.addEventListener('DOMContentLoaded', () => {
  const copyButtons = Array.from(document.querySelectorAll('[data-copy-text]'));

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
        return !!ok;
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
          
        }
      }
    }

    tick();
    setInterval(tick, 4000);
  }

 // Xử lý đếm ngược thời gian thanh toán 24h
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
// Cập nhật hiển thị đếm ngược
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

  const returnModal = document.getElementById('returnRequestModal');
  const proofInput = document.getElementById('proofMedia');
  const proofPreview = document.getElementById('proofMediaPreview');

  function clearProofPreview() {
    if (!proofPreview) return;
    proofPreview.innerHTML = '';
  }

  function renderProofPreview(files) {
    if (!proofPreview) return;
    clearProofPreview();
    const list = Array.from(files || []).slice(0, 5);

    list.forEach((file) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      const col = document.createElement('div');
      col.className = 'col-6 col-md-4';

      const card = document.createElement('div');
      card.className = 'border rounded p-2 bg-white h-100';

      const name = document.createElement('div');
      name.className = 'small text-muted text-truncate mt-1';
      name.textContent = file.name || 'Tep';

      if (String(file.type || '').startsWith('video/')) {
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        v.preload = 'metadata';
        v.className = 'w-100 rounded';
        v.style.maxHeight = '130px';
        card.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'preview';
        img.className = 'w-100 rounded';
        img.style.objectFit = 'cover';
        img.style.maxHeight = '130px';
        card.appendChild(img);
      }

      card.appendChild(name);
      col.appendChild(card);
      proofPreview.appendChild(col);
    });
  }

  if (proofInput) {
    proofInput.addEventListener('change', () => {
      renderProofPreview(proofInput.files);
    });
  }

  if (returnModal) {
    returnModal.addEventListener('shown.bs.modal', () => {
      document.body.classList.add('return-modal-open');
    });

    returnModal.addEventListener('hidden.bs.modal', () => {
      document.body.classList.remove('return-modal-open');
      if (proofInput) proofInput.value = '';
      clearProofPreview();
    });
  }
});
