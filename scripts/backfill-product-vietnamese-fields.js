require('dotenv').config();
const mongoose = require('mongoose');

const database = require('../config/database');
const Product = require('../models/product_model');

async function run() {
  await database.connect();

  const docs = await Product.find({}).select('_id category danhmuc_id sizeguide_id bangsize_id occasion dip_sudung_id ageGroup nhomtuoi_id brand thuonghieu thuonghieu_id').lean();

  if (!docs.length) {
    console.log('Khong co san pham de cap nhat.');
    await mongoose.connection.close();
    return;
  }

  const ops = docs.map((doc) => {
    const $set = {
      danhmuc_id: doc.danhmuc_id || doc.category || null,
      bangsize_id: doc.bangsize_id || doc.sizeguide_id || null,
      dip_sudung_id: doc.dip_sudung_id || doc.occasion || null,
      nhomtuoi_id: doc.nhomtuoi_id || doc.ageGroup || null,
      thuonghieu: doc.thuonghieu || doc.brand || doc.thuonghieu_id || null,
      category: doc.category || doc.danhmuc_id || null,
      sizeguide_id: doc.sizeguide_id || doc.bangsize_id || null,
      occasion: doc.occasion || doc.dip_sudung_id || null,
      ageGroup: doc.ageGroup || doc.nhomtuoi_id || null,
      brand: doc.brand || doc.thuonghieu || doc.thuonghieu_id || null,
      thuonghieu_id: doc.thuonghieu_id || doc.thuonghieu || doc.brand || null,
      ngaycapnhat: new Date()
    };

    return {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set }
      }
    };
  });

  const result = await Product.bulkWrite(ops, { ordered: false });
  console.log(`Backfill xong. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Backfill loi:', error);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
