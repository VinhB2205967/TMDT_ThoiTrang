const ordersAdminService = require('../../../services/order/admin-orders.service.js');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.tongQuanDonMoi = async (req, res) => {
  try {
    const data = await ordersAdminService.getTongQuanDonMoiData();
    return traJsonThanhCong(res, {
      status: 200,
      data: {
        count: Number(data.count || 0),
        latestOrder: data.latestOrder || null
      }
    });
  } catch (error) {
    console.error('orders.api.tongQuanDonMoi error:', error);
    return traJsonThatBai(res, { status: 500, code: 'ORDERS_NEW_SUMMARY_FAILED', message: 'Khong the lay so luong don moi' });
  }
};
