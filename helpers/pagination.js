module.exports = (phanTrang, query, tongSanPham) => {
    if (query.page) {
        phanTrang.currentPage = parseInt(query.page);
    }

    phanTrang.skip = (phanTrang.currentPage - 1) * phanTrang.limit;
    phanTrang.totalPages = Math.ceil(tongSanPham / phanTrang.limit);
    phanTrang.totalProducts = tongSanPham;

    return phanTrang;
};
