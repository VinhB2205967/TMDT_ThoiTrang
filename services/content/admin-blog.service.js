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

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true' || value === true || value === 1 || value === '1';
}

function parsePublishDate(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function buildBlogImage({ file, body }) {
  if (file && file.filename) return `/uploads/blogs/${file.filename}`;
  return String((body && body.hinhanh) || '').trim();
}

async function layDanhSachBaiViet() {
  const data = await BlogPost.find({}).sort({ ngaytao: -1 }).lean();
  return { ok: true, status: 200, data };
}

async function taoBaiViet({ body, file }) {
  const xuatban = parseBoolean(body.xuatban, false);
  const payload = {
    tieude: body.tieude,
    slug: slugify(body.tieude || ''),
    tomtat: body.tomtat,
    noidung: body.noidung,
    hinhanh: buildBlogImage({ body, file }),
    xuatban,
    ngayxuatban: parsePublishDate(body.ngayxuatban, xuatban ? new Date() : null)
  };

  const data = await BlogPost.create(payload);
  return { ok: true, status: 201, message: 'Tạo bài viết thành công', data };
}

async function capNhatBaiViet({ id, body, file }) {
  const payload = {};
  if (body.tieude !== undefined) {
    payload.tieude = body.tieude;
    payload.slug = slugify(body.tieude || '');
  }
  if (body.tomtat !== undefined) payload.tomtat = body.tomtat;
  if (body.noidung !== undefined) payload.noidung = body.noidung;
  if (body.xuatban !== undefined) payload.xuatban = parseBoolean(body.xuatban, false);
  if (body.ngayxuatban !== undefined) payload.ngayxuatban = parsePublishDate(body.ngayxuatban, null);
  if (file && file.filename) payload.hinhanh = `/uploads/blogs/${file.filename}`;

  const data = await BlogPost.findByIdAndUpdate(id, payload, { new: true });
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  return { ok: true, status: 200, message: 'Cập nhật bài viết thành công', data };
}

async function xoaBaiViet({ id }) {
  const data = await BlogPost.findByIdAndDelete(id);
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  return { ok: true, status: 200, message: 'Xóa bài viết thành công', data: null };
}

async function capNhatXuatBan({ id, body }) {
  const data = await BlogPost.findById(id);
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };

  const hasExplicit = body.xuatban !== undefined;
  const next = hasExplicit ? parseBoolean(body.xuatban, false) : !data.xuatban;
  data.xuatban = next;
  data.ngayxuatban = next ? new Date() : null;
  await data.save();

  return { ok: true, status: 200, message: 'Cập nhật xuất bản thành công', data };
}

module.exports = {
  slugify,
  layDanhSachBaiViet,
  taoBaiViet,
  capNhatBaiViet,
  xoaBaiViet,
  capNhatXuatBan
};
