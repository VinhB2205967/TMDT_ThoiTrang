function chuanHoaChuoi(value) {
  return String(value || '').trim();
}

function laEmailHopLe(email) {
  const e = chuanHoaChuoi(email).toLowerCase();
  // Basic email validation (good enough for UI level)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function chuanHoaSoDienThoai(phone) {
  let p = chuanHoaChuoi(phone);
  // Keep + for +84, strip spaces/dashes/parentheses
  p = p.replace(/[\s\-().]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  // Digits only
  p = p.replace(/\D/g, '');
  return p;
}

function laSoDienThoaiVN(phone) {
  const p = chuanHoaSoDienThoai(phone);
  if (!p) return true; // allow empty
  // Allow 09-11 digits total, usually starts with 0
  return /^0\d{9}$/.test(p);
}

function thoatBieuThuc(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function laUrlAnhAnToan(url) {
  const u = chuanHoaChuoi(url);
  if (!u) return true;
  if (u.startsWith('/')) return true;
  return /^https?:\/\//i.test(u);
}

module.exports = {
  chuanHoaChuoi,
  laEmailHopLe,
  chuanHoaSoDienThoai,
  laSoDienThoaiVN,
  thoatBieuThuc,
  laUrlAnhAnToan
};
