const SHIPPING_CONFIG = {
  freeShipThreshold: 500000,
  regions: {
    noithanh: { label: 'Nội thành', fee: 30000 },
    ngoaithanh: { label: 'Ngoại thành', fee: 30000 },
    tinhkhac: { label: 'Tỉnh khác', fee: 30000 }
  },
  defaultRegion: 'noithanh'
};

module.exports = SHIPPING_CONFIG;
