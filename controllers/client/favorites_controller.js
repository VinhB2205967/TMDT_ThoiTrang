const Sanpham = require("../../models/product_model");
const productHelper = require("../../helpers/product");
const Yeuthich = require("../../models/favorite_model");

function muonJSON(req) {
  const chapNhan = String(req.headers.accept || '');
  return req.xhr || chapNhan.includes('application/json') || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
}

// Danh sách
module.exports.danhSach = async (req, res) => {
  const danhSachYeuThich = await Yeuthich.find({ nguoidung_id: req.user._id })
    .sort({ ngaythem: -1 })
    .select('sanpham_id')
    .lean();

  const danhSachIdYeuThich = (danhSachYeuThich || []).map(f => String(f.sanpham_id));

  let danhSachSanPham = [];
  if (danhSachIdYeuThich.length) {
    const danhSachTimThay = await Sanpham.find({
      _id: { $in: danhSachIdYeuThich },
      daxoa: { $ne: true },
      trangthai: 'dangban'
    }).lean();

    const mapTheoId = new Map((danhSachTimThay || []).map(p => [String(p._id), productHelper(p)]));
    danhSachSanPham = danhSachIdYeuThich.map(id => mapTheoId.get(id)).filter(Boolean);
  }

  res.render('client/pages/favorites/index', {
    titlePage: 'Sản phẩm yêu thích',
    products: danhSachSanPham
  });
};

// Ids
module.exports.layIds = async (req, res) => {
  const danhSachYeuThich = await Yeuthich.find({ nguoidung_id: req.user._id })
    .select('sanpham_id')
    .lean();
  const danhSachId = (danhSachYeuThich || []).map(f => String(f.sanpham_id));
  return res.json({ success: true, ids: danhSachId });
};

// Thêm
module.exports.them = async (req, res) => {
  const idSanPham = req.params.id;
  await Yeuthich.updateOne(
    { nguoidung_id: req.user._id, sanpham_id: idSanPham },
    { $setOnInsert: { nguoidung_id: req.user._id, sanpham_id: idSanPham, ngaythem: new Date() } },
    { upsert: true }
  );
  return res.json({ success: true, active: true, message: 'Đã thêm vào yêu thích' });
};

// Xóa
module.exports.xoa = async (req, res) => {
  const idSanPham = req.params.id;
  await Yeuthich.deleteOne({ nguoidung_id: req.user._id, sanpham_id: idSanPham });
  return res.json({ success: true, active: false, message: 'Đã xóa khỏi yêu thích' });
};

// Bật/Tắt yêu thích
module.exports.batTat = async (req, res) => {
  try {
    const idSanPham = req.params.id;

    const tonTai = await Yeuthich.findOne({ nguoidung_id: req.user._id, sanpham_id: idSanPham }).select('_id').lean();
    if (tonTai) {
      await Yeuthich.deleteOne({ _id: tonTai._id });
      return res.json({ success: true, active: false });
    }

    await Yeuthich.create({ nguoidung_id: req.user._id, sanpham_id: idSanPham });
    return res.json({ success: true, active: true });
  } catch (error) {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/favorites');
  }
};
