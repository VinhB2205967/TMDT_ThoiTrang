const DEFAULT_GUIDES = [
  {
    tenbang: 'Bảng size áo tiêu chuẩn',
    slug: 'guide-ao-default',
    loaisanpham: 'ao',
    cot: ['Ngực', 'Vai', 'Dài áo', 'Cân nặng (kg)'],
    dong: [
      { size: 'S', giatri: ['88', '40', '65', '48-55'] },
      { size: 'M', giatri: ['92', '42', '67', '56-62'] },
      { size: 'L', giatri: ['96', '44', '69', '63-70'] },
      { size: 'XL', giatri: ['100', '46', '71', '71-78'] }
    ],
    goiy: 'Nếu bạn cao 170cm và nặng 60kg -> nên chọn size M'
  },
  {
    tenbang: 'Bảng size quần tiêu chuẩn',
    slug: 'guide-quan-default',
    loaisanpham: 'quan',
    cot: ['Eo', 'Mông', 'Dài quần', 'Cân nặng (kg)'],
    dong: [
      { size: 'S', giatri: ['70', '90', '95', '48-55'] },
      { size: 'M', giatri: ['74', '94', '97', '56-62'] },
      { size: 'L', giatri: ['78', '98', '99', '63-70'] },
      { size: 'XL', giatri: ['82', '102', '101', '71-78'] }
    ],
    goiy: 'Nếu bạn cao 170cm và nặng 60kg -> thường mặc vừa size M'
  },
  {
    tenbang: 'Bảng size giày tiêu chuẩn',
    slug: 'guide-giay-default',
    loaisanpham: 'giay',
    cot: ['Dài bàn chân'],
    dong: [
      { size: '38', giatri: ['24 cm'] },
      { size: '39', giatri: ['24.5 cm'] },
      { size: '40', giatri: ['25 cm'] },
      { size: '41', giatri: ['25.5 cm'] },
      { size: '42', giatri: ['26 cm'] }
    ],
    goiy: 'Nên chọn lớn hơn 1 size nếu chân bè ngang hoặc mu bàn chân cao'
  }
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `size-guide-${Date.now()}`;
}

function normalizeGuideTypeFromProductType(loaiSanPham) {
  const type = String(loaiSanPham || '').trim().toLowerCase();
  if (!type) return null;
  if (['ao', 'aokhoac', 'vay'].includes(type)) return 'ao';
  if (['quan'].includes(type)) return 'quan';
  if (['giay'].includes(type)) return 'giay';
  return null;
}

function parseColumns(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRows(raw, expectedColumnCount) {
  const lines = String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    const size = parts.shift() || '';
    const values = parts;

    if (expectedColumnCount > 0) {
      while (values.length < expectedColumnCount) values.push('');
      if (values.length > expectedColumnCount) values.length = expectedColumnCount;
    }

    return {
      size,
      giatri: values
    };
  }).filter((row) => row.size);
}

function rowsToTextarea(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .map((row) => {
      const size = String(row?.size || '').trim();
      const values = Array.isArray(row?.giatri) ? row.giatri.map((v) => String(v || '').trim()) : [];
      return [size, ...values].join(' | ');
    })
    .join('\n');
}

async function ensureDefaultSizeGuides(SizeGuide) {
  for (const item of DEFAULT_GUIDES) {
    const existed = await SizeGuide.findOne({ slug: item.slug, daxoa: { $ne: true } });
    if (!existed) {
      await SizeGuide.create({
        ...item,
        ngaytao: new Date(),
        ngaycapnhat: new Date()
      });
      continue;
    }

    // Keep existing guide content if already customized,
    // but auto-add weight column for default clothing guides.
    if (item.slug === 'guide-ao-default' || item.slug === 'guide-quan-default') {
      const hasWeightColumn = Array.isArray(existed.cot)
        && existed.cot.some((c) => String(c || '').toLowerCase().includes('cân nặng'));

      if (!hasWeightColumn) {
        const nextColumns = [...(existed.cot || []), 'Cân nặng (kg)'];
        const defaultWeightBySize = {
          S: '48-55',
          M: '56-62',
          L: '63-70',
          XL: '71-78',
          XXL: '79-86'
        };

        const nextRows = (existed.dong || []).map((row) => {
          const values = Array.isArray(row?.giatri) ? [...row.giatri] : [];
          values.push(defaultWeightBySize[String(row?.size || '').toUpperCase()] || '');
          return {
            size: row?.size,
            giatri: values
          };
        });

        existed.cot = nextColumns;
        existed.dong = nextRows;
        existed.ngaycapnhat = new Date();
        await existed.save();
      }
    }
  }
}

module.exports = {
  DEFAULT_GUIDES,
  slugify,
  parseColumns,
  parseRows,
  rowsToTextarea,
  normalizeGuideTypeFromProductType,
  ensureDefaultSizeGuides
};
