const Setting = require('../../models/setting_model');
const { redirectBackOrDefault } = require('../../services/communication/redirect.service');

module.exports.getHomeSettings = async (req, res) => {
  const data = await Setting.find({ key: { $in: ['home_new_limit', 'home_best_limit', 'home_blog_limit'] } }).lean();
  const map = data.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
  return res.render('admin/pages/home/settings.pug', {
    titlePage: 'Cấu hình Trang chủ',
    settings: map
  });
};

module.exports.updateHomeSettings = async (req, res) => {
  const entries = [
    { key: 'home_new_limit', value: Number(req.body.home_new_limit || 8) },
    { key: 'home_best_limit', value: Number(req.body.home_best_limit || 8) },
    { key: 'home_blog_limit', value: Number(req.body.home_blog_limit || 6) }
  ];

  const bulk = entries.map((entry) => ({
    updateOne: {
      filter: { key: entry.key },
      update: { $set: { value: entry.value } },
      upsert: true
    }
  }));

  await Setting.bulkWrite(bulk);
  if (req.flash) req.flash('success', 'Cập nhật cấu hình thành công');
  return redirectBackOrDefault(req, res, '/admin/settings/home');
};
