const Banner = require('../../models/banner_model');

const CTA_DESTINATION_OPTIONS = [
  { label: 'Trang chủ', url: '/' },
  { label: 'Tất cả sản phẩm', url: '/products' },
  { label: 'Sản phẩm mới', url: '/products?sort=ngaytao-desc' },
  { label: 'Giá thấp đến cao', url: '/products?sort=gia-asc' },
  { label: 'Giá cao đến thấp', url: '/products?sort=gia-desc' },
  { label: 'Sản phẩm áo', url: '/products?loaisanpham=ao' },
  { label: 'Sản phẩm quần', url: '/products?loaisanpham=quan' },
  { label: 'Sản phẩm váy', url: '/products?loaisanpham=vay' },
  { label: 'Sản phẩm giày', url: '/products?loaisanpham=giay' },
  { label: 'Sản phẩm túi', url: '/products?loaisanpham=tui' },
  { label: 'Sản phẩm phụ kiện', url: '/products?loaisanpham=phukien' },
  { label: 'Sản phẩm nam', url: '/products?gioitinh=nam' },
  { label: 'Sản phẩm nữ', url: '/products?gioitinh=nu' },
  { label: 'Lookbook', url: '/lookbook' },
  { label: 'Blog', url: '/blog' },
  { label: 'Thương hiệu', url: '/brands' },

];

const CTA_LINK_SUGGESTIONS = CTA_DESTINATION_OPTIONS.map((item) => item.url);

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true' || value === true || value === 1 || value === '1';
}

function parseNumber(value, defaultValue = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function buildBannerImage({ file, body }) {
  if (file && file.filename) return `/uploads/banners/${file.filename}`;
  return String((body && body.hinhanh) || '').trim();
}

async function layDanhSachBanner() {
  const data = await Banner.find({}).sort({ thuTu: 1, ngaytao: -1 }).lean();
  return {
    ok: true,
    status: 200,
    data,
    meta: {
      ctaLinkSuggestions: CTA_LINK_SUGGESTIONS,
      ctaDestinationOptions: CTA_DESTINATION_OPTIONS
    }
  };
}

async function taoBanner({ body, file }) {
  const image = buildBannerImage({ body, file });
  if (!image) {
    return { ok: false, status: 400, code: 'MISSING_IMAGE', message: 'Thiếu hình ảnh' };
  }

  const payload = {
    tieude: body.tieude,
    mota: body.mota,
    hinhanh: image,
    nut_text: body.nut_text,
    nut_link: body.nut_link,
    loai: body.loai || 'general',
    hienthi: parseBoolean(body.hienthi, true),
    thuTu: parseNumber(body.thuTu, 0)
  };

  const data = await Banner.create(payload);
  return { ok: true, status: 201, message: 'Tạo banner thành công', data };
}

async function capNhatBanner({ id, body, file }) {
  const payload = {};
  if (body.tieude !== undefined) payload.tieude = body.tieude;
  if (body.mota !== undefined) payload.mota = body.mota;
  if (body.nut_text !== undefined) payload.nut_text = body.nut_text;
  if (body.nut_link !== undefined) payload.nut_link = body.nut_link;
  if (body.loai !== undefined) payload.loai = body.loai;
  if (body.hienthi !== undefined) payload.hienthi = parseBoolean(body.hienthi, false);
  if (body.thuTu !== undefined) payload.thuTu = parseNumber(body.thuTu, 0);
  if (file && file.filename) payload.hinhanh = `/uploads/banners/${file.filename}`;

  const data = await Banner.findByIdAndUpdate(id, payload, { new: true });
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  return { ok: true, status: 200, message: 'Cập nhật banner thành công', data };
}

async function xoaBanner({ id }) {
  const data = await Banner.findByIdAndDelete(id);
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  return { ok: true, status: 200, message: 'Xóa banner thành công', data: null };
}

async function batTatBanner({ id }) {
  const data = await Banner.findById(id);
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  data.hienthi = !data.hienthi;
  await data.save();
  return { ok: true, status: 200, message: 'Cập nhật trạng thái banner thành công', data };
}

module.exports = {
  layDanhSachBanner,
  taoBanner,
  capNhatBanner,
  xoaBanner,
  batTatBanner
};
