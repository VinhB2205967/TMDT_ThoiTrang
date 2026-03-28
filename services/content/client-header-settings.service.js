const fs = require('fs');
const path = require('path');
const Setting = require('../../models/setting_model');

const HEADER_NAME_KEY = 'client_header_name';
const HEADER_LOGO_KEY = 'client_header_logo';
const DEFAULT_HEADER_NAME = 'Fashion Store';
const DEFAULT_HEADER_LOGO = '';

function chuanHoaTenHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_HEADER_NAME;
  return raw.slice(0, 80);
}

function taoMapCauHinh(rows = []) {
  return rows.reduce((acc, item) => {
    if (item && item.key) acc[item.key] = item.value;
    return acc;
  }, {});
}

function dinhDangCauHinhHeader(map = {}) {
  const nameRaw = String(map[HEADER_NAME_KEY] || '').trim();
  const logoRaw = String(map[HEADER_LOGO_KEY] || '').trim();
  return {
    name: chuanHoaTenHeader(nameRaw || DEFAULT_HEADER_NAME),
    logo: logoRaw || DEFAULT_HEADER_LOGO
  };
}

async function layCauHinhHeaderClient() {
  const rows = await Setting.find({ key: { $in: [HEADER_NAME_KEY, HEADER_LOGO_KEY] } }).lean();
  return dinhDangCauHinhHeader(taoMapCauHinh(rows));
}

function laLogoNoiBo(pathLogo) {
  return String(pathLogo || '').startsWith('/uploads/site/');
}

async function capNhatCauHinhHeaderClient({ name, logoFile }) {
  const hienTai = await layCauHinhHeaderClient();
  const tenMoi = chuanHoaTenHeader(typeof name === 'undefined' ? hienTai.name : name);

  let logoMoi = hienTai.logo;
  if (logoFile && logoFile.filename) {
    logoMoi = `/uploads/site/${logoFile.filename}`;
  }

  await Setting.bulkWrite([
    {
      updateOne: {
        filter: { key: HEADER_NAME_KEY },
        update: { $set: { value: tenMoi } },
        upsert: true
      }
    },
    {
      updateOne: {
        filter: { key: HEADER_LOGO_KEY },
        update: { $set: { value: logoMoi } },
        upsert: true
      }
    }
  ]);

  if (logoFile && logoFile.filename && laLogoNoiBo(hienTai.logo) && hienTai.logo !== logoMoi) {
    const tenFileCu = path.basename(hienTai.logo);
    const duongDanCu = path.join(process.cwd(), 'public', 'uploads', 'site', tenFileCu);
    fs.promises.unlink(duongDanCu).catch(() => {});
  }

  return {
    name: tenMoi,
    logo: logoMoi
  };
}

module.exports = {
  layCauHinhHeaderClient,
  capNhatCauHinhHeaderClient
};

