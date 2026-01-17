(() => {
	const App = window.App || {};
	const $ = App.qs || ((selector, root = document) => root.querySelector(selector));
	const apiFetch = App.apiFetch || (async (url, options = {}, cfg = {}) => {
		const { redirectOn401 = true } = cfg;
		const opts = {
			credentials: 'same-origin',
			...options,
			headers: {
				Accept: 'application/json',
				...(options.headers || {})
			}
		};

		const res = await fetch(url, opts);
		let data = null;
		try {
			const ct = String(res.headers.get('content-type') || '');
			if (ct.includes('application/json')) data = await res.json();
		} catch {
			data = null;
		}

		if (res.status === 401) {
			if (redirectOn401) {
				const redirect = data && data.redirect ? data.redirect : '/auth?mode=login';
				window.location.href = redirect;
			}
			return { ok: false, status: 401, data };
		}

		return { ok: res.ok, status: res.status, data };
	});
	const setCartBadge = App.setCartBadge || ((count) => {
		const badge = $('.cart-badge');
		if (!badge) return;
		badge.textContent = String(count ?? 0);
	});

	// ===== Favorites =====
	async function hydrateFavoriteHearts() {
		const cards = document.querySelectorAll('[data-product-id]');
		if (!cards.length) return;

		const { ok, data } = await apiFetch('/favorites/ids', {}, { redirectOn401: false });
		if (!ok || !data || !Array.isArray(data.ids)) return;

		const set = new Set(data.ids);
		cards.forEach((card) => {
			const pid = card.getAttribute('data-product-id');
			if (!pid) return;
			const buttons = card.querySelectorAll('.btn-wishlist, .btn-wishlist-float, .wishlist-btn');
			buttons.forEach((btn) => {
				const icon = btn.querySelector('i');
				const active = set.has(pid);
				btn.classList.toggle('active', active);
				if (icon) {
					icon.classList.toggle('bi-heart-fill', active);
					icon.classList.toggle('bi-heart', !active);
				}
			});
		});
	}

	async function toggleFavorite(productId, btn) {
		const { ok, data } = await apiFetch(`/favorites/toggle/${productId}`, { method: 'POST' });
		if (!ok || !data) return;

		const active = Boolean(data.active);
		if (btn) {
			btn.classList.toggle('active', active);
			const icon = btn.querySelector('i');
			if (icon) {
				icon.classList.toggle('bi-heart-fill', active);
				icon.classList.toggle('bi-heart', !active);
			}
		}

		// On favorites page, unfavoriting should remove the item from the list
		if (!active && String(window.location.pathname || '').startsWith('/favorites')) {
			const col = btn ? btn.closest('.col-6, .col-sm-6, .col-md-4, .col-lg-3') : null;
			if (col) col.remove();
			if (!document.querySelector('[data-product-id]')) {
				window.location.reload();
			}
		}
	}

	// ===== Quick Add/Buy Modal =====
	let modal;
	let modalEl;
	let currentProductId = null;
	let currentIntent = 'add'; // add | buy
	let currentOptions = null;
	let selectedVariantId = 'main';
	let selectedSize = '';
	let maxStock = 0;
	let editingCartItemId = null;

	function ensureModal() {
		modalEl = $('#quickAddModal');
		if (!modalEl) return null;
		// eslint-disable-next-line no-undef
		modal = bootstrap.Modal.getOrCreateInstance(modalEl);
		return modal;
	}

	function formatVND(n) {
		if (App.formatVND) return App.formatVND(n).replace(/đ$/, '₫');
		try {
			return (n || 0).toLocaleString('vi-VN') + '₫';
		} catch {
			return String(n || 0) + '₫';
		}
	}

	function renderModalProduct() {
		if (!currentOptions) return;
		const p = currentOptions.product;

		const variants = Array.isArray(p.variants) ? p.variants : [];
		let selectedVariant = variants.find(v => String(v.id) === String(selectedVariantId));
		if (!selectedVariant && variants.length) {
			selectedVariant = variants[0];
			selectedVariantId = String(selectedVariant.id);
		}

		$('#qamName').textContent = p.tensanpham || '—';
		$('#qamImage').src = (selectedVariant?.hinhanh || p.hinhanh || '/images/shopping.png');
		$('#qamPrice').textContent = formatVND((selectedVariant?.giamoi ?? selectedVariant?.gia) ?? (p.giamoi ?? p.gia ?? 0));

		const variantsWrap = $('#qamVariants');
		variantsWrap.innerHTML = '';

		variants.forEach((v) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'btn btn-sm ' + (String(v.id) === String(selectedVariantId) ? 'btn-primary' : 'btn-outline-primary');
			btn.textContent = v.mausac || 'Màu';
			btn.dataset.variantId = String(v.id);
			btn.addEventListener('click', () => {
				selectedVariantId = String(v.id);
				selectedSize = '';
				renderModalProduct();
			});
			variantsWrap.appendChild(btn);
		});

		selectedVariant = variants.find(v => String(v.id) === String(selectedVariantId)) || variants[0];

		const sizeWrap = $('#qamSizeWrap');
		const sizesEl = $('#qamSizes');
		sizesEl.innerHTML = '';

		if (p.hasSize) {
			sizeWrap.style.display = '';
			const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
			const sizes = Array.isArray(selectedVariant?.sizes) ? selectedVariant.sizes : [];
			const bySize = new Map(sizes.map(s => [String(s.size), s]));

			sizeOrder.forEach((sz) => {
				if (!bySize.has(sz)) return;
				const row = bySize.get(sz);
				const stock = row?.soluong || 0;
				const b = document.createElement('button');
				b.type = 'button';
				const active = selectedSize === sz;
				b.className = 'btn btn-sm ' + (active ? 'btn-dark' : 'btn-outline-dark');
				b.textContent = `${sz}${stock > 0 ? '' : ' (Hết)'}`;
				b.disabled = stock <= 0;
				b.addEventListener('click', () => {
					selectedSize = sz;
					renderModalProduct();
				});
				sizesEl.appendChild(b);
			});

			if (selectedSize) {
				const stock = bySize.get(selectedSize)?.soluong || 0;
				maxStock = stock;
			} else {
				maxStock = 0;
			}
		} else {
			sizeWrap.style.display = 'none';
			maxStock = selectedVariant?.soluong || 0;
		}

		const stockNote = $('#qamStockNote');
		stockNote.textContent = maxStock > 0 ? `Còn ${maxStock} sản phẩm` : (p.hasSize ? 'Vui lòng chọn size' : 'Hết hàng');

		const qtyInput = $('#qamQty');
		const currentQty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
		if (maxStock > 0) {
			qtyInput.max = String(maxStock);
			qtyInput.value = String(Math.min(currentQty, maxStock));
			qtyInput.disabled = false;
			$('#qamSubmit').disabled = false;
		} else {
			qtyInput.value = p.hasSize ? '1' : '0';
			qtyInput.disabled = !p.hasSize;
			$('#qamSubmit').disabled = true;
		}
	}

	async function openEditCartOptions(btn) {
		const productId = btn.getAttribute('data-product-id');
		const itemId = btn.getAttribute('data-item-id');
		if (!productId || !itemId) return;

		const m = ensureModal();
		if (!m) return;

		editingCartItemId = itemId;
		currentProductId = productId;
		currentIntent = 'edit';
		currentOptions = null;
		selectedVariantId = String(btn.getAttribute('data-variant-id') || 'main');
		selectedSize = String(btn.getAttribute('data-size') || '');
		maxStock = 0;

		$('#qamName').textContent = 'Đang tải...';
		$('#qamPrice').textContent = '';
		$('#qamVariants').innerHTML = '';
		$('#qamSizes').innerHTML = '';
		$('#qamSizeWrap').style.display = 'none';
		$('#qamStockNote').textContent = '';
		$('#qamSubmit').disabled = true;

		const qty = Math.max(1, parseInt(btn.getAttribute('data-qty') || '1', 10) || 1);
		$('#qamQty').value = String(qty);

		m.show();
		const { ok, data } = await apiFetch(`/products/${productId}/options`);
		if (!ok || !data || !data.success) {
			$('#qamName').textContent = 'Không tải được sản phẩm';
			return;
		}

		currentOptions = data;
		const variants = data.product?.variants || [];
		if (variants.length && !variants.find(v => String(v.id) === String(selectedVariantId))) {
			selectedVariantId = String(variants[0].id);
		}
		renderModalProduct();
	}

	async function openQuickModal(productId, intent) {
		const m = ensureModal();
		if (!m) return;
		currentProductId = productId;
		currentIntent = intent;
		editingCartItemId = null;
		currentOptions = null;
		selectedVariantId = 'main';
		selectedSize = '';
		maxStock = 0;

		$('#qamName').textContent = 'Đang tải...';
		$('#qamPrice').textContent = '';
		$('#qamVariants').innerHTML = '';
		$('#qamSizes').innerHTML = '';
		$('#qamSizeWrap').style.display = 'none';
		$('#qamStockNote').textContent = '';
		$('#qamSubmit').disabled = true;
		$('#qamQty').value = '1';

		m.show();

		const { ok, data } = await apiFetch(`/products/${productId}/options`);
		if (!ok || !data || !data.success) {
			$('#qamName').textContent = 'Không tải được sản phẩm';
			return;
		}

		currentOptions = data;
		if (data.product?.variants?.length) selectedVariantId = String(data.product.variants[0].id);
		renderModalProduct();
	}

	function initCartSubtotalBySelection() {
		const subtotalEl = document.getElementById('cartSubtotalValue');
		if (!subtotalEl) return;
		const checkboxes = Array.from(document.querySelectorAll('.cart-select'));
		if (!checkboxes.length) return;

		const compute = () => {
			let sum = 0;
			checkboxes.forEach((cb) => {
				if (!(cb instanceof HTMLInputElement)) return;
				const row = cb.closest('.border-bottom') || cb.closest('.d-flex');
				const qtyInput = row ? row.querySelector('input[name="soluong"]') : null;
				const qty = Math.max(1, parseInt(qtyInput && qtyInput.value ? qtyInput.value : '1', 10) || 1);
				const unitRaw = cb.getAttribute('data-unit-price') || '0';
				const unit = parseInt(unitRaw, 10) || 0;
				const lineTotal = unit * qty;
				const lineEl = row ? row.querySelector('.cart-line-total') : null;
				if (lineEl) lineEl.textContent = formatVND(lineTotal);

				if (!cb.checked) return;
				sum += lineTotal;
			});
			subtotalEl.textContent = formatVND(sum);
		};

		compute();
		checkboxes.forEach((cb) => cb.addEventListener('change', compute));
		// Recompute when quantity inputs change (even before submitting the form)
		document.querySelectorAll('input[name="soluong"]').forEach((inp) => {
			inp.addEventListener('input', compute);
			inp.addEventListener('change', compute);
		});

		// Expose compute for other initializers
		window.__cartComputeSubtotal = compute;
	}

	function initCartSelectionPersistence() {
		const key = 'cart:selectedIds:v1';
		const checkboxes = Array.from(document.querySelectorAll('.cart-select'));
		if (!checkboxes.length) return;

		let stored = null;
		try {
			stored = JSON.parse(localStorage.getItem(key) || 'null');
		} catch {
			stored = null;
		}

		if (Array.isArray(stored)) {
			const set = new Set(stored.map(String));
			checkboxes.forEach((cb) => {
				if (!(cb instanceof HTMLInputElement)) return;
				cb.checked = set.has(String(cb.value));
			});
		}

		const persist = () => {
			const ids = checkboxes
				.filter(cb => cb instanceof HTMLInputElement && cb.checked)
				.map(cb => String(cb.value));
			try {
				localStorage.setItem(key, JSON.stringify(ids));
			} catch {
				// ignore
			}
		};

		checkboxes.forEach((cb) => cb.addEventListener('change', persist));
		persist();
	}

	function initCartSelectAll() {
		const all = document.getElementById('cartSelectAll');
		if (!all) return;
		const checkboxes = Array.from(document.querySelectorAll('.cart-select'));
		if (!checkboxes.length) return;

		const syncAllState = () => {
			const checkedCount = checkboxes.filter(cb => cb instanceof HTMLInputElement && cb.checked).length;
			all.checked = checkedCount === checkboxes.length;
			all.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
		};

		all.addEventListener('change', () => {
			checkboxes.forEach((cb) => {
				if (!(cb instanceof HTMLInputElement)) return;
				cb.checked = all.checked;
			});
			checkboxes.forEach((cb) => cb.dispatchEvent(new Event('change')));
			if (typeof window.__cartComputeSubtotal === 'function') window.__cartComputeSubtotal();
		});

		checkboxes.forEach((cb) => cb.addEventListener('change', syncAllState));
		syncAllState();
	}

	function initCartAutoQtySync() {
		const qtyInputs = Array.from(document.querySelectorAll('input[name="soluong"][data-item-id]'));
		if (!qtyInputs.length) return;

		const timers = new Map();
		const pending = new Map();

		const sendUpdate = async (itemId, qty) => {
			pending.set(itemId, qty);
			const { ok } = await apiFetch('/cart/update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ itemId, soluong: qty }),
				keepalive: true
			});
			pending.delete(itemId);
			return ok;
		};

		const schedule = (itemId, qty) => {
			if (timers.has(itemId)) clearTimeout(timers.get(itemId));
			timers.set(itemId, setTimeout(() => {
				timers.delete(itemId);
				sendUpdate(itemId, qty);
			}, 400));
		};

		qtyInputs.forEach((inp) => {
			if (!(inp instanceof HTMLInputElement)) return;
			inp.addEventListener('input', () => {
				const itemId = String(inp.getAttribute('data-item-id') || '');
				const qty = Math.max(1, parseInt(inp.value || '1', 10) || 1);
				inp.value = String(qty);
				if (!itemId) return;
				schedule(itemId, qty);
			});
			inp.addEventListener('change', () => {
				const itemId = String(inp.getAttribute('data-item-id') || '');
				const qty = Math.max(1, parseInt(inp.value || '1', 10) || 1);
				inp.value = String(qty);
				if (!itemId) return;
				schedule(itemId, qty);
			});
		});

		// Flush pending updates before navigating to checkout
		const checkoutForm = document.getElementById('cartCheckoutForm');
		if (checkoutForm) {
			checkoutForm.addEventListener('submit', async (ev) => {
				ev.preventDefault();

				const selected = Array.from(document.querySelectorAll('.cart-select:checked'))
					.filter(i => i instanceof HTMLInputElement)
					.map(i => String(i.value));
				if (!selected.length) {
					alert('Vui lòng chọn sản phẩm để thanh toán');
					return;
				}

				// Force immediate update for selected lines using latest qty input
				const tasks = selected.map((id) => {
					// ObjectId is safe for attribute selector; avoid CSS.escape for compatibility
					const input = document.querySelector(`input[name="soluong"][data-item-id="${id}"]`);
					const qty = Math.max(1, parseInt(input && input.value ? input.value : '1', 10) || 1);
					return sendUpdate(id, qty);
				});
				try {
					await Promise.race([
						Promise.all(tasks),
						new Promise(resolve => setTimeout(resolve, 700))
					]);
				} catch {
					// ignore
				}

				const url = new URL(checkoutForm.action || '/cart/checkout', window.location.origin);
				url.search = '';
				selected.forEach((id) => url.searchParams.append('itemIds', id));
				window.location.href = url.toString();
			});
		}
	}

	function initCheckoutAddressSelect() {
		const select = document.getElementById('checkoutAddressSelect');
		if (!select) return;

		const inputName = document.querySelector('input[name="tennguoinhan"]');
		const inputPhone = document.querySelector('input[name="sodienthoai"]');
		const inputAddress = document.querySelector('input[name="diachigiao"]');
		const inputLabel = document.querySelector('input[name="addressLabel"]');
		const saveWrap = document.getElementById('saveAddressWrap');
		const saveCb = document.getElementById('saveAddress');
		const labelWrap = document.getElementById('addressLabelWrap');

		const draftNew = {
			ten: '',
			phone: '',
			addr: '',
			label: ''
		};

		const captureDraftIfNew = () => {
			const v = String(select.value || '');
			if (v !== 'new' && v !== '') return;
			draftNew.ten = inputName ? inputName.value : '';
			draftNew.phone = inputPhone ? inputPhone.value : '';
			draftNew.addr = inputAddress ? inputAddress.value : '';
			draftNew.label = inputLabel ? inputLabel.value : '';
		};

		const apply = () => {
			const v = String(select.value || '');
			const isNew = v === 'new' || v === '';

			if (labelWrap) labelWrap.style.display = isNew ? '' : 'none';
			if (saveWrap) saveWrap.style.display = isNew ? '' : 'none';
			if (!isNew && saveCb) saveCb.checked = false;
			if (inputLabel) inputLabel.readOnly = false;

			if (isNew) {
				if (inputName) inputName.value = draftNew.ten;
				if (inputPhone) inputPhone.value = draftNew.phone;
				if (inputAddress) inputAddress.value = draftNew.addr;
				if (inputLabel) inputLabel.value = draftNew.label;
				return;
			}

			const opt = select.options[select.selectedIndex];
			if (!opt) return;
			const ten = opt.getAttribute('data-ten') || '';
			const phone = opt.getAttribute('data-phone') || '';
			const addr = opt.getAttribute('data-address') || '';
			if (inputName) inputName.value = ten;
			if (inputPhone) inputPhone.value = phone;
			if (inputAddress) inputAddress.value = addr;
			if (inputLabel) inputLabel.value = '';
		};

		select.addEventListener('change', () => {
			captureDraftIfNew();
			apply();
		});
		apply();
	}

	async function submitQuickModal() {
		if (!currentOptions || !currentProductId) return;
		const p = currentOptions.product;

		if (p.hasSize && !selectedSize) {
			alert('Vui lòng chọn size');
			return;
		}

		const qty = Math.max(1, parseInt($('#qamQty').value, 10) || 1);
		const body = {
			sanpham_id: currentProductId,
			bienthe_id: selectedVariantId === 'main' ? null : selectedVariantId,
			kichco: p.hasSize ? selectedSize : null,
			soluong: qty
		};

		const endpoint = currentIntent === 'buy' ? '/cart/buy-now' : (currentIntent === 'edit' ? '/cart/update-options' : '/cart/add');
		const payload = currentIntent === 'edit'
			? { ...body, itemId: editingCartItemId }
			: body;

		const { ok, data } = await apiFetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!ok || !data || !data.success) {
			alert((data && data.message) ? data.message : 'Có lỗi xảy ra');
			return;
		}

		if (typeof data.cartCount === 'number') setCartBadge(data.cartCount);

		if (currentIntent === 'buy' && data.redirect) {
			window.location.href = data.redirect;
			return;
		}

		// Editing cart options: refresh page to show new image/size/color
		if (currentIntent === 'edit') {
			window.location.reload();
			return;
		}

		if (modal) modal.hide();
	}

	function getProductIdFromEventTarget(target) {
		const card = target.closest('[data-product-id]');
		if (card) return card.getAttribute('data-product-id');
		const direct = target.getAttribute && target.getAttribute('data-product-id');
		return direct || null;
	}

	// ===== Wire modal buttons =====
	document.addEventListener('DOMContentLoaded', () => {
		// Qty buttons
		const minus = $('#qamQtyMinus');
		const plus = $('#qamQtyPlus');
		const qty = $('#qamQty');
		const submit = $('#qamSubmit');
		if (minus && plus && qty) {
			minus.addEventListener('click', () => {
				const v = Math.max(1, (parseInt(qty.value, 10) || 1) - 1);
				qty.value = String(v);
			});
			plus.addEventListener('click', () => {
				const cur = Math.max(1, parseInt(qty.value, 10) || 1);
				const next = maxStock > 0 ? Math.min(maxStock, cur + 1) : (cur + 1);
				qty.value = String(next);
			});
			qty.addEventListener('input', () => {
				const cur = Math.max(1, parseInt(qty.value, 10) || 1);
				qty.value = String(maxStock > 0 ? Math.min(maxStock, cur) : cur);
			});
		}
		if (submit) submit.addEventListener('click', submitQuickModal);

		hydrateFavoriteHearts();

		initCartSubtotalBySelection();
		initCartSelectionPersistence();
		initCartSelectAll();
		initCartAutoQtySync();
		initCheckoutAddressSelect();
	});

	// ===== Global delegated clicks =====
	document.addEventListener('click', (e) => {
		const target = e.target;
		if (!(target instanceof Element)) return;

		const wishlistBtn = target.closest('.btn-wishlist, .btn-wishlist-float, .wishlist-btn');
		if (wishlistBtn) {
			e.preventDefault();
			e.stopPropagation();
			const productId = wishlistBtn.getAttribute('data-product-id') || getProductIdFromEventTarget(wishlistBtn);
			if (!productId) return;
			toggleFavorite(productId, wishlistBtn);
			return;
		}

		const removeFavoriteBtn = target.closest('.btn-remove-favorite');
		if (removeFavoriteBtn) {
			e.preventDefault();
			const productId = removeFavoriteBtn.getAttribute('data-id');
			if (!productId) return;
			apiFetch(`/favorites/remove/${productId}`, { method: 'POST' }).then(({ ok }) => {
				if (!ok) return;
				const cardCol = removeFavoriteBtn.closest('.col-6, .col-md-4, .col-lg-3');
				if (cardCol) cardCol.remove();
			});
			return;
		}

		const addBtn = target.closest('.btn-add-cart');
		if (addBtn) {
			e.preventDefault();
			e.stopPropagation();
			const productId = getProductIdFromEventTarget(addBtn);
			if (productId) openQuickModal(productId, 'add');
			return;
		}

		const buyBtn = target.closest('.btn-buy-now');
		if (buyBtn) {
			e.preventDefault();
			e.stopPropagation();
			const productId = getProductIdFromEventTarget(buyBtn);
			if (productId) openQuickModal(productId, 'buy');
			return;
		}
	});

	// Cart edit options button
	document.addEventListener('click', (e) => {
		const target = e.target;
		if (!(target instanceof Element)) return;
		const editBtn = target.closest('[data-action="edit-options"]');
		if (!editBtn) return;
		e.preventDefault();
		openEditCartOptions(editBtn);
	});

	// ===== Compatibility with existing inline handlers (products page) =====
	window.handleAddCartClick = (event) => {
		const el = event && event.currentTarget ? event.currentTarget : null;
		const productId = el ? getProductIdFromEventTarget(el) : null;
		if (productId) openQuickModal(productId, 'add');
	};

	window.handleWishlistClick = (event) => {
		const el = event && event.currentTarget ? event.currentTarget : null;
		const productId = el ? getProductIdFromEventTarget(el) : null;
		if (!productId) return;
		toggleFavorite(productId, el);
	};
})();
