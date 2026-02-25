const voucherList = document.getElementById('voucherList');
const voucherCodeInput = document.getElementById('voucherCode');
const subtotalEl = document.getElementById('checkoutSubtotal');
const shippingEl = document.getElementById('checkoutShipping');
const discountEl = document.getElementById('checkoutDiscount');
const totalEl = document.getElementById('checkoutTotal');
const shippingRegionSelect = document.getElementById('checkoutShippingRegion');
const voucherMoreBtn = document.getElementById('voucherMoreBtn');
const voucherModalEl = document.getElementById('voucherModal');
const voucherModalList = document.getElementById('voucherModalList');
const selectedVoucherNote = document.getElementById('selectedVoucherNote');
const selectedVoucherCard = document.getElementById('selectedVoucherCard');
const checkoutForm = document.querySelector('form[action="/cart/checkout"]');
const checkoutAlert = document.getElementById('checkoutInlineAlert');
const checkoutAlertText = document.getElementById('checkoutInlineAlertText');

let allVouchers = [];
let inlineCodes = new Set();
let checkoutAlertTimer = null;

if (voucherModalEl && voucherModalEl.parentElement !== document.body) {
  document.body.appendChild(voucherModalEl);
}

function showCheckoutAlert(message) {
  if (!checkoutAlert || !checkoutAlertText) return;
  checkoutAlertText.textContent = message;
  checkoutAlert.classList.remove('d-none');
  checkoutAlert.classList.add('show');
  checkoutAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (checkoutAlertTimer) {
    clearTimeout(checkoutAlertTimer);
  }
  checkoutAlertTimer = setTimeout(() => {
    hideCheckoutAlert();
  }, 5000);
}

function hideCheckoutAlert() {
  if (!checkoutAlert) return;
  checkoutAlert.classList.add('d-none');
  checkoutAlert.classList.remove('show');
}

function bindCheckoutValidation() {
  if (!checkoutForm) return;
  checkoutForm.addEventListener('submit', (event) => {
    const nameInput = checkoutForm.querySelector('input[name="tennguoinhan"]');
    const phoneInput = checkoutForm.querySelector('input[name="sodienthoai"]');
    const addressInput = checkoutForm.querySelector('input[name="diachigiao"]');

    const name = String(nameInput?.value || '').trim();
    const phone = String(phoneInput?.value || '').trim();
    const address = String(addressInput?.value || '').trim();

    if (!name || !phone || !address) {
      event.preventDefault();
      showCheckoutAlert('Vui lòng nhập đầy đủ họ tên, số điện thoại, địa chỉ');
      return;
    }

    hideCheckoutAlert();
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + '₫';
}

function formatDiscountLabel(voucher) {
  if (!voucher) return '';
  if (voucher.type === 'phantram') return `Giảm ${voucher.value || 0}%`;
  return `Giảm ${formatMoney(voucher.value || 0)}`;
}

function getSubtotal() {
  const raw = voucherList?.dataset.subtotal;
  return Number(raw || 0);
}

function setTotals({ discount, shippingFee, total }) {
  if (discountEl) discountEl.textContent = formatMoney(discount || 0);
  if (shippingEl) shippingEl.textContent = formatMoney(shippingFee || 0);
  if (totalEl) totalEl.textContent = formatMoney(total || 0);
}

async function applyVoucher(code) {
  const subtotal = getSubtotal();
  const shippingRegion = shippingRegionSelect?.value || '';

  const response = await fetch('/vouchers/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotal, shippingRegion })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.success) {
    throw new Error(data?.message || 'Không thể áp dụng voucher');
  }

  setTotals({
    discount: data.discount || 0,
    shippingFee: data.shippingFee || 0,
    total: data.total || 0
  });
}

function updateSelectedNote(code) {
  if (!selectedVoucherNote) return;
  if (!code) {
    selectedVoucherNote.textContent = 'Đang chọn: Không dùng voucher';
    return;
  }
  const voucher = allVouchers.find((v) => v.code === code);
  if (!voucher) {
    selectedVoucherNote.textContent = `Đang chọn: ${code}`;
    return;
  }
  selectedVoucherNote.textContent = `Đang chọn: ${voucher.code} - ${voucher.name || 'Voucher'}`;
}

function renderSelectedCard(voucher) {
  if (!selectedVoucherCard) return;
  selectedVoucherCard.innerHTML = '';
  if (!voucher) return;

  const item = document.createElement('div');
  item.className = 'voucher-item';

  const label = document.createElement('div');
  label.className = 'voucher-label';
  const title = document.createElement('strong');
  title.textContent = `${voucher.code} - ${voucher.name || 'Voucher'}`;
  const sub = document.createElement('span');
  const endDate = voucher.endDate ? new Date(voucher.endDate).toLocaleDateString('vi-VN') : 'Không giới hạn';
  const minOrder = formatMoney(voucher.minOrderValue || 0);
  sub.textContent = `${formatDiscountLabel(voucher)} • Tối thiểu ${minOrder} • Hết hạn ${endDate}`;
  label.appendChild(title);
  label.appendChild(sub);

  const hint = document.createElement('span');
  hint.style.marginLeft = 'auto';
  hint.style.fontSize = '12px';
  hint.style.color = '#3b82f6';
  hint.textContent = 'Đổi voucher';

  item.appendChild(label);
  item.appendChild(hint);
  item.addEventListener('click', () => {
    if (!voucherModalEl || !window.bootstrap || !window.bootstrap.Modal) return;
    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(voucherModalEl);
    modalInstance.show();
  });

  selectedVoucherCard.appendChild(item);
}

function buildVoucherItem(voucher) {
  const item = document.createElement('div');
  item.className = 'voucher-item';

  const input = document.createElement('input');
  input.className = 'voucher-radio';
  input.type = 'radio';
  input.name = 'voucherChoice';
  input.id = `voucher-${voucher.code}`;
  input.value = voucher.code;

  const label = document.createElement('label');
  label.className = 'voucher-label';
  label.htmlFor = input.id;
  label.innerHTML = `<strong>${voucher.code} - ${voucher.name || 'Voucher'}</strong>`;

  const sub = document.createElement('span');
  const endDate = voucher.endDate ? new Date(voucher.endDate).toLocaleDateString('vi-VN') : 'Không giới hạn';
  const minOrder = formatMoney(voucher.minOrderValue || 0);
  sub.textContent = `Tối thiểu ${minOrder} - Hết hạn ${endDate}`;
  label.appendChild(sub);

  item.appendChild(input);
  item.appendChild(label);

  input.addEventListener('change', async () => {
    if (!input.checked) return;
    if (voucherCodeInput) voucherCodeInput.value = input.value || '';
    setActiveItem(item);
    updateSelectedNote(input.value || '');
    try {
      await applyVoucher(input.value || '');
    } catch {
      if (voucherCodeInput) voucherCodeInput.value = '';
      const noneInput = document.getElementById('voucher-none');
      if (noneInput) noneInput.checked = true;
      updateSelectedNote('');
      try {
        await applyVoucher('');
      } catch {
        // keep current totals
      }
    }
  });

  return item;
}

function setActiveItem(activeItem) {
  document.querySelectorAll('.voucher-item').forEach((el) => {
    el.classList.toggle('is-active', el === activeItem);
  });
}

function clearInlineVouchers() {
  const noneInput = document.getElementById('voucher-none');
  const noneItem = noneInput?.closest('.voucher-item');
  if (!voucherList) return;
  Array.from(voucherList.querySelectorAll('.voucher-item')).forEach((item) => {
    if (noneItem && item === noneItem) return;
    item.remove();
  });
}

function renderInlineVouchers(vouchers) {
  inlineCodes = new Set(vouchers.map((v) => v.code));
  clearInlineVouchers();
  vouchers.forEach((voucher) => {
    voucherList.appendChild(buildVoucherItem(voucher));
  });
}

function buildModalItem(voucher, modalInstance) {
  const item = document.createElement('div');
  item.className = 'voucher-modal-item';

  const info = document.createElement('div');
  info.className = 'voucher-modal-info';
  const title = document.createElement('strong');
  title.textContent = `${voucher.code} - ${voucher.name || 'Voucher'}`;
  const sub = document.createElement('span');
  const endDate = voucher.endDate ? new Date(voucher.endDate).toLocaleDateString('vi-VN') : 'Không giới hạn';
  const minOrder = formatMoney(voucher.minOrderValue || 0);
  sub.textContent = `${formatDiscountLabel(voucher)} • Tối thiểu ${minOrder} • Hết hạn ${endDate}`;
  info.appendChild(title);
  info.appendChild(sub);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-outline-primary';
  btn.setAttribute('data-bs-dismiss', 'modal');
  btn.textContent = 'Chọn';
  btn.addEventListener('click', async () => {
    if (voucherCodeInput) voucherCodeInput.value = voucher.code || '';
    const inlineItem = voucherList?.querySelector(`input[value="${voucher.code}"]`)?.closest('.voucher-item') || null;
    setActiveItem(inlineItem);
    updateSelectedNote(voucher.code || '');
    renderSelectedCard(voucher);
    const noneInput = document.getElementById('voucher-none');
    if (noneInput) noneInput.checked = false;
    try {
      await applyVoucher(voucher.code || '');
    } catch {
      // keep current totals
    }
    modalInstance?.hide();
  });

  item.appendChild(info);
  item.appendChild(btn);
  return item;
}

function renderModalVouchers(vouchers) {
  if (!voucherModalList) return;
  voucherModalList.innerHTML = '';
  const modalInstance = (voucherModalEl && window.bootstrap && window.bootstrap.Modal)
    ? window.bootstrap.Modal.getOrCreateInstance(voucherModalEl)
    : null;

  const noneItem = document.createElement('div');
  noneItem.className = 'voucher-modal-item';
  const noneInfo = document.createElement('div');
  noneInfo.className = 'voucher-modal-info';
  const noneTitle = document.createElement('strong');
  noneTitle.textContent = 'Không dùng voucher';
  const noneSub = document.createElement('span');
  noneSub.textContent = 'Bỏ chọn và giữ nguyên tổng tiền.';
  noneInfo.appendChild(noneTitle);
  noneInfo.appendChild(noneSub);
  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.className = 'btn btn-sm btn-outline-secondary';
  noneBtn.setAttribute('data-bs-dismiss', 'modal');
  noneBtn.textContent = 'Chọn';
  noneBtn.addEventListener('click', async () => {
    const noneInput = document.getElementById('voucher-none');
    if (noneInput) noneInput.checked = true;
    if (voucherCodeInput) voucherCodeInput.value = '';
    const noneInlineItem = noneInput?.closest('.voucher-item');
    setActiveItem(noneInlineItem);
    updateSelectedNote('');
    renderSelectedCard(null);
    try {
      await applyVoucher('');
    } catch {
      // keep current totals
    }
    modalInstance?.hide();
  });
  noneItem.appendChild(noneInfo);
  noneItem.appendChild(noneBtn);
  voucherModalList.appendChild(noneItem);

  vouchers.forEach((voucher) => {
    voucherModalList.appendChild(buildModalItem(voucher, modalInstance));
  });
}

async function loadVouchers() {
  if (!voucherList) return;
  try {
    const response = await fetch('/vouchers/available');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Không thể tải voucher');

    const vouchers = (data.vouchers || []).filter((voucher) => !voucher.isUsed);
    if (!vouchers.length) {
      const empty = document.createElement('div');
      empty.className = 'voucher-empty';
      empty.textContent = 'Chưa có voucher phù hợp.';
      voucherList.appendChild(empty);
      return;
    }
    allVouchers = vouchers;
    renderInlineVouchers([]);
    renderModalVouchers(vouchers);
    if (voucherMoreBtn) {
      voucherMoreBtn.style.display = vouchers.length ? '' : 'none';
    }
  } catch {
    const empty = document.createElement('div');
    empty.className = 'voucher-empty';
    empty.textContent = 'Không thể tải voucher. Vui lòng thử lại.';
    voucherList.appendChild(empty);
  }
}

function bindNoneVoucher() {
  const noneInput = document.getElementById('voucher-none');
  const noneItem = noneInput?.closest('.voucher-item');
  if (!noneInput || !noneItem) return;

  setActiveItem(noneItem);
  updateSelectedNote('');
  renderSelectedCard(null);
  noneInput.addEventListener('change', async () => {
    if (!noneInput.checked) return;
    if (voucherCodeInput) voucherCodeInput.value = '';
    setActiveItem(noneItem);
    updateSelectedNote('');
    renderSelectedCard(null);
    try {
      await applyVoucher('');
    } catch {
      // keep current totals
    }
  });
}

async function applyInitialTotals() {
  try {
    await applyVoucher('');
  } catch {
    // keep initial totals
  }
}

if (shippingRegionSelect) {
  shippingRegionSelect.addEventListener('change', async () => {
    const selected = document.querySelector('input[name="voucherChoice"]:checked');
    const code = selected ? selected.value : '';
    try {
      await applyVoucher(code);
    } catch {
      // ignore
    }
  });
}

bindNoneVoucher();
loadVouchers();
applyInitialTotals();
bindCheckoutValidation();
