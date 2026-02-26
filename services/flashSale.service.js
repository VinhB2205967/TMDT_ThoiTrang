const FlashSale = require('../models/flash_sale_model');
const Sanpham = require('../models/product_model');

function tinhGiaFlash(giaGoc, phanTram) {
  if (!Number.isFinite(giaGoc)) return null;
  const discount = Number(phanTram) || 0;
  const giaMoi = Math.round(giaGoc * (100 - discount) / 100);
  return giaMoi;
}

async function getFlashSaleActive() {
  const now = new Date();
  const sale = await FlashSale.findOne({
    hienthi: true,
    batdau: { $lte: now },
    ketthuc: { $gte: now }
  }).sort({ batdau: -1 }).lean();

  if (!sale) return null;

  const items = Array.isArray(sale.sanpham) ? sale.sanpham : [];
  const ids = items.map((i) => i.sanpham_id).filter(Boolean);
  if (!ids.length) return { sale, products: [] };

  const products = await Sanpham.find({
    _id: { $in: ids },
    trangthai: 'dangban',
    daxoa: false
  }).lean();

  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const ordered = items.map((item) => {
    const p = productMap.get(String(item.sanpham_id));
    if (!p) return null;

    const giaGoc = Number(p.gia) || 0;
    const flashGia = Number(item.giagiam) || tinhGiaFlash(giaGoc, sale.phantramgiamgia);

    return {
      ...p,
      flashSalePrice: flashGia || 0,
      flashSalePercent: sale.phantramgiamgia || 0,
      flashSaleId: sale._id
    };
  }).filter(Boolean);

  return { sale, products: ordered };
}

module.exports = {
  getFlashSaleActive
};
