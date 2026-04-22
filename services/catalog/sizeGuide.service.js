const BANG_SIZE_MAC_DINH = [
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
    tenbang: 'Váy',
    slug: 'guide-vay-default',
    loaisanpham: 'vay',
    cot: ['Ngực (cm)', 'Eo (cm)', 'Mông (cm)', 'Dài váy (cm)', 'Cân nặng (kg)'],
    dong: [
      { size: 'XS', giatri: ['78-82', '60-64', '84-88', '80-85', '38-43'] },
      { size: 'S', giatri: ['82-86', '64-68', '88-92', '85-90', '43-48'] },
      { size: 'M', giatri: ['86-90', '68-72', '92-96', '90-95', '48-53'] },
      { size: 'L', giatri: ['90-94', '72-76', '96-100', '95-100', '53-58'] },
      { size: 'XL', giatri: ['94-98', '76-80', '100-104', '100-105', '58-63'] },
      { size: 'XXL', giatri: ['98-104', '80-86', '104-110', '105-110', '63-70'] }
    ],
    goiy: 'Nếu số đo nằm giữa hai size, nên ưu tiên size lớn hơn để mặc váy thoải mái hơn.'
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

function boDau(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function laLoiMa(text) {
  return /(Ã.|áº|á»|Æ°|Ä‘)/.test(String(text || ''));
}

function laCotCanNang(text) {
  const raw = String(text || '').toLowerCase();
  const compact = boDau(raw).replace(/[^a-z0-9]/g, '');
  return compact.includes('cannang')
    || compact.includes('canang')
    || raw.includes('cã¢n')
    || raw.includes('náº·ng');
}

function gopCotCanNang(columns, rows) {
  const cols = Array.isArray(columns) ? [...columns] : [];
  const listRows = Array.isArray(rows) ? rows : [];
  const weightIndexes = cols
    .map((c, idx) => ({ idx, isWeight: laCotCanNang(c) }))
    .filter((x) => x.isWeight)
    .map((x) => x.idx);

  if (weightIndexes.length <= 1) {
    return { columns: cols, rows: listRows, changed: false };
  }

  const keepWeightIndex = weightIndexes[0];
  const removeSet = new Set(weightIndexes.slice(1));
  const nextColumns = cols.filter((_, idx) => !removeSet.has(idx));

  const nextRows = listRows.map((row) => {
    const values = Array.isArray(row?.giatri) ? [...row.giatri] : [];
    const pickedWeight = weightIndexes
      .map((idx) => String(values[idx] || '').trim())
      .find((v) => v);

    const rebuilt = [];
    for (let idx = 0; idx < cols.length; idx += 1) {
      if (removeSet.has(idx)) continue;
      if (idx === keepWeightIndex) {
        rebuilt.push(pickedWeight || String(values[idx] || '').trim());
      } else {
        rebuilt.push(String(values[idx] || '').trim());
      }
    }

    return {
      ...row,
      giatri: rebuilt
    };
  });

  return {
    columns: nextColumns,
    rows: nextRows,
    changed: true
  };
}

function taoSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `size-guide-${Date.now()}`;
}

function chuanLoaiBangSize(loaiSanPham) {
  const type = String(loaiSanPham || '').trim().toLowerCase();
  if (!type) return null;
  if (['ao', 'aokhoac'].includes(type)) return 'ao';
  if (['vay'].includes(type)) return 'vay';
  if (['quan'].includes(type)) return 'quan';
  if (['giay'].includes(type)) return 'giay';
  return null;
}

function tachCot(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function tachDong(raw, expectedColumnCount) {
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

function dongToText(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .map((row) => {
      const size = String(row?.size || '').trim();
      const values = Array.isArray(row?.giatri) ? row.giatri.map((v) => String(v || '').trim()) : [];
      return [size, ...values].join(' | ');
    })
    .join('\n');
}

async function damBaoBangSizeMacDinh(SizeGuide) {
  for (const item of BANG_SIZE_MAC_DINH) {
    const existed = await SizeGuide.findOne({ slug: item.slug, daxoa: { $ne: true } });
    if (!existed) {
      await SizeGuide.create({
        ...item,
        ngaytao: new Date(),
        ngaycapnhat: new Date()
      });
      continue;
    }

    let changed = false;

    if (laLoiMa(existed.tenbang)) {
      existed.tenbang = item.tenbang;
      changed = true;
    }

    if (laLoiMa(existed.goiy)) {
      existed.goiy = item.goiy;
      changed = true;
    }

    if (Array.isArray(existed.cot)) {
      existed.cot = existed.cot.map((col, idx) => {
        if (laLoiMa(col) && item.cot[idx]) {
          changed = true;
          return item.cot[idx];
        }
        return col;
      });
    }

    const deduped = gopCotCanNang(existed.cot, existed.dong);
    if (deduped.changed) {
      existed.cot = deduped.columns;
      existed.dong = deduped.rows;
      changed = true;
    }

    // Keep existing guide content if already customized,
    // but auto-add weight column for default clothing guides.
    if (item.slug === 'guide-ao-default' || item.slug === 'guide-quan-default') {
      const hasWeightColumn = Array.isArray(existed.cot)
        && existed.cot.some((c) => laCotCanNang(c));

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
        changed = true;
      }
    }

    if (changed) {
      existed.ngaycapnhat = new Date();
      await existed.save();
    }
  }
}

module.exports = {
  BANG_SIZE_MAC_DINH,
  taoSlug,
  tachCot,
  tachDong,
  dongToText,
  chuanLoaiBangSize,
  damBaoBangSizeMacDinh
};


