(() => {
  const productsEl = document.getElementById('products-json');
  const receiptItemsEl = document.getElementById('receipt-items-json');
  const receiptSelect = document.getElementById('source-import-receipt');
  const tbody = document.getElementById('adjustment-items-body');
  const addBtn = document.getElementById('btn-add-row');
  const form = document.getElementById('adjustment-create-form');
  if (!productsEl || !receiptItemsEl || !receiptSelect || !tbody || !form) return;

  let products = [];
  let receiptItemsById = {};

  try {
    products = JSON.parse(productsEl.textContent || '[]');
  } catch {
    products = [];
  }

  try {
    receiptItemsById = JSON.parse(receiptItemsEl.textContent || '{}');
  } catch {
    receiptItemsById = {};
  }

  const noSizeTypes = new Set(['tui', 'phukien']);
  const numberFormatter = new Intl.NumberFormat('vi-VN');

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatQty(value) {
    if (value == null || !Number.isFinite(value)) return '--';
    return numberFormatter.format(value);
  }

  function getProductById(productId) {
    return products.find((p) => String(p._id) === String(productId)) || null;
  }

  function getVariantById(product, variantId) {
    if (!product || !variantId || variantId === 'main') return null;
    return (Array.isArray(product.bienthe) ? product.bienthe : []).find((v) => String(v._id) === String(variantId)) || null;
  }

  function getSizeRows(source) {
    if (!source || typeof source !== 'object') return [];
    if (Array.isArray(source.sizes)) return source.sizes;
    if (Array.isArray(source.danhsach_kichco)) return source.danhsach_kichco;
    return [];
  }

  function readStock(product, variantId, sizeValue) {
    if (!product) return null;

    const isNoSize = noSizeTypes.has(String(product.loaisanpham || '').toLowerCase());
    const variant = getVariantById(product, variantId);
    const isMain = !variant;

    if (!isNoSize) {
      const size = String(sizeValue || '').trim();
      if (!size) return null;

      const source = isMain ? product : variant;
      const row = getSizeRows(source).find((item) => String(item.size || item.kichco || '').trim() === size);
      return toNumber(row && row.soluong, 0);
    }

    if (isMain) return toNumber(product.soluong_chinh, 0);
    return toNumber(variant && variant.soluong, 0);
  }

  function paintStockCell(el, value, invalid = false) {
    if (!el) return;
    const hasValue = value != null && Number.isFinite(value);
    el.textContent = hasValue ? formatQty(value) : '--';
    el.classList.toggle('text-muted', !hasValue);
    el.classList.toggle('text-danger', Boolean(invalid));
    el.classList.toggle('fw-semibold', Boolean(invalid));
  }

  function activeReceiptId() {
    return String(receiptSelect.value || '').trim();
  }

  function activeReceiptItems() {
    const rid = activeReceiptId();
    if (!rid) return [];
    const rows = receiptItemsById[rid];
    return Array.isArray(rows) ? rows : [];
  }

  function collectSelectedKeys(excludeSelect = null) {
    const selected = new Set();
    tbody.querySelectorAll('.js-receipt-item').forEach((selectEl) => {
      if (excludeSelect && selectEl === excludeSelect) return;
      const value = String(selectEl.value || '').trim();
      if (value) selected.add(value);
    });
    return selected;
  }

  function buildItemLabel(item) {
    const product = getProductById(item.sanphamid);
    const productName = String(item.tensanpham || product?.tensanpham || 'Sản phẩm').trim();
    const variantId = String(item.bientheid || 'main');
    const color = String(item.mausac || '').trim();
    const size = String(item.kichco || '').trim();

    const variantLabel = variantId === 'main'
      ? 'Mặc định'
      : (color ? `Biến thể: ${color}` : 'Biến thể');

    const parts = [productName, variantLabel];
    if (size) parts.push(`Size ${size}`);
    if (item.soluongnhap && Number(item.soluongnhap) > 0) {
      parts.push(`SL nhập ${formatQty(Number(item.soluongnhap))}`);
    }

    return parts.join(' - ');
  }

  function itemOptions(selected = '', disabledKeys = new Set()) {
    const rows = activeReceiptItems();
    const opts = ['<option value="">-- Chọn sản phẩm trong phiếu nhập --</option>'];
    const selectedKey = String(selected || '');
    rows.forEach((item) => {
      const key = String(item.key || '');
      const sel = key === selectedKey ? ' selected' : '';
      const disabled = disabledKeys.has(key) && key !== selectedKey ? ' disabled' : '';
      opts.push(`<option value="${escapeHtml(key)}"${sel}${disabled}>${escapeHtml(buildItemLabel(item))}</option>`);
    });
    return opts.join('');
  }

  function renumber() {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((tr, idx) => {
      tr.dataset.index = String(idx);
      tr.querySelectorAll('[data-field]').forEach((el) => {
        const field = el.getAttribute('data-field');
        if (!field) return;
        el.setAttribute('name', `chitiet[${idx}][${field}]`);
      });
    });
  }

  function findSelectedItem(key) {
    if (!key) return null;
    return activeReceiptItems().find((it) => String(it.key || '') === String(key)) || null;
  }

  function refreshAllRowsOptions(keepSelected = true) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((tr) => {
      if (typeof tr._refreshOptions === 'function') tr._refreshOptions(keepSelected);
    });
    setAddButtonState();
  }

  function wireRow(tr) {
    const itemSelect = tr.querySelector('.js-receipt-item');
    const qtyInput = tr.querySelector('.js-qty');
    const stockBeforeEl = tr.querySelector('.js-stock-before');
    const stockAfterEl = tr.querySelector('.js-stock-after');
    const variantLabel = tr.querySelector('.js-variant-label');
    const sizeLabel = tr.querySelector('.js-size-label');
    const colorLabel = tr.querySelector('.js-color-label');

    const productIdInput = tr.querySelector('.js-product-id');
    const productNameInput = tr.querySelector('.js-product-name');
    const variantIdInput = tr.querySelector('.js-variant-id');
    const sizeInput = tr.querySelector('.js-size-input');
    const colorInput = tr.querySelector('.js-color-input');

    function refreshStock() {
      const selected = findSelectedItem(itemSelect.value);
      if (!selected) {
        paintStockCell(stockBeforeEl, null, false);
        paintStockCell(stockAfterEl, null, false);
        qtyInput.setCustomValidity('');
        qtyInput.classList.remove('is-invalid');
        return;
      }

      const product = getProductById(selected.sanphamid);
      const before = readStock(product, selected.bientheid || 'main', selected.kichco || '');
      const deltaRaw = Number(qtyInput.value);
      const hasDelta = Number.isFinite(deltaRaw);
      const after = before == null || !hasDelta ? null : before + deltaRaw;

      const isInvalidAfter = after != null && after < 0;
      paintStockCell(stockBeforeEl, before, false);
      paintStockCell(stockAfterEl, after, isInvalidAfter);

      qtyInput.classList.toggle('is-invalid', isInvalidAfter);
      qtyInput.setCustomValidity(isInvalidAfter ? 'Tồn sau điều chỉnh không được âm' : '');
    }

    function refreshSelectedItem() {
      const selected = findSelectedItem(itemSelect.value);
      if (!selected) {
        productIdInput.value = '';
        productNameInput.value = '';
        variantIdInput.value = 'main';
        sizeInput.value = '';
        colorInput.value = '';

        variantLabel.textContent = '--';
        sizeLabel.textContent = '--';
        colorLabel.textContent = '--';
        refreshStock();
        return;
      }

      const variantId = String(selected.bientheid || 'main');
      productIdInput.value = String(selected.sanphamid || '');
      productNameInput.value = String(selected.tensanpham || '');
      variantIdInput.value = variantId;
      sizeInput.value = String(selected.kichco || '');
      colorInput.value = String(selected.mausac || '');

      variantLabel.textContent = variantId === 'main'
        ? 'Mặc định'
        : (selected.mausac ? `Biến thể: ${selected.mausac}` : 'Biến thể');
      sizeLabel.textContent = String(selected.kichco || '--');
      colorLabel.textContent = String(selected.mausac || '--');

      refreshStock();
    }

    function refreshOptions(keepSelected = true) {
      const oldValue = keepSelected ? String(itemSelect.value || '') : '';
      const disabledKeys = collectSelectedKeys(itemSelect);
      itemSelect.innerHTML = itemOptions(oldValue, disabledKeys);

      if (!itemSelect.value) {
        const firstDataOption = itemSelect.querySelector('option[value]:not([value=""]):not([disabled])');
        if (firstDataOption && !oldValue) itemSelect.value = String(firstDataOption.value || '');
      }

      refreshSelectedItem();
    }

    itemSelect.addEventListener('change', () => {
      refreshSelectedItem();
      refreshAllRowsOptions(true);
    });
    qtyInput.addEventListener('input', refreshStock);

    tr.querySelector('.js-remove') && tr.querySelector('.js-remove').addEventListener('click', () => {
      tr.remove();
      renumber();
      refreshAllRowsOptions(true);
    });

    tr._refreshOptions = refreshOptions;
    refreshOptions(true);
  }

  function createRow() {
    const idx = tbody.querySelectorAll('tr').length;
    const tr = document.createElement('tr');
    tr.dataset.index = String(idx);
    tr.innerHTML = `
      <td>
        <select class="form-select form-select-sm js-receipt-item" required></select>
        <input type="hidden" class="js-product-id" data-field="sanphamid" name="chitiet[${idx}][sanphamid]" />
        <input type="hidden" class="js-product-name" data-field="tensanpham" name="chitiet[${idx}][tensanpham]" />
        <input type="hidden" class="js-variant-id" data-field="bientheid" name="chitiet[${idx}][bientheid]" />
        <input type="hidden" class="js-size-input" data-field="kichco" name="chitiet[${idx}][kichco]" />
        <input type="hidden" class="js-color-input" data-field="mausac" name="chitiet[${idx}][mausac]" />
      </td>
      <td><span class="js-variant-label text-muted">--</span></td>
      <td><span class="js-size-label text-muted">--</span></td>
      <td>
        <input class="form-control form-control-sm js-qty" type="number" step="1" data-field="soluongdieuchinh" name="chitiet[${idx}][soluongdieuchinh]" placeholder="VD: 5 hoặc -3" required />
      </td>
      <td class="text-end"><span class="js-stock-before text-muted">--</span></td>
      <td class="text-end"><span class="js-stock-after text-muted">--</span></td>
      <td><span class="js-color-label text-muted">--</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-danger js-remove" type="button" title="Xóa dòng">
          <i class="bi bi-x"></i>
        </button>
      </td>
    `;

    wireRow(tr);
    return tr;
  }

  function setAddButtonState() {
    const hasReceipt = Boolean(activeReceiptId());
    const totalItems = activeReceiptItems().length;
    const selectedCount = collectSelectedKeys().size;
    addBtn.disabled = !hasReceipt || totalItems === 0 || selectedCount >= totalItems;
  }

  function resetRowsByReceipt() {
    tbody.innerHTML = '';
    tbody.appendChild(createRow());
    renumber();
    refreshAllRowsOptions(true);
  }

  receiptSelect.addEventListener('change', resetRowsByReceipt);

  addBtn && addBtn.addEventListener('click', () => {
    if (!activeReceiptId()) {
      window.alert('Vui lòng chọn phiếu nhập trước khi thêm dòng.');
      receiptSelect.focus();
      return;
    }
    if (collectSelectedKeys().size >= activeReceiptItems().length) {
      window.alert('Bạn đã chọn hết sản phẩm trong phiếu nhập này.');
      return;
    }
    tbody.appendChild(createRow());
    renumber();
    refreshAllRowsOptions(true);
  });

  form.addEventListener('submit', (e) => {
    if (!activeReceiptId()) {
      e.preventDefault();
      window.alert('Vui lòng chọn phiếu nhập trước khi tạo phiếu điều chỉnh.');
      receiptSelect.focus();
      return;
    }

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const selectedKeys = new Set();
    const values = [];

    for (const tr of rows) {
      const itemSelect = tr.querySelector('.js-receipt-item');
      const qtyInput = tr.querySelector('.js-qty');
      const selectedKey = String((itemSelect && itemSelect.value) || '').trim();
      const selected = findSelectedItem(itemSelect && itemSelect.value);
      const qty = Number(qtyInput && qtyInput.value);

      if (selected && selectedKey) {
        if (selectedKeys.has(selectedKey)) {
          e.preventDefault();
          window.alert('Không được chọn trùng sản phẩm/biến thể/size trong cùng một phiếu điều chỉnh.');
          itemSelect.focus();
          return;
        }
        selectedKeys.add(selectedKey);
      }

      if (!selected) continue;
      if (!Number.isFinite(qty) || qty === 0) continue;
      values.push(qty);
    }

    if (!values.length) {
      e.preventDefault();
      window.alert('Vui lòng nhập ít nhất 1 dòng có số lượng điều chỉnh khác 0.');
      return;
    }

    const hasNegativeAfter = rows.some((tr) => {
      const itemSelect = tr.querySelector('.js-receipt-item');
      const qtyInput = tr.querySelector('.js-qty');
      const selected = findSelectedItem(itemSelect && itemSelect.value);
      if (!selected) return false;

      const delta = Number(qtyInput && qtyInput.value);
      if (!Number.isFinite(delta)) return false;

      const product = getProductById(selected.sanphamid);
      const before = readStock(product, selected.bientheid || 'main', selected.kichco || '');
      if (before == null) return false;
      return before + delta < 0;
    });

    if (hasNegativeAfter) {
      e.preventDefault();
      window.alert('Tồn sau điều chỉnh không được âm. Vui lòng giảm số lượng điều chỉnh.');
    }
  });

  resetRowsByReceipt();
})();
