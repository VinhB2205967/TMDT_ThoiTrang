function normalizeItems(bodyItems) {
  if (!bodyItems) return [];
  if (Array.isArray(bodyItems)) return bodyItems;
  return [bodyItems];
}

function normalizeBienTheId(raw) {
  const v = String(raw || '').trim();
  if (!v || v === 'main') return null;
  return v;
}

function toNumber(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function tinhTongTienNhap(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr.reduce((sum, it) => {
    if (!it) return sum;
    const qty = toNumber(it.soluong ?? it.so_luong ?? 0, 0);
    const price = toNumber(it.gianhap ?? it.gia_nhap ?? 0, 0);
    return sum + qty * price;
  }, 0);
}

module.exports = {
  normalizeItems,
  normalizeBienTheId,
  tinhTongTienNhap
};
