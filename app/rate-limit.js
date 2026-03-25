const rateLimit = require('express-rate-limit');

function createRateLimiters() {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  });

  const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  });

  return { limiter, authLimiter };
}

module.exports = {
  createRateLimiters
};
