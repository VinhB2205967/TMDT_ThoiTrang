const { runDbScript } = require('./_lib/run-with-db');
const Thanhtoan = require('../models/pay_model');

runDbScript(async () => {
  const pending = await Thanhtoan.updateMany(
    { trangthai: 'pending' },
    { $set: { trangthai: 'choduyet', ngaycapnhat: new Date() } }
  );

  const success = await Thanhtoan.updateMany(
    { trangthai: 'success' },
    { $set: { trangthai: 'thanhcong', ngaycapnhat: new Date() } }
  );

  const failed = await Thanhtoan.updateMany(
    { trangthai: 'failed' },
    { $set: { trangthai: 'thatbai', ngaycapnhat: new Date() } }
  );

  const refunded = await Thanhtoan.updateMany(
    { trangthai: 'refunded' },
    { $set: { trangthai: 'hoantien', ngaycapnhat: new Date() } }
  );

  const c = (r) => Number(r?.modifiedCount || r?.nModified || 0);
  console.log('[migrate-pay-status] pending -> choduyet:', c(pending));
  console.log('[migrate-pay-status] success -> thanhcong:', c(success));
  console.log('[migrate-pay-status] failed -> thatbai:', c(failed));
  console.log('[migrate-pay-status] refunded -> hoantien:', c(refunded));
});
