function muonJSON(req) {
  const chapNhan = String(req.headers.accept || '').toLowerCase();
  return (
    req.xhr ||
    chapNhan.includes('application/json') ||
    String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest'
  );
}

module.exports = {
  muonJSON
};
