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
	if (!toggleBtn || !panel || !form || !input || !list || !sendBtn || !statusEl) return;

	const STORAGE_KEY = 'fashion_ai_chat_history_v1';
	const PROVIDER_STORAGE_KEY = 'fashion_ai_provider_v1';
	const MODEL_STORAGE_KEY = 'fashion_ai_gemini_model_v1';
	const EXPANDED_STORAGE_KEY = 'fashion_ai_chat_expanded_v1';
	const history = [];

	function setExpanded(expanded) {
		panel.classList.toggle('expanded', Boolean(expanded));
		if (!expandBtn) return;
		expandBtn.innerHTML = expanded
			? '<i class="bi bi-arrows-angle-contract"></i>'
			: '<i class="bi bi-arrows-angle-expand"></i>';
		expandBtn.setAttribute('title', expanded ? 'Thu nhỏ chat' : 'Phóng to chat');
		expandBtn.setAttribute('aria-label', expanded ? 'Thu nhỏ chat' : 'Phóng to chat');
	}

	function syncModelVisibility() {
		if (!modelRowEl || !providerEl) return;
		const provider = String(providerEl.value || 'ollama').toLowerCase();
		modelRowEl.style.display = provider === 'gemini' ? '' : 'none';
	}

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function isSafeUrl(url) {
		const value = String(url || '').trim();
		if (!value) return false;
		if (value.startsWith('http://') || value.startsWith('https://')) return true;
		if (value.startsWith('/')) return true;
		return false;
	}

	function isImageUrl(url) {
		const clean = String(url || '').split('?')[0].toLowerCase();
		return /\.(png|jpe?g|gif|webp|avif|svg)$/.test(clean);
	}

	function normalizeProductUrl(url) {
		const raw = String(url || '').trim();
		if (!raw) return '';

		const byId = raw.match(/([a-f0-9]{24})/i);
		if (!byId) return raw;
		const id = byId[1];

		const lower = raw
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		if (lower.includes('/san pham/') || lower.includes('/products/')) {
			return `/products/${id}`;
		}

		return raw;
	}

	function formatMessageContent(text) {
		const raw = String(text || '').trim();
		if (!raw) return '';

		const lines = raw.split('\n');
		const htmlLines = lines.map((line) => {
			const trimmed = line.trim();

			// Markdown image: ![alt](url)
			const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
			if (imageMatch && isSafeUrl(imageMatch[2]) && isImageUrl(imageMatch[2])) {
				const alt = escapeHtml(imageMatch[1] || 'image');
				const src = escapeHtml(imageMatch[2]);
				return `<img class="ai-chat-inline-image" src="${src}" alt="${alt}">`;
			}

			let output = escapeHtml(line);

			// Render markdown links as clickable anchors.
			output = output.replace(/\[(.*?)\]\((.*?)\)/g, (_, label, url) => {
				const normUrl = normalizeProductUrl(String(url || '').trim());
				const safeLabel = escapeHtml(String(label || '').trim() || normUrl);
				const safeUrl = escapeHtml(normUrl);
				if (!safeUrl || !isSafeUrl(normUrl)) return safeLabel;
				return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
			});

			// Auto-link raw product paths like /sản phẩm/{id} or /products/{id}.
			output = output.replace(/(tại\s+đây|tai\s+day)\s*:\s*(\/(?:sản\s*phẩm|san\s*pham|products)\/[a-f0-9]{24})/gi, (_, label, rawUrl) => {
				const normUrl = normalizeProductUrl(rawUrl);
				if (!isSafeUrl(normUrl)) return escapeHtml(`${label}: ${rawUrl}`);
				const safeUrl = escapeHtml(normUrl);
				const safeLabel = escapeHtml(label || 'tại đây');
				return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
			});

			output = output.replace(/(\/(?:sản\s*phẩm|san\s*pham|products)\/[a-f0-9]{24})/gi, (match) => {
				const normUrl = normalizeProductUrl(match);
				if (!isSafeUrl(normUrl)) return escapeHtml(match);
				const safeUrl = escapeHtml(normUrl);
				const safeLabel = 'tại đây';
				return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
			});

			return output;
		});

		return htmlLines.join('<br>');
	}

	function setStatus(message, loading = false) {
		statusEl.textContent = message || '';
		statusEl.classList.toggle('loading', Boolean(loading));
	}

	function scrollToBottom() {
		list.scrollTop = list.scrollHeight;
	}

	function renderMessage(role, content) {
		const row = document.createElement('div');
		row.className = `ai-chat-row ${role}`;
		const bubble = document.createElement('div');
		bubble.className = 'ai-chat-bubble';
		bubble.innerHTML = formatMessageContent(content);
		row.appendChild(bubble);
		list.appendChild(row);
		scrollToBottom();
		return row;
	}

	function renderProductCards(products) {
		const items = Array.isArray(products) ? products.filter(Boolean).slice(0, 4) : [];
		if (items.length === 0) return;

		const row = document.createElement('div');
		row.className = 'ai-chat-row assistant';
		const wrap = document.createElement('div');
		wrap.className = 'ai-product-suggest-list';

		items.forEach((item) => {
			const card = document.createElement('a');
			card.className = 'ai-product-card';
			card.href = item.url || '/products';
			card.target = '_blank';
			card.rel = 'noopener noreferrer';
			const originalPriceHtml = item.hasDiscount && item.originalPriceText
				? `<span class="ai-product-card-old-price">${escapeHtml(item.originalPriceText)}</span>`
				: '';
			card.innerHTML = `
				<img class="ai-product-card-image" src="${escapeHtml(item.imageUrl || '/images/shopping.png')}" alt="${escapeHtml(item.name || 'Sản phẩm')}">
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

	function saveHistory() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-30)));
		} catch {
			// Ignore storage errors in private mode.
		}
	}

	function resetHistory() {
		history.length = 0;
		list.innerHTML = '';
		renderMessage('system', 'Xin chào, tôi có thể giúp bạn tìm sản phẩm và thông tin đơn hàng.');
		saveHistory();
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
			const content = String(item && item.content ? item.content : '').trim();
			if (!content) return;
			const suggestedProducts = Array.isArray(item && item.suggestedProducts) ? item.suggestedProducts : [];
			history.push({ role, content, suggestedProducts });
			renderMessage(role, content);
			if (role === 'assistant' && suggestedProducts.length > 0) {
				renderProductCards(suggestedProducts);
			}
		});
	}

	async function askAI(question) {
		const provider = providerEl ? String(providerEl.value || 'ollama').toLowerCase() : 'ollama';
		const model = modelEl ? String(modelEl.value || '').trim() : '';
		const payload = {
			message: question,
			history: history.slice(-10),
			provider,
			model: provider === 'gemini' ? model : ''
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
			throw new Error((data && data.message) || 'Không thể kết nối AI');
		}

		return {
			answer: String(data.data.answer || '').trim(),
			model: String(data.data.model || ''),
			provider: String(data.data.provider || provider),
			suggestedProducts: Array.isArray(data.data.suggestedProducts) ? data.data.suggestedProducts : []
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
	clearBtn.addEventListener('click', () => resetHistory());
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
		if (savedProvider && (savedProvider === 'ollama' || savedProvider === 'gemini' || savedProvider === 'openrouter')) {
			providerEl.value = savedProvider;
		}

		if (modelEl) {
			const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
			if (savedModel) {
				modelEl.value = savedModel;
			} else {
				modelEl.value = 'gemma-3-12b-it';
			}

			modelEl.addEventListener('change', () => {
				localStorage.setItem(MODEL_STORAGE_KEY, String(modelEl.value || ''));
				setStatus(`Model Gemini: ${String(modelEl.value || '')}`);
			});
		}

		syncModelVisibility();

		providerEl.addEventListener('change', () => {
			const selected = String(providerEl.value || 'ollama').toLowerCase();
			localStorage.setItem(PROVIDER_STORAGE_KEY, selected);
			syncModelVisibility();
			const providerName = selected === 'gemini'
				? 'Gemini'
				: (selected === 'openrouter' ? 'OpenRouter' : 'Ollama');
			setStatus(`Đã chuyển sang ${providerName}`);
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
		if (!question) return;

		renderMessage('user', question);
		history.push({ role: 'user', content: question });
		input.value = '';
		input.style.height = 'auto';
		setStatus('Đang trả lời...', true);
		sendBtn.disabled = true;

		try {
			const ai = await askAI(question);
			if (!ai.answer) throw new Error('AI chưa có câu trả lời');
			renderMessage('assistant', ai.answer);
			renderProductCards(ai.suggestedProducts);
			history.push({ role: 'assistant', content: ai.answer, suggestedProducts: ai.suggestedProducts });
			saveHistory();
			const providerName = ai.provider === 'gemini'
				? 'Gemini'
				: (ai.provider === 'openrouter' ? 'OpenRouter' : 'Ollama');
			setStatus(ai.model ? `${providerName} - ${ai.model}` : `Hoàn tất (${providerName})`, false);
		} catch (error) {
			const message = error && error.message ? error.message : 'Không thể trả lời lúc này';
			renderMessage('system', message);
			setStatus('Lỗi kết nối', false);
		} finally {
			sendBtn.disabled = false;
		}
	});

	input.addEventListener('input', () => {
		input.style.height = 'auto';
		input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
	});

	loadHistory();
})();
