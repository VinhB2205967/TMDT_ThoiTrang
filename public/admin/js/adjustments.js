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
    sizeList = JSON.parse(sizesEl?.textContent || '[]');
  } catch {
    sizeList = [];
  }

  const noSizeTypes = new Set(['tui', 'phukien']);

  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function productOptions(selected = '') {
    const opts = ['<option value="">-- Chọn sản phẩm --</option>'];
    products.forEach((p) => {
      const sel = String(selected) === String(p._id) ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(p._id)}"${sel}>${escapeHtml(p.tensanpham || 'Sản phẩm')}</option>`);
    });
    return opts.join('');
  }

  function variantOptions(product, selected = 'main') {
    const opts = [`<option value="main"${String(selected) === 'main' ? ' selected' : ''}>Mặc định</option>`];
    (product?.bienthe || []).forEach((v) => {
      const id = String(v._id);
      const label = v.mausac ? `Biến thể: ${v.mausac}` : `Biến thể: ${id.slice(-6)}`;
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

  function wireRow(tr) {
    const productSelect = tr.querySelector('.js-product');
    const variantSelect = tr.querySelector('.js-variant');
    const sizeSelect = tr.querySelector('.js-size');
    const colorInput = tr.querySelector('.js-color');

    function refreshProduct() {
      const product = products.find((p) => String(p._id) === String(productSelect.value));
      variantSelect.innerHTML = variantOptions(product);

      const isNoSize = noSizeTypes.has(String(product?.loaisanpham || '').toLowerCase());
      sizeSelect.disabled = isNoSize;
      sizeSelect.required = !isNoSize;
      if (isNoSize) sizeSelect.value = '';

      if (colorInput && !colorInput.value) colorInput.value = product?.mausac_chinh || '';
    }

    function refreshVariant() {
      const product = products.find((p) => String(p._id) === String(productSelect.value));
      if (!product || !colorInput) return;
      const variantId = String(variantSelect.value || 'main');
      if (variantId !== 'main') {
        const variant = (product.bienthe || []).find((v) => String(v._id) === variantId);
        colorInput.value = variant?.mausac || colorInput.value || '';
      } else {
        colorInput.value = product.mausac_chinh || colorInput.value || '';
      }
    }

    productSelect.addEventListener('change', refreshProduct);
    variantSelect.addEventListener('change', refreshVariant);

    tr.querySelector('.js-remove')?.addEventListener('click', () => {
      tr.remove();
      renumber();
    });

    refreshProduct();
    refreshVariant();
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
        <input class="form-control form-control-sm" type="number" step="1" data-field="soluongdieuchinh" name="chitiet[${idx}][soluongdieuchinh]" placeholder="VD: 5 hoặc -3" required />
      </td>
      <td>
        <input class="form-control form-control-sm js-color" type="text" data-field="mausac" name="chitiet[${idx}][mausac]" placeholder="Màu" />
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

  addBtn?.addEventListener('click', () => {
    tbody.appendChild(createRow());
    renumber();
  });

  form.addEventListener('submit', (e) => {
    const qtyInputs = Array.from(tbody.querySelectorAll('input[name$="[soluongdieuchinh]"]'));
    const values = qtyInputs.map((el) => Number(el.value || 0)).filter((n) => Number.isFinite(n) && n !== 0);
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
    }
  });

  tbody.appendChild(createRow());
  renumber();
})();
