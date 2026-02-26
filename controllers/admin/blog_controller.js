const BlogPost = require('../../models/blog_model');

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

module.exports.danhSach = async (req, res) => {
  const data = await BlogPost.find({}).sort({ ngaytao: -1 }).lean();
  const want = req.accepts(['html', 'json']);
  if (want === 'html') {
    return res.render('admin/pages/home/blog.pug', {
      titlePage: 'Quản lý Blog',
      posts: data
    });
  }
  return res.json({ success: true, data });
};

module.exports.taoMoi = async (req, res) => {
  const slug = slugify(req.body.tieude || req.body.slug);
  const image = req.file?.filename ? `/uploads/blogs/${req.file.filename}` : (req.body.hinhanh || '');
  const payload = {
    tieude: req.body.tieude,
    slug,
    tomtat: req.body.tomtat,
    noidung: req.body.noidung,
    hinhanh: image,
    xuatban: req.body.xuatban !== undefined ? String(req.body.xuatban) === 'true' || req.body.xuatban === true : false,
    ngayxuatban: req.body.ngayxuatban || (req.body.xuatban ? new Date() : null)
  };

  const data = await BlogPost.create(payload);
  res.json({ success: true, data });
};

module.exports.capNhat = async (req, res) => {
  const payload = {};
  if (req.body.tieude !== undefined) payload.tieude = req.body.tieude;
  if (req.body.slug !== undefined && String(req.body.slug || '').trim() !== '') {
    payload.slug = slugify(req.body.slug);
  }
  if (req.body.tomtat !== undefined) payload.tomtat = req.body.tomtat;
  if (req.body.noidung !== undefined) payload.noidung = req.body.noidung;
  if (req.body.xuatban !== undefined) payload.xuatban = String(req.body.xuatban) === 'true' || req.body.xuatban === true;
  if (req.body.ngayxuatban !== undefined) payload.ngayxuatban = req.body.ngayxuatban;
  if (req.file?.filename) payload.hinhanh = `/uploads/blogs/${req.file.filename}`;

  const data = await BlogPost.findByIdAndUpdate(req.params.id, payload, { new: true });
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data });
};

module.exports.xoa = async (req, res) => {
  const data = await BlogPost.findByIdAndDelete(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true });
};

module.exports.capNhatXuatBan = async (req, res) => {
  const data = await BlogPost.findById(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Not found' });
  const next = req.body.xuatban !== undefined ? Boolean(req.body.xuatban) : !data.xuatban;
  data.xuatban = next;
  data.ngayxuatban = next ? new Date() : null;
  await data.save();
  res.json({ success: true, data });
};
