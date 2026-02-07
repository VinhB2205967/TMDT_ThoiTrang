const danhgia = require('../models/review_model');
const chitietdonhang = require('../models/order_item_model');

async function buildProductStats(ids) {
  const safeIds = (ids || []).filter(Boolean);
  if (!safeIds.length) {
    return { ratingMap: new Map(), soldMap: new Map() };
  }

  const reviewAgg = await danhgia.aggregate([
    { $match: { sanpham_id: { $in: safeIds }, trangthai: 'approved', hienthi: true, daxoa: { $ne: true } } },
    { $group: { _id: '$sanpham_id', avg: { $avg: '$diem' }, count: { $sum: 1 } } }
  ]);

  const soldAgg = await chitietdonhang.aggregate([
    { $match: { sanpham_id: { $in: safeIds } } },
    { $lookup: { from: 'orders', localField: 'donhang_id', foreignField: '_id', as: 'order' } },
    { $unwind: '$order' },
    { $match: { 'order.trangthai': 'dagiao', 'order.daxoa': { $ne: true } } },
    { $group: { _id: '$sanpham_id', orders: { $addToSet: '$order._id' } } },
    { $project: { sold: { $size: '$orders' } } }
  ]);

  return {
    ratingMap: new Map(reviewAgg.map((r) => [String(r._id), r])),
    soldMap: new Map(soldAgg.map((r) => [String(r._id), r]))
  };
}

function applyProductStats(products, ratingMap, soldMap) {
  return (products || []).map((p) => {
    const r = ratingMap.get(String(p._id));
    const s = soldMap.get(String(p._id));
    const avg = r && Number.isFinite(r.avg) ? Math.round(r.avg * 10) / 10 : 0;
    return {
      ...p,
      avgRating: avg,
      reviewCount: r ? r.count : 0,
      soldCount: s ? s.sold : 0,
      danhgia: avg
    };
  });
}

module.exports = {
  buildProductStats,
  applyProductStats
};
