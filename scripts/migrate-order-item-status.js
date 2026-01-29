require('dotenv').config();
const mongoose = require('mongoose');
const database = require('../config/database');
const Chitietdonhang = require('../models/order_item_model');

async function main() {
  await database.connect();

  const pending = await Chitietdonhang.updateMany(
    { trangthai: 'pending' },
    { $set: { trangthai: 'choxuly' } }
  );

  const cancelled = await Chitietdonhang.updateMany(
    { trangthai: 'cancelled' },
    { $set: { trangthai: 'dahuy' } }
  );

  const pendingCount = Number(pending?.modifiedCount || pending?.nModified || 0);
  const cancelledCount = Number(cancelled?.modifiedCount || cancelled?.nModified || 0);

  console.log('[migrate-order-item-status] updated pending -> choxuly:', pendingCount);
  console.log('[migrate-order-item-status] updated cancelled -> dahuy:', cancelledCount);

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
