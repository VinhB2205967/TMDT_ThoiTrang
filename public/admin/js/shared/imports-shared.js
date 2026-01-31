(() => {
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function attachSelectSearch(searchInput, selectEl) {
    if (!searchInput || !selectEl) return;

    const allOptions = Array.from(selectEl.options).map((o) => ({
      value: o.value,
      label: o.textContent || '',
      disabled: o.disabled
    }));

    function render(query) {
      const q = String(query || '').trim().toLowerCase();
      const current = String(selectEl.value || '');
      const filtered = q
        ? allOptions.filter((o) => !o.value || o.label.toLowerCase().includes(q))
        : allOptions;

      selectEl.innerHTML = filtered
        .map((o) => `<option value="${escapeHtml(o.value)}"${o.disabled ? ' disabled' : ''}>${escapeHtml(o.label)}</option>`)
        .join('');

      const stillThere = Array.from(selectEl.options).some((o) => String(o.value) === current);
      if (stillThere) selectEl.value = current;
    }

    searchInput.addEventListener('input', () => render(searchInput.value));
    searchInput.addEventListener('search', () => render(searchInput.value));
  }

  function isNoSizeType(loaisanpham) {
    const t = String(loaisanpham || '').toLowerCase();
    return t === 'tui' || t === 'phukien';
  }

  function pickImageFor(product, variantId) {
    if (!product) return '';
    if (variantId && variantId !== 'main') {
      const variant = (product.bienthe || []).find((v) => String(v._id) === String(variantId));
      if (variant?.hinhanh) return String(variant.hinhanh);
    }
    return String(product.hinhanh || '');
  }

  function formatMoneyVND(amount) {
    const n = Number(amount || 0);
    return (Number.isFinite(n) ? n : 0).toLocaleString('vi-VN');
  }

  window.ImportsShared = {
    escapeHtml,
    attachSelectSearch,
    isNoSizeType,
    pickImageFor,
    formatMoneyVND
  };
})();
