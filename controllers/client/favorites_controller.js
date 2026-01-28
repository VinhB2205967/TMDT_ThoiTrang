const sanpham = require("../../models/product_model");
const productHelper = require("../../helpers/product");
const yeuthich = require("../../models/favorite_model");
const { muonJSON } = require('../../helpers/http');

// Danh sách
module.exports.danhSach = async (req, res) => {
  const danhsachyeuthich = await yeuthich.find({ nguoidung_id: req.user._id })
    .sort({ ngaythem: -1 })
    .select('sanpham_id')
    .lean();

  const danhsachidyeuthich = (danhsachyeuthich || []).map(f => String(f.sanpham_id));

  let danhsachsanpham = [];
  if (danhsachidyeuthich.length) {
    const danhsachtimthay = await sanpham.find({
      _id: { $in: danhsachidyeuthich },
      daxoa: { $ne: true },
      trangthai: 'dangban'
    }).lean();

    const maptheoid = new Map((danhsachtimthay || []).map(p => [String(p._id), productHelper(p)]));
    danhsachsanpham = danhsachidyeuthich.map(id => maptheoid.get(id)).filter(Boolean);
  }

  res.render('client/pages/favorites/index', {
    titlePage: 'Sản phẩm yêu thích',
    products: danhsachsanpham
  });
};

// Ids
module.exports.layIds = async (req, res) => {
  const danhsachyeuthich = await yeuthich.find({ nguoidung_id: req.user._id })
    .select('sanpham_id')
    .lean();
  const danhsachid = (danhsachyeuthich || []).map(f => String(f.sanpham_id));
  return res.json({ success: true, ids: danhsachid });
};

// Thêm
module.exports.them = async (req, res) => {
  const idSanPham = req.params.id;
  await yeuthich.updateOne(
    { nguoidung_id: req.user._id, sanpham_id: idSanPham },
    { $setOnInsert: { nguoidung_id: req.user._id, sanpham_id: idSanPham, ngaythem: new Date() } },
    { upsert: true }
  );
  return res.json({ success: true, active: true, message: 'Đã thêm vào yêu thích' });
};

// Xóa
module.exports.xoa = async (req, res) => {
  const idSanPham = req.params.id;
  await yeuthich.deleteOne({ nguoidung_id: req.user._id, sanpham_id: idSanPham });
  return res.json({ success: true, active: false, message: 'Đã xóa khỏi yêu thích' });
};

// Bật/Tắt yêu thích
module.exports.batTat = async (req, res) => {
  try {
    const idSanPham = req.params.id;

    const tontai = await yeuthich.findOne({ nguoidung_id: req.user._id, sanpham_id: idSanPham }).select('_id').lean();
    if (tontai) {
      await yeuthich.deleteOne({ _id: tontai._id });
      return res.json({ success: true, active: false });
    }

    await yeuthich.create({ nguoidung_id: req.user._id, sanpham_id: idSanPham });
    return res.json({ success: true, active: true });
  } catch (error) {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/favorites');
  }
};
