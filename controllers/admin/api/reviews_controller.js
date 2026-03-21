const Danhgia = require('../../../models/review_model');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.thongKe = async (req, res) => {
  try {
    const total = await Danhgia.countDocuments({ daxoa: { $ne: true } });
    const byStar = await Danhgia.aggregate([
      { $match: { daxoa: { $ne: true } } },
      { $group: { _id: '$diem', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);
    const hidden = await Danhgia.countDocuments({ daxoa: { $ne: true }, hienthi: false });

    return traJsonThanhCong(res, {
      status: 200,
      data: { total, hidden, byStar }
    });
  } catch (error) {
    console.error('reviews.api.thongKe error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'REVIEWS_STATS_FAILED',
      message: 'Không thể lấy thống kê'
    });
  }
};
