require('dotenv').config();
const mongoose = require('mongoose');
const database = require('../config/database');
const Sanpham = require('../models/product_model');
const { tinhTongTon } = require('../services/productStock.service');

async function main() {
  await database.connect();

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

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.close();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
