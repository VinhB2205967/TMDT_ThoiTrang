const productsService = require('../../services/catalog/client-products.service');

module.exports.danhSach = async (req, res) => {
  try {
    const viewData = await productsService.getDanhSachData(req.query || {});
    res.render('client/pages/products/index.pug', viewData);
  } catch (error) {
    console.error('Lỗi lấy sản phẩm:', error);
    res.status(500).send('Lỗi server');
  }
};

module.exports.chiTiet = async (req, res) => {
  try {
    const viewData = await productsService.getChiTietData(req.params.id, req.query || {});
    if (viewData && viewData.notFound) {
      return res.status(404).render('client/pages/products/detail.pug', { titlePage: 'Sản phẩm không tồn tại' });
    }

    return res.render('client/pages/products/detail.pug', viewData);
  } catch (error) {
    console.error('Lỗi lấy chi tiết sản phẩm:', error);
    return res.status(500).send('Lỗi server');
  }
};

module.exports.timBangAnh = async (req, res) => {
  try {
    const uploadedPath = req.file && req.file.path ? String(req.file.path) : '';
    const result = await productsService.timBangAnhData(uploadedPath);
    return res.redirect((result && result.redirectUrl) || '/products?openclip_status=error');
  } catch (error) {
    console.error('Product image search error:', error);
    return res.redirect('/products?openclip_status=error');
  }
};
