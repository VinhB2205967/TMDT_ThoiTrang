const { validationResult } = require('express-validator');
const { laYeuCauApi, traJsonThatBai } = require('../services/communication/hybrid-response.service');
const { redirectBackOrDefault } = require('../services/communication/redirect.service');

function validateRequest(options = {}) {
  const {
    redirectTo = '/',
    errorMessage = 'Dữ liệu không hợp lệ',
    preserveFields = []
  } = options;

  return function (req, res, next) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const first = errors.array({ onlyFirstError: true })[0];
    const message = first?.msg || errorMessage;

    if (laYeuCauApi(req)) {
      return traJsonThatBai(res, {
        status: 422,
        code: 'VALIDATION_ERROR',
        message,
        errors: errors.array()
      });
    }

    if (req.flash) req.flash('error', message);

    if (req.flash && Array.isArray(preserveFields) && preserveFields.length > 0) {
      const payload = {};
      preserveFields.forEach((field) => {
        payload[field] = req.body && req.body[field] !== undefined ? req.body[field] : '';
      });
      req.flash('formData', JSON.stringify(payload));
    }

    return redirectBackOrDefault(req, res, redirectTo);
  };
}

module.exports = { validateRequest };