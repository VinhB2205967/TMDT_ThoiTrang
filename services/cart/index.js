const cartItemService = require('./cart-item.service');
const checkoutService = require('./checkout.service');
const paymentCallbackService = require('./payment-callback.service');

function applyFlashMessage(flashFn, flash) {
  if (!flash || typeof flashFn !== 'function') return;
  flashFn(flash.type || 'info', flash.message || '');
}

function resolveServiceErrorMessage(error, fallback) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

function resolveRedirectResult(result, fallback) {
  if (!result || typeof result !== 'object') return fallback;
  if (result.ok === false) return result.redirect || fallback;
  return result.redirect || fallback;
}

function resolveJsonResult(result, { status = 200, json = {} } = {}) {
  if (!result || typeof result !== 'object') {
    return { status, json };
  }

  return {
    status: result.status || status,
    json: result.json || json
  };
}

module.exports = {
  applyFlashMessage,
  resolveServiceErrorMessage,
  resolveRedirectResult,
  resolveJsonResult,
  ...cartItemService,
  ...checkoutService,
  ...paymentCallbackService
};
