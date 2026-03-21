const HomeSection = require('../../models/home_section_model');
const { mergeSections } = require('./home.service.js');

function parseBoolean(input, fallback = false) {
  if (input === undefined || input === null || input === '') return fallback;
  if (typeof input === 'boolean') return input;
  const raw = String(input).trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes';
}

function normalizePayload(key, body = {}) {
  const sectionKey = String(key || '').trim();
  const thuTu = sectionKey === 'banner_slider' ? 1 : Number(body.thuTu || 0);
  return {
    tieuDe: body.tieuDe,
    hienthi: parseBoolean(body.hienthi, true),
    thuTu,
    config: body.config && typeof body.config === 'object' ? body.config : {}
  };
}

async function layDanhSachHomeSections() {
  const sections = await HomeSection.find({}).sort({ thuTu: 1 }).lean();
  const data = mergeSections(sections);
  return { ok: true, status: 200, data };
}

async function capNhatHomeSection({ key, body = {} }) {
  const sectionKey = String(key || '').trim();
  const data = await HomeSection.findOneAndUpdate(
    { key: sectionKey },
    normalizePayload(sectionKey, body),
    { new: true, upsert: true }
  );

  return { ok: true, status: 200, message: 'Cập nhật block thành công', data };
}

async function batTatHomeSection({ key }) {
  const data = await HomeSection.findOne({ key: String(key || '').trim() });
  if (!data) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Not found' };
  data.hienthi = !Boolean(data.hienthi);
  await data.save();
  return { ok: true, status: 200, message: 'Cập nhật hiển thị thành công', data };
}

async function sapXepHomeSections({ items = [] }) {
  const bulk = (Array.isArray(items) ? items : []).map((item) => ({
    updateOne: {
      filter: { key: item.key },
      update: {
        $set: {
          thuTu: String(item.key || '').trim() === 'banner_slider' ? 1 : Number(item.thuTu || 0)
        }
      }
    }
  }));

  if (bulk.length) await HomeSection.bulkWrite(bulk);
  return { ok: true, status: 200, message: 'Cập nhật thứ tự thành công' };
}

module.exports = {
  layDanhSachHomeSections,
  capNhatHomeSection,
  batTatHomeSection,
  sapXepHomeSections
};
