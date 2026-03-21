const ordersService = require('../../../services/order/client-orders.service');

module.exports.kiemTraThanhToan = async (req, res) => {
  try {
    const result = await ordersService.checkOrderPaymentStatus({
      userId: req.user._id,
      orderId: req.params.id
    });

    return res.status(result.status || 200).json(result.payload || { success: false, paid: false });
  } catch {
    return res.status(200).json({ success: false, paid: false });
  }
};
