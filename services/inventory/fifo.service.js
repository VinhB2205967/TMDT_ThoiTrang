const mongoose = require('mongoose');
const TonKhoLo = require('../../models/inventory_lot_model');
const { normalizeBienTheId } = require('../../helpers/importReceipt');
const { laLoaiKhongSize, resolveVariant } = require('./inventory.service');
// Dịch vụ này quản lý lớp FIFO cho tồn kho, giúp theo dõi chính xác lô hàng nào được nhập trước và xuất trước khi điều chỉnh tồn kho.
function taoDieuKienBienTheChoLo(rawVariantId) {
  const normalized = normalizeBienTheId(rawVariantId);
  if (!normalized) {
    return {
      $or: [
        { bientheid: null },
        { bientheid: { $exists: false } }
      ]
    };
  }

  if (!mongoose.Types.ObjectId.isValid(String(normalized))) {
    throw new Error('Biến thể không hợp lệ');
  }

  return { bientheid: new mongoose.Types.ObjectId(String(normalized)) };
}

function taoDieuKienLo({ productDoc, line }) {
  const productId = String(line.sanphamid || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error('Sản phẩm không hợp lệ');
  }

  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const sizeKey = hasSize ? String(line.kichco || line.kich_co || '').trim() : '';
  if (hasSize && !sizeKey) throw new Error('Thiếu size cho sản phẩm có size');

  const variantCondition = taoDieuKienBienTheChoLo(line.bientheid || line.bien_the_id);

  return {
    sanphamid: new mongoose.Types.ObjectId(productId),
    kichco: String(sizeKey || ''),
    ...variantCondition
  };
}

async function tangLayerFIFO({ receiptDoc, productDoc, line, delta }) {
  const lotCondition = taoDieuKienLo({ productDoc, line });
  const latestLot = await TonKhoLo.findOne(lotCondition)
    .sort({ ngaynhap: -1, ngaytao: -1, _id: -1 })
    .select('gianhap giabandexuat')
    .lean();

  const resolved = resolveVariant(productDoc, line);
  const fallbackGiaBan = resolved.isMain
    ? Number(productDoc.gia || 0)
    : Number(resolved.variant?.gia || productDoc.gia || 0);

  const giaNhap = Number(latestLot?.gianhap || 0);
  const giaBanDeXuat = Number(latestLot?.giabandexuat || fallbackGiaBan || 0);

  const variantId = normalizeBienTheId(line.bientheid || line.bien_the_id);
  const variantObjectId = variantId && mongoose.Types.ObjectId.isValid(String(variantId))
    ? new mongoose.Types.ObjectId(String(variantId))
    : null;

  await TonKhoLo.create({
    phieunhap_id: receiptDoc._id,
    maphieunhap: String(receiptDoc.maphieu || ''),
    ngaynhap: new Date(),
    nhacungcap: 'Điều chỉnh kho',
    sanphamid: lotCondition.sanphamid,
    bientheid: variantObjectId,
    kichco: lotCondition.kichco,
    mausac: String(line.mausac || '').trim(),
    gianhap: giaNhap,
    giabandexuat: giaBanDeXuat,
    soluongnhap: Number(delta),
    soluongconlai: Number(delta),
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });
}

async function giamLayerFIFO({ productDoc, line, delta }) {
  let remaining = Math.abs(Number(delta || 0));
  if (!remaining) return;

  const lotCondition = taoDieuKienLo({ productDoc, line });
  const lots = await TonKhoLo.find({
    ...lotCondition,
    soluongconlai: { $gt: 0 }
  }).sort({ ngaynhap: -1, ngaytao: -1, _id: -1 });

  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.soluongconlai || 0);
    if (available <= 0) continue;

    const take = Math.min(remaining, available);
    lot.soluongconlai = available - take;
    lot.ngaycapnhat = new Date();
    await lot.save();
    remaining -= take;
  }

  // Cho phép tồn âm trên sản phẩm mà không tạo lot âm.
}

module.exports = {
  tangLayerFIFO,
  giamLayerFIFO
};