module.exports = (Pagination, query, totalProducts) => {
    if (query.page) {
        Pagination.currentPage = parseInt(query.page);
    }

    Pagination.skip = (Pagination.currentPage - 1) * Pagination.limit;
    Pagination.totalPages = Math.ceil(totalProducts / Pagination.limit);
    Pagination.totalProducts = totalProducts;

    return Pagination;
};
