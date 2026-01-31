(() => {
  const productsJsonEl = document.getElementById('products-json');
  const sizesJsonEl = document.getElementById('sizes-json');
  const tbody = document.getElementById('import-edit-items-body');
  const addBtn = document.getElementById('btn-add-line');
  const totalEl = document.getElementById('import-total-money');
  if (!productsJsonEl || !tbody) return;

  let products = [];
  try {
    products = JSON.parse(productsJsonEl.textContent || '[]');
  } catch {
    products = [];
  }

  let sizeList = [];
  try {
    sizeList = JSON.parse(sizesJsonEl?.textContent || '[]');
  } catch {
    sizeList = [];
  }

  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const shared = window.ImportsShared || {};
  const escapeHtml = shared.escapeHtml || ((s) => String(s || ''));
  const attachSelectSearch = shared.attachSelectSearch || (() => {});
  const isNoSizeType = shared.isNoSizeType || ((t) => ['tui', 'phukien'].includes(String(t || '').toLowerCase()));
  const pickImageFor = shared.pickImageFor || ((p) => String(p?.hinhanh || ''));
  const formatMoneyVND = shared.formatMoneyVND || ((n) => Number(n || 0).toLocaleString('vi-VN'));

  function toNumber(raw, fallback = 0) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  function calcTotalImportMoney() {
    let total = 0;
    Array.from(tbody.querySelectorAll('tr')).forEach((tr) => {
      const qtyInput = tr.querySelector('input[name$="[soluong]"]');
      const priceInput = tr.querySelector('input[name$="[gianhap]"]');
      const qty = toNumber(qtyInput?.value, 0);
      const price = toNumber(priceInput?.value, 0);
      total += qty * price;
    });
    if (totalEl) totalEl.textContent = formatMoneyVND(total);
    return total;
  }

  function buildProductOptions(selectedId) {
    const opts = ['<option value="">-- Chọn sản phẩm --</option>'];
    products.forEach((p) => {
      const sel = String(p._id) === String(selectedId) ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(p._id)}"${sel}>${escapeHtml(p.tensanpham || 'Sản phẩm')}</option>`);
    });
    return opts.join('');
  }

  function buildVariantOptions(product, selected) {
    const opts = [`<option value="main"${selected === 'main' ? ' selected' : ''}>Mặc định</option>`];
    (product?.bienthe || []).forEach((v) => {
      const id = String(v._id);
      const label = v?.mausac ? `Biến thể: ${v.mausac}` : `Biến thể: ${id.slice(-6)}`;
      const sel = String(selected) === id ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(id)}"${sel}>${escapeHtml(label)}</option>`);
    });
    return opts.join('');
  }

  function buildSizeOptions(selected) {
    const opts = ['<option value="">-- Size --</option>'];
    (sizeList || []).forEach((s) => {
      const sel = String(selected) === String(s) ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(s)}"${sel}>${escapeHtml(s)}</option>`);
    });
    return opts.join('');
  }

  function updateSizeRequired(tr, product) {
    const sizeEl = tr.querySelector('.js-size');
    if (!sizeEl) return;
    const noSize = isNoSizeType(product?.loaisanpham);
    if (noSize) {
      sizeEl.value = '';
      sizeEl.disabled = true;
      sizeEl.required = false;
    } else {
      sizeEl.disabled = false;
      sizeEl.required = true;
    }
  }

  function wireRow(tr) {
    const productSearch = tr.querySelector('.js-product-search');
    const productSelect = tr.querySelector('.js-product');
    const variantSelect = tr.querySelector('.js-variant');
    const sizeSelect = tr.querySelector('.js-size');
    const productNameHidden = tr.querySelector('.js-product-name');
    const colorInput = tr.querySelector('.js-color');
    const imageHidden = tr.querySelector('.js-image');
    const imagePreview = tr.querySelector('.js-image-preview');

    attachSelectSearch(productSearch, productSelect);

    function refreshFromProduct() {
      const product = productMap.get(String(productSelect.value));
      productNameHidden.value = product?.tensanpham || '';
      variantSelect.innerHTML = buildVariantOptions(product, variantSelect.value || 'main');
      updateSizeRequired(tr, product);

      if (colorInput && !colorInput.value) colorInput.value = product?.mausac_chinh || '';

      const img = pickImageFor(product, 'main');
      if (imageHidden && img) imageHidden.value = img;
      if (imagePreview) {
        if (img) {
          imagePreview.src = img;
          imagePreview.style.display = 'inline-block';
        } else {
          imagePreview.removeAttribute('src');
          imagePreview.style.display = 'none';
        }
      }
    }

    function refreshFromVariant() {
      const product = productMap.get(String(productSelect.value));
      const variantId = variantSelect.value || 'main';
      if (!product) return;

      if (colorInput) {
        if (variantId !== 'main') {
          const variant = (product.bienthe || []).find((v) => String(v._id) === String(variantId));
          if (variant?.mausac) colorInput.value = variant.mausac;
        } else {
          colorInput.value = product?.mausac_chinh || '';
        }
      }

      const img = pickImageFor(product, variantId);
      if (imageHidden) imageHidden.value = img;
      if (imagePreview) {
        if (img) {
          imagePreview.src = img;
          imagePreview.style.display = 'inline-block';
        } else {
          imagePreview.removeAttribute('src');
          imagePreview.style.display = 'none';
        }
      }
    }

    productSelect.addEventListener('change', () => {
      refreshFromProduct();
      if (sizeSelect) sizeSelect.value = '';
    });
    variantSelect.addEventListener('change', refreshFromVariant);

    tr.querySelector('.js-remove')?.addEventListener('click', () => {
      tr.remove();
      renumber();
    });

    // initial
    refreshFromProduct();
    refreshFromVariant();
    calcTotalImportMoney();
  }

  function renumber() {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach((tr, idx) => {
      tr.dataset.index = String(idx);
      tr.querySelectorAll('input, select, textarea').forEach((el) => {
        const name = el.getAttribute('name');
        if (!name) return;
        let newName = name;
        newName = newName.replace(/chitiet\[\d+\]/, `chitiet[${idx}]`);
        newName = newName.replace(/item_images\[\d+\]/, `item_images[${idx}]`);
        el.setAttribute('name', newName);
      });
    });
  }

  function createRow(idx) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(idx);

    tr.innerHTML = `
      <td style="min-width:240px">
        <input type="search" class="form-control form-control-sm mb-1 js-product-search" placeholder="Tìm sản phẩm..." />
        <select class="form-select form-select-sm js-product" name="chitiet[${idx}][sanphamid]">
          ${buildProductOptions('')}
        </select>
        <input type="hidden" class="js-product-name" name="chitiet[${idx}][tensanpham]" />
      </td>
      <td style="min-width:180px">
        <select class="form-select form-select-sm js-variant" name="chitiet[${idx}][bientheid]">
          <option value="main">Mặc định</option>
        </select>
      </td>
      <td style="min-width:120px">
        <select class="form-select form-select-sm js-size" name="chitiet[${idx}][kichco]">
          ${buildSizeOptions('')}
        </select>
      </td>
      <td style="min-width:110px">
        <input class="form-control form-control-sm" type="number" min="1" step="1" name="chitiet[${idx}][soluong]" value="1" required />
      </td>
      <td style="min-width:140px">
        <input class="form-control form-control-sm" type="number" min="0" step="1000" name="chitiet[${idx}][gianhap]" placeholder="Giá nhập" />
      </td>
      <td style="min-width:160px">
        <input class="form-control form-control-sm" type="number" min="0" step="1000" name="chitiet[${idx}][giabandexuat]" placeholder="Giá bán" />
      </td>
      <td style="min-width:260px">
        <details class="js-details" open>
          <summary>Chi tiết</summary>
          <div class="mt-2">
            <div class="mb-2">
              <label class="form-label small mb-1">Màu sắc</label>
              <input class="form-control form-control-sm js-color" name="chitiet[${idx}][mausac]" placeholder="Màu" />
            </div>
            <div class="mb-2">
              <label class="form-label small mb-1">Chất liệu</label>
              <input class="form-control form-control-sm js-material" name="chitiet[${idx}][chatlieu]" placeholder="Chất liệu" />
            </div>
            <div class="mb-2">
              <label class="form-label small mb-1">Danh mục</label>
              <input class="form-control form-control-sm js-category" name="chitiet[${idx}][danhmuc]" placeholder="Danh mục" />
            </div>
            <div class="d-flex align-items-center gap-2">
              <img class="js-image-preview" src="" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;display:none" />
              <div class="form-text mb-0">Ảnh tự lấy từ sản phẩm/biến thể.</div>
            </div>
            <input type="hidden" class="js-image" name="chitiet[${idx}][hinhanh]" />
          </div>
        </details>
      </td>
      <td style="min-width:60px" class="text-center">
        <button type="button" class="btn btn-sm btn-outline-danger js-remove" title="Xóa">
          <i class="bi bi-x"></i>
        </button>
      </td>
    `;

    wireRow(tr);
    return tr;
  }

  // Wire existing rows rendered by server
  Array.from(tbody.querySelectorAll('tr')).forEach(wireRow);

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const idx = tbody.querySelectorAll('tr').length;
      tbody.appendChild(createRow(idx));
      renumber();
      calcTotalImportMoney();
    });
  }

  tbody.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.matches('input[name$="[soluong]"], input[name$="[gianhap]"]')) {
      calcTotalImportMoney();
    }
  });

  // initial total
  calcTotalImportMoney();
})();
