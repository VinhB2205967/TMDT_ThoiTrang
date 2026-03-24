(() => {
  const productsJsonEl = document.getElementById('products-json');
  if (!productsJsonEl) return;

  const sizesJsonEl = document.getElementById('sizes-json');

  const importDateEl = document.querySelector('input[name="ngaynhap"], input[name="import_date"]');
  if (importDateEl && !importDateEl.value) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    importDateEl.value = local;
  }

  const totalEl = document.getElementById('import-total-money');

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

  let initialItems = [];
  try {
    const initialEl = document.getElementById('import-initial-items-json');
    initialItems = JSON.parse(initialEl?.textContent || '[]');
  } catch {
    initialItems = [];
  }

  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const bodyFashion = document.getElementById('import-items-fashion-body');
  const fashionBlocksEl = document.getElementById('fashion-blocks');
  const addFashionBlockBtn = document.getElementById('btn-add-fashion-block');
  const generatedItemsEl = document.getElementById('generated-items');

  const bodyAccessory = document.getElementById('import-items-accessory-body');
  const addFashionBtn = document.getElementById('btn-add-fashion');
  const addAccessoryBtn = document.getElementById('btn-add-accessory');
  const applyFashionBtn = document.getElementById('btn-apply-fashion');
  const applyAccessoryBtn = document.getElementById('btn-apply-accessory');

  // New accessory block/matrix mode
  const accessoryBlocksEl = document.getElementById('accessory-blocks');
  const addAccessoryBlockBtn = document.getElementById('btn-add-accessory-block');

  let globalIndex = 0;

  function cloneTemplate(id) {
    const tpl = document.getElementById(id);
    if (!tpl || !('content' in tpl)) return null;
    const el = tpl.content.firstElementChild;
    return el ? el.cloneNode(true) : null;
  }

  const shared = window.ImportsShared || {};
  const escapeHtml = shared.escapeHtml || ((s) => String(s || ''));
  const attachSelectSearch = shared.attachSelectSearch || (() => {});
  const isNoSizeType = shared.isNoSizeType || ((t) => ['tui', 'phukien'].includes(String(t || '').toLowerCase()));
  const formatMoneyVND = shared.formatMoneyVND || ((n) => Number(n || 0).toLocaleString('vi-VN'));

  function setSelectValueSafe(selectEl, preferredValue, fallbackValue) {
    if (!selectEl) return;
    const hasValue = (value) => Array.from(selectEl.options || []).some((opt) => String(opt.value) === String(value));

    const preferred = String(preferredValue || '').trim();
    if (preferred && hasValue(preferred)) {
      selectEl.value = preferred;
      return;
    }

    const fallback = String(fallbackValue || '').trim();
    if (fallback && hasValue(fallback)) {
      selectEl.value = fallback;
      return;
    }

    if (selectEl.options && selectEl.options.length) {
      selectEl.selectedIndex = 0;
    }
  }

  function buildVariantOptions(product) {
    const opts = ['<option value="main">Mặc định</option>'];
    (product?.bienthe || []).forEach((v) => {
      const label = v?.mausac ? `Biến thể: ${v.mausac}` : `Biến thể: ${String(v._id).slice(-6)}`;
      opts.push(`<option value="${escapeHtml(v._id)}">${escapeHtml(label)}</option>`);
    });
    return opts.join('');
  }

  const pickImageFor = shared.pickImageFor || ((p) => String(p?.hinhanh || ''));

  function toNumber(raw, fallback = 0) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  function calcFashionBlockTotal(blockEl) {
    if (!blockEl) return 0;
    let total = 0;
    blockEl.querySelectorAll('tr.js-variant-row').forEach((tr) => {
      const price = toNumber(tr.querySelector('.js-import')?.value, 0);
      if (!price) return;
      let qtySum = 0;
      tr.querySelectorAll('.js-qty').forEach((inp) => {
        const qty = toNumber(inp.value, 0);
        qtySum += Math.max(0, qty);
      });
      total += qtySum * price;
    });
    return total;
  }

  function calcAccessoryBlockTotal(blockEl) {
    if (!blockEl) return 0;
    let total = 0;
    blockEl.querySelectorAll('tr.js-accessory-variant-row').forEach((tr) => {
      const price = toNumber(tr.querySelector('.js-import')?.value, 0);
      const qtyEl = tr.querySelector('.js-qty-one');
      const qty = toNumber(qtyEl?.value, 0);
      total += Math.max(0, qty) * price;
    });
    return total;
  }

  function renderBlockTotal(blockEl, total) {
    const el = blockEl?.querySelector('.js-block-total');
    if (el) el.textContent = formatMoneyVND(total);
  }

  function calcTotalImportMoney() {
    let total = 0;

    // Per fashion block
    fashionBlocksEl?.querySelectorAll('[data-block-index]')?.forEach((blockEl) => {
      const bt = calcFashionBlockTotal(blockEl);
      renderBlockTotal(blockEl, bt);
      total += bt;
    });

    // Per accessory block
    accessoryBlocksEl?.querySelectorAll('[data-accessory-block-index]')?.forEach((blockEl) => {
      const bt = calcAccessoryBlockTotal(blockEl);
      renderBlockTotal(blockEl, bt);
      total += bt;
    });

    if (totalEl) totalEl.textContent = formatMoneyVND(total);
    return total;
  }

  function wireTotalListeners(container) {
    if (!container) return;
    container.addEventListener('input', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el.classList.contains('js-qty') || el.classList.contains('js-qty-one') || el.classList.contains('js-import')) {
        calcTotalImportMoney();
      }
    });
  }

  wireTotalListeners(fashionBlocksEl);
  wireTotalListeners(accessoryBlocksEl);

  // Giá bán đề xuất = giá gốc (không trừ giảm giá)
  function effectiveSuggestedPrice(product, variantId) {
    if (!product) return 0;
    if (variantId && variantId !== 'main') {
      const v = (product.bienthe || []).find((x) => String(x._id) === String(variantId));
      const gia = (v && v.gia != null) ? Number(v.gia) : Number(product.gia || 0);
      return gia || 0;
    }

    const gia = Number(product.gia || 0);
    return gia || 0;
  }

  function stockBySize(product, variantId) {
    const m = new Map();
    if (!product) return m;

    const sizes =
      variantId && variantId !== 'main'
        ? ((product.bienthe || []).find((v) => String(v._id) === String(variantId))?.sizes || [])
        : (product.sizes || []);

    (sizes || []).forEach((s) => {
      if (!s) return;
      const key = String(s.size || '').trim();
      if (!key) return;
      m.set(key, Number(s.soluong || 0));
    });
    return m;
  }

  function stockNoSize(product, variantId) {
    if (!product) return 0;
    if (variantId && variantId !== 'main') {
      const v = (product.bienthe || []).find((x) => String(x._id) === String(variantId));
      return Number(v?.soluong || 0);
    }
    return Number(product.soluong_chinh ?? product.soluongton ?? 0);
  }

  // ---------------- Fashion matrix mode ----------------
  let fashionBlockIndex = 0;

  function buildLoaiSanPhamOptions() {
    // Same as views/admin/pages/products/create.pug
    return [
      { value: 'ao', label: 'Áo' },
      { value: 'quan', label: 'Quần' },
      { value: 'vay', label: 'Váy' },
      { value: 'phukien', label: 'Phụ kiện' },
      { value: 'giay', label: 'Giày' },
      { value: 'tui', label: 'Túi' },
      { value: 'aokhoac', label: 'Áo khoác' }
    ]
      .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join('');
  }

  function renderFashionMatrix(container, product) {
    if (!container) return;
    if (!product) {
      container.innerHTML = '<div class="text-muted">Chọn sản phẩm để hiện ma trận size/màu.</div>';
      return;
    }

    const matrixEl = cloneTemplate('tpl-fashion-matrix');
    const rowTplId = 'tpl-fashion-variant-row';
    if (!matrixEl) {
      container.innerHTML = '<div class="text-danger">Thiếu template ma trận.</div>';
      return;
    }

    const tbody = matrixEl.querySelector('tbody');
    const variants = [{ id: 'main', label: 'Mặc định', color: product.mausac_chinh || '' }].concat(
      (product.bienthe || []).map((v) => ({
        id: String(v._id),
        label: v.mausac ? `Biến thể: ${v.mausac}` : `Biến thể: ${String(v._id).slice(-6)}`,
        color: v.mausac || ''
      }))
    );

    variants.forEach((v) => {
      const tr = cloneTemplate(rowTplId);
      if (!tr) return;
      tr.setAttribute('data-variant', v.id);
      tr.dataset.variant = v.id;
      const labelEl = tr.querySelector('.js-variant-label');
      if (labelEl) labelEl.textContent = v.label;

      // Show price for main/variant
      const priceEl = tr.querySelector('.js-variant-price');
      if (priceEl) {
        const p = effectiveSuggestedPrice(product, v.id);
        priceEl.textContent = p > 0 ? `Giá: ${p.toLocaleString('vi-VN')}đ` : '';
      }

      const colorEl = tr.querySelector('.js-variant-color');
      if (colorEl) colorEl.value = v.color || '';

      const img = pickImageFor(product, v.id);
      const imgEl = tr.querySelector('.js-variant-image');
      if (imgEl) {
        if (img) {
          imgEl.src = img;
          imgEl.style.display = 'inline-block';
        } else {
          imgEl.removeAttribute('src');
          imgEl.style.display = 'none';
        }
      }

      // Show current stock per size (from product / variant)
      const stockMap = stockBySize(product, v.id);
      tr.querySelectorAll('.js-stock').forEach((el) => {
        const size = String(el.getAttribute('data-size') || '').trim();
        const ton = Number(stockMap.get(size) || 0);
        el.textContent = `Tồn: ${ton}`;
      });

      // Qty input represents IMPORT quantity.
      tr.querySelectorAll('.js-qty').forEach((inp) => {
        inp.min = '0';
        if (!String(inp.value || '').trim()) inp.value = '0';
      });

      // Default suggested price from product / variant price (still editable)
      const suggestedEl = tr.querySelector('.js-suggested');
      if (suggestedEl && !String(suggestedEl.value || '').trim()) {
        const p = effectiveSuggestedPrice(product, v.id);
        if (p > 0) suggestedEl.value = String(p);
      }

      tbody?.appendChild(tr);
    });

    container.replaceChildren(matrixEl);
    calcTotalImportMoney();
  }

  // ---------------- Accessory matrix mode (no size) ----------------
  let accessoryBlockIndex = 0;

  function renderAccessoryMatrix(container, product) {
    if (!container) return;
    if (!product) {
      container.innerHTML = '<div class="text-muted">Chọn phụ kiện để hiện danh sách biến thể.</div>';
      return;
    }

    const matrixEl = cloneTemplate('tpl-accessory-matrix');
    const rowTplId = 'tpl-accessory-variant-row';
    if (!matrixEl) {
      container.innerHTML = '<div class="text-danger">Thiếu template phụ kiện.</div>';
      return;
    }

    const tbody = matrixEl.querySelector('tbody');
    const variants = [{ id: 'main', label: 'Mặc định', color: product.mausac_chinh || '' }].concat(
      (product.bienthe || []).map((v) => ({
        id: String(v._id),
        label: v.mausac ? `Biến thể: ${v.mausac}` : `Biến thể: ${String(v._id).slice(-6)}`,
        color: v.mausac || ''
      }))
    );

    variants.forEach((v) => {
      const tr = cloneTemplate(rowTplId);
      if (!tr) return;
      tr.setAttribute('data-variant', v.id);
      tr.dataset.variant = v.id;

      const labelEl = tr.querySelector('.js-variant-label');
      if (labelEl) labelEl.textContent = v.label;

      // Show price for main/variant
      const priceEl = tr.querySelector('.js-variant-price');
      if (priceEl) {
        const p = effectiveSuggestedPrice(product, v.id);
        priceEl.textContent = p > 0 ? `Giá: ${p.toLocaleString('vi-VN')}đ` : '';
      }

      const colorEl = tr.querySelector('.js-variant-color');
      if (colorEl) colorEl.value = v.color || '';

      const img = pickImageFor(product, v.id);
      const imgEl = tr.querySelector('.js-variant-image');
      if (imgEl) {
        if (img) {
          imgEl.src = img;
          imgEl.style.display = 'inline-block';
        } else {
          imgEl.removeAttribute('src');
          imgEl.style.display = 'none';
        }
      }

      // Show current stock (no size)
      const tonNoSize = stockNoSize(product, v.id);
      const stockElNoSize = tr.querySelector('.js-stock-one');
      if (stockElNoSize) stockElNoSize.textContent = `Tồn: ${tonNoSize}`;

      // Qty input represents IMPORT quantity.
      const qtyElOne = tr.querySelector('.js-qty-one');
      if (qtyElOne) {
        qtyElOne.min = '0';
        if (!String(qtyElOne.value || '').trim()) qtyElOne.value = '0';
      }

      const suggestedEl = tr.querySelector('.js-suggested');
      if (suggestedEl && !String(suggestedEl.value || '').trim()) {
        const p = effectiveSuggestedPrice(product, v.id);
        if (p > 0) suggestedEl.value = String(p);
      }

      tbody?.appendChild(tr);
    });

    container.replaceChildren(matrixEl);
    calcTotalImportMoney();
  }

  function createAccessoryBlock(blockIndex) {
    const wrap = cloneTemplate('tpl-accessory-block');
    if (!wrap) return document.createElement('div');
    wrap.dataset.accessoryBlockIndex = String(blockIndex);

    const productSelect = wrap.querySelector('.js-accessory-product');
    const productSearch = wrap.querySelector('.js-accessory-product-search');
    const matrixEl = wrap.querySelector('.js-accessory-matrix');
    const blockImagePreview = wrap.querySelector('.js-block-image-preview');

    attachSelectSearch(productSearch, productSelect);

    productSelect.addEventListener('change', () => {
      const productId = productSelect.value;
      const product = productMap.get(String(productId));
      renderAccessoryMatrix(matrixEl, product);

      const img = pickImageFor(product, 'main');
      if (blockImagePreview) {
        if (img) {
          blockImagePreview.src = img;
          blockImagePreview.style.display = 'inline-block';
        } else {
          blockImagePreview.removeAttribute('src');
          blockImagePreview.style.display = 'none';
        }
      }

      const catEl = wrap.querySelector('.js-accessory-category');
      setSelectValueSafe(catEl, product?.loaisanpham, 'phukien');
    });

    wrap.querySelector('.js-remove-accessory-block')?.addEventListener('click', () => {
      wrap.remove();
      calcTotalImportMoney();
    });

    renderAccessoryMatrix(matrixEl, null);
    return wrap;
  }

  function createFashionBlock(blockIndex) {
    const wrap = cloneTemplate('tpl-fashion-block');
    if (!wrap) return document.createElement('div');
    wrap.dataset.blockIndex = String(blockIndex);

    const productSelect = wrap.querySelector('.js-fashion-product');
    const productSearch = wrap.querySelector('.js-fashion-product-search');
    const matrixEl = wrap.querySelector('.js-matrix');
    const blockImagePreview = wrap.querySelector('.js-block-image-preview');

    attachSelectSearch(productSearch, productSelect);

    productSelect.addEventListener('change', () => {
      const productId = productSelect.value;
      const product = productMap.get(String(productId));
      renderFashionMatrix(matrixEl, product);

      const img = pickImageFor(product, 'main');
      if (blockImagePreview) {
        if (img) {
          blockImagePreview.src = img;
          blockImagePreview.style.display = 'inline-block';
        } else {
          blockImagePreview.removeAttribute('src');
          blockImagePreview.style.display = 'none';
        }
      }

      const catEl = wrap.querySelector('.js-fashion-category');
      setSelectValueSafe(catEl, product?.loaisanpham, 'ao');
    });

    wrap.querySelector('.js-remove-block')?.addEventListener('click', () => {
      wrap.remove();
      calcTotalImportMoney();
    });

    renderFashionMatrix(matrixEl, null);
    return wrap;
  }

  function normalizeInitialItem(raw) {
    return {
      chisoblock: raw?.chisoblock,
      sanphamid: String(raw?.sanphamid || raw?.san_pham_id || '').trim(),
      bientheid: String(raw?.bientheid || raw?.bien_the_id || 'main').trim() || 'main',
      kichco: String(raw?.kichco || raw?.kich_co || '').trim(),
      mausac: String(raw?.mausac || raw?.mau_sac || '').trim(),
      chatlieu: String(raw?.chatlieu || raw?.chat_lieu || '').trim(),
      danhmuc: String(raw?.danhmuc || raw?.danh_muc || '').trim(),
      soluong: Number(raw?.soluong || raw?.so_luong || 0),
      gianhap: Number(raw?.gianhap ?? raw?.gia_nhap ?? 0) || 0,
      giabandexuat: Number(raw?.giabandexuat ?? raw?.gia_ban_de_xuat ?? 0) || 0
    };
  }

  function groupInitialItems(items) {
    const fashion = new Map();
    const accessory = new Map();

    (items || []).forEach((raw, idx) => {
      const it = normalizeInitialItem(raw);
      if (!it.sanphamid || !productMap.has(it.sanphamid) || !(it.soluong > 0)) return;

      const product = productMap.get(it.sanphamid);
      const keyBase = `${String(it.chisoblock ?? '')}|${it.sanphamid}|${it.danhmuc}|${it.chatlieu}`;
      const target = isNoSizeType(product?.loaisanpham) ? accessory : fashion;
      const key = keyBase || `auto-${idx}`;
      if (!target.has(key)) target.set(key, []);
      target.get(key).push(it);
    });

    return {
      fashionGroups: Array.from(fashion.values()),
      accessoryGroups: Array.from(accessory.values())
    };
  }

  function hydrateFashionGroup(items) {
    if (!fashionBlocksEl || !items?.length) return;
    const block = createFashionBlock(fashionBlockIndex++);
    fashionBlocksEl.appendChild(block);

    const first = items[0];
    const productId = first.sanphamid;
    const product = productMap.get(String(productId));
    const productSelect = block.querySelector('.js-fashion-product');
    const categoryEl = block.querySelector('.js-fashion-category');
    const materialEl = block.querySelector('.js-fashion-material');

    if (productSelect) {
      productSelect.value = String(productId);
      productSelect.dispatchEvent(new Event('change'));
    }
    setSelectValueSafe(categoryEl, first.danhmuc, product?.loaisanpham || 'ao');
    if (materialEl && first.chatlieu) materialEl.value = first.chatlieu;

    const rows = Array.from(block.querySelectorAll('.js-variant-row'));
    items.forEach((it) => {
      const variantKey = String(it.bientheid || 'main');
      const row = rows.find((r) => String(r.getAttribute('data-variant') || 'main') === variantKey);
      if (!row) return;

      const qtyInput = row.querySelector(`.js-qty[data-size="${it.kichco}"]`);
      if (qtyInput) qtyInput.value = String(Math.max(0, Number(it.soluong || 0)));

      const importEl = row.querySelector('.js-import');
      const suggestedEl = row.querySelector('.js-suggested');
      const colorEl = row.querySelector('.js-variant-color');
      if (importEl) importEl.value = String(it.gianhap || 0);
      if (suggestedEl) suggestedEl.value = String(it.giabandexuat || 0);
      if (colorEl && it.mausac) colorEl.value = it.mausac;
    });
  }

  function hydrateAccessoryGroup(items) {
    if (!accessoryBlocksEl || !items?.length) return;
    const block = createAccessoryBlock(accessoryBlockIndex++);
    accessoryBlocksEl.appendChild(block);

    const first = items[0];
    const productId = first.sanphamid;
    const productSelect = block.querySelector('.js-accessory-product');
    const categoryEl = block.querySelector('.js-accessory-category');
    const materialEl = block.querySelector('.js-accessory-material');

    if (productSelect) {
      productSelect.value = String(productId);
      productSelect.dispatchEvent(new Event('change'));
    }
    setSelectValueSafe(categoryEl, first.danhmuc, product?.loaisanpham || 'phukien');
    if (materialEl && first.chatlieu) materialEl.value = first.chatlieu;

    const rows = Array.from(block.querySelectorAll('.js-accessory-variant-row'));
    items.forEach((it) => {
      const variantKey = String(it.bientheid || 'main');
      const row = rows.find((r) => String(r.getAttribute('data-variant') || 'main') === variantKey);
      if (!row) return;

      const qtyEl = row.querySelector('.js-qty-one');
      const importEl = row.querySelector('.js-import');
      const suggestedEl = row.querySelector('.js-suggested');
      const colorEl = row.querySelector('.js-variant-color');

      if (qtyEl) qtyEl.value = String(Math.max(0, Number(it.soluong || 0)));
      if (importEl) importEl.value = String(it.gianhap || 0);
      if (suggestedEl) suggestedEl.value = String(it.giabandexuat || 0);
      if (colorEl && it.mausac) colorEl.value = it.mausac;
    });
  }

  function updateDetailsSummary(tr) {
    const details = tr.querySelector('.js-details');
    if (!details) return;
    const summary = details.querySelector('summary');
    if (!summary) return;

    const color = tr.querySelector('.js-color')?.value || '';
    const category = tr.querySelector('.js-category')?.value || '';

    const parts = [];
    if (color) parts.push(`Màu: ${color}`);
    if (category) parts.push(`Mục: ${category}`);

    summary.textContent = parts.length ? parts.join(' | ') : 'Chi tiết (mở để nhập thêm)';
  }

  function setIfNeeded(el, value, overwrite) {
    if (!el) return;
    const v = value != null ? String(value) : '';
    if (!v) return;
    if (overwrite) {
      el.value = v;
      return;
    }
    if (!String(el.value || '').trim()) el.value = v;
  }

  function applyQuick(mode) {
    const isAccessory = mode === 'accessory';
    const overwrite = Boolean(document.getElementById(isAccessory ? 'quick-accessory-overwrite' : 'quick-fashion-overwrite')?.checked);

    const rows = isAccessory
      ? (bodyAccessory ? Array.from(bodyAccessory.querySelectorAll('tr')) : [])
      : (bodyFashion ? Array.from(bodyFashion.querySelectorAll('tr')) : []);

    const q = (id) => document.getElementById(id);

    const size = isAccessory ? '' : String(q('quick-fashion-size')?.value || '');
    const color = String(q(isAccessory ? 'quick-accessory-color' : 'quick-fashion-color')?.value || '');
    const material = String(q(isAccessory ? 'quick-accessory-material' : 'quick-fashion-material')?.value || '');
    const category = String(q(isAccessory ? 'quick-accessory-category' : 'quick-fashion-category')?.value || '');
    const importPrice = String(q(isAccessory ? 'quick-accessory-import' : 'quick-fashion-import')?.value || '');
    const suggested = String(q(isAccessory ? 'quick-accessory-suggested' : 'quick-fashion-suggested')?.value || '');

    rows.forEach((tr) => {
      if (!isAccessory) {
        const sizeEl = tr.querySelector('.js-size');
        if (sizeEl && size) setIfNeeded(sizeEl, size, overwrite);
      }

      setIfNeeded(tr.querySelector('.js-color'), color, overwrite);
      setIfNeeded(tr.querySelector('.js-material'), material, overwrite);
      setIfNeeded(tr.querySelector('.js-category'), category, overwrite);

      setIfNeeded(tr.querySelector('input[name$="[gianhap]"]'), importPrice, overwrite);
      setIfNeeded(tr.querySelector('input[name$="[giabandexuat]"]'), suggested, overwrite);

      updateDetailsSummary(tr);
    });
  }

  function copyDefaultsFromPrev(prevTr, nextTr) {
    if (!prevTr || !nextTr) return;

    const prevSize = prevTr.querySelector('.js-size')?.value || '';
    const prevColor = prevTr.querySelector('.js-color')?.value || '';
    const prevMaterial = prevTr.querySelector('.js-material')?.value || '';
    const prevCategory = prevTr.querySelector('.js-category')?.value || '';
    const prevImport = prevTr.querySelector('input[name$="[gianhap]"]')?.value || '';
    const prevSuggested = prevTr.querySelector('input[name$="[giabandexuat]"]')?.value || '';

    // Copy only non-empty
    setIfNeeded(nextTr.querySelector('.js-size'), prevSize, false);
    setIfNeeded(nextTr.querySelector('.js-color'), prevColor, false);
    setIfNeeded(nextTr.querySelector('.js-material'), prevMaterial, false);
    setIfNeeded(nextTr.querySelector('.js-category'), prevCategory, false);
    setIfNeeded(nextTr.querySelector('input[name$="[gianhap]"]'), prevImport, false);
    setIfNeeded(nextTr.querySelector('input[name$="[giabandexuat]"]'), prevSuggested, false);

    updateDetailsSummary(nextTr);
  }

  function createRow(index, mode) {
    let tr = document.createElement('tr');
    tr.dataset.index = String(index);

    const isAccessoryMode = mode === 'accessory';
    if (isAccessoryMode) {
      const row = cloneTemplate('tpl-accessory-row');
      if (row) {
        row.dataset.index = String(index);
        tr = row;
      }
    }

    // Currently only accessory mode uses row table; fashion uses matrix blocks.
    if (!isAccessoryMode) {
      // Fallback: create an empty row if called.
      tr.innerHTML = '<td colspan="7" class="text-muted">Dòng thời trang đang dùng ma trận. Vui lòng dùng nút Thêm sản phẩm (ma trận size/màu).</td>';
      return tr;
    }

    function assignNames(rowEl, idx) {
      rowEl.querySelectorAll('[data-field]').forEach((el) => {
        const field = el.getAttribute('data-field');
        if (!field) return;
        el.setAttribute('name', `chitiet[${idx}][${field}]`);
      });
    }

    assignNames(tr, index);

    const productSelect = tr.querySelector('.js-product');
    const productSearch = tr.querySelector('.js-product-search');
    const variantSelect = tr.querySelector('.js-variant');
    const sizeInput = tr.querySelector('.js-size');
    const colorInput = tr.querySelector('.js-color');
    const productNameHidden = tr.querySelector('.js-product-name');
    const imageHidden = tr.querySelector('.js-image');
    const imagePreview = tr.querySelector('.js-image-preview');

    attachSelectSearch(productSearch, productSelect);

    productSelect.addEventListener('change', () => {
      const productId = productSelect.value;
      const product = productMap.get(String(productId));
      productNameHidden.value = product?.tensanpham || '';

      variantSelect.innerHTML = buildVariantOptions(product);

      // Default color
      colorInput.value = product?.mausac_chinh || '';

      const categoryInput = tr.querySelector('.js-category');
      if (categoryInput && !categoryInput.value) categoryInput.value = product?.loaisanpham || '';

      // Snapshot image
      const img = pickImageFor(product, 'main');
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

        if (sizeInput) sizeInput.value = '';

      updateDetailsSummary(tr);
    });

    variantSelect.addEventListener('change', () => {
      const productId = productSelect.value;
      const product = productMap.get(String(productId));
      const variantId = variantSelect.value;
      if (!product) return;

      if (variantId && variantId !== 'main') {
        const variant = (product.bienthe || []).find((v) => String(v._id) === String(variantId));
        if (variant?.mausac) colorInput.value = variant.mausac;
      } else {
        colorInput.value = product?.mausac_chinh || '';
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

      updateDetailsSummary(tr);
    });

    // Keep summary in sync when editing details
    tr.querySelectorAll('.js-color, .js-category').forEach((el) => {
      el.addEventListener('input', () => updateDetailsSummary(tr));
      el.addEventListener('change', () => updateDetailsSummary(tr));
    });

    updateDetailsSummary(tr);

    tr.querySelector('.js-remove')?.addEventListener('click', () => {
      tr.remove();
      renumberRows();
    });

    return tr;
  }

  function allRows() {
    const rowsFashion = bodyFashion ? Array.from(bodyFashion.querySelectorAll('tr')) : [];
    const rowsAccessory = bodyAccessory ? Array.from(bodyAccessory.querySelectorAll('tr')) : [];
    return rowsFashion.concat(rowsAccessory);
  }

  function renumberRows() {
    const rows = allRows();
    rows.forEach((tr, idx) => {
      tr.dataset.index = String(idx);
      tr.querySelectorAll('[data-field]').forEach((el) => {
        const field = el.getAttribute('data-field');
        if (!field) return;
        el.setAttribute('name', `chitiet[${idx}][${field}]`);
      });
    });

    globalIndex = rows.length;
  }

  function addRow(mode) {
    const index = globalIndex++;
    const tr = createRow(index, mode);
    if (mode === 'accessory') {
      const prev = bodyAccessory ? bodyAccessory.querySelector('tr:last-child') : null;
      bodyAccessory?.appendChild(tr);
      copyDefaultsFromPrev(prev, tr);
    } else {
      const prev = bodyFashion ? bodyFashion.querySelector('tr:last-child') : null;
      bodyFashion?.appendChild(tr);
      copyDefaultsFromPrev(prev, tr);
    }
  }

  if (addFashionBtn && bodyFashion) {
    addFashionBtn.addEventListener('click', () => addRow('fashion'));
  }
  if (addAccessoryBtn && bodyAccessory) {
    addAccessoryBtn.addEventListener('click', () => addRow('accessory'));
  }

  if (applyFashionBtn) {
    applyFashionBtn.addEventListener('click', () => applyQuick('fashion'));
  }
  if (applyAccessoryBtn) {
    applyAccessoryBtn.addEventListener('click', () => applyQuick('accessory'));
  }

  const groupedInitial = groupInitialItems(initialItems);

  // Fashion matrix blocks (new)
  if (fashionBlocksEl) {
    if (groupedInitial.fashionGroups.length) {
      groupedInitial.fashionGroups.forEach((g) => hydrateFashionGroup(g));
    } else {
      const first = createFashionBlock(fashionBlockIndex++);
      fashionBlocksEl.appendChild(first);
    }
  }

  if (addFashionBlockBtn && fashionBlocksEl) {
    addFashionBlockBtn.addEventListener('click', () => {
      const block = createFashionBlock(fashionBlockIndex++);
      fashionBlocksEl.appendChild(block);
    });
  }

  // Generate chitiet[] for blocks right before submit
  const formEl = document.querySelector('#import-create-form')
    || Array.from(document.querySelectorAll('form')).find((f) => {
      const action = String(f.getAttribute('action') || '');
      return /\/imports\/create(?:\?|$)/.test(action);
    });
  if (formEl && generatedItemsEl) {
    formEl.addEventListener('submit', () => {
      // Ensure accessory rows are indexed correctly
      renumberRows();

      let itemIndex = allRows().length;
      generatedItemsEl.innerHTML = '';

      function appendFields(fields) {
        Object.entries(fields).forEach(([k, v]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = `chitiet[${itemIndex}][${k}]`;
          input.value = v;
          generatedItemsEl.appendChild(input);
        });
        itemIndex += 1;
      }

      // 1) Fashion blocks
      const blocks = fashionBlocksEl ? Array.from(fashionBlocksEl.querySelectorAll('[data-block-index]')) : [];
      blocks.forEach((block) => {
        const blockIndex = Number(block.dataset.blockIndex);
        const productId = block.querySelector('.js-fashion-product')?.value || '';
        const product = productMap.get(String(productId));
        if (!productId || !product) return;

        const productName = product.tensanpham || '';
        const category = block.querySelector('.js-fashion-category')?.value || '';
        const material = block.querySelector('.js-fashion-material')?.value || '';

        const variantRows = Array.from(block.querySelectorAll('.js-variant-row'));
        variantRows.forEach((row) => {
          const variantId = row.getAttribute('data-variant') || 'main';
          const color = row.querySelector('.js-variant-color')?.value || '';
          const importPrice = row.querySelector('.js-import')?.value || '';
          const suggested = row.querySelector('.js-suggested')?.value || '';

          const qtyInputs = Array.from(row.querySelectorAll('.js-qty'));
          qtyInputs.forEach((qEl) => {
            const size = qEl.getAttribute('data-size') || '';
            const qty = Number(qEl.value || 0);
            if (!qty || qty <= 0) return;

            const img = pickImageFor(product, variantId);

            const fields = {
              chisoblock: String(blockIndex),
              sanphamid: String(productId),
              tensanpham: String(productName),
              bientheid: String(variantId),
              kichco: String(size),
              mausac: String(color),
              chatlieu: String(material),
              danhmuc: String(category),
              soluong: String(qty),
              gianhap: String(importPrice),
              giabandexuat: String(suggested),
              hinhanh: String(img)
            };

            appendFields(fields);
          });
        });
      });

      // 2) Accessory blocks (no size)
      const aBlocks = accessoryBlocksEl ? Array.from(accessoryBlocksEl.querySelectorAll('[data-accessory-block-index]')) : [];
      aBlocks.forEach((block) => {
        const productId = block.querySelector('.js-accessory-product')?.value || '';
        const product = productMap.get(String(productId));
        if (!productId || !product) return;

        const productName = product.tensanpham || '';
        const category = block.querySelector('.js-accessory-category')?.value || '';
        const material = block.querySelector('.js-accessory-material')?.value || '';

        const variantRows = Array.from(block.querySelectorAll('.js-accessory-variant-row'));
        variantRows.forEach((row) => {
          const variantId = row.getAttribute('data-variant') || 'main';
          const color = row.querySelector('.js-variant-color')?.value || '';
          const importPrice = row.querySelector('.js-import')?.value || '';
          const suggested = row.querySelector('.js-suggested')?.value || '';
          const qtyEl = row.querySelector('.js-qty-one');
          const qty = Number(qtyEl?.value || 0);
          if (!qty || qty <= 0) return;

          const img = pickImageFor(product, variantId);

          appendFields({
            chisoblock: '',
            sanphamid: String(productId),
            tensanpham: String(productName),
            bientheid: String(variantId),
            kichco: '',
            mausac: String(color),
            chatlieu: String(material),
            danhmuc: String(category),
            soluong: String(qty),
            gianhap: String(importPrice),
            giabandexuat: String(suggested),
            hinhanh: String(img)
          });
        });
      });
    });
  }

  // Accessory blocks start with hydrated data or 1 empty block.
  if (accessoryBlocksEl) {
    if (groupedInitial.accessoryGroups.length) {
      groupedInitial.accessoryGroups.forEach((g) => hydrateAccessoryGroup(g));
    } else {
      const first = createAccessoryBlock(accessoryBlockIndex++);
      accessoryBlocksEl.appendChild(first);
    }
  }

  if (addAccessoryBlockBtn && accessoryBlocksEl) {
    addAccessoryBlockBtn.addEventListener('click', () => {
      const block = createAccessoryBlock(accessoryBlockIndex++);
      accessoryBlocksEl.appendChild(block);
    });
  }

  calcTotalImportMoney();
})();
