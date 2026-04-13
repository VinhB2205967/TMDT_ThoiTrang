(() => {
	const toggleBtn = document.getElementById('aiChatToggle');
	const panel = document.getElementById('aiChatPanel');
	const closeBtn = document.getElementById('aiChatClose');
	const clearBtn = document.getElementById('aiChatClear');
	const expandBtn = document.getElementById('aiChatExpand');
	const form = document.getElementById('aiChatForm');
	const input = document.getElementById('aiChatInput');
	const list = document.getElementById('aiChatList');
	const sendBtn = document.getElementById('aiChatSend');
	const statusEl = document.getElementById('aiChatStatus');
	const providerEl = document.getElementById('aiChatProvider');
	const modelRowEl = document.getElementById('aiChatModelRow');
	const modelEl = document.getElementById('aiChatModel');
	const imageInputEl = document.getElementById('aiChatImage');
	const imageBtnEl = document.getElementById('aiChatImageBtn');
	const imagePreviewEl = document.getElementById('aiChatImagePreview');
	const imagePreviewImgEl = document.getElementById('aiChatImagePreviewImage');
	const imageRemoveBtnEl = document.getElementById('aiChatImageRemove');
	if (!toggleBtn || !panel || !form || !input || !list || !sendBtn || !statusEl) return;

	const runtime = window.AIChatRuntime || {};
	const storageScope = runtime && runtime.isAuthenticated && runtime.userId
		? `user:${String(runtime.userId)}`
		: 'guest';
	const currentProductId = runtime && runtime.currentProduct && runtime.currentProduct.id
		? String(runtime.currentProduct.id).trim()
		: '';
	const pageScope = currentProductId ? `product:${currentProductId}` : 'global';
	const LEGACY_STORAGE_KEY = 'fashion_ai_chat_history_v1';
	const LEGACY_SCOPED_STORAGE_KEY = `${LEGACY_STORAGE_KEY}:${storageScope}`;
	const STORAGE_KEY = `fashion_ai_chat_history_v2:${storageScope}:${pageScope}`;
	const GLOBAL_STORAGE_KEY = `fashion_ai_chat_history_v2:${storageScope}:global`;
	const PROVIDER_STORAGE_KEY = 'fashion_ai_provider_v1';
	const MODEL_STORAGE_KEY = 'fashion_ai_gemini_model_v1';
	const EXPANDED_STORAGE_KEY = 'fashion_ai_chat_expanded_v1';
	const DEFAULT_PROVIDER = 'gemini';
	const ALLOWED_GEMINI_MODELS = new Set(['gemma-3-27b-it', 'gemini-2.0-flash']);
	const DEFAULT_GEMINI_MODEL = 'gemma-3-27b-it';
	const ALLOWED_PRODUCT_QUERY_KEYS = new Set([
		'loaisanpham',
		'gioitinh',
		'brand',
		'occasion',
		'agegroup',
		'pricemin',
		'pricemax',
		'sort',
		'keyword'
	]);
	const DEFAULT_SUGGEST_LIMIT = 6;
	const IMAGE_SEARCH_SUGGEST_LIMIT = Math.max(
		1,
		Number(runtime.openClipUiMaxResults || window.OPENCLIP_UI_MAX_RESULTS || 48)
	);
	const history = [];
	let pendingImageFile = null;
	let pendingImagePreviewUrl = '';
	const submittedImagePreviewUrls = [];

	function clearScopedHistoryStorage() {
		try {
			localStorage.removeItem(STORAGE_KEY);
			localStorage.removeItem(GLOBAL_STORAGE_KEY);
			localStorage.removeItem(LEGACY_STORAGE_KEY);
			localStorage.removeItem(LEGACY_SCOPED_STORAGE_KEY);
		} catch {
			// Ignore storage errors in private mode.
		}
	}

	function setExpanded(expanded) {
		panel.classList.toggle('expanded', Boolean(expanded));
		if (!expandBtn) return;
		expandBtn.innerHTML = expanded
			? '<i class="bi bi-arrows-angle-contract"></i>'
			: '<i class="bi bi-arrows-angle-expand"></i>';
		expandBtn.setAttribute('title', expanded ? 'Thu nhỏ chat' : 'Phóng to chat');
		expandBtn.setAttribute('aria-label', expanded ? 'Thu nhỏ chat' : 'Phóng to chat');
	}

	function getProviderValue() {
		return providerEl ? String(providerEl.value || DEFAULT_PROVIDER).toLowerCase() : DEFAULT_PROVIDER;
	}

	function normalizeProviderValue(value) {
		return String(value || '').toLowerCase() === 'gemini' ? 'gemini' : DEFAULT_PROVIDER;
	}

	function getProviderDisplayName(provider) {
		switch (String(provider || '').toLowerCase()) {
			case 'gemini':
				return 'Gemini';
			case 'openrouter':
				return 'OpenRouter';
			case 'openclip':
				return 'OpenCLIP';
			case 'system':
				return 'He thong';
			default:
				return 'Ollama';
		}
	}

	function getProviderReadyText(provider) {
		switch (String(provider || '').toLowerCase()) {
			case 'gemini':
				return 'Da chuyen sang Gemini. Ban co the chon model ben duoi.';
			case 'openrouter':
				return 'Da chuyen sang OpenRouter. Model dang dung cau hinh co dinh cua he thong.';
			default:
				return 'Da chuyen sang Ollama. Model dang dung cau hinh co dinh cua he thong.';
		}
	}

	function normalizeGeminiModel(value) {
		const model = String(value || '').trim();
		if (ALLOWED_GEMINI_MODELS.has(model)) return model;
		return DEFAULT_GEMINI_MODEL;
	}

	function buildResponseStatus(ai) {
		const providerName = getProviderDisplayName(ai && ai.provider);
		const modelName = String(ai && ai.model ? ai.model : '').trim();
		return modelName ? `${providerName} - ${modelName}` : `Hoan tat (${providerName})`;
	}

	function syncModelVisibility() {
		if (!modelRowEl || !providerEl) return;
		const shouldShow = getProviderValue() === 'gemini';
		modelRowEl.style.display = shouldShow ? '' : 'none';
	}
	function mapOpenClipProducts(products) {
		return Array.isArray(products)
			? products.map((item) => {
				const finalPrice = Number(item.giaSauGiam || item.gia || 0);
				const originalPrice = Number(item.gia || 0);
				const hasDiscount = originalPrice > 0 && finalPrice > 0 && finalPrice < originalPrice;
				return {
					id: String(item.id || ''),
					name: String(item.tensanpham || 'Sản phẩm'),
					url: String(item.url || ''),
					imageUrl: String(item.imageUrl || '/images/shopping.png'),
					price: finalPrice,
					originalPrice,
					hasDiscount,
					priceText: finalPrice > 0 ? `${finalPrice.toLocaleString('vi-VN')}đ` : '',
					originalPriceText: hasDiscount ? `${originalPrice.toLocaleString('vi-VN')}đ` : ''
				};
			})
			: [];
	}

	function buildOpenClipImageAnswer(products) {
		const count = Array.isArray(products) ? products.length : 0;
		if (count === 0) return 'Mình chưa tìm thấy sản phẩm phù hợp từ ảnh này.';
		return `Tìm thấy ${count} sản phẩm tương tự từ ảnh:`;
	}

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function normalizeInternalUrl(url) {
		const cleaned = sanitizeLinkCandidate(url);
		if (!cleaned) return '';

		const normalizePathOnly = (pathValue, searchParams) => {
			const decodedPath = String(pathValue || '')
				.replace(/\\/g, '/')
				.replace(/\/{2,}/g, '/')
				.trim();
			const lower = decodedPath
				.toLowerCase()
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '');

			const idMatch = decodedPath.match(/([a-f0-9]{24})/i);
			if (idMatch && /\/(?:san[-_\s]*pham|products?)\b/i.test(lower)) {
				return `/products/${idMatch[1]}`;
			}

			if (/^\/products\/[a-f0-9]{24}$/i.test(decodedPath)) {
				return decodedPath;
			}

			if (
				/^\/products$/i.test(decodedPath)
				|| /\/san[-_\s]*pham$/i.test(lower)
				|| /\/products?$/i.test(lower)
			) {
				const params = new URLSearchParams();
				if (searchParams && typeof searchParams.forEach === 'function') {
					searchParams.forEach((value, key) => {
						const normalizedKey = String(key || '').trim().toLowerCase();
						if (!ALLOWED_PRODUCT_QUERY_KEYS.has(normalizedKey)) return;
						params.set(normalizedKey === 'agegroup' ? 'ageGroup' : key, String(value || '').trim());
					});
				}
				const query = params.toString();
				return query ? `/products?${query}` : '/products';
			}

			if (/^\/orders$/i.test(decodedPath) || /\/don[-_\s]*hang$/i.test(lower)) return '/orders';
			if (/^\/vouchers?$/i.test(decodedPath) || /voucher/.test(lower)) return '/vouchers';
			if (/^\/size-guide$/i.test(decodedPath) || /bang\s*size|size[-_\s]*guide/.test(lower)) return '/size-guide';
			if (/^\/cart$/i.test(decodedPath) || /gio\s*hang/.test(lower)) return '/cart';
			if (/^\/lookbooks?$/i.test(decodedPath) || /\/lookbooks?$/.test(lower) || /lookbook/.test(lower)) return '/lookbook';
			if (/^\/lookbooks?\/[a-z0-9-]+$/i.test(decodedPath)) return decodedPath.replace(/^\/lookbooks\//i, '/lookbook/');
			if (/^\/brands?$/i.test(decodedPath) || /\/brands?$/.test(lower) || /thuong\s*hieu|brand/.test(lower)) return '/brands';
			if (/^\/brands?\/[a-z0-9-]+$/i.test(decodedPath)) return decodedPath;
			if (/^\/blog$/i.test(decodedPath) || /\/blog$/.test(lower) || /bai\s*viet|tin\s*tuc/.test(lower)) return '/blog';
			if (/^\/blog\/[a-z0-9-]+$/i.test(decodedPath)) return decodedPath;
			return '';
		};

		try {
			const parsed = new URL(cleaned, window.location.origin);
			return normalizePathOnly(parsed.pathname, parsed.searchParams);
		} catch {
			return normalizePathOnly(cleaned, null);
		}
	}

	function isSafeUrl(url) {
		return Boolean(normalizeInternalUrl(url));
	}

	function isImageUrl(url) {
		const clean = String(url || '').split('?')[0].toLowerCase();
		return /\.(png|jpe?g|gif|webp|avif|svg)$/.test(clean);
	}

	function sanitizeLinkCandidate(value) {
		let url = String(value || '').trim();
		if (!url) return '';

		// Remove wrapping quotes/backticks and leaked HTML attributes.
		url = url.replace(/^['"`(]+|['"`)]+$/g, '');
		url = url.split(/\s+(?:target|rel|class|id|style)\s*=|\s+on\w+\s*=|\s+data-[\w-]+\s*=/i)[0];
		url = url.replace(/\bnoopener\b|\bnoreferrer\b/gi, '');
		url = url.replace(/["'`]+$/g, '');
		url = url.replace(/[.,;:!?]+$/g, '');
		return url.replace(/\s{2,}/g, ' ').trim();
	}

	function normalizeProductUrl(url) {
		let raw = String(url || '').trim();
		if (!raw) return '';

		try {
			raw = decodeURIComponent(raw);
		} catch {
			// Keep original string when decode fails.
		}

		raw = raw
			.replace(/\\/g, '/')
			.replace(/\bnoopener\b|\bnoreferrer\b/gi, '')
			.replace(/\s{2,}/g, ' ')
			.trim();

		// Repair malformed path fragments produced by AI text transforms.
		raw = raw
			.replace(/(^|\/)s[aả]n\s*[-_]?\s*ph[aẩ]m\//gi, '$1products/')
			.replace(/(^|\/)san\s*[-_]?\s*pham\//gi, '$1products/')
			.replace(/(^|\/)ph[aẩ]m\//gi, '$1products/')
			.replace(/(^|\/)pham\//gi, '$1products/');

		const queryMatch = raw.match(/\?[^\s#)]+/);
		const query = queryMatch ? queryMatch[0] : '';

		const byId = raw.match(/([a-f0-9]{24})/i);

		const lower = raw
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		const mentionsProductPath = /\/(?:san\s*[-_]?\s*pham|products?|pham)\b/i.test(lower);

		if (byId && mentionsProductPath) {
			const id = byId[1];
			return `/products/${id}`;
		}

		if (lower.includes('/san pham') || lower.includes('/san-pham') || /\/products?\s*pham\b/i.test(lower) || /(?:^|\/)pham\/[a-f0-9]{24}/i.test(lower)) {
			return byId ? `/products/${byId[1]}` : '';
		}

		return '';
	}

	function formatMessageContent(text) {
		const raw = String(text || '').trim();
		if (!raw) return '';

		const normalized = raw
			.replace(/\*\*/g, '')
			.replace(/^\s*#{1,6}\s*/gm, '')
			.replace(/(?:s[aả]n\s*[-_]?\s*ph[aẩ]m|san\s*[-_]?\s*pham|ph[aẩ]m|pham)\/([a-f0-9]{24})/gi, '/products/$1')
			.replace(/\/(?:san\s*[-_]?\s*pham|products?)\/([a-f0-9]{24})(?=[\s)\].,;:!?]|$)/gi, '/products')
			.replace(/https?:\/\/[^\s)]+\/(?:san\s*[-_]?\s*pham|products?)\/([a-f0-9]{24})(?=[\s)\].,;:!?]|$)/gi, '/products')
			.replace(/:\s*(?=\d+\.\s)/g, ':\n')
			.replace(/([\p{L}\)])\s(?=\d+\.\s)/gu, '$1\n')
			.replace(/(tại\s+đây)\s(?=\d+\.)/gi, '$1\n')
			.replace(/\s*1\.\s*(Tóm tắt[^:]*):?/i, '\n📌 $1:\n')
			.replace(/\s*2\.\s*(Phân tích[^:]*):?/i, '\n📊 $1:\n')
			.replace(/\s*3\.\s*(Vấn đề[^:]*):?/i, '\n⚠️ $1:\n')
			.replace(/\s*4\.\s*(Khuyến nghị[^:]*):?/i, '\n✅ $1:\n')
			.replace(/\s\*\s+/g, '\n- ')
			.replace(/\n{3,}/g, '\n\n')
			.trim();

		const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);

		const formatInline = (line) => {
			const cleanedLine = String(line || '')
				.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
				.replace(/\s*(target|rel)\s*=\s*["'][^"']*["']/gi, '')
				.replace(/\bnoreferrer\b/gi, '')
				.trim();
			const trimmed = cleanedLine.trim();

			// Markdown image: ![alt](url)
			const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
			if (imageMatch && isSafeUrl(imageMatch[2]) && isImageUrl(imageMatch[2])) {
				const alt = escapeHtml(imageMatch[1] || 'image');
				const src = escapeHtml(imageMatch[2]);
				return `<img class="ai-chat-inline-image" src="${src}" alt="${alt}">`;
			}

			const tokens = [];
			const putToken = (html) => {
				const key = `__AI_TOKEN_${tokens.length}__`;
				tokens.push({ key, html });
				return key;
			};

			const toAnchor = (label, url) => {
				const cleanUrl = sanitizeLinkCandidate(url).replace(/\bnoreferrer\b/gi, '').trim();
				const normUrl = normalizeProductUrl(cleanUrl) || normalizeInternalUrl(cleanUrl);
				if (!normUrl || !isSafeUrl(normUrl)) return escapeHtml(label || 'tại đây');
				const safeLabel = escapeHtml(label || 'tại đây');
				const safeUrl = escapeHtml(normUrl);
				return `<a class="ai-chat-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
			};

			let textWork = cleanedLine;

			// Markdown links.
			textWork = textWork.replace(/\[(.*?)\]\((.*?)\)/g, (_, label, url) => {
				const rawLabel = String(label || '').trim();
				const compactLabel = (!rawLabel || /^(https?:\/\/|\/)/i.test(rawLabel) || /(san\s*pham|sản\s*phẩm|products|orders|vouchers|size-guide|cart)/i.test(rawLabel))
					? 'tại đây'
					: rawLabel;
				return putToken(toAnchor(compactLabel, url));
			});

			// "tại đây: /products/{id}" style.
			textWork = textWork.replace(/(tại\s+đây|tai\s+day)\s*:\s*(\/(?:sản\s*phẩm|san\s*pham|products)\/[a-f0-9]{24})/gi, (_, label, rawUrl) => {
				return putToken(toAnchor(String(label || 'tại đây').trim(), rawUrl));
			});

			// Standalone internal paths.
			textWork = textWork.replace(/(\/(?:sản\s*phẩm|san\s*pham|products|orders|vouchers|size-guide|cart)(?:\/[a-f0-9]{24})?(?:\?[^\s<]+)?)/gi, (rawPath) => {
				return putToken(toAnchor('tại đây', rawPath));
			});

			textWork = textWork.replace(/(\/(?:lookbooks?|brands?|blog)(?:\/[a-z0-9-]+)?(?:\?[^\s<]+)?)/gi, (rawPath) => {
				return putToken(toAnchor('tại đây', rawPath));
			});

			textWork = textWork.replace(/(tai\s+day|tại\s+đây)\s*:\s*(\/(?:lookbooks?|brands?|blog)(?:\/[a-z0-9-]+)?)/gi, (_, label, rawUrl) => {
				return putToken(toAnchor(String(label || 'tại đây').trim(), rawUrl));
			});

			let output = escapeHtml(textWork);
			tokens.forEach((token) => {
				output = output.replace(token.key, token.html);
			});

			return output;
		};

		let html = '';
		let listBuffer = [];

		const flushList = () => {
			if (!listBuffer.length) return;
			html += `<ul class="ai-chat-list">${listBuffer.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`;
			listBuffer = [];
		};

		lines.forEach((line) => {
			if (/^(📌|📊|⚠️|✅)\s/.test(line)) {
				flushList();
				html += `<div class="ai-chat-section-title">${formatInline(line)}</div>`;
				return;
			}

			if (/^\d+\.\s/.test(line)) {
				const itemLine = line.replace(/^\d+\.\s*/, '🛍️ ');
				listBuffer.push(itemLine);
				return;
			}

			if (line.startsWith('- ')) {
				listBuffer.push(line.replace(/^-\s*/, ''));
				return;
			}

			flushList();
			html += `<div class="ai-chat-line">${formatInline(line)}</div>`;
		});

		flushList();
		return html;
	}

	function injectSuggestedLinks(answer, suggestedProducts) {
		let output = String(answer || '');
		const products = Array.isArray(suggestedProducts)
			? suggestedProducts.filter((item) => item && /^\/products\/[a-f0-9]{24}$/i.test(String(item.url || '')))
			: [];
		if (!output || products.length === 0) return output;

		const normalizeForCompare = (value) => String(value || '')
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const buildProductLinkLabel = (item) => {
			const name = String(item && item.name ? item.name : '').trim();
			if (!name) return 'Xem sản phẩm';
			return name.length > 48 ? `Xem ${name.slice(0, 45).trim()}...` : `Xem ${name}`;
		};

		// If answer is numbered list, keep exactly one link per item based on product name mention.
		const blocks = output.match(/\d+\.[\s\S]*?(?=\n\d+\.|$)/g);
		if (blocks && blocks.length > 0) {
			const rebuilt = blocks.map((block, blockIndex) => {
				const cleanBlock = String(block || '')
					.replace(/\[tại\s+đây\]\([^)]*\)/gi, '')
					.replace(/\btại\s+đây\b/gi, '')
					.replace(/\s{2,}/g, ' ')
					.replace(/\s+([.,!?;:])/g, '$1')
					.trim();

				const blockNorm = normalizeForCompare(cleanBlock);
				let picked = null;
				for (let i = 0; i < products.length; i += 1) {
					const item = products[i];
					const itemNameNorm = normalizeForCompare(item && item.name ? item.name : '');
					if (itemNameNorm && blockNorm.includes(itemNameNorm)) {
						picked = item;
						break;
					}
				}

				if (!picked && products[blockIndex] && products[blockIndex].url) {
					picked = products[blockIndex];
				}

				if (!picked || !picked.url) return cleanBlock;
				const detailUrl = normalizeProductUrl(String(picked.url));
				if (!detailUrl) return cleanBlock;
				return `${cleanBlock} Xem thêm: [${buildProductLinkLabel(picked)}](${detailUrl})`;
			});

			const prefix = output.split(/\d+\./)[0] || '';
			return `${prefix}${rebuilt.join('\n')}`.trim();
		}

		// Non-numbered answer fallback.
		products.forEach((item) => {
			const name = String(item && item.name ? item.name : '').trim();
			const url = String(item && item.url ? item.url : '').trim();
			if (!name || !url) return;

			const nameRegex = new RegExp(`(${escapeRegex(name)})(?![^\\n]*\\[tại\\s+đây\\]\\()`, 'i');
			if (nameRegex.test(output)) {
				const detailUrl = normalizeProductUrl(url);
				if (!detailUrl) return;
				output = output.replace(nameRegex, `$1 - Xem thêm: [${buildProductLinkLabel(item)}](${detailUrl})`);
			}
		});

		return output;
	}

	function setStatus(message, loading = false) {
		statusEl.textContent = message || '';
		statusEl.classList.toggle('loading', Boolean(loading));
	}

	function scrollToBottom() {
		list.scrollTop = list.scrollHeight;
	}

function setInputHeight() {
		input.style.height = 'auto';
		input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
	}

	function revokePendingImagePreview() {
		if (pendingImagePreviewUrl) {
			URL.revokeObjectURL(pendingImagePreviewUrl);
			pendingImagePreviewUrl = '';
		}
	}

	function revokeSubmittedImagePreviews() {
		while (submittedImagePreviewUrls.length > 0) {
			const previewUrl = submittedImagePreviewUrls.pop();
			if (!previewUrl) continue;
			URL.revokeObjectURL(previewUrl);
		}
	}

	function clearPendingImage(options = {}) {
		const keepStatus = Boolean(options.keepStatus);
		pendingImageFile = null;
		revokePendingImagePreview();
		if (imageInputEl) imageInputEl.value = '';
		if (imagePreviewImgEl) {
			imagePreviewImgEl.src = '';
			imagePreviewImgEl.classList.add('d-none');
		}
		if (imagePreviewEl) imagePreviewEl.classList.add('d-none');
		if (!keepStatus && !statusEl.classList.contains('loading')) {
			setStatus('');
		}
	}

	function detachPendingImageForSubmit() {
		const file = pendingImageFile;
		const previewSrc = pendingImagePreviewUrl;
		pendingImageFile = null;
		pendingImagePreviewUrl = '';
		if (imageInputEl) imageInputEl.value = '';
		if (imagePreviewImgEl) {
			imagePreviewImgEl.src = '';
			imagePreviewImgEl.classList.add('d-none');
		}
		if (imagePreviewEl) imagePreviewEl.classList.add('d-none');
		if (previewSrc) {
			submittedImagePreviewUrls.push(previewSrc);
		}
		return { file, previewSrc };
	}

	function setPendingImage(file) {
		if (!file) {
			clearPendingImage();
			return;
		}

		pendingImageFile = file;
		revokePendingImagePreview();
		pendingImagePreviewUrl = URL.createObjectURL(file);
		if (imagePreviewImgEl) {
			imagePreviewImgEl.src = pendingImagePreviewUrl;
			imagePreviewImgEl.classList.remove('d-none');
		}
		if (imagePreviewEl) imagePreviewEl.classList.remove('d-none');
		setStatus('Đã đính kèm 1 ảnh. Khi gửi, hệ thống sẽ tìm sản phẩm tương tự bằng OpenCLIP.');
	}

	function renderMessage(role, content, options = {}) {
		const row = document.createElement('div');
		row.className = `ai-chat-row ${role}`;
		const bubble = document.createElement('div');
		bubble.className = 'ai-chat-bubble';
		const imageSrc = String(options.imageSrc || '').trim();
		if (imageSrc) {
			const image = document.createElement('img');
			image.className = 'ai-query-image';
			image.src = imageSrc;
			image.alt = 'query image';
			bubble.appendChild(image);
		}
		const formatted = formatMessageContent(content);
		if (formatted) {
			const textWrap = document.createElement('div');
			textWrap.innerHTML = formatted;
			bubble.appendChild(textWrap);
		}
		row.appendChild(bubble);
		list.appendChild(row);
		scrollToBottom();
		return row;
	}
	function renderSuggestedActions(actions) {
		const items = Array.isArray(actions)
			? actions
				.map((item) => ({
					label: String(item && item.label ? item.label : '').trim(),
					url: normalizeInternalUrl(item && item.url ? String(item.url) : ''),
					kind: String(item && item.kind ? item.kind : 'link').trim().toLowerCase()
				}))
				.filter((item) => item.label && item.url)
				.slice(0, 5)
			: [];
		if (items.length === 0) return;

		const row = document.createElement('div');
		row.className = 'ai-chat-row assistant';
		const wrap = document.createElement('div');
		wrap.className = 'ai-chat-actions';

		items.forEach((item) => {
			const link = document.createElement('a');
			link.className = `ai-chat-action ${item.kind === 'primary' ? 'primary' : ''}`;
			link.href = item.url;
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			link.textContent = item.label;
			wrap.appendChild(link);
		});

		row.appendChild(wrap);
		list.appendChild(row);
		scrollToBottom();
	}

	function renderProductCards(products, options = {}) {
		const maxItems = Number.isFinite(Number(options && options.maxItems))
			? Math.max(1, Number(options.maxItems))
			: DEFAULT_SUGGEST_LIMIT;
		const items = Array.isArray(products)
			? products.filter((item) => item && /^\/products\/[a-f0-9]{24}$/i.test(String(item.url || ''))).slice(0, maxItems)
			: [];
		if (items.length === 0) return;

		const row = document.createElement('div');
		row.className = 'ai-chat-row assistant';
		const wrap = document.createElement('div');
		wrap.className = 'ai-product-suggest-list';

		items.forEach((item) => {
			const safeUrl = normalizeInternalUrl(item && item.url ? String(item.url) : '');
			if (!safeUrl) return;
			const card = document.createElement('a');
			card.className = 'ai-product-card';
			card.href = safeUrl;
			card.target = '_blank';
			card.rel = 'noopener noreferrer';
			const originalPriceHtml = item.hasDiscount && item.originalPriceText
				? `<span class="ai-product-card-old-price">${escapeHtml(item.originalPriceText)}</span>`
				: '';
			card.innerHTML = `
				<img class="ai-product-card-image" src="${escapeHtml(item.imageUrl || '/images/shopping.png')}" alt="${escapeHtml(item.name || 'Sản phẩm')}" onerror="this.onerror=null;this.src='/images/shopping.png';">
				<div class="ai-product-card-body">
					<div class="ai-product-card-name">${escapeHtml(item.name || 'Sản phẩm')}</div>
					<div class="ai-product-card-price-wrap">
						<div class="ai-product-card-price">${escapeHtml(item.priceText || '')}</div>
						${originalPriceHtml}
					</div>
				</div>
			`;
			wrap.appendChild(card);
		});

		row.appendChild(wrap);
		list.appendChild(row);
		scrollToBottom();
	}

	function renderOpenClipImageCards(products) {
		const items = Array.isArray(products) ? products.slice(0, IMAGE_SEARCH_SUGGEST_LIMIT) : [];
		if (items.length === 0) return;

		const row = document.createElement('div');
		row.className = 'ai-chat-row assistant';
		const wrap = document.createElement('div');
		wrap.className = 'ai-product-suggest-list';

		items.forEach((item) => {
			const card = document.createElement('a');
			card.className = 'ai-product-card';
			const safeUrl = normalizeInternalUrl(item && item.url ? String(item.url) : '') || '/products';
			card.href = safeUrl;
			card.target = '_blank';
			card.rel = 'noopener noreferrer';
			const originalPriceHtml = item.hasDiscount && item.originalPriceText
				? `<span class="ai-product-card-old-price">${escapeHtml(item.originalPriceText)}</span>`
				: '';
			card.innerHTML = `
				<img class="ai-product-card-image" src="${escapeHtml(item.imageUrl || '/images/shopping.png')}" alt="${escapeHtml(item.name || 'Sản phẩm')}" onerror="this.onerror=null;this.src='/images/shopping.png';">
				<div class="ai-product-card-body">
					<div class="ai-product-card-name">${escapeHtml(item.name || 'Sản phẩm')}</div>
					<div class="ai-product-card-price-wrap">
						<div class="ai-product-card-price">${escapeHtml(item.priceText || '')}</div>
						${originalPriceHtml}
					</div>
				</div>
			`;
			wrap.appendChild(card);
		});

		row.appendChild(wrap);
		list.appendChild(row);
		scrollToBottom();
	}

	function mergeSuggestedProducts(primaryProducts, fallbackProducts) {
		const merged = [];
		const seen = new Set();

		[primaryProducts, fallbackProducts].forEach((group) => {
			if (!Array.isArray(group)) return;
			group.forEach((item) => {
				if (!item) return;
				const key = [
					String(item.id || '').trim().toLowerCase(),
					String(item.url || '').trim().toLowerCase(),
					String(item.name || item.tensanpham || '').trim().toLowerCase()
				].find(Boolean);
				if (!key || seen.has(key)) return;
				seen.add(key);
				merged.push(item);
			});
		});

		return merged.slice(0, IMAGE_SEARCH_SUGGEST_LIMIT);
	}

	function saveHistory() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-30)));
		} catch {
			// Ignore storage errors in private mode.
		}
	}

	function resetHistory() {
		history.length = 0;
		revokeSubmittedImagePreviews();
		list.innerHTML = '';
		renderMessage('system', 'Xin chào, tôi có thể giúp bạn tìm sản phẩm và thông tin đơn hàng.');
		saveHistory();
	}

	function sanitizeAssistantContentForHistory(value) {
		return String(value || '')
			.replace(/\s*-\s*Xem th[aâ]m:\s*\[[^\]]+\]\(\/products\/[a-f0-9]{24}\)/gi, '')
			.replace(/\s*Xem th[aâ]m:\s*\[[^\]]+\]\(\/products\/[a-f0-9]{24}\)/gi, '')
			.replace(/\s{2,}/g, ' ')
			.replace(/\s+([.,!?;:])/g, '$1')
			.trim();
	}

	function loadHistory() {
		let stored = [];
		try {
			stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
		} catch {
			stored = [];
		}

		if (!Array.isArray(stored) || stored.length === 0) {
			resetHistory();
			return;
		}

		list.innerHTML = '';
		stored.slice(-30).forEach((item) => {
			const role = item && item.role === 'assistant' ? 'assistant' : 'user';
			const rawContent = String(item && item.content ? item.content : '').trim();
			const content = role === 'assistant'
				? sanitizeAssistantContentForHistory(rawContent)
				: rawContent;
			if (!content) return;
			const suggestedProducts = Array.isArray(item && item.suggestedProducts) ? item.suggestedProducts : [];
			const suggestedActions = Array.isArray(item && item.suggestedActions) ? item.suggestedActions : [];
			history.push({ role, content, suggestedProducts, suggestedActions });
			renderMessage(role, content);
			if (role === 'assistant' && suggestedProducts.length > 0) {
				renderProductCards(suggestedProducts);
			}
			if (role === 'assistant' && suggestedActions.length > 0) {
				renderSuggestedActions(suggestedActions);
			}
		});
	}

	function normalizeCurrentProductForPayload(rawProduct) {
		const source = rawProduct && typeof rawProduct === 'object' ? rawProduct : null;
		if (!source) return null;

		const id = String(source.id || source._id || '').trim();
		const name = String(source.name || source.tensanpham || '').trim();
		const url = String(source.url || (id ? `/products/${id}` : '')).trim();
		const imageUrl = String(source.imageUrl || source.image || '/images/shopping.png').trim();
		const price = Number(source.price || source.giaSauGiam || source.gia || 0);
		const originalPrice = Number(source.originalPrice || source.gia || price || 0);
		const productType = String(source.productType || source.loaisanpham || '').trim();
		const gender = String(source.gender || source.gioitinh || '').trim();

		if (!id && !name && !url) return null;

		return {
			id,
			name,
			url,
			imageUrl,
			price: Number.isFinite(price) && price > 0 ? price : 0,
			originalPrice: Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice : 0,
			productType,
			gender
		};
	}

	function buildPageContextPayload() {
		const payload = {
			path: String(window.location.pathname || '').trim() || '/'
		};
		const currentProduct = normalizeCurrentProductForPayload(runtime && runtime.currentProduct);
		if (currentProduct) payload.currentProduct = currentProduct;
		return payload;
	}

async function askAI(question, options = {}) {
		const provider = getProviderValue();
		const model = modelEl ? String(modelEl.value || '').trim() : '';
		const payload = {
			message: question,
			history: history.slice(-10).map((item) => ({
				...item,
				content: item && item.role === 'assistant'
					? sanitizeAssistantContentForHistory(item.content)
					: String(item && item.content ? item.content : '').trim()
			})),
			provider,
			model: provider === 'gemini' ? model : '',
			imageProducts: Array.isArray(options.imageProducts) ? options.imageProducts : [],
			imageMeta: options.imageMeta && typeof options.imageMeta === 'object' ? options.imageMeta : null,
			pageContext: buildPageContextPayload()
		};

		const res = await fetch('/api/ai-chat/message', {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify(payload)
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok || !data || !data.success || !data.data || !data.data.answer) {
			throw new Error((data && data.message) || 'Khong the ket noi AI');
		}

		return {
			answer: String(data.data.answer || '').trim(),
			model: String(data.data.model || ''),
			provider: String(data.data.provider || provider),
			suggestedProducts: Array.isArray(data.data.suggestedProducts) ? data.data.suggestedProducts : [],
			suggestedActions: Array.isArray(data.data.suggestedActions) ? data.data.suggestedActions : []
		};
	}

	async function askOpenClipByImage(file, question = '') {
		const fd = new FormData();
		fd.append('image', file);
		if (String(question || '').trim()) {
			fd.append('query', String(question || '').trim());
		}

		const res = await fetch('/api/openclip/search-by-image', {
			method: 'POST',
			credentials: 'same-origin',
			body: fd
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok || !data || data.success !== true || !data.data) {
			throw new Error((data && data.message) || 'Khong the tim theo anh luc nay');
		}

		const productsRaw = Array.isArray(data.data.products) ? data.data.products : [];
		const suggestedProducts = mapOpenClipProducts(productsRaw).slice(0, IMAGE_SEARCH_SUGGEST_LIMIT);
		const modelName = data.data && data.data.openClipMeta && data.data.openClipMeta.model
			? String(data.data.openClipMeta.model)
			: 'ViT-B-32';

		return {
			answer: buildOpenClipImageAnswer(suggestedProducts),
			model: modelName,
			provider: 'openclip',
			suggestedProducts,
			suggestedActions: []
		};
	}
	function togglePanel(forceOpen) {
		const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('open');
		panel.classList.toggle('open', shouldOpen);
		if (shouldOpen) {
			input.focus();
			scrollToBottom();
		}
	}

	toggleBtn.addEventListener('click', () => togglePanel());
	closeBtn.addEventListener('click', () => togglePanel(false));
	clearBtn.addEventListener('click', () => {
		resetHistory();
		clearPendingImage();
	});
	document.querySelectorAll("form[action='/auth/logout']").forEach((logoutForm) => {
		logoutForm.addEventListener('submit', () => {
			clearScopedHistoryStorage();
		});
	});
	window.addEventListener('beforeunload', () => {
		revokePendingImagePreview();
		revokeSubmittedImagePreviews();
	});
	if (expandBtn) {
		const savedExpanded = localStorage.getItem(EXPANDED_STORAGE_KEY) === '1';
		setExpanded(savedExpanded);
		expandBtn.addEventListener('click', () => {
			const nextExpanded = !panel.classList.contains('expanded');
			setExpanded(nextExpanded);
			localStorage.setItem(EXPANDED_STORAGE_KEY, nextExpanded ? '1' : '0');
		});
	}

if (providerEl) {
		const savedProvider = localStorage.getItem(PROVIDER_STORAGE_KEY);
		const normalizedProvider = normalizeProviderValue(savedProvider || providerEl.value || DEFAULT_PROVIDER);
		providerEl.value = normalizedProvider;
		localStorage.setItem(PROVIDER_STORAGE_KEY, normalizedProvider);

		if (modelEl) {
			const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
			const normalizedModel = normalizeGeminiModel(savedModel || modelEl.value || DEFAULT_GEMINI_MODEL);
			modelEl.value = normalizedModel;
			localStorage.setItem(MODEL_STORAGE_KEY, normalizedModel);

			modelEl.addEventListener('change', () => {
				const normalized = normalizeGeminiModel(modelEl.value);
				modelEl.value = normalized;
				localStorage.setItem(MODEL_STORAGE_KEY, normalized);
				if (getProviderValue() === 'gemini') {
					setStatus(`Model Gemini: ${normalized}`);
				}
			});
		}

		syncModelVisibility();
		providerEl.addEventListener('change', () => {
			const selected = normalizeProviderValue(getProviderValue());
			providerEl.value = selected;
			localStorage.setItem(PROVIDER_STORAGE_KEY, selected);
			syncModelVisibility();
			setStatus(getProviderReadyText(selected));
		});
	}

	if (imageBtnEl && imageInputEl) {
		imageBtnEl.addEventListener('click', () => {
			imageInputEl.click();
		});

		imageInputEl.addEventListener('change', () => {
			const file = imageInputEl.files && imageInputEl.files[0] ? imageInputEl.files[0] : null;
			if (!file) return;
			setPendingImage(file);
		});
	}

	if (imageRemoveBtnEl) {
		imageRemoveBtnEl.addEventListener('click', () => {
			clearPendingImage();
		});
	}
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			form.requestSubmit();
		}
	});

form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const question = String(input.value || '').trim();
		const hasImage = Boolean(pendingImageFile);
		if (!question && !hasImage) return;

		const userMessage = question || 'Da gui anh de tim san pham tuong tu.';
		const imageSubmission = hasImage ? detachPendingImageForSubmit() : null;
		const requestImageFile = imageSubmission && imageSubmission.file ? imageSubmission.file : null;
		const previewSrc = imageSubmission && imageSubmission.previewSrc ? imageSubmission.previewSrc : '';
		const previousInputValue = input.value;
		renderMessage('user', userMessage, { imageSrc: previewSrc });
		input.value = '';
		setInputHeight();
		setStatus(
			hasImage && question
				? 'Đang phân tích ảnh và suy luận...'
				: (hasImage ? 'Đang phân tích ảnh...' : 'Đang trả lời...'),
			true
		);
		sendBtn.disabled = true;
		if (imageBtnEl) imageBtnEl.disabled = true;

		try {
			let ai;
			let imageSearchResult = null;

			if (requestImageFile && question) {
				imageSearchResult = await askOpenClipByImage(requestImageFile, question);
				ai = await askAI(question, {
					imageProducts: imageSearchResult.suggestedProducts,
					imageMeta: {
						provider: imageSearchResult.provider,
						model: imageSearchResult.model,
						answer: imageSearchResult.answer
					}
				});
				ai = {
					...ai,
					suggestedProducts: mergeSuggestedProducts(ai && ai.suggestedProducts, imageSearchResult.suggestedProducts)
				};
			} else if (requestImageFile) {
				ai = await askOpenClipByImage(requestImageFile, question);
			} else {
				ai = await askAI(question);
			}

			if (!ai.answer) throw new Error('AI chua co cau tra loi');
			const answerWithLinks = ai.provider === 'openclip'
				? ai.answer
				: sanitizeAssistantContentForHistory(ai.answer);
			renderMessage('assistant', answerWithLinks);
			if (ai.provider === 'openclip') {
				renderOpenClipImageCards(ai.suggestedProducts);
			} else {
				renderProductCards(ai.suggestedProducts, {
					maxItems: requestImageFile ? IMAGE_SEARCH_SUGGEST_LIMIT : DEFAULT_SUGGEST_LIMIT
				});
			}
			renderSuggestedActions(ai.suggestedActions);
			history.push({ role: 'user', content: userMessage });
			history.push({
				role: 'assistant',
				content: sanitizeAssistantContentForHistory(ai.answer),
				suggestedProducts: ai.suggestedProducts,
				suggestedActions: ai.suggestedActions,
				provider: ai.provider,
				model: ai.model
			});
			saveHistory();
			setStatus(buildResponseStatus(ai), false);
		} catch (error) {
			const message = error && error.message ? error.message : 'Không thể trả lời lúc này';
			renderMessage('system', message);
			input.value = previousInputValue;
			setInputHeight();
			setStatus('Lỗi kết nối', false);
		} finally {
			sendBtn.disabled = false;
			if (imageBtnEl) imageBtnEl.disabled = false;
		}
	});

	input.addEventListener('input', () => {
		setInputHeight();
	});

	loadHistory();
})();


