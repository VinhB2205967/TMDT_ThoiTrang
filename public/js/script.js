(() => {
	const App = window.App || {};
	const $ = App.qs || ((selector, root = document) => root.querySelector(selector));
	const goiApi = App.apiFetch || (async (url, options = {}, cfg = {}) => {
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
	const datHuyHieuGio = App.setCartBadge || ((count) => {
		const badge = $('.cart-badge');
		if (!badge) return;
		badge.textContent = String(count ?? 0);
	});
	let nutThemGioGanNhat = null;

	// ===== Fixed header: auto offset =====
	function capNhatKhoangCachHeader() {
		const header = document.querySelector('header.header');
		if (!header) return;
		const h = Math.ceil(header.getBoundingClientRect().height || 0);
		if (!h) return;
		document.documentElement.style.setProperty('--header-offset', `${h}px`);
		document.documentElement.style.setProperty('--header-offset-mobile', `${h}px`);
	}

	function ganSuKienCapNhatHeaderOffset() {
		let raf = 0;
		const schedule = () => {
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				raf = 0;
				capNhatKhoangCachHeader();
			});
		};

		// Lần đầu
		schedule();
		window.addEventListener('resize', schedule, { passive: true });
		window.addEventListener('orientationchange', schedule, { passive: true });
		window.addEventListener('load', schedule, { passive: true });
	}

	ganSuKienCapNhatHeaderOffset();

	function timAnhSanPhamTuNut(btn) {
		if (!btn || !(btn instanceof Element)) return document.getElementById('mainImage');
		const card = btn.closest('.product-card, [data-product-id]');
		if (card) {
			return card.querySelector('.product-image img, img');
		}
		return document.getElementById('mainImage');
	}

	// ===== Favorites =====
	async function taiTrangYeuThich() {
		const cards = document.querySelectorAll('[data-product-id]');
		if (!cards.length) return;

		const { ok, data } = await goiApi('/api/favorites/ids', {}, { redirectOn401: false });
		if (!ok || !data || !Array.isArray(data.ids)) return;

		const set = new Set(data.ids);
		if (App.setFavoriteBadge) App.setFavoriteBadge(set.size);
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

	async function doiYeuThich(productId, btn) {
	const { ok, data } = await goiApi(`/api/favorites/toggle/${productId}`, { method: 'POST' });
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

		if (App.setFavoriteBadge) {
			const current = parseInt((App.qs && App.qs('.favorite-badge') ? App.qs('.favorite-badge').textContent : '0'), 10) || 0;
			const next = active ? current + 1 : Math.max(0, current - 1);
			App.setFavoriteBadge(next);
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
	let hopThoai;
	let phanTuHopThoai;
	let maSanPhamHienTai = null;
	let mucDichHienTai = 'add'; // add | buy
	let tuyChonHienTai = null;
	let idBienTheDaChon = 'main';
	let sizeDaChon = '';
	let tonToiDa = 0;
	let idMucGioDangSua = null;

	function damBaoHopThoai() {
		phanTuHopThoai = $('#quickAddModal');
		if (!phanTuHopThoai) return null;
		// eslint-disable-next-line no-undef
		hopThoai = bootstrap.Modal.getOrCreateInstance(phanTuHopThoai);
		return hopThoai;
	}

	function dinhDangVND(n) {
		if (App.formatVND) return App.formatVND(n).replace(/đ$/, '₫');
		try {
			return (n || 0).toLocaleString('vi-VN') + '₫';
		} catch {
			return String(n || 0) + '₫';
		}
	}

	function hienThiSanPhamModal() {
		if (!tuyChonHienTai) return;
		const p = tuyChonHienTai.product;

		const tinhTonBienThe = (variant) => {
			if (!variant) return 0;
			if (!p.hasSize) return Number(variant.soluong || 0);
			const sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
			return sizes.reduce((sum, s) => sum + Number(s?.soluong || 0), 0);
		};

		const variants = Array.isArray(p.variants) ? p.variants : [];
		let selectedVariant = variants.find(v => String(v.id) === String(idBienTheDaChon));
		if (!selectedVariant && variants.length) {
			selectedVariant = variants[0];
			idBienTheDaChon = String(selectedVariant.id);
		}

		$('#qamName').textContent = p.tensanpham || '—';
		$('#qamImage').src = (selectedVariant?.hinhanh || p.hinhanh || '/images/shopping.png');
		$('#qamPrice').textContent = dinhDangVND((selectedVariant?.giamoi ?? selectedVariant?.gia) ?? (p.giamoi ?? p.gia ?? 0));

		const variantsWrap = $('#qamVariants');
		variantsWrap.innerHTML = '';

		variants.forEach((v) => {
			const tonBienThe = tinhTonBienThe(v);
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'btn btn-sm ' + (String(v.id) === String(idBienTheDaChon) ? 'btn-primary' : 'btn-outline-primary');
			btn.textContent = `${v.mausac || 'Màu'}${tonBienThe > 0 ? '' : ' (Hết hàng)'}`;
			btn.dataset.variantId = String(v.id);
			btn.addEventListener('click', () => {
				idBienTheDaChon = String(v.id);
				sizeDaChon = '';
				hienThiSanPhamModal();
			});
			variantsWrap.appendChild(btn);
		});

		selectedVariant = variants.find(v => String(v.id) === String(idBienTheDaChon)) || variants[0];

		const sizeWrap = $('#qamSizeWrap');
		const sizesEl = $('#qamSizes');
		sizesEl.innerHTML = '';

		if (p.hasSize) {
			sizeWrap.style.display = '';
			const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
			const sizes = Array.isArray(selectedVariant?.sizes) ? selectedVariant.sizes : [];
			const bySize = new Map(sizes.map(s => [String(s.size), s]));
			const tongTonBienThe = tinhTonBienThe(selectedVariant);

			sizeOrder.forEach((sz) => {
				if (!bySize.has(sz)) return;
				const row = bySize.get(sz);
				const stock = row?.soluong || 0;
				const b = document.createElement('button');
				b.type = 'button';
				const active = sizeDaChon === sz;
				b.className = 'btn btn-sm ' + (active ? 'btn-dark' : 'btn-outline-dark');
				b.textContent = `${sz}${stock > 0 ? '' : ' (Hết hàng)'}`;
				b.disabled = stock <= 0;
				b.addEventListener('click', () => {
					sizeDaChon = sz;
					hienThiSanPhamModal();
				});
				sizesEl.appendChild(b);
			});

			if (sizeDaChon) {
				const stock = bySize.get(sizeDaChon)?.soluong || 0;
				tonToiDa = stock;
			} else {
				tonToiDa = 0;
			}

			const stockNote = $('#qamStockNote');
			if (tonToiDa > 0) {
				stockNote.textContent = `Còn ${tonToiDa} sản phẩm`;
			} else if (tongTonBienThe <= 0) {
				stockNote.textContent = 'Hết hàng';
			} else {
				stockNote.textContent = 'Vui lòng chọn size';
			}
		} else {
			sizeWrap.style.display = 'none';
			tonToiDa = selectedVariant?.soluong || 0;
			const stockNote = $('#qamStockNote');
			stockNote.textContent = tonToiDa > 0 ? `Còn ${tonToiDa} sản phẩm` : 'Hết hàng';
		}

		const qtyInput = $('#qamQty');
		const currentQty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
		if (tonToiDa > 0) {
			qtyInput.max = String(tonToiDa);
			qtyInput.value = String(Math.min(currentQty, tonToiDa));
			qtyInput.disabled = false;
			$('#qamSubmit').disabled = false;
		} else {
			qtyInput.value = '1';
			qtyInput.disabled = true;
			$('#qamSubmit').disabled = true;
		}
	}

	async function moSuaTuyChonGio(btn) {
		const productId = btn.getAttribute('data-product-id');
		const itemId = btn.getAttribute('data-item-id');
		if (!productId || !itemId) return;

		const m = damBaoHopThoai();
		if (!m) return;

		idMucGioDangSua = itemId;
		maSanPhamHienTai = productId;
		mucDichHienTai = 'edit';
		tuyChonHienTai = null;
		idBienTheDaChon = String(btn.getAttribute('data-variant-id') || 'main');
		sizeDaChon = String(btn.getAttribute('data-size') || '');
		tonToiDa = 0;

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
		const { ok, data } = await goiApi(`/api/products/${productId}/options`);
		if (!ok || !data || !data.success) {
			$('#qamName').textContent = 'Không tải được sản phẩm';
			return;
		}

		tuyChonHienTai = data;
		const variants = data.product?.variants || [];
		if (variants.length && !variants.find(v => String(v.id) === String(idBienTheDaChon))) {
			idBienTheDaChon = String(variants[0].id);
		}
		hienThiSanPhamModal();
	}

	async function moModalNhanh(productId, intent) {
		const m = damBaoHopThoai();
		if (!m) return;
		maSanPhamHienTai = productId;
		mucDichHienTai = intent;
		idMucGioDangSua = null;
		tuyChonHienTai = null;
		idBienTheDaChon = 'main';
		sizeDaChon = '';
		tonToiDa = 0;

		$('#qamName').textContent = 'Đang tải...';
		$('#qamPrice').textContent = '';
		$('#qamVariants').innerHTML = '';
		$('#qamSizes').innerHTML = '';
		$('#qamSizeWrap').style.display = 'none';
		$('#qamStockNote').textContent = '';
		$('#qamSubmit').disabled = true;
		$('#qamQty').value = '1';

		m.show();

		const { ok, data } = await goiApi(`/api/products/${productId}/options`);
		if (!ok || !data || !data.success) {
			$('#qamName').textContent = 'Không tải được sản phẩm';
			return;
		}

		tuyChonHienTai = data;
		if (data.product?.variants?.length) idBienTheDaChon = String(data.product.variants[0].id);
		hienThiSanPhamModal();
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
				const baseLineRaw = cb.getAttribute('data-line-total') || '';
				const baseLine = Math.max(0, parseFloat(baseLineRaw) || 0);
				const lineTotal = Math.round(baseLine);
				const lineEl = row ? row.querySelector('.cart-line-total') : null;
				if (lineEl) lineEl.textContent = dinhDangVND(lineTotal);

				if (!cb.checked) return;
				sum += lineTotal;
			});
			subtotalEl.textContent = dinhDangVND(sum);
		};

		compute();
		checkboxes.forEach((cb) => cb.addEventListener('change', compute));

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
			// If a subtotal calculator was registered, recompute after restoring selection
			if (typeof window.__cartComputeSubtotal === 'function') window.__cartComputeSubtotal();
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

		const sendUpdate = async (itemId, qty, inputEl) => {
			pending.set(itemId, qty);
			const { ok, data } = await goiApi('/api/cart/update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ itemId, soluong: qty }),
				keepalive: true
			});
			pending.delete(itemId);
			if (ok && data && inputEl instanceof HTMLInputElement) {
				if (typeof data.maxStock === 'number' && data.maxStock > 0) {
					inputEl.max = String(data.maxStock);
					inputEl.dataset.max = String(data.maxStock);
				}
				if (typeof data.quantity === 'number') {
					inputEl.value = String(Math.max(1, data.quantity));
				}

				const checkbox = document.querySelector(`.cart-select[value="${itemId}"]`);
				if (checkbox instanceof HTMLInputElement) {
					if (typeof data.lineTotal === 'number' && Number.isFinite(data.lineTotal)) {
						checkbox.setAttribute('data-line-total', String(Math.max(0, data.lineTotal)));
					}
					if (typeof data.quantity === 'number' && Number.isFinite(data.quantity)) {
						checkbox.setAttribute('data-base-qty', String(Math.max(1, data.quantity)));
					}
					if (typeof data.unitPrice === 'number' && Number.isFinite(data.unitPrice)) {
						checkbox.setAttribute('data-unit-price', String(Math.max(0, data.unitPrice)));
					}
				}

				const row = inputEl.closest('.border-bottom') || inputEl.closest('.d-flex');
				const lineEl = row ? row.querySelector('.cart-line-total') : null;
				if (lineEl && typeof data.lineTotal === 'number' && Number.isFinite(data.lineTotal)) {
					lineEl.textContent = dinhDangVND(Math.max(0, data.lineTotal));
				}

				if (typeof window.__cartComputeSubtotal === 'function') {
					window.__cartComputeSubtotal();
				}
			}
			return ok;
		};

		const schedule = (itemId, qty, inputEl) => {
			if (timers.has(itemId)) clearTimeout(timers.get(itemId));
			timers.set(itemId, setTimeout(() => {
				timers.delete(itemId);
				sendUpdate(itemId, qty, inputEl);
			}, 400));
		};

		const clampQty = (inputEl, qty) => {
			const maxRaw = inputEl.getAttribute('data-max') || inputEl.getAttribute('max') || '';
			const max = parseInt(maxRaw, 10);
			if (Number.isFinite(max) && max > 0) return Math.min(qty, max);
			return qty;
		};

		qtyInputs.forEach((inp) => {
			if (!(inp instanceof HTMLInputElement)) return;
			inp.addEventListener('input', () => {
				const itemId = String(inp.getAttribute('data-item-id') || '');
				let qty = Math.max(1, parseInt(inp.value || '1', 10) || 1);
				qty = clampQty(inp, qty);
				inp.value = String(qty);
				if (!itemId) return;
				schedule(itemId, qty, inp);
			});
			inp.addEventListener('change', () => {
				const itemId = String(inp.getAttribute('data-item-id') || '');
				let qty = Math.max(1, parseInt(inp.value || '1', 10) || 1);
				qty = clampQty(inp, qty);
				inp.value = String(qty);
				if (!itemId) return;
				schedule(itemId, qty, inp);
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
					let qty = Math.max(1, parseInt(input && input.value ? input.value : '1', 10) || 1);
					if (input instanceof HTMLInputElement) {
						const maxRaw = input.getAttribute('data-max') || input.getAttribute('max') || '';
						const max = parseInt(maxRaw, 10);
						if (Number.isFinite(max) && max > 0) qty = Math.min(qty, max);
						input.value = String(qty);
					}
					return sendUpdate(id, qty, input);
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

	async function guiModalNhanh() {
		if (!tuyChonHienTai || !maSanPhamHienTai) return;
		const p = tuyChonHienTai.product;

		if (p.hasSize && !sizeDaChon) {
			alert('Vui lòng chọn size');
			return;
		}

		const qty = Math.max(1, parseInt($('#qamQty').value, 10) || 1);
		const body = {
			sanpham_id: maSanPhamHienTai,
			bienthe_id: idBienTheDaChon === 'main' ? null : idBienTheDaChon,
			kichco: p.hasSize ? sizeDaChon : null,
			soluong: qty
		};

		const endpoint = mucDichHienTai === 'buy' ? '/api/cart/buy-now' : (mucDichHienTai === 'edit' ? '/api/cart/update-options' : '/api/cart/add');
		const payload = mucDichHienTai === 'edit'
			? { ...body, itemId: idMucGioDangSua }
			: body;

		const { ok, data } = await goiApi(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!ok || !data || !data.success) {
			alert((data && data.message) ? data.message : 'Có lỗi xảy ra');
			return;
		}

		if (typeof data.cartCount === 'number') datHuyHieuGio(data.cartCount);
		if (mucDichHienTai === 'add') {
			if (App.flyToCart) {
				const img = timAnhSanPhamTuNut(nutThemGioGanNhat || $('#qamSubmit'));
				if (img) App.flyToCart(img);
			}
		}

		if (mucDichHienTai === 'buy' && data.redirect) {
			window.location.href = data.redirect;
			return;
		}

		// Editing cart options: refresh page to show new image/size/color
		if (mucDichHienTai === 'edit') {
			window.location.reload();
			return;
		}

		if (hopThoai) hopThoai.hide();
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
				const next = tonToiDa > 0 ? Math.min(tonToiDa, cur + 1) : (cur + 1);
				qty.value = String(next);
			});
			qty.addEventListener('input', () => {
				const cur = Math.max(1, parseInt(qty.value, 10) || 1);
				qty.value = String(tonToiDa > 0 ? Math.min(tonToiDa, cur) : cur);
			});
		}
		if (submit) submit.addEventListener('click', guiModalNhanh);

		taiTrangYeuThich();

		// Apply persisted selection before any subtotal computation
		initCartSelectionPersistence();
		initCartSubtotalBySelection();
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
			doiYeuThich(productId, wishlistBtn);
			return;
		}

		const removeFavoriteBtn = target.closest('.btn-remove-favorite');
		if (removeFavoriteBtn) {
			e.preventDefault();
			const productId = removeFavoriteBtn.getAttribute('data-id');
			if (!productId) return;
			goiApi(`/api/favorites/remove/${productId}`, { method: 'POST' }).then(({ ok }) => {
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
			nutThemGioGanNhat = addBtn;
			const productId = getProductIdFromEventTarget(addBtn);
			if (productId) moModalNhanh(productId, 'add');
			return;
		}

		const buyBtn = target.closest('.btn-buy-now');
		if (buyBtn) {
			e.preventDefault();
			e.stopPropagation();
			const productId = getProductIdFromEventTarget(buyBtn);
			if (productId) moModalNhanh(productId, 'buy');
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
		moSuaTuyChonGio(editBtn);
	});

	// ===== Compatibility with existing inline handlers (products page) =====
		window.xuLyThemGio = (event) => {
		const el = event && event.currentTarget ? event.currentTarget : null;
		nutThemGioGanNhat = el;
		const productId = el ? getProductIdFromEventTarget(el) : null;
			if (productId) moModalNhanh(productId, 'add');
	};

		window.xuLyYeuThich = (event) => {
		const el = event && event.currentTarget ? event.currentTarget : null;
		const productId = el ? getProductIdFromEventTarget(el) : null;
		if (!productId) return;
			doiYeuThich(productId, el);
	};
})();
