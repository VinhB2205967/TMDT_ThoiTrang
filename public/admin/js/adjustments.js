(() => {
  const productsEl = document.getElementById('products-json');
  const sizesEl = document.getElementById('sizes-json');
  const tbody = document.getElementById('adjustment-items-body');
  const addBtn = document.getElementById('btn-add-row');
  const form = document.getElementById('adjustment-create-form');
  if (!productsEl || !tbody || !form) return;

  let products = [];
  let sizeList = [];

  try {
    products = JSON.parse(productsEl.textContent || '[]');
  } catch {
    products = [];
  }

  try {
    sizeList = JSON.parse((sizesEl && sizesEl.textContent) || '[]');
  } catch {
    sizeList = [];
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

  function productOptions(selected = '') {
    const opts = ['<option value="">-- Chon san pham --</option>'];
    products.forEach((p) => {
      const sel = String(selected) === String(p._id) ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(p._id)}"${sel}>${escapeHtml(p.tensanpham || 'San pham')}</option>`);
    });
    return opts.join('');
  }

  function variantOptions(product, selected = 'main') {
    const opts = [`<option value="main"${String(selected) === 'main' ? ' selected' : ''}>Mặc định</option>`];
    (product && Array.isArray(product.bienthe) ? product.bienthe : []).forEach((v) => {
      const id = String(v._id || '');
      const label = v.mausac ? `Bien the: ${v.mausac}` : `Bien the: ${id.slice(-6)}`;
      const sel = id === String(selected) ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(id)}"${sel}>${escapeHtml(label)}</option>`);
    });
    return opts.join('');
  }

  function sizeOptions(selected = '') {
    const opts = ['<option value="">-- Size --</option>'];
    sizeList.forEach((s) => {
      const sel = String(selected) === String(s) ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(s)}"${sel}>${escapeHtml(s)}</option>`);
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

  function formatQty(value) {
    if (value == null || !Number.isFinite(value)) return '--';
    return numberFormatter.format(value);
  }

  function paintStockCell(el, value, invalid = false) {
    if (!el) return;
    const hasValue = value != null && Number.isFinite(value);
    el.textContent = hasValue ? formatQty(value) : '--';
    el.classList.toggle('text-muted', !hasValue);
    el.classList.toggle('text-danger', Boolean(invalid));
    el.classList.toggle('fw-semibold', Boolean(invalid));
  }

  function wireRow(tr) {
    const productSelect = tr.querySelector('.js-product');
    const variantSelect = tr.querySelector('.js-variant');
    const sizeSelect = tr.querySelector('.js-size');
    const qtyInput = tr.querySelector('.js-qty');
    const colorInput = tr.querySelector('.js-color');
    const stockBeforeEl = tr.querySelector('.js-stock-before');
    const stockAfterEl = tr.querySelector('.js-stock-after');

    function refreshStock() {
      const product = getProductById(productSelect.value);
      const before = readStock(product, variantSelect.value, sizeSelect.value);
      const deltaRaw = Number(qtyInput.value);
      const hasDelta = Number.isFinite(deltaRaw);
      const after = before == null || !hasDelta ? null : before + deltaRaw;

      const isInvalidAfter = after != null && after < 0;
      paintStockCell(stockBeforeEl, before, false);
      paintStockCell(stockAfterEl, after, isInvalidAfter);

      qtyInput.classList.toggle('is-invalid', isInvalidAfter);
      qtyInput.setCustomValidity(isInvalidAfter ? 'Ton sau dieu chinh khong duoc am' : '');
    }

    function refreshProduct() {
      const product = getProductById(productSelect.value);
      variantSelect.innerHTML = variantOptions(product, 'main');

      const isNoSize = noSizeTypes.has(String((product && product.loaisanpham) || '').toLowerCase());
      sizeSelect.disabled = isNoSize;
      sizeSelect.required = !isNoSize;
      if (isNoSize) sizeSelect.value = '';

      if (!product) {
        colorInput.value = '';
      } else if (!colorInput.value) {
        colorInput.value = product.mausac_chinh || '';
      }

      refreshVariant();
      refreshStock();
    }

    function refreshVariant() {
      const product = getProductById(productSelect.value);
      if (!product) {
        colorInput.value = '';
        refreshStock();
        return;
      }

      const variantId = String(variantSelect.value || 'main');
      if (variantId !== 'main') {
        const variant = getVariantById(product, variantId);
        colorInput.value = (variant && variant.mausac) || colorInput.value || '';
      } else {
        colorInput.value = product.mausac_chinh || colorInput.value || '';
      }

      refreshStock();
    }

    productSelect.addEventListener('change', refreshProduct);
    variantSelect.addEventListener('change', refreshVariant);
    sizeSelect.addEventListener('change', refreshStock);
    qtyInput.addEventListener('input', refreshStock);

    tr.querySelector('.js-remove') && tr.querySelector('.js-remove').addEventListener('click', () => {
      tr.remove();
      renumber();
    });

    refreshProduct();
  }

  function createRow() {
    const idx = tbody.querySelectorAll('tr').length;
    const tr = document.createElement('tr');
    tr.dataset.index = String(idx);
    tr.innerHTML = `
      <td>
        <select class="form-select form-select-sm js-product" data-field="sanphamid" name="chitiet[${idx}][sanphamid]" required>
          ${productOptions('')}
        </select>
      </td>
      <td>
        <select class="form-select form-select-sm js-variant" data-field="bientheid" name="chitiet[${idx}][bientheid]">
          <option value="main">Mặc định</option>
        </select>
      </td>
      <td>
        <select class="form-select form-select-sm js-size" data-field="kichco" name="chitiet[${idx}][kichco]">
          ${sizeOptions('')}
        </select>
      </td>
      <td>
        <input class="form-control form-control-sm js-qty" type="number" step="1" data-field="soluongdieuchinh" name="chitiet[${idx}][soluongdieuchinh]" placeholder="VD: 5 hoac -3" required />
      </td>
      <td class="text-end"><span class="js-stock-before text-muted">--</span></td>
      <td class="text-end"><span class="js-stock-after text-muted">--</span></td>
      <td>
        <input class="form-control form-control-sm js-color" type="text" data-field="mausac" name="chitiet[${idx}][mausac]" placeholder="Mau" />
      </td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-danger js-remove" type="button" title="Xóa dòng">
          <i class="bi bi-x"></i>
        </button>
      </td>
    `;

    wireRow(tr);
    return tr;
  }

  addBtn && addBtn.addEventListener('click', () => {
    tbody.appendChild(createRow());
    renumber();
  });

  form.addEventListener('submit', (e) => {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const qtyInputs = rows
      .map((tr) => tr.querySelector('input[name$="[soluongdieuchinh]"]'))
      .filter(Boolean);

    const values = qtyInputs
      .map((el) => Number(el.value || 0))
      .filter((n) => Number.isFinite(n) && n !== 0);

    const hasPositive = values.some((n) => n > 0);
    const hasNegative = values.some((n) => n < 0);

    if (!values.length) {
      e.preventDefault();
      window.alert('Vui lòng nhập ít nhất 1 dòng có số lượng điều chỉnh khác 0.');
      return;
    }

    if (hasPositive && hasNegative) {
      e.preventDefault();
      window.alert('Một phiếu chỉ hỗ trợ một loại điều chỉnh (+ hoặc -). Vui lòng tách thành 2 phiếu riêng.');
      return;
    }

    const hasNegativeAfter = rows.some((tr) => {
      const productSelect = tr.querySelector('.js-product');
      const variantSelect = tr.querySelector('.js-variant');
      const sizeSelect = tr.querySelector('.js-size');
      const qtyInput = tr.querySelector('.js-qty');
      const product = getProductById(productSelect && productSelect.value);
      const before = readStock(product, variantSelect && variantSelect.value, sizeSelect && sizeSelect.value);
      const delta = Number(qtyInput && qtyInput.value);
      if (before == null || !Number.isFinite(delta)) return false;
      return before + delta < 0;
    });

    if (hasNegativeAfter) {
      e.preventDefault();
      window.alert('Tồn sau điều chỉnh không được âm. Vui lòng giảm số lượng điều chỉnh.');
    }
  });

  tbody.appendChild(createRow());
  renumber();
})();
