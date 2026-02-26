const FlashSale = require('../../models/flash_sale_model');
const Sanpham = require('../../models/product_model');

module.exports.danhSach = async (req, res) => {
  const data = await FlashSale.find({}).sort({ batdau: -1 }).lean();
  const want = req.accepts(['html', 'json']);
  if (want === 'html') {
    const products = await Sanpham.find({ daxoa: { $ne: true }, trangthai: 'dangban' })
      .sort({ ngaytao: -1 })
      .limit(50)
      .lean();
    return res.render('admin/pages/home/flash_sales.pug', {
      titlePage: 'Quản lý Flash Sale',
      flashSales: data,
      products
    });
  }
  return res.json({ success: true, data });
};

module.exports.taoMoi = async (req, res) => {
  const payload = {
    ten: req.body.ten,
    batdau: req.body.batdau,
    ketthuc: req.body.ketthuc,
    hienthi: req.body.hienthi !== undefined ? Boolean(req.body.hienthi) : true,
    phantramgiamgia: Number(req.body.phantramgiamgia || 0),
    sanpham: Array.isArray(req.body.sanpham) ? req.body.sanpham : []
  };

  const data = await FlashSale.create(payload);
  res.json({ success: true, data });
};

module.exports.capNhat = async (req, res) => {
  const payload = {
    ten: req.body.ten,
    batdau: req.body.batdau,
    ketthuc: req.body.ketthuc,
    hienthi: req.body.hienthi,
    phantramgiamgia: req.body.phantramgiamgia,
    sanpham: req.body.sanpham
  };

  const data = await FlashSale.findByIdAndUpdate(req.params.id, payload, { new: true });
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data });
};

module.exports.xoa = async (req, res) => {
  const data = await FlashSale.findByIdAndDelete(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true });
};

module.exports.batTat = async (req, res) => {
  const data = await FlashSale.findById(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  data.hienthi = !data.hienthi;
  await data.save();
  res.json({ success: true, data });
};
