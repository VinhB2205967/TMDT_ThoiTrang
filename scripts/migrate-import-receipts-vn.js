require('dotenv').config();
const mongoose = require('mongoose');
const database = require('../config/database');

function normalizeBienTheId(raw) {
  const v = String(raw || '').trim();
  if (!v || v === 'main') return null;
  return v;
}

function toNumber(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function tinhTongTienNhap(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr.reduce((sum, it) => {
    if (!it) return sum;
    const qty = toNumber(it.soluong ?? it.so_luong ?? 0, 0);
    const price = toNumber(it.gianhap ?? it.gia_nhap ?? it.import_price ?? 0, 0);
    return sum + qty * price;
  }, 0);
}

async function main() {
  await database.connect();

  const col = mongoose.connection.collection('import_receipts');

  const query = {
    $or: [
      { code: { $exists: true } },
      { import_date: { $exists: true } },
      { supplier: { $exists: true } },
      { note: { $exists: true } },
      { items: { $exists: true } },
      { tongtiennhap: { $exists: false } },
      { ma_phieu: { $exists: true } },
      { ngay_nhap: { $exists: true } },
      { nha_cung_cap: { $exists: true } },
      { ghi_chu: { $exists: true } },
      { chi_tiet: { $exists: true } },
      { 'chi_tiet.danh_muc': { $exists: true } },
      { 'chi_tiet.san_pham_id': { $exists: true } },
      { 'chi_tiet.ten_san_pham': { $exists: true } },
      { 'chi_tiet.ma_sku': { $exists: true } },
      { 'chi_tiet.chat_lieu': { $exists: true } },
      { 'chi_tiet.bien_the_id': { $exists: true } },
      { 'chi_tiet.kich_co': { $exists: true } },
      { 'chi_tiet.mau_sac': { $exists: true } },
      { 'chi_tiet.so_luong': { $exists: true } },
      { 'chi_tiet.gia_nhap': { $exists: true } },
      { 'chi_tiet.gia_ban_de_xuat': { $exists: true } },
      { created_by: { $exists: true } },
      { created_at: { $exists: true } },
      { updated_at: { $exists: true } }
    ]
  };

  const cursor = col.find(query);

  let scanned = 0;
  let updated = 0;

  // eslint-disable-next-line no-restricted-syntax
  for await (const doc of cursor) {
    scanned += 1;

    const set = {};
    const unset = {
      // English legacy
      code: '',
      import_date: '',
      supplier: '',
      note: '',
      items: '',
      created_by: '',
      created_at: '',
      updated_at: '',

      // Vietnamese legacy (underscore)
      ma_phieu: '',
      ngay_nhap: '',
      nha_cung_cap: '',
      ghi_chu: '',
      chi_tiet: '',
      nguoi_tao: '',
      ngay_tao: '',
      ngay_cap_nhat: ''
    };

    // Header fields
    if (doc.maphieu == null) {
      if (doc.ma_phieu != null) set.maphieu = String(doc.ma_phieu);
      else if (doc.code != null) set.maphieu = String(doc.code);
    }

    if (doc.ngaynhap == null) {
      if (doc.ngay_nhap != null) set.ngaynhap = new Date(doc.ngay_nhap);
      else if (doc.import_date != null) set.ngaynhap = new Date(doc.import_date);
    }

    if (doc.nhacungcap == null || doc.nhacungcap === '') {
      if (doc.nha_cung_cap != null) set.nhacungcap = String(doc.nha_cung_cap);
      else if (doc.supplier != null) set.nhacungcap = String(doc.supplier);
    }

    if (doc.ghichu == null || doc.ghichu === '') {
      if (doc.ghi_chu != null) set.ghichu = String(doc.ghi_chu);
      else if (doc.note != null) set.ghichu = String(doc.note);
    }

    // Audit fields
    if (doc.nguoitao == null && doc.nguoi_tao != null) set.nguoitao = doc.nguoi_tao;
    if (doc.nguoitao == null && doc.created_by != null) set.nguoitao = doc.created_by;

    if (doc.ngaytao == null) {
      if (doc.ngay_tao != null) set.ngaytao = new Date(doc.ngay_tao);
      else if (doc.created_at != null) set.ngaytao = new Date(doc.created_at);
    }

    if (doc.ngaycapnhat == null) {
      if (doc.ngay_cap_nhat != null) set.ngaycapnhat = new Date(doc.ngay_cap_nhat);
      else if (doc.updated_at != null) set.ngaycapnhat = new Date(doc.updated_at);
    }

    // Items -> chitiet
    const hasChiTietLegacy = Array.isArray(doc.chi_tiet) && doc.chi_tiet.length > 0;
    const hasChiTietNew = Array.isArray(doc.chitiet) && doc.chitiet.length > 0;
    const hasItems = Array.isArray(doc.items) && doc.items.length > 0;

    const legacyItems = hasChiTietLegacy ? doc.chi_tiet : hasItems ? doc.items : null;

    const needsNormalizeLegacy =
      hasChiTietLegacy ||
      hasItems ||
      (Array.isArray(doc.chitiet) &&
        doc.chitiet.some(
          (it) =>
            it &&
            (Object.prototype.hasOwnProperty.call(it, 'san_pham_id') ||
              Object.prototype.hasOwnProperty.call(it, 'ten_san_pham') ||
              Object.prototype.hasOwnProperty.call(it, 'bien_the_id') ||
              Object.prototype.hasOwnProperty.call(it, 'kich_co') ||
              Object.prototype.hasOwnProperty.call(it, 'mau_sac') ||
              Object.prototype.hasOwnProperty.call(it, 'chat_lieu') ||
              Object.prototype.hasOwnProperty.call(it, 'so_luong') ||
              Object.prototype.hasOwnProperty.call(it, 'gia_nhap') ||
              Object.prototype.hasOwnProperty.call(it, 'gia_ban_de_xuat') ||
              Object.prototype.hasOwnProperty.call(it, 'chi_so_block') ||
              Object.prototype.hasOwnProperty.call(it, 'ma_sku') ||
              Object.prototype.hasOwnProperty.call(it, 'danh_muc'))
        ));

    if (!hasChiTietNew && legacyItems) {
      set.chitiet = legacyItems
        .map((it) => {
          if (!it) return null;

          const isEnglish = Object.prototype.hasOwnProperty.call(it, 'product_id') || Object.prototype.hasOwnProperty.call(it, 'quantity');

          const chiSoBlockRaw = isEnglish ? it.block_index : it.chisoblock ?? it.chi_so_block;
          const chiSoBlock = chiSoBlockRaw != null && chiSoBlockRaw !== '' ? toNumber(chiSoBlockRaw, undefined) : undefined;

          const sanPhamId = isEnglish ? it.product_id : it.sanphamid ?? it.san_pham_id;
          const soLuong = toNumber(isEnglish ? it.quantity : it.soluong ?? it.so_luong, 0);
          if (!sanPhamId || !soLuong || soLuong <= 0) return null;

          return {
            chisoblock: chiSoBlock,
            sanphamid: sanPhamId,
            tensanpham: isEnglish ? (it.product_name != null ? String(it.product_name) : '') : it.tensanpham ?? (it.ten_san_pham != null ? String(it.ten_san_pham) : ''),
            masku: isEnglish ? (it.sku != null ? String(it.sku) : '') : it.masku ?? (it.ma_sku != null ? String(it.ma_sku) : ''),
            danhmuc: isEnglish
              ? it.category != null
                ? String(it.category)
                : ''
              : it.danhmuc ?? (it.danh_muc != null ? String(it.danh_muc) : ''),
            chatlieu: isEnglish ? (it.material != null ? String(it.material) : '') : it.chatlieu ?? (it.chat_lieu != null ? String(it.chat_lieu) : ''),
            hinhanh: isEnglish ? (it.image != null ? String(it.image) : '') : it.hinhanh ?? (it.hinhanh != null ? String(it.hinhanh) : ''),
            bientheid: isEnglish ? normalizeBienTheId(it.variant_id) : normalizeBienTheId(it.bientheid ?? it.bien_the_id),
            kichco: isEnglish ? (it.size != null ? String(it.size) : '') : it.kichco ?? (it.kich_co != null ? String(it.kich_co) : ''),
            mausac: isEnglish ? (it.color != null ? String(it.color) : '') : it.mausac ?? (it.mau_sac != null ? String(it.mau_sac) : ''),
            soluong: soLuong,
            gianhap: toNumber(isEnglish ? it.import_price : it.gianhap ?? it.gia_nhap, 0),
            giabandexuat: toNumber(isEnglish ? it.suggested_price : it.giabandexuat ?? it.gia_ban_de_xuat, 0)
          };
        })
        .filter(Boolean);
    } else if (needsNormalizeLegacy && Array.isArray(doc.chitiet)) {
      set.chitiet = doc.chitiet
        .map((it) => {
          if (!it) return null;
          const sanPhamId = it.sanphamid ?? it.san_pham_id;
          const soLuong = toNumber(it.soluong ?? it.so_luong, 0);
          if (!sanPhamId || !soLuong || soLuong <= 0) return null;

          const chiSoBlock = it.chisoblock ?? it.chi_so_block;

          return {
            ...it,
            chisoblock: chiSoBlock,
            sanphamid: sanPhamId,
            tensanpham: it.tensanpham ?? it.ten_san_pham ?? '',
            masku: it.masku ?? it.ma_sku ?? '',
            danhmuc: it.danhmuc ?? it.danh_muc ?? '',
            chatlieu: it.chatlieu ?? it.chat_lieu ?? '',
            bientheid: normalizeBienTheId(it.bientheid ?? it.bien_the_id),
            kichco: it.kichco ?? it.kich_co ?? '',
            mausac: it.mausac ?? it.mau_sac ?? '',
            soluong: soLuong,
            gianhap: toNumber(it.gianhap ?? it.gia_nhap, 0),
            giabandexuat: toNumber(it.giabandexuat ?? it.gia_ban_de_xuat, 0)
          };
        })
        .filter(Boolean);
    }

    // If tongtiennhap missing, set from best available detail array
    if (doc.tongtiennhap == null) {
      const best = set.chitiet || doc.chitiet || doc.chi_tiet || doc.items;
      if (best) {
        set.tongtiennhap = tinhTongTienNhap(best);
      }
    }

    // If we have nothing to set, skip
    if (Object.keys(set).length === 0) {
      continue;
    }

    await col.updateOne({ _id: doc._id }, { $set: set, $unset: unset });
    updated += 1;
  }

  console.log('[migrate-import-receipts-vn] scanned:', scanned);
  console.log('[migrate-import-receipts-vn] updated:', updated);

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.close();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
