const Donhang = require('../../../models/order_model');
const Chitietdonhang = require('../../../models/order_item_model');

module.exports.listMyOrders = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
    const skip = (page - 1) * limit;
    const status = String(req.query.status || '').trim();

    const filter = {
      nguoidung_id: req.user._id,
      daxoa: { $ne: true }
    };
    if (status) filter.trangthai = status;

    const [rows, total] = await Promise.all([
      Donhang.find(filter).sort({ ngaytao: -1 }).skip(skip).limit(limit).lean(),
      Donhang.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        items: (rows || []).map((o) => ({
          id: String(o._id),
          madonhang: String(o.madonhang || ''),
          trangthai: String(o.trangthai || ''),
          tongtien: Number(o.tongtien || 0),
          dathanhtoan: Boolean(o.dathanhtoan),
          phuongthucthanhtoan: String(o.phuongthucthanhtoan || ''),
          ngaytao: o.ngaytao || null
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (err) {
    console.error('orderApi.listMyOrders error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy danh sách đơn hàng' });
  }
};

module.exports.getOrderDetail = async (req, res) => {
  try {
    const orderId = String(req.params.id || '').trim();

    const order = await Donhang.findOne({ _id: orderId, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });

    const items = await Chitietdonhang.find({ donhang_id: order._id }).lean();

    return res.json({
      success: true,
      data: {
        order: {
          id: String(order._id),
          madonhang: String(order.madonhang || ''),
          trangthai: String(order.trangthai || ''),
          tongtien: Number(order.tongtien || 0),
          tamtinh: Number(order.tamtinh || 0),
          giamgia: Number(order.giamgia || 0),
          phivanchuyen: Number(order.phivanchuyen || 0),
          dathanhtoan: Boolean(order.dathanhtoan),
          phuongthucthanhtoan: String(order.phuongthucthanhtoan || ''),
          tennguoinhan: String(order.tennguoinhan || ''),
          sodienthoai: String(order.sodienthoai || ''),
          diachigiao: String(order.diachigiao || ''),
          ghichu: String(order.ghichu || ''),
          ngaytao: order.ngaytao || null
        },
        items: (items || []).map((i) => ({
          id: String(i._id),
          sanpham_id: i.sanpham_id ? String(i.sanpham_id) : null,
          bienthe_id: i.bienthe_id ? String(i.bienthe_id) : null,
          tensanpham: String(i.tensanpham || ''),
          hinhanh: String(i.hinhanh || '/images/shopping.png'),
          mausac: String(i.mausac || ''),
          kichco: i.kichco ? String(i.kichco) : null,
          giaban: Number(i.giaban || 0),
          soluong: Number(i.soluong || 0),
          thanhtien: Number(i.thanhtien || 0),
          trangthai: String(i.trangthai || '')
        }))
      }
    });
  } catch (err) {
    console.error('orderApi.getOrderDetail error:', err);
    return res.status(500).json({ success: false, message: 'Không thể lấy chi tiết đơn hàng' });
  }
};


