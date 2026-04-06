const xss = require('xss');
const BlogPost = require('../../models/blog_model');

const BLOG_MEDIA_TOKEN_PREFIX = '__BLOG_MEDIA_TOKEN__';

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

function parseJsonArray(input) {
  const raw = Array.isArray(input) ? input[0] : input;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePlainContent(text) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return '';

  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

function replaceBlogMediaTokens(html, files, mediaTokens) {
  let output = String(html || '');
  if (!output) return '';

  const uploadedMedia = files && files.content_media_uploads ? files.content_media_uploads : [];
  if (!uploadedMedia.length || !mediaTokens.length) return output;

  mediaTokens.forEach((token, index) => {
    const file = uploadedMedia[index];
    if (!token || !file || !file.filename) return;
    output = output.split(`${BLOG_MEDIA_TOKEN_PREFIX}${token}`).join(`/uploads/blogs/${file.filename}`);
  });

  return output;
}

function sanitizeBlogContent(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const source = /<[^>]+>/.test(raw) ? raw : normalizePlainContent(raw);

  return xss(source, {
    whiteList: {
      p: ['class'],
      br: [],
      strong: [],
      b: [],
      em: [],
      i: [],
      u: [],
      s: [],
      strike: [],
      blockquote: ['class'],
      ul: [],
      ol: [],
      li: [],
      h1: ['class'],
      h2: ['class'],
      h3: ['class'],
      h4: ['class'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'class'],
      video: ['src', 'controls', 'preload', 'playsinline', 'class'],
      source: ['src', 'type'],
      div: ['class'],
      span: ['class']
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  });
}

function buildBlogImage({ files, body }) {
  const coverFile = files && files.image && files.image[0] ? files.image[0] : null;
  if (coverFile && coverFile.filename) return `/uploads/blogs/${coverFile.filename}`;
  return String((body && body.hinhanh) || '').trim();
}

function buildBlogPayload({ body, files, existingTitle }) {
  const xuatban = parseBoolean(body.xuatban, false);
  const mediaTokens = parseJsonArray(body.content_media_tokens);
  const rawContent = replaceBlogMediaTokens(body.noidung, files, mediaTokens);
  const nextTitle = body.tieude !== undefined ? body.tieude : existingTitle;

  return {
    tieude: nextTitle,
    slug: slugify(nextTitle || ''),
    tomtat: body.tomtat,
    noidung: sanitizeBlogContent(rawContent),
    hinhanh: buildBlogImage({ body, files }),
    xuatban,
    ngayxuatban: parsePublishDate(body.ngayxuatban, xuatban ? new Date() : null)
  };
}

async function layDanhSachBaiViet() {
  const data = await BlogPost.find({}).sort({ ngaytao: -1 }).lean();
  return { ok: true, status: 200, data };
}

async function layChiTietBaiViet({ id }) {
  const data = await BlogPost.findById(id).lean();
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  return { ok: true, status: 200, data };
}

async function taoBaiViet({ body, files }) {
  const payload = buildBlogPayload({ body, files });
  const data = await BlogPost.create(payload);
  return { ok: true, status: 201, message: 'Tao bai viet thanh cong', data };
}

async function capNhatBaiViet({ id, body, files }) {
  const current = await BlogPost.findById(id);
  if (!current) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };

  const payload = {};
  if (body.tieude !== undefined) {
    payload.tieude = body.tieude;
    payload.slug = slugify(body.tieude || '');
  }
  if (body.tomtat !== undefined) payload.tomtat = body.tomtat;
  if (body.noidung !== undefined) {
    const mediaTokens = parseJsonArray(body.content_media_tokens);
    const rawContent = replaceBlogMediaTokens(body.noidung, files, mediaTokens);
    payload.noidung = sanitizeBlogContent(rawContent);
  }
  if (body.xuatban !== undefined) payload.xuatban = parseBoolean(body.xuatban, false);
  if (body.ngayxuatban !== undefined) payload.ngayxuatban = parsePublishDate(body.ngayxuatban, null);

  const nextImage = buildBlogImage({ body, files });
  if (nextImage) payload.hinhanh = nextImage;

  const data = await BlogPost.findByIdAndUpdate(id, payload, { new: true });
  return { ok: true, status: 200, message: 'Cap nhat bai viet thanh cong', data };
}

async function xoaBaiViet({ id }) {
  const data = await BlogPost.findByIdAndDelete(id);
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  return { ok: true, status: 200, message: 'Xoa bai viet thanh cong', data: null };
}

async function capNhatXuatBan({ id, body }) {
  const data = await BlogPost.findById(id);
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };

  const hasExplicit = body.xuatban !== undefined;
  const next = hasExplicit ? parseBoolean(body.xuatban, false) : !data.xuatban;
  data.xuatban = next;
  data.ngayxuatban = next ? new Date() : null;
  await data.save();

  return { ok: true, status: 200, message: 'Cap nhat xuat ban thanh cong', data };
}

module.exports = {
  slugify,
  layDanhSachBaiViet,
  layChiTietBaiViet,
  taoBaiViet,
  capNhatBaiViet,
  xoaBaiViet,
  capNhatXuatBan
};
