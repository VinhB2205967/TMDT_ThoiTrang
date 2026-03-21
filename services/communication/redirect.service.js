function layRefererHopLe(req, fallback = '/') {
  const referer = String(req.get('referer') || '').trim();
  if (!referer || referer === 'back' || /\/back([/?#]|$)/i.test(referer)) return fallback;
  return referer;
}

function redirectBackOrDefault(req, res, fallback = '/') {
  return res.redirect(layRefererHopLe(req, fallback));
}

module.exports = {
  layRefererHopLe,
  redirectBackOrDefault
};
