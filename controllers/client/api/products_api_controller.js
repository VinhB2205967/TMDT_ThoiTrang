const productsService = require('../../../services/catalog/client-products.service');

module.exports.tuyChon = async (req, res) => {
  try {
    const data = await productsService.getTuyChonData(req.params.id);
    if (data && data.notFound) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });
    }

    return res.json(data);
  } catch (error) {
    console.error('products api options error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
