const Banner = require('../../models/banner_model');

module.exports.danhSach = async (req, res) => {
  const data = await Banner.find({}).sort({ thuTu: 1, ngaytao: -1 }).lean();
  const want = req.accepts(['html', 'json']);
  if (want === 'html') {
    return res.render('admin/pages/home/banners.pug', {
      titlePage: 'Quản lý Banner',
      banners: data,
      bannerTypes: ['collection', 'sale', 'lookbook', 'general']
    });
  }
  return res.json({ success: true, data });
};

module.exports.taoMoi = async (req, res) => {
  const image = req.file?.filename ? `/uploads/banners/${req.file.filename}` : (req.body.hinhanh || '');
  if (!image) return res.status(400).json({ success: false, message: 'Thiếu hình ảnh' });

  const payload = {
    tieude: req.body.tieude,
    mota: req.body.mota,
    hinhanh: image,
    nut_text: req.body.nut_text,
    nut_link: req.body.nut_link,
    loai: req.body.loai || 'general',
    hienthi: req.body.hienthi !== undefined ? String(req.body.hienthi) === 'true' || req.body.hienthi === true : true,
    thuTu: Number(req.body.thuTu || 0)
  };

  const data = await Banner.create(payload);
  res.json({ success: true, data });
};

module.exports.capNhat = async (req, res) => {
  const payload = {};
  if (req.body.tieude !== undefined) payload.tieude = req.body.tieude;
  if (req.body.mota !== undefined) payload.mota = req.body.mota;
  if (req.body.nut_text !== undefined) payload.nut_text = req.body.nut_text;
  if (req.body.nut_link !== undefined) payload.nut_link = req.body.nut_link;
  if (req.body.loai !== undefined) payload.loai = req.body.loai;
  if (req.body.hienthi !== undefined) payload.hienthi = String(req.body.hienthi) === 'true' || req.body.hienthi === true;
  if (req.body.thuTu !== undefined) payload.thuTu = Number(req.body.thuTu || 0);

  if (req.file?.filename) {
    payload.hinhanh = `/uploads/banners/${req.file.filename}`;
  }

  const data = await Banner.findByIdAndUpdate(req.params.id, payload, { new: true });
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data });
};

module.exports.xoa = async (req, res) => {
  const data = await Banner.findByIdAndDelete(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true });
};

module.exports.batTat = async (req, res) => {
  const data = await Banner.findById(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  data.hienthi = !data.hienthi;
  await data.save();
  res.json({ success: true, data });
};
