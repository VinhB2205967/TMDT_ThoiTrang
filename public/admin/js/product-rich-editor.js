(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    const hiddenInput = document.getElementById('productDescriptionInput');
    const editorRoot = document.getElementById('productDescriptionEditor');
    const toolbarRoot = document.getElementById('productDescriptionToolbar');
    const mediaInput = document.getElementById('productDescriptionMediaInput');
    const mediaTokensInput = document.getElementById('productDescriptionMediaTokens');

    if (!hiddenInput || !editorRoot || !toolbarRoot || !mediaInput || typeof window.Quill === 'undefined') {
        return;
    }

    const PRODUCT_MEDIA_TOKEN_PREFIX = '__PRODUCT_MEDIA_TOKEN__';
    const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
    const objectUrls = new Set();
    const mediaRegistry = new Map();

    const BlockEmbed = window.Quill.import('blots/block/embed');

    class ProductVideoBlot extends BlockEmbed {
        static create(value) {
            const node = super.create();
            const payload = typeof value === 'string' ? { src: value } : (value || {});
            node.setAttribute('src', String(payload.src || ''));
            node.setAttribute('controls', 'controls');
            node.setAttribute('playsinline', 'playsinline');
            node.setAttribute('preload', 'metadata');
            node.classList.add('product-rich-video');
            if (payload.token) node.dataset.uploadToken = String(payload.token);
            return node;
        }

        static value(node) {
            return {
                src: node.getAttribute('src') || '',
                token: node.dataset.uploadToken || ''
            };
        }
    }

    ProductVideoBlot.blotName = 'productVideo';
    ProductVideoBlot.tagName = 'video';

    window.Quill.register(ProductVideoBlot);

    toolbarRoot.innerHTML = `
        <span class="ql-formats">
            <select class="ql-header">
                <option selected></option>
                <option value="2"></option>
                <option value="3"></option>
            </select>
        </span>
        <span class="ql-formats">
            <button class="ql-bold"></button>
            <button class="ql-italic"></button>
            <button class="ql-underline"></button>
            <button class="ql-strike"></button>
        </span>
        <span class="ql-formats">
            <button class="ql-blockquote"></button>
            <button class="ql-list" value="ordered"></button>
            <button class="ql-list" value="bullet"></button>
            <button class="ql-link"></button>
        </span>
        <span class="ql-formats">
            <button class="ql-image"></button>
            <button class="ql-video"></button>
            <button class="ql-clean"></button>
        </span>
    `;

    const quill = new window.Quill(editorRoot, {
        theme: 'snow',
        placeholder: editorRoot.dataset.placeholder || 'Nhập mô tả sản phẩm...',
        modules: {
            toolbar: {
                container: toolbarRoot,
                handlers: {
                    image: () => openMediaPicker('image'),
                    video: () => openMediaPicker('video')
                }
            }
        }
    });

    function createToken() {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function getEditorSelection() {
        const range = quill.getSelection(true);
        if (range) return range;
        return { index: quill.getLength(), length: 0 };
    }

    function openMediaPicker(type) {
        mediaInput.dataset.pendingType = type;
        mediaInput.accept = type === 'image' ? 'image/*' : 'video/*';
        mediaInput.click();
    }

    function trackObjectUrl(url) {
        if (!url) return;
        objectUrls.add(url);
    }

    function insertImage(file) {
        const token = createToken();
        const reader = new FileReader();

        mediaRegistry.set(token, { file, type: 'image' });

        reader.onload = () => {
            const previewUrl = String(reader.result || '');
            const range = getEditorSelection();

            quill.insertEmbed(range.index, 'image', previewUrl, 'user');
            quill.setSelection(range.index + 1, 0, 'silent');

            requestAnimationFrame(() => {
                const imgNode = Array.from(quill.root.querySelectorAll('img'))
                    .find((node) => node.getAttribute('src') === previewUrl);
                if (imgNode) {
                    imgNode.dataset.uploadToken = token;
                    imgNode.alt = file.name || 'Ảnh mô tả sản phẩm';
                }
                syncEditorValue();
            });
        };

        reader.readAsDataURL(file);
    }

    function insertVideo(file) {
        const token = createToken();
        const previewUrl = URL.createObjectURL(file);
        const range = getEditorSelection();

        trackObjectUrl(previewUrl);
        mediaRegistry.set(token, { file, type: 'video' });
        quill.insertEmbed(range.index, 'productVideo', { src: previewUrl, token }, 'user');
        quill.insertText(range.index + 1, '\n', 'silent');
        quill.setSelection(range.index + 2, 0, 'silent');
        syncEditorValue();
    }

    function collectEditorTokens() {
        const orderedTokens = [];
        quill.root.querySelectorAll('[data-upload-token]').forEach((node) => {
            const token = String(node.dataset.uploadToken || '').trim();
            if (token) orderedTokens.push(token);
        });
        return orderedTokens;
    }

    function syncMediaFileList() {
        const orderedTokens = collectEditorTokens();
        const transfer = new DataTransfer();

        orderedTokens.forEach((token) => {
            const item = mediaRegistry.get(token);
            if (!item || !item.file) return;
            transfer.items.add(item.file);
        });

        mediaInput.files = transfer.files;
        mediaTokensInput.value = JSON.stringify(orderedTokens);
    }

    function serializeEditorHtml() {
        const clone = quill.root.cloneNode(true);
        clone.querySelectorAll('[data-upload-token]').forEach((node) => {
            const token = String(node.dataset.uploadToken || '').trim();
            if (!token) return;
            node.setAttribute('src', `${PRODUCT_MEDIA_TOKEN_PREFIX}${token}`);
            node.removeAttribute('data-upload-token');
        });
        return clone.innerHTML.trim();
    }

    function syncEditorValue() {
        hiddenInput.value = serializeEditorHtml();
        syncMediaFileList();
    }

    function validateSelectedFile(file, expectedType) {
        if (!file) return false;

        if (expectedType === 'image') {
            if (!String(file.type || '').startsWith('image/')) {
                window.alert('Vui lòng chọn đúng file ảnh để chèn vào nội dung.');
                return false;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                window.alert('Ảnh trong nội dung không được vượt quá 20MB.');
                return false;
            }
            return true;
        }

        if (!String(file.type || '').startsWith('video/')) {
            window.alert('Vui lòng chọn đúng file video để chèn vào nội dung.');
            return false;
        }
        if (file.size > MAX_VIDEO_BYTES) {
            window.alert('Video trong nội dung không được vượt quá 80MB.');
            return false;
        }
        return true;
    }

    mediaInput.addEventListener('change', () => {
        const expectedType = mediaInput.dataset.pendingType === 'video' ? 'video' : 'image';
        const pickedFiles = Array.from(mediaInput.files || []);

        pickedFiles.forEach((file) => {
            if (!validateSelectedFile(file, expectedType)) return;
            if (expectedType === 'video') {
                insertVideo(file);
            } else {
                insertImage(file);
            }
        });

        mediaInput.value = '';
    });

    quill.on('text-change', syncEditorValue);

    if (String(hiddenInput.value || '').trim()) {
        quill.clipboard.dangerouslyPasteHTML(hiddenInput.value);
    }

    syncEditorValue();

    window.addEventListener('beforeunload', () => {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
    });
})();
