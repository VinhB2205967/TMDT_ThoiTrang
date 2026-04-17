const { NO_SIZE_TYPES } = require('../../config/constants');

function laLoaiKhongSize(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}

function resolveVariant(productDoc, line) {
  const variantId = line.bientheid ? String(line.bientheid) : (line.bien_the_id ? String(line.bien_the_id) : '');
  let isMain = !variantId || variantId === 'main';
  let variant = null;

  if (!isMain) {
    variant = (productDoc.bienthe || []).find((v) => String(v._id) === variantId) || null;
    if (!variant) isMain = true;
  }

  if (isMain) {
    const color = String(line.mausac || line.mau_sac || '').trim().toLowerCase();
    if (color) {
      variant = (productDoc.bienthe || []).find((v) => String(v.mausac || '').trim().toLowerCase() === color) || null;
      if (variant) isMain = false;
    }
  }

  return { isMain, variant };
}

function readCurrentStock(productDoc, line, preResolved = null) {
  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const resolved = preResolved || resolveVariant(productDoc, line);
  const { isMain, variant } = resolved;

  if (hasSize) {
    const size = String(line.kichco || line.kich_co || '').trim();
    if (!size) throw new Error('Thiếu size cho sản phẩm có size');

    if (isMain) {
      const rows = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const item = rows.find((s) => String(s.size) === size);
      return Number(item?.soluong || 0);
    }

    const rows = Array.isArray(variant?.sizes) ? variant.sizes : [];
    const item = rows.find((s) => String(s.size) === size);
    return Number(item?.soluong || 0);
  }

  if (isMain) return Number(productDoc.soluong_chinh || 0);
  return Number(variant?.soluong || 0);
}

function applyAdjustmentToProductDoc(productDoc, line, deltaQty) {
  const delta = Number(deltaQty || 0);
  if (!Number.isFinite(delta) || delta === 0) throw new Error('Số lượng điều chỉnh không hợp lệ');

  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const resolved = resolveVariant(productDoc, line);
  const { isMain, variant } = resolved;

  if (!isMain && !variant) throw new Error('Biến thể không tồn tại');

  if (hasSize) {
    const size = String(line.kichco || line.kich_co || '').trim();
    if (!size) throw new Error('Thiếu size cho sản phẩm có size');

    if (isMain) {
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const row = productDoc.sizes.find((s) => String(s.size) === size);
      const before = Number(row?.soluong || 0);
      const after = before + delta;
      if (after < 0) throw new Error('Tồn kho không thể âm sau điều chỉnh');
      if (row) row.soluong = after;
      else productDoc.sizes.push({ size, soluong: after });
      return { before, after, color: productDoc.mausac_chinh || '' };
    }

    variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const row = variant.sizes.find((s) => String(s.size) === size);
    const before = Number(row?.soluong || 0);
    const after = before + delta;
    if (after < 0) throw new Error('Tồn kho không thể âm sau điều chỉnh');
    if (row) row.soluong = after;
    else variant.sizes.push({ size, soluong: after });
    return { before, after, color: variant.mausac || '' };
  }

  if (isMain) {
    const before = Number(productDoc.soluong_chinh || 0);
    const after = before + delta;
    if (after < 0) throw new Error('Tồn kho không thể âm sau điều chỉnh');
    productDoc.soluong_chinh = after;
    return { before, after, color: productDoc.mausac_chinh || '' };
  }

  const before = Number(variant.soluong || 0);
  const after = before + delta;
  if (after < 0) throw new Error('Tồn kho không thể âm sau điều chỉnh');
  variant.soluong = after;
  return { before, after, color: variant.mausac || '' };
}

module.exports = {
  laLoaiKhongSize,
  resolveVariant,
  readCurrentStock,
  applyAdjustmentToProductDoc
};
