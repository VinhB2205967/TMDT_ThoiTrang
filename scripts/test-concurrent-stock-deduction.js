const { runDbScript } = require('./_lib/run-with-db');
const Sanpham = require('../models/product_model');
const { truTonTheoItem } = require('../services/cart.service');

function timestampTag() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function runConcurrentRace({
  scenarioName,
  scenarioDisplayName,
  productDoc,
  buildItem,
  attempts = 10,
  verifyStock
}) {
  const created = await Sanpham.create(productDoc);
  const createdId = String(created._id);

  try {
    const tasks = Array.from({ length: attempts }, () => {
      const payload = buildItem(created);
      return truTonTheoItem(payload);
    });

    const results = await Promise.allSettled(tasks);
    const success = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    const refreshed = await Sanpham.findById(created._id).lean();
    const displayName = scenarioDisplayName || scenarioName;

    if (!refreshed) {
      throw new Error(`[${displayName}] Sản phẩm bị mất trong quá trình kiểm thử.`);
    }

    if (success.length !== 1) {
      throw new Error(
        `[${displayName}] Kỳ vọng đúng 1 lần thành công, thực tế ${success.length} thành công / ${failed.length} thất bại.`
      );
    }

    if (!verifyStock(refreshed)) {
      throw new Error(`[${displayName}] Tồn kho cuối cùng không về 0 như kỳ vọng.`);
    }

    console.log(
      `[DAT] ${displayName}: ${success.length} thành công, ${failed.length} thất bại, tồn kho cuối cùng hợp lệ`
    );
  } finally {
    await Sanpham.deleteOne({ _id: createdId }).catch(() => {});
  }
}

runDbScript(async () => {
  const tag = timestampTag();

  await runConcurrentRace({
    scenarioName: 'main_no_size',
    scenarioDisplayName: 'Sản phẩm chính không kích cỡ',
    productDoc: {
      tensanpham: `[TEST-CONCURRENCY] main_no_size ${tag}`,
      gia: 100000,
      loaisanpham: 'tui',
      soluong_chinh: 1,
      soluongton: 1,
      trangthai: 'dangban',
      daxoa: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    },
    buildItem: (product) => ({
      sanpham_id: product._id,
      soluong: 1
    }),
    verifyStock: (p) => Number(p.soluong_chinh || 0) === 0 && Number(p.soluongton || 0) === 0
  });

  await runConcurrentRace({
    scenarioName: 'main_with_size',
    scenarioDisplayName: 'Sản phẩm chính có kích cỡ',
    productDoc: {
      tensanpham: `[TEST-CONCURRENCY] main_with_size ${tag}`,
      gia: 120000,
      loaisanpham: 'ao',
      sizes: [{ size: 'M', soluong: 1 }],
      soluongton: 1,
      trangthai: 'dangban',
      daxoa: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    },
    buildItem: (product) => ({
      sanpham_id: product._id,
      kichco: 'M',
      soluong: 1
    }),
    verifyStock: (p) => {
      const row = (p.sizes || []).find((s) => String(s.size) === 'M');
      return Number(row?.soluong || 0) === 0 && Number(p.soluongton || 0) === 0;
    }
  });

  await runConcurrentRace({
    scenarioName: 'variant_no_size',
    scenarioDisplayName: 'Biến thể không kích cỡ',
    productDoc: {
      tensanpham: `[TEST-CONCURRENCY] variant_no_size ${tag}`,
      gia: 150000,
      loaisanpham: 'tui',
      bienthe: [
        {
          mausac: 'Den',
          gia: 150000,
          soluong: 1
        }
      ],
      soluongton: 1,
      trangthai: 'dangban',
      daxoa: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    },
    buildItem: (product) => ({
      sanpham_id: product._id,
      bienthe_id: product.bienthe[0]._id,
      soluong: 1
    }),
    verifyStock: (p) => {
      const variant = (p.bienthe || [])[0];
      return Number(variant?.soluong || 0) === 0 && Number(p.soluongton || 0) === 0;
    }
  });

  await runConcurrentRace({
    scenarioName: 'variant_with_size',
    scenarioDisplayName: 'Biến thể có kích cỡ',
    productDoc: {
      tensanpham: `[TEST-CONCURRENCY] variant_with_size ${tag}`,
      gia: 180000,
      loaisanpham: 'ao',
      bienthe: [
        {
          mausac: 'Xanh',
          gia: 180000,
          sizes: [{ size: 'L', soluong: 1 }]
        }
      ],
      soluongton: 1,
      trangthai: 'dangban',
      daxoa: false,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    },
    buildItem: (product) => ({
      sanpham_id: product._id,
      bienthe_id: product.bienthe[0]._id,
      kichco: 'L',
      soluong: 1
    }),
    verifyStock: (p) => {
      const variant = (p.bienthe || [])[0];
      const sizeRow = (variant?.sizes || []).find((s) => String(s.size) === 'L');
      return Number(sizeRow?.soluong || 0) === 0 && Number(p.soluongton || 0) === 0;
    }
  });

  console.log('Tất cả các kịch bản kiểm thử trừ tồn kho đồng thời đều đạt.');
});
