const Brand = require('../../models/brand_model');

module.exports.danhSach = async (req, res) => {
  const data = await Brand.find({}).sort({ thuTu: 1 }).lean();
  const want = req.accepts(['html', 'json']);
  if (want === 'html') {
    return res.render('admin/pages/home/brands.pug', {
      titlePage: 'Quản lý Thương hiệu',
      brands: data
    });
  }
  return res.json({ success: true, data });
};

module.exports.taoMoi = async (req, res) => {
  const logo = req.file?.filename ? `/uploads/brands/${req.file.filename}` : (req.body.logo || '');
  if (!logo) return res.status(400).json({ success: false, message: 'Thiếu logo' });
  const payload = {
    ten: req.body.ten,
    logo,
    hienthi: req.body.hienthi !== undefined ? String(req.body.hienthi) === 'true' || req.body.hienthi === true : true,
    noiBat: req.body.noiBat !== undefined ? String(req.body.noiBat) === 'true' || req.body.noiBat === true : false,
    thuTu: Number(req.body.thuTu || 0)
  };

  const data = await Brand.create(payload);
  res.json({ success: true, data });
};

module.exports.capNhat = async (req, res) => {
  const payload = {};
  if (req.body.ten !== undefined) payload.ten = req.body.ten;
  if (req.body.hienthi !== undefined) payload.hienthi = String(req.body.hienthi) === 'true' || req.body.hienthi === true;
  if (req.body.noiBat !== undefined) payload.noiBat = String(req.body.noiBat) === 'true' || req.body.noiBat === true;
  if (req.body.thuTu !== undefined) payload.thuTu = Number(req.body.thuTu || 0);
  if (req.file?.filename) payload.logo = `/uploads/brands/${req.file.filename}`;

  const data = await Brand.findByIdAndUpdate(req.params.id, payload, { new: true });
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data });
};

module.exports.xoa = async (req, res) => {
  const data = await Brand.findByIdAndDelete(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true });
};

module.exports.capNhatNoiBat = async (req, res) => {
  const data = await Brand.findById(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  data.noiBat = req.body.noiBat !== undefined ? Boolean(req.body.noiBat) : !data.noiBat;
  await data.save();
  res.json({ success: true, data });
};

module.exports.sapXep = async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const bulk = items.map((item) => ({
    updateOne: {
      filter: { _id: item.id },
      update: { $set: { thuTu: Number(item.thuTu || 0) } }
    }
  }));

  if (bulk.length) await Brand.bulkWrite(bulk);
  res.json({ success: true });
};
