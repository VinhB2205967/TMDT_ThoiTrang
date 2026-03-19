const sanpham = require('../models/product_model');
const { laLoaiKhongSize, tinhTongTon } = require('./productStock.service');
const {
  consumeLotsFIFO,
  resolveSuggestedPriceAfterConsume,
  applySuggestedPriceToProductDoc
} = require('./exportReceipt.service');

async function truTonTheoItem(item) {
  const idsanpham = item.sanpham_id;
  const idbienthe = item.bienthe_id;
  const kichco = item.kichco;
  const soluong = item.soluong || 1;

  const sanphamdoc = await sanpham.findById(idsanpham);
  if (!sanphamdoc) throw new Error('Sản phẩm không tồn tại');

  const variantId = idbienthe ? String(idbienthe) : null;
  const sizeKey = String(kichco || '').trim();
  let fifoAllocations = [];

  try {
    const fifoCost = await consumeLotsFIFO({
      productId: String(idsanpham),
      variantId,
      size: sizeKey,
      qty: soluong
    });

    fifoAllocations = Array.isArray(fifoCost?.allocations)
      ? fifoCost.allocations.map((a) => ({
        lotId: String(a?.lotId || ''),
        soLuong: Number(a?.soLuong || 0),
        giaNhap: Number(a?.giaNhap || 0),
        giaBanDeXuat: Number(a?.giaBanDeXuat || 0)
      })).filter((a) => a.soLuong > 0)
      : [];

    const suggestedPrice = await resolveSuggestedPriceAfterConsume({
      productId: String(idsanpham),
      variantId,
      size: sizeKey,
      allocations: fifoCost?.allocations || []
    });

    applySuggestedPriceToProductDoc(sanphamdoc, {
      variantId,
      suggestedPrice
    });
  } catch {
    // Compatibility fallback: proceed with product-stock deduction when lots are legacy/incomplete.
  }

  const tonggoc = (typeof sanphamdoc.soluongton === 'number') ? sanphamdoc.soluongton : tinhTongTon(sanphamdoc);

  const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);

  if (!idbienthe) {
    if (cosize) {
      const dong = (sanphamdoc.sizes || []).find((s) => s.size === kichco);
      if (!dong || dong.soluong < soluong) throw new Error('Không đủ hàng');
      dong.soluong -= soluong;
    } else {
      if ((sanphamdoc.soluong_chinh || 0) < soluong) throw new Error('Không đủ hàng');
      sanphamdoc.soluong_chinh = (sanphamdoc.soluong_chinh || 0) - soluong;
    }

    sanphamdoc.soluongton = Math.max(0, tonggoc - soluong);
    await sanphamdoc.save();
    return {
      fifoAllocations,
      fifoApplied: fifoAllocations.length > 0
    };
  }

  const bienthe = (sanphamdoc.bienthe || []).id(idbienthe);
  if (!bienthe) throw new Error('Biến thể không tồn tại');

  if (cosize) {
    const dong = (bienthe.sizes || []).find((s) => s.size === kichco);
    if (!dong || dong.soluong < soluong) throw new Error('Không đủ hàng');
    dong.soluong -= soluong;
  } else {
    if ((bienthe.soluong || 0) < soluong) throw new Error('Không đủ hàng');
    bienthe.soluong = (bienthe.soluong || 0) - soluong;
  }

  sanphamdoc.soluongton = Math.max(0, tonggoc - soluong);
  await sanphamdoc.save();

  return {
    fifoAllocations,
    fifoApplied: fifoAllocations.length > 0
  };
}

module.exports = {
  truTonTheoItem
};


