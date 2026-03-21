const SHIPPING_CONFIG = require('../../config/shipping');

module.exports.index = async (req, res) => {
  res.render('client/pages/vouchers/index.pug', {
    titlePage: 'Voucher',
    shippingConfig: SHIPPING_CONFIG
  });
};
