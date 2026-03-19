const { runDbScript } = require('./_lib/run-with-db');
const Sanpham = require('../models/product_model');
const { tinhTongTon } = require('../services/catalog/productStock.service.js');

runDbScript(async () => {
  let total = 0;
  let updated = 0;

  const cursor = Sanpham.find({}).cursor();
  for await (const doc of cursor) {
    total += 1;

    const computed = Number(tinhTongTon(doc.toObject())) || 0;
    const current = Number(doc.soluongton || 0) || 0;

    if (computed !== current) {
      doc.soluongton = computed;
      doc.ngaycapnhat = new Date();
      await doc.save();
      updated += 1;
    }
  }

  console.log('[sync-product-stock] total:', total);
  console.log('[sync-product-stock] updated soluongton:', updated);
});
