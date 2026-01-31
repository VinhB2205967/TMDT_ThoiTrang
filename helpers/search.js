// helpers/search.js
// Tạo biểu thức tìm kiếm an toàn, hỗ trợ:
// - Không phân biệt dấu tiếng Việt (khách gõ không dấu vẫn ra sản phẩm có dấu)
// - "Gần giống" theo kiểu chứa từ khóa / nhiều từ cách nhau vẫn match

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nhóm ký tự tiếng Việt để tạo regex không dấu.
// Bao gồm cả chữ thường và HOA để tránh phụ thuộc hoàn toàn vào /i cho Unicode.
const VN_GROUPS = {
    a: 'aàáảãạăằắẳẵặâầấẩẫậAÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ',
    e: 'eèéẻẽẹêềếểễệEÈÉẺẼẸÊỀẾỂỄỆ',
    i: 'iìíỉĩịIÌÍỈĨỊ',
    o: 'oòóỏõọôồốổỗộơờớởỡợOÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ',
    u: 'uùúủũụưừứửữựUÙÚỦŨỤƯỪỨỬỮỰ',
    y: 'yỳýỷỹỵYỲÝỶỸỴ',
    d: 'dđDĐ'
};

// Map mọi ký tự trong nhóm về 1 char-class an toàn.
const VN_CHAR_CLASS = (() => {
    const map = new Map();
    for (const key of Object.keys(VN_GROUPS)) {
        const chars = VN_GROUPS[key];
        const cls = `[${chars}]`;
        for (const ch of chars) map.set(ch, cls);
    }
    return map;
})();

function buildVietnameseLooseRegex(keyword) {
    const raw = String(keyword || '').trim();
    if (!raw) return null;

    // Chuẩn hóa unicode (tiếng Việt)
    let normalized = raw.normalize('NFC');

    // Giới hạn độ dài để tránh regex quá nặng
    if (normalized.length > 120) normalized = normalized.slice(0, 120);

    // Nới lỏng cách gõ: thay ký tự phân tách phổ biến thành khoảng trắng
    normalized = normalized
        .replace(/[_\-]+/g, ' ')
        .replace(/[^0-9a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const tokens = normalized.split(' ').filter(Boolean);
    if (!tokens.length) return null;

    const tokenPatterns = tokens.map((tok) => {
        let out = '';
        for (const ch of tok) {
            const cls = VN_CHAR_CLASS.get(ch);
            if (cls) {
                out += cls;
                continue;
            }

            // Ký tự ASCII chữ cái cũng nên map sang nhóm tương ứng
            const lower = ch.toLowerCase();
            if (VN_GROUPS[lower]) {
                out += `[${VN_GROUPS[lower]}]`;
                continue;
            }

            // Số/khác: escape để an toàn
            out += escapeRegExp(ch);
        }
        return out;
    });

    // "Gần giống": cho phép có ký tự bất kỳ giữa các token (ví dụ "ao thun" vẫn match "Áo  thun nam")
    const pattern = tokenPatterns.join('.*');
    return new RegExp(pattern, 'i');
}

module.exports = (query, cauhinh) => {
    const keywordKey = cauhinh && cauhinh.keywordKey ? cauhinh.keywordKey : 'keyword';
    let tukhoa = (query && query[keywordKey] ? query[keywordKey] : '').toString().trim();

    // Chuẩn hóa unicode (tiếng Việt)
    tukhoa = tukhoa.normalize('NFC');

    const regex = buildVietnameseLooseRegex(tukhoa);

    return {
        keyword: tukhoa,
        regex
    };
};
