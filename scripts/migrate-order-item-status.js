const { runDbScript } = require('./_lib/run-with-db');
const Chitietdonhang = require('../models/order_item_model');

runDbScript(async () => {
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
});
