(function () {
  const runtime = window.AdminCategoriesRuntime || {};
  const treeRoot = document.getElementById('categoryTreeRoot');
  const createForm = document.getElementById('categoryCreateForm');
  const refreshBtn = document.getElementById('categoryTreeRefresh');
  if (!treeRoot || !createForm || !runtime.adminPath) return;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type) {
    if (typeof bootstrap === 'undefined' || !message) return;

    let wrap = document.getElementById('adminCategoryToastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'adminCategoryToastWrap';
      wrap.className = 'toast-container position-fixed top-0 end-0 p-3';
      wrap.style.zIndex = '1080';
      document.body.appendChild(wrap);
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type === 'error' ? 'text-bg-danger' : 'text-bg-primary'} border-0`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;

    wrap.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: 2600 });
    toastEl.addEventListener('hidden.bs.toast', function () {
      toastEl.remove();
    });
    toast.show();
  }

  function captureOpenState() {
    return new Set(Array.from(treeRoot.querySelectorAll('.collapse.show[id]')).map(function (el) {
      return el.id;
    }));
  }

  function renderTypeOptions(selectedType) {
    return [
      ['category', 'Loai san pham'],
      ['occasion', 'Dip su dung'],
      ['age_group', 'Nhom tuoi'],
      ['brand', 'Thuong hieu']
    ].map(function (entry) {
      return `<option value="${entry[0]}"${entry[0] === selectedType ? ' selected' : ''}>${entry[1]}</option>`;
    }).join('');
  }

  function renderNode(item, depth, openState) {
    const id = String(item && item._id || '');
    const name = String(item && item.name || '');
    const type = String(item && item.type || 'category');
    const order = Number(item && item.order || 0);
    const isActive = !!(item && item.isActive);
    const children = Array.isArray(item && item.children) ? item.children : [];
    const isRootNode = !item.parent_id;
    const indent = Math.max(0, Number(depth || 0)) * 20;
    const childrenCollapseId = `children-${id}`;
    const editCollapseId = `edit-${id}`;
    const childrenExpanded = openState.has(childrenCollapseId);
    const editExpanded = openState.has(editCollapseId);

    const toggleNodeHtml = children.length
      ? `<button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${childrenCollapseId}" aria-expanded="${childrenExpanded ? 'true' : 'false'}" aria-controls="${childrenCollapseId}"><i class="bi bi-chevron-down"></i></button>`
      : '<span class="text-muted"><i class="bi bi-dot"></i></span>';

    const actionsHtml = isRootNode
      ? ''
      : `
        <button class="btn btn-sm ${isActive ? 'btn-outline-warning' : 'btn-outline-success'} js-category-toggle" type="button" data-id="${id}">${isActive ? 'An' : 'Hien'}</button>
        <button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="collapse" data-bs-target="#${editCollapseId}" aria-expanded="${editExpanded ? 'true' : 'false'}" aria-controls="${editCollapseId}">Sua</button>
        ${children.length
          ? '<button class="btn btn-sm btn-outline-secondary" type="button" disabled title="Xoa danh muc con truoc">Xoa</button>'
          : `<button class="btn btn-sm btn-outline-danger js-category-delete" type="button" data-id="${id}">Xoa</button>`}
      `;

    const editBoxHtml = isRootNode
      ? ''
      : `
        <div class="collapse mt-2 category-edit-box${editExpanded ? ' show' : ''}" id="${editCollapseId}">
          <form class="row g-2 js-category-edit-form" data-id="${id}">
            <div class="col-md-3">
              <input class="form-control form-control-sm" type="text" name="name" required value="${escapeHtml(name)}">
            </div>
            <div class="col-md-2">
              <select class="form-select form-select-sm" name="type">
                ${renderTypeOptions(type)}
              </select>
            </div>
            <div class="col-md-2">
              <input class="form-control form-control-sm" type="number" name="order" value="${order}" min="0">
            </div>
            <div class="col-md-1">
              <div class="form-check form-switch pt-2">
                <input class="form-check-input" type="checkbox" name="isActive" value="true"${isActive ? ' checked' : ''}>
              </div>
            </div>
            <div class="col-12">
              <button class="btn btn-sm btn-primary" type="submit">Luu</button>
            </div>
          </form>
        </div>
      `;

    const childrenHtml = children.length
      ? `<ul class="list-group list-group-flush collapse${childrenExpanded ? ' show' : ''}" id="${childrenCollapseId}">${children.map(function (child) {
        return renderNode(child, depth + 1, openState);
      }).join('')}</ul>`
      : '';

    return `
      <li class="list-group-item category-tree-item">
        <div class="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between category-tree-row">
          <div class="d-flex align-items-center gap-2 category-tree-label" style="padding-left:${indent}px">
            ${toggleNodeHtml}
            <div class="fw-semibold">${escapeHtml(name)}</div>
            ${isActive ? '' : '<span class="badge bg-secondary">An</span>'}
          </div>
          <div class="category-tree-actions">${actionsHtml}</div>
        </div>
        ${editBoxHtml}
        ${childrenHtml}
      </li>
    `;
  }

  function renderTree(tree, openState) {
    const items = Array.isArray(tree) ? tree : [];
    if (!items.length) {
      treeRoot.innerHTML = '<div class="text-muted">Chua co danh muc.</div>';
      return;
    }

    treeRoot.innerHTML = `<ul class="list-group list-group-flush category-tree">${items.map(function (item) {
      return renderNode(item, 0, openState || new Set());
    }).join('')}</ul>`;
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      ...(options || {})
    });

    const payload = await res.json().catch(function () {
      return {};
    });

    if (!res.ok || !payload || payload.success === false) {
      throw new Error((payload && payload.message) || 'Co loi xay ra');
    }

    return payload;
  }

  async function refreshTree(message, type, openState) {
    const payload = await fetchJson(runtime.treeUrl, { method: 'GET' });
    renderTree(payload.data || [], openState || new Set());
    if (message) showToast(message, type || 'success');
  }

  function formToPayload(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  createForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const submitBtn = createForm.querySelector('button[type="submit"]');

    try {
      if (submitBtn) submitBtn.disabled = true;
      const result = await fetchJson(createForm.action, {
        method: 'POST',
        body: JSON.stringify(formToPayload(createForm))
      });
      createForm.reset();
      const activeInput = createForm.querySelector('input[name="isActive"]');
      if (activeInput) activeInput.checked = true;
      await refreshTree(result.message || 'Tao danh muc thanh cong', 'success', captureOpenState());
    } catch (error) {
      showToast(error.message || 'Khong the tao danh muc', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  treeRoot.addEventListener('submit', async function (event) {
    const form = event.target.closest('.js-category-edit-form');
    if (!form) return;
    event.preventDefault();

    const categoryId = String(form.getAttribute('data-id') || '').trim();
    if (!categoryId) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const openState = captureOpenState();
    openState.add(`edit-${categoryId}`);

    try {
      if (submitBtn) submitBtn.disabled = true;
      const result = await fetchJson(`${runtime.adminPath}/categories/${encodeURIComponent(categoryId)}`, {
        method: 'PATCH',
        body: JSON.stringify(formToPayload(form))
      });
      await refreshTree(result.message || 'Cap nhat danh muc thanh cong', 'success', openState);
    } catch (error) {
      showToast(error.message || 'Khong the cap nhat danh muc', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  treeRoot.addEventListener('click', async function (event) {
    const toggleBtn = event.target.closest('.js-category-toggle');
    if (toggleBtn) {
      const categoryId = String(toggleBtn.getAttribute('data-id') || '').trim();
      if (!categoryId) return;

      try {
        toggleBtn.disabled = true;
        const result = await fetchJson(`${runtime.adminPath}/categories/${encodeURIComponent(categoryId)}/toggle-active`, {
          method: 'PATCH',
          body: JSON.stringify({})
        });
        await refreshTree(result.message || 'Da cap nhat trang thai hien thi', 'success', captureOpenState());
      } catch (error) {
        showToast(error.message || 'Khong the cap nhat trang thai', 'error');
      } finally {
        toggleBtn.disabled = false;
      }
      return;
    }

    const deleteBtn = event.target.closest('.js-category-delete');
    if (!deleteBtn) return;

    const categoryId = String(deleteBtn.getAttribute('data-id') || '').trim();
    if (!categoryId || !window.confirm('Xoa danh muc nay?')) return;

    try {
      deleteBtn.disabled = true;
      const result = await fetchJson(`${runtime.adminPath}/categories/${encodeURIComponent(categoryId)}`, {
        method: 'DELETE',
        body: JSON.stringify({})
      });
      await refreshTree(result.message || 'Da xoa danh muc', 'success', captureOpenState());
    } catch (error) {
      showToast(error.message || 'Khong the xoa danh muc', 'error');
    } finally {
      deleteBtn.disabled = false;
    }
  });

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function (event) {
      event.preventDefault();
      refreshTree('Da lam moi cay danh muc', 'success', captureOpenState()).catch(function (error) {
        showToast(error.message || 'Khong the lam moi danh muc', 'error');
      });
    });
  }
})();
