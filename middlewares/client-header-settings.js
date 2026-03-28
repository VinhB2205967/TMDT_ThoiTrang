const { layCauHinhHeaderClient } = require('../services/content/client-header-settings.service');

const DEFAULT_HEADER = {
  name: 'Fashion Store',
  logo: ''
};

let cache = {
  expiresAt: 0,
  data: DEFAULT_HEADER
};

function xoaCacheHeaderClient() {
  cache = {
    expiresAt: 0,
    data: DEFAULT_HEADER
  };
}

async function ganCauHinhHeaderClient(req, res, next) {
  try {
    const now = Date.now();
    if (cache.expiresAt <= now) {
      const data = await layCauHinhHeaderClient();
      cache = {
        expiresAt: now + 5 * 60 * 1000,
        data: data || DEFAULT_HEADER
      };
    }
    res.locals.clientHeader = cache.data;
  } catch {
    res.locals.clientHeader = DEFAULT_HEADER;
  }
  next();
}

module.exports = {
  ganCauHinhHeaderClient,
  xoaCacheHeaderClient
};

