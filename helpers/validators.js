function normalizeString(value) {
  return String(value || '').trim();
}

function isValidEmail(email) {
  const e = normalizeString(email).toLowerCase();
  // Basic email validation (good enough for UI level)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function normalizePhone(phone) {
  let p = normalizeString(phone);
  // Keep + for +84, strip spaces/dashes/parentheses
  p = p.replace(/[\s\-().]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  // Digits only
  p = p.replace(/\D/g, '');
  return p;
}

function isValidPhoneVN(phone) {
  const p = normalizePhone(phone);
  if (!p) return true; // allow empty
  // Allow 09-11 digits total, usually starts with 0
  return /^0\d{9}$/.test(p);
}

function escapeRegex(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSafeImageUrl(url) {
  const u = normalizeString(url);
  if (!u) return true;
  if (u.startsWith('/')) return true;
  return /^https?:\/\//i.test(u);
}

module.exports = {
  normalizeString,
  isValidEmail,
  normalizePhone,
  isValidPhoneVN,
  escapeRegex,
  isSafeImageUrl
};
