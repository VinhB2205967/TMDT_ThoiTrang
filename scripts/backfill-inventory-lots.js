const { runDbScript } = require('./_lib/run-with-db');

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeVariantId(raw) {
  const v = String(raw || '').trim();
  if (!v || v === 'main') return null;
  return v;
}

function normalizeSize(raw) {
  return String(raw || '').trim();
}

async function consumeLotFIFO({ lotsCol, productId, variantId, sizeKey, qty }) {
  let remaining = toNumber(qty, 0);
  if (remaining <= 0) return { consumed: 0, shortage: 0 };

  const query = {
    sanphamid: productId,
    bientheid: variantId,
    kichco: sizeKey,
    soluongconlai: { $gt: 0 }
  };

  const lots = await lotsCol
    .find(query)
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 })
    .toArray();

  let consumed = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;

    const available = toNumber(lot.soluongconlai, 0);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const nextQty = available - take;

    await lotsCol.updateOne(
      { _id: lot._id },
      {
        $set: {
          soluongconlai: nextQty,
          ngaycapnhat: new Date()
        }
      }
    );

    remaining -= take;
    consumed += take;
  }

  return {
    consumed,
    shortage: Math.max(0, remaining)
  };
}

runDbScript(async ({ mongoose }) => {
  const importCol = mongoose.connection.collection('import_receipts');
  const exportCol = mongoose.connection.collection('export_receipts');
  const lotsCol = mongoose.connection.collection('inventory_lots');

  await lotsCol.deleteMany({});

  let importReceipts = 0;
  let importLines = 0;
  let createdLots = 0;

  const importCursor = importCol
    .find({})
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 });

  // eslint-disable-next-line no-restricted-syntax
  for await (const receipt of importCursor) {
    importReceipts += 1;

    const items = Array.isArray(receipt.chitiet)
      ? receipt.chitiet
      : (Array.isArray(receipt.chi_tiet) ? receipt.chi_tiet : []);

    const docs = [];

    for (const item of items) {
      const productId = item?.sanphamid || item?.san_pham_id || null;
      if (!productId) continue;

      const qty = toNumber(item?.soluong ?? item?.so_luong ?? 0, 0);
      if (qty <= 0) continue;

      const variantRaw = item?.bientheid ?? item?.bien_the_id;
      const variantId = normalizeVariantId(variantRaw);
      const sizeKey = normalizeSize(item?.kichco ?? item?.kich_co);

      docs.push({
        phieunhap_id: receipt._id,
        maphieunhap: String(receipt.maphieu || receipt.ma_phieu || receipt.code || ''),
        ngaynhap: receipt.ngaynhap || receipt.ngay_nhap || receipt.ngaytao || receipt.created_at || new Date(),
        nhacungcap: String(receipt.nhacungcap || receipt.nha_cung_cap || receipt.supplier || ''),
        sanphamid: productId,
        bientheid: variantId,
        kichco: sizeKey,
        mausac: String(item?.mausac || item?.mau_sac || ''),
        gianhap: toNumber(item?.gianhap ?? item?.gia_nhap ?? item?.import_price ?? 0, 0),
        giabandexuat: toNumber(item?.giabandexuat ?? item?.gia_ban_de_xuat ?? item?.suggested_price ?? 0, 0),
        soluongnhap: qty,
        soluongconlai: qty,
        ngaytao: receipt.ngaytao || receipt.created_at || new Date(),
        ngaycapnhat: receipt.ngaycapnhat || receipt.updated_at || new Date()
      });
      importLines += 1;
    }

    if (docs.length) {
      await lotsCol.insertMany(docs);
      createdLots += docs.length;
    }
  }

  let exportReceipts = 0;
  let exportLines = 0;
  let totalConsumed = 0;
  let totalShortage = 0;

  const shortages = [];

  const exportCursor = exportCol
    .find({})
    .sort({ ngayxuat: 1, ngaytao: 1, _id: 1 });

  // eslint-disable-next-line no-restricted-syntax
  for await (const receipt of exportCursor) {
    exportReceipts += 1;
    const items = Array.isArray(receipt.chitiet) ? receipt.chitiet : [];

    for (const item of items) {
      const productId = item?.sanphamid || null;
      if (!productId) continue;

      const qty = toNumber(item?.soluong ?? 0, 0);
      if (qty <= 0) continue;

      exportLines += 1;

      const variantId = normalizeVariantId(item?.bientheid);
      const sizeKey = normalizeSize(item?.kichco);

      const result = await consumeLotFIFO({
        lotsCol,
        productId,
        variantId,
        sizeKey,
        qty
      });

      totalConsumed += result.consumed;
      totalShortage += result.shortage;

      if (result.shortage > 0) {
        shortages.push({
          maphieu: String(receipt.maphieu || ''),
          sanphamid: String(productId),
          bientheid: variantId ? String(variantId) : 'main',
          kichco: sizeKey,
          canxuat: qty,
          daxuat: result.consumed,
          thieu: result.shortage
        });
      }
    }
  }

  const remainingAgg = await lotsCol.aggregate([
    {
      $group: {
        _id: null,
        tongsoluongnhap: { $sum: '$soluongnhap' },
        tongsoluongconlai: { $sum: '$soluongconlai' },
        tonglo: { $sum: 1 }
      }
    }
  ]).toArray();

  const summary = remainingAgg[0] || {
    tongsoluongnhap: 0,
    tongsoluongconlai: 0,
    tonglo: 0
  };

  console.log('[backfill-inventory-lots] import receipts:', importReceipts);
  console.log('[backfill-inventory-lots] import lines:', importLines);
  console.log('[backfill-inventory-lots] lots created:', createdLots);
  console.log('[backfill-inventory-lots] export receipts:', exportReceipts);
  console.log('[backfill-inventory-lots] export lines:', exportLines);
  console.log('[backfill-inventory-lots] consumed qty:', totalConsumed);
  console.log('[backfill-inventory-lots] shortage qty:', totalShortage);
  console.log('[backfill-inventory-lots] total lots:', summary.tonglo || 0);
  console.log('[backfill-inventory-lots] total imported qty:', summary.tongsoluongnhap || 0);
  console.log('[backfill-inventory-lots] total remaining qty:', summary.tongsoluongconlai || 0);

  if (shortages.length) {
    console.log('[backfill-inventory-lots] shortages details (first 50):');
    shortages.slice(0, 50).forEach((it, idx) => {
      console.log(
        `${idx + 1}. phieu=${it.maphieu} product=${it.sanphamid} variant=${it.bientheid} size=${it.kichco || '-'} can=${it.canxuat} da=${it.daxuat} thieu=${it.thieu}`
      );
    });
  }
});
