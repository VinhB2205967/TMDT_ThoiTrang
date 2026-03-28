const cartItemService = require('./cart-item.service');
const checkoutService = require('./checkout.service');
const paymentCallbackService = require('./payment-callback.service');

function apDungFlash(flashFn, flash) {
  if (!flash || typeof flashFn !== 'function') return;
  flashFn(flash.type || 'info', flash.message || '');
}

function layThongDiepLoi(error, fallback) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

function layRedirect(result, fallback) {
  if (!result || typeof result !== 'object') return fallback;
  if (result.ok === false) return result.redirect || fallback;
  return result.redirect || fallback;
}

function layJsonPhanHoi(result, { status = 200, json = {} } = {}) {
  if (!result || typeof result !== 'object') {
    return { status, json };
  }

  return {
    status: result.status || status,
    json: result.json || json
  };
}

module.exports = {
  apDungFlash,
  layThongDiepLoi,
  layRedirect,
  layJsonPhanHoi,
  ...cartItemService,
  ...checkoutService,
  ...paymentCallbackService
};

