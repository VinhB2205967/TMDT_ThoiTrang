const nhantrangthai = {
  all: 'T\u1ea5t c\u1ea3',
  choxacnhan: 'Ch\u1edd x\u00e1c nh\u1eadn',
  daxacnhan: '\u0110\u00e3 x\u00e1c nh\u1eadn',
  dangchuanbi: '\u0110ang chu\u1ea9n b\u1ecb',
  danggiao: '\u0110ang giao',
  dagiao: '\u0110\u00e3 giao',
  requested_return: 'Y\u00eau c\u1ea7u ho\u00e0n h\u00e0ng',
  approved_return: '\u0110\u00e3 duy\u1ec7t ho\u00e0n h\u00e0ng',
  rejected_return: 'T\u1eeb ch\u1ed1i ho\u00e0n h\u00e0ng',
  return_shipping: '\u0110ang g\u1eedi h\u00e0ng ho\u00e0n',
  returned: '\u0110\u00e3 nh\u1eadn h\u00e0ng ho\u00e0n',
  returned_full: '\u0110\u00e3 nh\u1eadn ho\u00e0n to\u00e0n b\u1ed9',
  returned_partial: '\u0110\u00e3 nh\u1eadn ho\u00e0n m\u1ed9t ph\u1ea7n',
  refunded: '\u0110\u00e3 ho\u00e0n ti\u1ec1n',
  dahuy: '\u0110\u00e3 h\u1ee7y',
  hoanhang: 'Ho\u00e0n h\u00e0ng',

  // Legacy aliases kept for backward compatibility.
  yeucau_hoanhang: 'Y\u00eau c\u1ea7u ho\u00e0n h\u00e0ng',
  daduyet_hoanhang: '\u0110\u00e3 duy\u1ec7t ho\u00e0n h\u00e0ng',
  tuchoi_hoanhang: 'T\u1eeb ch\u1ed1i ho\u00e0n h\u00e0ng',
  danggui_hanghoan: '\u0110ang g\u1eedi h\u00e0ng ho\u00e0n',
  danhan_hanghoan: '\u0110\u00e3 nh\u1eadn h\u00e0ng ho\u00e0n',
  dahoantien: '\u0110\u00e3 ho\u00e0n ti\u1ec1n'
};

function layTrangThaiChoPhep() {
  return [
    'all',
    'choxacnhan',
    'daxacnhan',
    'dangchuanbi',
    'danggiao',
    'dagiao',
    'requested_return',
    'approved_return',
    'rejected_return',
    'return_shipping',
    'returned',
    'returned_full',
    'returned_partial',
    'refunded',
    'dahuy',
    'hoanhang'
  ];
}

module.exports = {
  nhantrangthai,
  layTrangThaiChoPhep
};
