// helpers/search.js
module.exports = (query, cauhinh) => {
    let tukhoa = (query[cauhinh.keywordKey] || '').toString().trim();

    // Chuẩn hóa unicode (tiếng Việt)
    tukhoa = tukhoa.normalize('NFC');

    // Escape regex để tránh injection
    const thoatBieuThuc = (str) => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const tukhoaanToan = thoatBieuThuc(tukhoa);

    // Tạo regex an toàn
    const regex = tukhoaanToan
        ? new RegExp(tukhoaanToan, 'i')
        : null;

    return {
        keyword: tukhoa,
        regex
    };
};
