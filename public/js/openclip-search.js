(() => {
  const form = document.getElementById('openclipSearchForm');
  const imageForm = document.getElementById('openclipImageForm');
  const input = document.getElementById('openclipQuery');
  const imageInput = document.getElementById('openclipImage');
  const previewWrap = document.getElementById('openclipImagePreviewWrap');
  const previewImg = document.getElementById('openclipImagePreview');
  const list = document.getElementById('openclipResultList');
  const statusEl = document.getElementById('openclipStatus');
  const modelEl = document.getElementById('openclipModel');

  if (!form || !input || !list || !statusEl) return;
  const initialData = window.OpenClipInitialData || null;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    if (amount <= 0) return 'Lien he';
    return `${amount.toLocaleString('vi-VN')}đ`;
  }

  function renderEmpty(message) {
    list.innerHTML = `<div class="openclip-empty">${escapeHtml(message || 'Chua co du lieu')}</div>`;
  }

  function renderResults(products) {
    const rows = Array.isArray(products) ? products : [];
    if (rows.length === 0) {
      renderEmpty('Khong tim thay san pham phu hop. Thu mo ta cu the hon ve mau sac, chat lieu, kieu dang.');
      return;
    }

    list.innerHTML = rows.map((item) => {
      const score = Number(item.openClipScore || 0);
      const scoreText = Number.isFinite(score) ? score.toFixed(4) : '0.0000';
      return `
        <a class="openclip-item" href="${escapeHtml(item.url || '/products')}" target="_blank" rel="noopener noreferrer">
          <img class="openclip-item-image" src="${escapeHtml(item.imageUrl || '/images/shopping.png')}" alt="${escapeHtml(item.tensanpham || 'San pham')}" onerror="this.onerror=null;this.src='/images/shopping.png';">
          <div class="openclip-item-body">
            <div class="openclip-item-name">${escapeHtml(item.tensanpham || 'San pham')}</div>
            <div class="openclip-item-price">${escapeHtml(formatMoney(item.giaSauGiam || item.gia))}</div>
            <div class="openclip-item-score">OpenCLIP score: ${escapeHtml(scoreText)}</div>
          </div>
        </a>
      `;
    }).join('');
  }

  function setModelStatus(result) {
    const modelText = result && result.openClipMeta && result.openClipMeta.model
      ? `Model: ${String(result.openClipMeta.model)} (${String(result.openClipMeta.device || 'cpu')})`
      : 'Model: OpenCLIP';
    if (modelEl) modelEl.textContent = modelText;
  }

  async function search(query) {
    const res = await fetch('/api/openclip/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ query })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || data.success !== true) {
      throw new Error((data && data.message) || 'Khong the tim kiem OpenCLIP');
    }

    return data.data || {};
  }

  async function searchByImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/openclip/search-by-image', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || data.success !== true) {
      throw new Error((data && data.message) || 'Khong the tim kiem OpenCLIP theo anh');
    }

    return data.data || {};
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = String(input.value || '').trim();
    if (!query) {
      renderEmpty('Vui long nhap mo ta san pham truoc khi tim kiem.');
      return;
    }

    statusEl.textContent = 'Dang phan tich voi OpenCLIP...';
    form.querySelector('button[type="submit"]').disabled = true;

    try {
      const result = await search(query);
      renderResults(result.products);
      statusEl.textContent = `Tim thay ${Array.isArray(result.products) ? result.products.length : 0} san pham.`;
      setModelStatus(result);
    } catch (error) {
      statusEl.textContent = 'Tim kiem that bai.';
      renderEmpty(error && error.message ? error.message : 'Khong the ket noi OpenCLIP');
    } finally {
      form.querySelector('button[type="submit"]').disabled = false;
    }
  });

  if (imageInput && previewWrap && previewImg) {
    imageInput.addEventListener('change', () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) {
        previewWrap.classList.add('d-none');
        previewImg.src = '';
        return;
      }
      previewImg.src = URL.createObjectURL(file);
      previewWrap.classList.remove('d-none');
    });
  }

  if (imageForm && imageInput) {
    imageForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = imageInput.files && imageInput.files[0];
      if (!file) {
        renderEmpty('Vui long chon anh truoc khi tim kiem.');
        return;
      }

      statusEl.textContent = 'Dang tim theo anh voi OpenCLIP...';
      const submitBtn = imageForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const result = await searchByImage(file);
        renderResults(result.products);
        statusEl.textContent = `Tim thay ${Array.isArray(result.products) ? result.products.length : 0} san pham tu anh.`;
        setModelStatus(result);
      } catch (error) {
        statusEl.textContent = 'Tim theo anh that bai.';
        renderEmpty(error && error.message ? error.message : 'Khong the ket noi OpenCLIP');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (initialData && initialData.meta) {
    const count = Array.isArray(initialData.products) ? initialData.products.length : 0;
    if (count > 0) {
      statusEl.textContent = `Tim thay ${count} san pham.`;
    } else if (initialData.meta.message) {
      statusEl.textContent = String(initialData.meta.message);
    }

    if (modelEl && initialData.meta.model) {
      modelEl.textContent = `Model: ${String(initialData.meta.model)} (${String(initialData.meta.device || 'cpu')})`;
    }
  }
})();
