const productsAdminService = require('../../../services/catalog/admin-products.service.js');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.doiTrangThai = async (req, res) => {
  try {
    const status = req.body && req.body.status;
    const result = await productsAdminService.doiTrangThaiSanPham(req.params.id, status);

    if (!result || !result.ok) {
      return traJsonThatBai(res, {
        status: 400,
        code: 'PRODUCT_STATUS_UPDATE_FAILED',
        message: (result && result.message) || 'Không thể thay đổi trạng thái'
      });
    }

    return traJsonThanhCong(res, {
      status: 200,
      message: result.message || 'Cập nhật trạng thái sản phẩm thành công'
    });
  } catch (error) {
    console.error('products.api.doiTrangThai error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'PRODUCT_STATUS_UPDATE_FAILED',
      message: 'Không thể thay đổi trạng thái'
    });
  }
};
