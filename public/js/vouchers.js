const voucherGrid = document.getElementById('voucherGrid');
const searchInput = document.getElementById('voucherSearch');
const filterButtons = Array.from(document.querySelectorAll('.btn-filter'));
const calcCode = document.getElementById('calcCode');
const calcSubtotal = document.getElementById('calcSubtotal');
const calcRegion = document.getElementById('calcRegion');
const calcApply = document.getElementById('calcApply');
const calcDiscount = document.getElementById('calcDiscount');
const calcShipping = document.getElementById('calcShipping');
const calcTotal = document.getElementById('calcTotal');
const calcMessage = document.getElementById('calcMessage');

let allVouchers = [];
let activeFilter = 'all';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + '₫';
}

function formatDate(dateString) {
  if (!dateString) return 'Không giới hạn';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Không giới hạn';
  return date.toLocaleDateString('vi-VN');
}

function buildCard(voucher) {
  const card = document.createElement('article');
  card.className = 'voucher-card';
  card.dataset.code = voucher.code || '';
  card.dataset.name = voucher.name || '';
  card.dataset.saved = voucher.isSaved ? 'true' : 'false';
  card.dataset.active = voucher.isUsed ? 'false' : 'true';

  const banner = document.createElement('div');
  banner.className = 'voucher-card__banner';
  if (voucher.banner) {
    const img = document.createElement('img');
    img.src = voucher.banner;
    img.alt = voucher.name || voucher.code || 'Voucher';
    banner.appendChild(img);
  }
  const bannerText = document.createElement('span');
  const valueLabel = voucher.type === 'phantram'
    ? `Giảm ${voucher.value || 0}%`
    : `Giảm ${formatMoney(voucher.value)}`;
  bannerText.textContent = valueLabel;
  banner.appendChild(bannerText);

  const body = document.createElement('div');
  body.className = 'voucher-card__body';

  const title = document.createElement('h3');
  title.className = 'voucher-title';
  title.textContent = voucher.name || voucher.code || 'Voucher';

  const desc = document.createElement('p');
  desc.className = 'voucher-desc';
  desc.textContent = voucher.description || 'Sử dụng để nhận ưu đãi hấp dẫn.';

  const badges = document.createElement('div');
  badges.className = 'voucher-badges';
  const codeBadge = document.createElement('span');
  codeBadge.className = 'voucher-badge';
  codeBadge.textContent = voucher.code || 'CODE';
  const minBadge = document.createElement('span');
  minBadge.className = 'voucher-badge';
  minBadge.textContent = `Đơn tối thiểu ${formatMoney(voucher.minOrderValue)}`;
  badges.appendChild(codeBadge);
  badges.appendChild(minBadge);
  if (voucher.maxDiscount) {
    const maxBadge = document.createElement('span');
    maxBadge.className = 'voucher-badge';
    maxBadge.textContent = `Giảm tối đa ${formatMoney(voucher.maxDiscount)}`;
    badges.appendChild(maxBadge);
  }

  const meta = document.createElement('div');
  meta.className = 'voucher-meta';
  const remaining = document.createElement('span');
  remaining.textContent = voucher.remaining != null ? `Còn ${voucher.remaining} lượt` : 'Số lượng không giới hạn';
  const endDate = document.createElement('span');
  endDate.textContent = `Hết hạn: ${formatDate(voucher.endDate)}`;
  meta.appendChild(remaining);
  meta.appendChild(endDate);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-save';
  saveBtn.type = 'button';
  saveBtn.textContent = voucher.isSaved ? 'Đã lưu' : 'Lưu';
  if (voucher.isSaved) {
    saveBtn.classList.add('is-disabled');
    saveBtn.disabled = true;
  }

  saveBtn.addEventListener('click', () => handleSave(voucher, saveBtn));

  const actions = document.createElement('div');
  actions.className = 'voucher-actions';
  actions.appendChild(saveBtn);

  body.appendChild(title);
  body.appendChild(desc);
  body.appendChild(badges);
  body.appendChild(meta);
  body.appendChild(actions);

  card.appendChild(banner);
  card.appendChild(body);

  card.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    if (!calcCode) return;
    calcCode.value = voucher.code || '';
    calcMessage.textContent = 'Đã điền mã, hãy nhập tạm tính để tính thử.';
    calcMessage.style.color = '#1f1b17';
  });

  return card;
}

function renderVouchers(vouchers) {
  voucherGrid.innerHTML = '';
  if (!vouchers.length) {
    const empty = document.createElement('div');
    empty.className = 'voucher-loading';
    empty.textContent = 'Không có voucher phù hợp.';
    voucherGrid.appendChild(empty);
    return;
  }

  vouchers.forEach((voucher) => {
    voucherGrid.appendChild(buildCard(voucher));
  });
}

function applyFilters() {
  const keyword = (searchInput?.value || '').trim().toLowerCase();
  const filtered = allVouchers.filter((voucher) => {
    if (activeFilter === 'saved' && !voucher.isSaved) return false;
    if (activeFilter === 'active' && voucher.isUsed) return false;
    if (!keyword) return true;
    const haystack = `${voucher.code || ''} ${voucher.name || ''}`.toLowerCase();
    return haystack.includes(keyword);
  });
  renderVouchers(filtered);
}

async function handleSave(voucher, button) {
  try {
    const response = await fetch('/api/vouchers/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: voucher.code })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Không thể lưu voucher');
    button.textContent = 'Đã lưu';
    button.disabled = true;
    button.classList.add('is-disabled');
    voucher.isSaved = true;
  } catch (error) {
    showMessage(error.message || 'Không thể lưu voucher', true);
  }
}

function showMessage(text, isError) {
  if (!calcMessage) return;
  calcMessage.textContent = text || '';
  calcMessage.style.color = isError ? '#b3492f' : '#1f1b17';
}

async function applyVoucher() {
  const code = (calcCode?.value || '').trim();
  const subtotal = Number(calcSubtotal?.value || 0);
  const shippingRegion = calcRegion?.value || '';

  try {
    const response = await fetch('/api/vouchers/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal, shippingRegion })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Không thể áp dụng voucher');

    calcDiscount.textContent = formatMoney(data.discount || 0);
    calcShipping.textContent = formatMoney(data.shippingFee || 0);
    calcTotal.textContent = formatMoney(data.total || 0);
    showMessage(code ? 'Áp dụng thành công.' : 'Nhập mã để tính giảm giá.', false);
  } catch (error) {
    showMessage(error.message || 'Không thể áp dụng voucher', true);
  }
}

async function loadVouchers() {
  try {
    const response = await fetch('/api/vouchers/available');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Không thể tải voucher');
    allVouchers = data.vouchers || [];
    applyFilters();
  } catch (error) {
    voucherGrid.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'voucher-loading';
    empty.textContent = 'Không thể tải voucher. Vui lòng thử lại sau.';
    voucherGrid.appendChild(empty);
  }
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((btn) => btn.classList.remove('is-active'));
    button.classList.add('is-active');
    activeFilter = button.dataset.filter || 'all';
    applyFilters();
  });
});

if (searchInput) {
  searchInput.addEventListener('input', applyFilters);
}

if (calcApply) {
  calcApply.addEventListener('click', applyVoucher);
}

loadVouchers();
