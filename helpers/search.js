// helpers/search.js
module.exports = (query, Search) => {
    let keyword = (query[Search.keywordKey] || '').toString().trim();

    // Chuẩn hóa unicode (tiếng Việt)
    keyword = keyword.normalize('NFC');

    // Escape regex để tránh injection
    const escapeRegex = (str) => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const safeKeyword = escapeRegex(keyword);

    // Tạo regex an toàn
    const regex = safeKeyword
        ? new RegExp(safeKeyword, 'i')
        : null;

    return {
        keyword,
        regex
    };
};
