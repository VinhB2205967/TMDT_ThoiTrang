const FlashSale = require('../../models/flash_sale_model');
const Sanpham = require('../../models/product_model');

function tinhGiaFlash(giaGoc, phanTram) {
  if (!Number.isFinite(giaGoc)) return null;
  const discount = Number(phanTram) || 0;
  const giaMoi = Math.round(giaGoc * (100 - discount) / 100);
  return giaMoi;
}

async function dongBoTrangThaiFlashSale(now = new Date()) {
  // Không tự bật lại flash sale đã bị admin tắt tay.
  // Chỉ tự tắt các flash sale đã hết hạn để tránh tiếp tục áp giá.
  await FlashSale.updateMany(
    {
      hienthi: true,
      ketthuc: { $lte: now }
    },
    { $set: { hienthi: false } }
  );
}

async function layFlashSaleDangChay(now = new Date()) {
  await dongBoTrangThaiFlashSale(now);
  return FlashSale.findOne({
    hienthi: true,
    batdau: { $lte: now },
    ketthuc: { $gt: now }
  }).sort({ batdau: -1 }).lean();
}

async function getFlashSalePercentMap(productIds = []) {
  const sale = await layFlashSaleDangChay();
  const result = new Map();
  if (!sale || !Array.isArray(productIds) || !productIds.length) return result;

  const flashIds = new Set(
    (sale.sanpham || [])
      .map((item) => item && item.sanpham_id ? String(item.sanpham_id) : null)
      .filter(Boolean)
  );

  const percent = Number(sale.phantramgiamgia) || 0;
  if (percent <= 0) return result;

  productIds.forEach((id) => {
    const key = String(id || '');
    if (key && flashIds.has(key)) result.set(key, percent);
  });

  return result;
}

async function getFlashSaleActive() {
  const sale = await layFlashSaleDangChay();

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
    const flashGia = tinhGiaFlash(giaGoc, sale.phantramgiamgia);

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
  getFlashSaleActive,
  getFlashSalePercentMap,
  tinhGiaFlash
};

