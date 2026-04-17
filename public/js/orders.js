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
      const res = await fetch(`/api/orders/${orderId}/payment-status`, {
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
  const returnForm = returnModal ? returnModal.querySelector('form.return-request-form') : null;

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
    const returnChecks = Array.from(returnModal.querySelectorAll('.js-return-item-check'));
    const returnQtyInputs = Array.from(returnModal.querySelectorAll('.js-return-item-qty'));
    const refundMethodInputs = Array.from(returnModal.querySelectorAll('input[name="refundMethod"]'));
    const refundBankFields = returnModal.querySelector('[data-refund-bank-fields]');
    const bankNameInput = returnModal.querySelector('input[name="bankName"]');
    const bankAccountNameInput = returnModal.querySelector('input[name="bankAccountName"]');
    const bankAccountNumberInput = returnModal.querySelector('input[name="bankAccountNumber"]');
    const bankInputs = [bankNameInput, bankAccountNameInput, bankAccountNumberInput].filter(Boolean);
    const forceBankRefund = returnForm && returnForm.dataset.refundForceBank === '1';

    function shouldRequireBankInfo() {
      if (forceBankRefund) return true;
      const selected = refundMethodInputs.find((it) => it.checked);
      return selected && selected.value === 'bank';
    }

    function updateRefundFields() {
      if (!refundBankFields) return;
      const showBank = shouldRequireBankInfo();
      refundBankFields.classList.toggle('d-none', !showBank);
      bankInputs.forEach((input) => {
        input.required = showBank;
        if (showBank) {
          input.setAttribute('required', 'required');
        } else {
          input.removeAttribute('required');
        }
        if (!showBank) input.value = '';
      });
    }

    refundMethodInputs.forEach((input) => {
      input.addEventListener('change', updateRefundFields);
    });

    if (bankAccountNumberInput) {
      bankAccountNumberInput.addEventListener('input', () => {
        bankAccountNumberInput.value = String(bankAccountNumberInput.value || '').replace(/[^\d]/g, '');
      });
    }

    updateRefundFields();

    function clampReturnQty(input) {
      if (!input) return;
      const max = Number(input.getAttribute('max') || 0);
      let qty = Number(input.value || 0);
      if (!Number.isFinite(qty) || qty < 0) qty = 0;
      if (Number.isFinite(max) && max >= 0 && qty > max) qty = max;
      input.value = String(Math.floor(qty));
    }

    returnChecks.forEach((check) => {
      const targetId = String(check.getAttribute('data-qty-target') || '').trim();
      const qtyInput = targetId ? document.getElementById(targetId) : null;
      if (!qtyInput) return;

      check.addEventListener('change', () => {
        qtyInput.disabled = !check.checked;
        if (check.checked) {
          if (Number(qtyInput.value || 0) <= 0) {
            qtyInput.value = '1';
          }
          clampReturnQty(qtyInput);
        } else {
          qtyInput.value = '0';
        }
      });

      qtyInput.addEventListener('input', () => clampReturnQty(qtyInput));
    });

    if (returnForm) {
      returnForm.addEventListener('submit', (event) => {
        let selectedCount = 0;
        const selected = refundMethodInputs.find((it) => it.checked);
        const selectedValue = selected ? String(selected.value || '').toLowerCase() : 'bank';
        const showBank = selectedValue === 'bank';
        if (showBank) {
          const hasMissingBankField = bankInputs.some((input) => !String(input.value || '').trim());
          if (hasMissingBankField) {
            event.preventDefault();
            bankInputs.forEach((input) => {
              if (!String(input.value || '').trim()) {
                input.classList.add('is-invalid');
              } else {
                input.classList.remove('is-invalid');
              }
            });
            return;
          }
        }

        returnQtyInputs.forEach((input) => {
          clampReturnQty(input);
          const qty = Number(input.value || 0);
          if (!input.disabled && qty > 0) selectedCount += 1;
        });

        if (shouldRequireBankInfo()) {
          const missing = bankInputs.some((input) => !String(input.value || '').trim());
          if (missing) {
            event.preventDefault();
            window.alert('Vui long nhap day du thong tin ngan hang de hoan tien.');
            return;
          }
        }

        if (selectedCount <= 0) {
          event.preventDefault();
          window.alert('Vui lòng chọn ít nhất 1 sản phẩm và số lượng muốn hoàn.');
        }
      });
    }

    returnModal.addEventListener('shown.bs.modal', () => {
      document.body.classList.add('return-modal-open');
      updateRefundFields();
    });

    returnModal.addEventListener('hidden.bs.modal', () => {
      document.body.classList.remove('return-modal-open');
      if (proofInput) proofInput.value = '';
      clearProofPreview();

      returnChecks.forEach((check) => { check.checked = false; });
      returnQtyInputs.forEach((input) => {
        input.value = '0';
        input.disabled = true;
      });
      if (returnForm) returnForm.reset();
      updateRefundFields();
    });
  }
});
