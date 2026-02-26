const HomeSection = require('../../models/home_section_model');
const { mergeSections } = require('../../services/home.service');

module.exports.danhSach = async (req, res) => {
  const sections = await HomeSection.find({}).sort({ thuTu: 1 }).lean();
  const data = mergeSections(sections);
  const want = req.accepts(['html', 'json']);
  if (want === 'html') {
    return res.render('admin/pages/home/home_sections.pug', {
      titlePage: 'Quản lý Trang chủ',
      sections: data
    });
  }
  return res.json({ success: true, data });
};

module.exports.capNhat = async (req, res) => {
  const data = await HomeSection.findOneAndUpdate({ key: req.params.key }, {
    tieuDe: req.body.tieuDe,
    hienthi: req.body.hienthi,
    thuTu: req.body.thuTu,
    config: req.body.config
  }, { new: true, upsert: true });

  res.json({ success: true, data });
};

module.exports.batTat = async (req, res) => {
  const data = await HomeSection.findOne({ key: req.params.key });
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  data.hienthi = !data.hienthi;
  await data.save();
  res.json({ success: true, data });
};

module.exports.sapXep = async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const bulk = items.map((item) => ({
    updateOne: {
      filter: { key: item.key },
      update: { $set: { thuTu: Number(item.thuTu || 0) } }
    }
  }));

  if (bulk.length) await HomeSection.bulkWrite(bulk);
  res.json({ success: true });
};
