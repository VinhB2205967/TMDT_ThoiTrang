require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');

const database = require('../config/database');
const Product = require('../models/product_model');
const Category = require('../models/category_model');
const Brand = require('../models/brand_model');
const BlogPost = require('../models/blog_model');
const Lookbook = require('../models/lookbook_model');
const ImportReceipt = require('../models/import_receipt_model');
const InventoryLot = require('../models/inventory_lot_model');

const ROOT_IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const SIZE_LIST = ['S', 'M', 'L', 'XL'];
const COLORS = ['Den', 'Trang', 'Xanh', 'Do', 'Hong', 'Nau', 'Xam', 'Be', 'Kem'];
const BRAND_PREFIX = 'SEED_BRAND_20260409';
const PRODUCT_PREFIX = 'SEED_PRODUCT_20260409';
const BLOG_PREFIX = 'SEED_BLOG_20260409';
const LOOKBOOK_PREFIX = 'SEED_LOOKBOOK_20260409';
const RECEIPT_PREFIX = 'NKSEEDNAMES20260409';

const BRAND_NAMES = [
  'Hikari Studio ✨',
  'NovaWear',
  'Urban Muse',
  'Zenith Style',
  'Aura Lab'
];

const BLOG_LOOKBOOK_STORIES = [
  {
    key: 'urban-whisper',
    title: 'Urban Whisper – Khi thành phố trở thành chất liệu của phong cách',
    summary: 'Urban Whisper kể câu chuyện thời trang đô thị tối giản, hiện đại và đầy cá tính.',
    content: [
      'Urban Whisper không đơn thuần là một lookbook, mà là một câu chuyện được dệt nên từ nhịp sống đô thị. Giữa những con phố đông đúc, nơi mỗi người đều mang một cá tính riêng, thời trang trở thành cách mà ta giao tiếp với thế giới mà không cần lời nói.',
      'Bộ sưu tập lần này tập trung vào sự tối giản nhưng không hề nhàm chán. Những chiếc áo basic được cắt may tinh tế, kết hợp cùng quần dáng suông và sneaker mang hơi hướng streetwear, tạo nên một tổng thể vừa thoải mái vừa hiện đại. Tone màu chủ đạo xoay quanh trắng, xám và đen - những gam màu tưởng chừng quen thuộc nhưng lại chính là nền tảng để cá tính được thể hiện rõ nhất.',
      'Urban Whisper không chạy theo xu hướng, mà chọn cách lắng nghe thành phố và chuyển hóa nó thành phong cách. Đó là sự tự do, là nhịp điệu, là chính bạn - giữa hàng triệu con người ngoài kia.'
    ],
    lookbookDescription: 'Lookbook mang tinh thần đô thị tối giản với điểm nhấn streetwear hiện đại.'
  },
  {
    key: 'midnight-mood',
    title: 'Midnight Mood – Khi bóng tối trở thành nguồn cảm hứng',
    summary: 'Midnight Mood khám phá vẻ đẹp sâu lắng, táo bạo của thời trang trong màn đêm.',
    content: [
      'Midnight Mood là hành trình khám phá vẻ đẹp của màn đêm - nơi mọi thứ trở nên sâu lắng hơn, thật hơn và cũng táo bạo hơn.',
      'Lookbook mang đến những outfit với chất liệu mềm mại như cotton, satin và denim tối màu. Ánh đèn thành phố phản chiếu lên từng lớp vải, tạo nên cảm giác vừa huyền bí vừa cuốn hút. Những thiết kế oversized được khai thác triệt để, mang lại sự thoải mái nhưng vẫn giữ được nét cá tính mạnh mẽ.',
      'Đây không phải là phong cách dành cho số đông. Midnight Mood dành cho những ai dám khác biệt, dám bước ra khỏi vùng an toàn và tìm thấy vẻ đẹp của chính mình trong bóng tối.'
    ],
    lookbookDescription: 'Phong cách đêm với gam tối, phom oversized và năng lượng cá tính mạnh.'
  },
  {
    key: 'soft-motion',
    title: 'Soft Motion – Chuyển động của sự tối giản',
    summary: 'Soft Motion là sự kết hợp giữa chuyển động tự do và tinh thần thời trang tối giản.',
    content: [
      'Soft Motion là sự giao thoa giữa thời trang và nhịp điệu cơ thể. Mỗi thiết kế trong lookbook đều được tạo ra với mục tiêu: chuyển động cùng bạn, không gò bó, không giới hạn.',
      'Những chiếc áo form rộng, quần jogger linh hoạt và sneaker nhẹ nhàng tạo nên một tổng thể hài hòa giữa năng động và tinh tế. Màu sắc được lựa chọn theo hướng trung tính: be, nâu nhạt, trắng kem - mang lại cảm giác dịu mắt và dễ phối.',
      'Điểm đặc biệt của Soft Motion nằm ở triết lý: thời trang không cần phải phức tạp để trở nên đẹp. Đôi khi, chính sự đơn giản lại là thứ khiến bạn nổi bật nhất.'
    ],
    lookbookDescription: 'Các thiết kế nhẹ, linh hoạt, tập trung vào sự thoải mái và tinh tế.'
  },
  {
    key: 'aura-street',
    title: 'Aura Street – Cá tính tạo nên ánh sáng riêng',
    summary: 'Aura Street đưa streetwear thành tuyên ngôn cá nhân với khí chất riêng biệt.',
    content: [
      'Aura Street là nơi streetwear không còn là phong cách, mà trở thành một tuyên ngôn cá nhân.',
      'Những thiết kế trong lookbook mang đậm dấu ấn đường phố: áo graphic, quần cargo, giày chunky. Tuy nhiên, thay vì đi theo lối mòn, Aura Street thêm vào những chi tiết tinh tế như đường cắt lạ, layering độc đáo và sự pha trộn giữa các chất liệu.',
      'Mỗi outfit đều mang một aura riêng - một năng lượng mà người mặc tự tạo ra. Không cần quá nổi bật, không cần quá cầu kỳ, chỉ cần đúng với bản thân, bạn đã đủ khác biệt.'
    ],
    lookbookDescription: 'Streetwear cá tính với layering và phối chất liệu mang dấu ấn cá nhân.'
  },
  {
    key: 'cloud-drift',
    title: 'Cloud Drift – Nhẹ nhàng nhưng không nhạt nhòa',
    summary: 'Cloud Drift dành cho những ngày chậm lại với bảng màu pastel dịu mắt.',
    content: [
      'Cloud Drift là lookbook dành cho những ngày bạn muốn chậm lại một chút. Không ồn ào, không áp lực, chỉ là thời trang theo cách tự nhiên nhất.',
      'Các thiết kế ưu tiên sự thoải mái: áo thun mềm, quần rộng, váy nhẹ. Tông màu pastel như xanh nhạt, hồng phấn, trắng sữa mang lại cảm giác dễ chịu, như một buổi chiều nhiều mây trôi.',
      'Cloud Drift không cố gắng gây ấn tượng. Nó đơn giản là ở đó - nhẹ nhàng, tinh tế và đủ để khiến người ta nhớ.'
    ],
    lookbookDescription: 'Nhịp điệu nhẹ nhàng với chất liệu mềm và bảng màu pastel thư giãn.'
  }
];

const PRODUCT_NAMES = {
  ao: [
    'Áo Midnight Whisper',
    'Áo Cloud Nine Tee',
    'Áo Urban Chill',
    'Áo Velvet Dream',
    'Áo Neo Basic',
    'Áo Skyline Fit',
    'Áo Sunset Layer',
    'Áo Mono Mood',
    'Áo Retro Pulse',
    'Áo Frost Edge',
    'Áo Minimal Soul',
    'Áo Street Core',
    'Áo Aura Tee',
    'Áo Soft Storm',
    'Áo Light Vibe',
    'Áo Flex Motion',
    'Áo Nova Style',
    'Áo Cozy Touch',
    'Áo Pure Blend',
    'Áo Urban Whisper',
    'Áo Alpha Fit',
    'Áo Daily Zen',
    'Áo Cloud Drift',
    'Áo Edge Form',
    'Áo Basic Bloom',
    'Áo Motion Tee',
    'Áo Urban Frame',
    'Áo Chill Mode',
    'Áo Soft Layer',
    'Áo Neo Street'
  ],
  giay: [
    'Giày Thunder Step',
    'Giày Sky Runner',
    'Giày Urban Glide',
    'Giày Nova Kick',
    'Giày Street Dash',
    'Giày Pulse Walk',
    'Giày Cloud Runner',
    'Giày Drift Sneak',
    'Giày Sonic Move',
    'Giày Flash Step',
    'Giày Aero Flex',
    'Giày Phantom Walk',
    'Giày Urban Sprint',
    'Giày Glide Pro',
    'Giày Neo Runner',
    'Giày Street Pulse',
    'Giày Shadow Step',
    'Giày Hyper Walk',
    'Giày Swift Edge',
    'Giày Metro Kick',
    'Giày Urban Blade',
    'Giày Wave Motion',
    'Giày Chill Runner',
    'Giày Dash Core',
    'Giày Alpha Step',
    'Giày Motion Flex',
    'Giày Air Glide',
    'Giày Night Runner',
    'Giày Speed Soul',
    'Giày Flex Dash'
  ],
  quan: [
    'Quần Urban Fit',
    'Quần Flex Denim',
    'Quần Street Core',
    'Quần Slim Edge',
    'Quần Motion Pants',
    'Quần Chill Jogger',
    'Quần Neo Fit',
    'Quần Dark Mode',
    'Quần Daily Flex',
    'Quần Soft Move',
    'Quần Urban Cargo',
    'Quần Basic Line',
    'Quần Storm Fit',
    'Quần Alpha Pants',
    'Quần Drift Denim',
    'Quần Light Fit',
    'Quần Street Move',
    'Quần Mono Pants',
    'Quần Edge Denim',
    'Quần Core Jogger',
    'Quần Urban Slim',
    'Quần Flex Street',
    'Quần Motion Core',
    'Quần Chill Fit',
    'Quần Nova Pants',
    'Quần Zen Denim',
    'Quần Shadow Fit',
    'Quần Pulse Pants',
    'Quần Daily Move',
    'Quần Soft Denim'
  ],
  tui: [
    'Túi Urban Bag',
    'Túi Neo Carry',
    'Túi Street Pack',
    'Túi Chill Tote',
    'Túi Daily Bag',
    'Túi Metro Carry',
    'Túi Soft Pack',
    'Túi Aura Bag',
    'Túi Cloud Tote',
    'Túi Light Carry',
    'Túi Minimal Pack',
    'Túi Edge Bag',
    'Túi Flex Carry',
    'Túi Urban Tote',
    'Túi Motion Bag',
    'Túi Nova Pack',
    'Túi Zen Carry',
    'Túi Shadow Bag',
    'Túi Core Tote',
    'Túi Drift Pack'
  ],
  vay: [
    'Váy Sunset Dress',
    'Váy Velvet Bloom',
    'Váy Cloud Silk',
    'Váy Midnight Dress',
    'Váy Aura Flow',
    'Váy Soft Elegance',
    'Váy Moonlight Dress',
    'Váy Dream Layer',
    'Váy Nova Dress',
    'Váy Pure Grace'
  ]
};

function parseScaleArg() {
  const matched = process.argv.find((arg) => /^--scale=\d+$/i.test(String(arg || '')));
  if (!matched) return 5;
  const value = Number(String(matched).split('=')[1]);
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.min(20, Math.max(1, Math.floor(value)));
}

function toPublicPath(absPath) {
  return `/${path.relative(path.join(__dirname, '..', 'public'), absPath).replace(/\\/g, '/')}`;
}

function normalize(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function toSlug(input) {
  return normalize(input)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function pick(items, index) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.abs(index) % items.length];
}

function pseudoNumber(seed, min, max) {
  const hash = Math.abs(
    String(seed || '')
      .split('')
      .reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0)
  );
  const span = max - min + 1;
  return min + (hash % span);
}

function detectProductGroupByImagePath(imagePath) {
  const text = normalize(imagePath);
  if (text.includes('giay') || text.includes('shoes')) return 'giay';
  if (text.includes('quan') || text.includes('shorts')) return 'quan';
  if (text.includes('vay') || text.includes('dress')) return 'vay';
  if (text.includes('/phukien/') || text.includes('tui') || text.includes('bag') || text.includes('handbag')) return 'tui';
  return 'ao';
}

function groupToLoaiSanPham(group) {
  if (group === 'tui') return 'tui';
  if (group === 'giay') return 'giay';
  if (group === 'quan') return 'quan';
  if (group === 'vay') return 'vay';
  return 'ao';
}

function buildProductName(group, index) {
  const source = PRODUCT_NAMES[group] || PRODUCT_NAMES.ao;
  const base = pick(source, index) || `${PRODUCT_PREFIX}_${String(index + 1).padStart(5, '0')}`;
  return base;
}

function buildSeedMarker(code) {
  return `[${code}]`;
}

async function cleanupSeedData() {
  const seedProductRegex = new RegExp(`\\[${PRODUCT_PREFIX}_`);
  const seedBlogSlugRegex = new RegExp(`^${toSlug(BLOG_PREFIX)}-`);
  const seedLookbookSlugRegex = new RegExp(`^${toSlug(LOOKBOOK_PREFIX)}-`);
  const seedReceiptRegex = new RegExp(`^${RECEIPT_PREFIX}-`);
  const legacySeedBrandSlugRegex = /^seedbrand20260409/;
  const legacySeedBrandNameRegex = /^SEED_BRAND_20260409_/;
  const fixedBrandSlugs = BRAND_NAMES.map((name) => toSlug(name));

  const seededReceipts = await ImportReceipt.find({ maphieu: { $regex: seedReceiptRegex } })
    .select('_id')
    .lean();
  const receiptIds = seededReceipts.map((item) => item._id).filter(Boolean);

  if (receiptIds.length) {
    await InventoryLot.deleteMany({ phieunhap_id: { $in: receiptIds } });
    await ImportReceipt.deleteMany({ _id: { $in: receiptIds } });
  }

  await InventoryLot.deleteMany({ maphieunhap: { $regex: seedReceiptRegex } });

  await Product.deleteMany({ mota: { $regex: seedProductRegex } });
  await BlogPost.deleteMany({ slug: { $regex: seedBlogSlugRegex } });
  await Lookbook.deleteMany({ slug: { $regex: seedLookbookSlugRegex } });
  await Brand.deleteMany({
    $or: [
      { slug: { $regex: legacySeedBrandSlugRegex } },
      { slug: { $in: fixedBrandSlugs } },
      { ten: { $regex: legacySeedBrandNameRegex } },
      { name: { $regex: legacySeedBrandNameRegex } }
    ]
  });
}

async function listImageFilesRecursive(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await listImageFilesRecursive(absPath);
      out.push(...nested);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    out.push(absPath);
  }

  return out;
}

async function getImagePools() {
  const imageFiles = await listImageFilesRecursive(ROOT_IMAGES_DIR);

  const pools = {
    all: uniqueBy(imageFiles.map((abs) => toPublicPath(abs)), (p) => p),
    products: [],
    brands: [],
    blogLookbook: []
  };

  for (const p of pools.all) {
    const norm = normalize(p);
    if (norm.includes('/images/sanpham/')) pools.products.push(p);

    if (norm.includes('thuong hieu') || norm.includes('/images/logo/')) {
      pools.brands.push(p);
    }

    if (norm.includes('blog, lookbok') || norm.includes('blog-lookbook')) {
      pools.blogLookbook.push(p);
    }
  }

  pools.products = uniqueBy(pools.products, (p) => p);
  pools.brands = uniqueBy(pools.brands, (p) => p);
  pools.blogLookbook = uniqueBy(pools.blogLookbook, (p) => p);

  if (!pools.products.length) pools.products = [...pools.all];
  if (!pools.brands.length) pools.brands = [...pools.all];
  if (!pools.blogLookbook.length) pools.blogLookbook = [...pools.all];

  return pools;
}

async function ensureBaseCategories() {
  const existing = await Category.find({
    type: 'category',
    daxoa: { $ne: true }
  })
    .select('_id name tendanhmuc slug')
    .lean();

  if (existing.length >= 2) return existing;

  const base = [
    { name: 'Ao', tendanhmuc: 'Ao', type: 'category', isActive: true, order: 1, thutu: 1 },
    { name: 'Phu kien', tendanhmuc: 'Phu kien', type: 'category', isActive: true, order: 2, thutu: 2 }
  ];

  for (const item of base) {
    const slug = toSlug(item.name);
    const found = await Category.findOne({ slug, daxoa: { $ne: true } }).select('_id').lean();
    if (found?._id) continue;

    await Category.create({
      ...item,
      slug,
      path: `/${slug}`,
      level: 1,
      ancestors: [],
      parent_id: null,
      danhmuccha: null,
      trangthai: 'active',
      daxoa: false,
      ngaytao: new Date()
    });
  }

  return Category.find({ type: 'category', daxoa: { $ne: true } }).select('_id name tendanhmuc slug').lean();
}

async function ensureSupportCategories() {
  const defaults = [
    { name: 'Tre em', tendanhmuc: 'Tre em', type: 'age_group', order: 1, thutu: 1 },
    { name: 'Thanh thieu nien', tendanhmuc: 'Thanh thieu nien', type: 'age_group', order: 2, thutu: 2 },
    { name: 'Nguoi lon', tendanhmuc: 'Nguoi lon', type: 'age_group', order: 3, thutu: 3 },
    { name: 'Di hoc', tendanhmuc: 'Di hoc', type: 'occasion', order: 1, thutu: 1 },
    { name: 'Di lam', tendanhmuc: 'Di lam', type: 'occasion', order: 2, thutu: 2 },
    { name: 'Di choi', tendanhmuc: 'Di choi', type: 'occasion', order: 3, thutu: 3 }
  ];

  for (const item of defaults) {
    const slug = toSlug(item.name);
    const found = await Category.findOne({ slug, type: item.type, daxoa: { $ne: true } }).select('_id').lean();
    if (found?._id) continue;

    await Category.create({
      ...item,
      slug,
      path: `/${slug}`,
      level: 1,
      ancestors: [],
      parent_id: null,
      danhmuccha: null,
      isActive: true,
      trangthai: 'active',
      daxoa: false,
      ngaytao: new Date()
    });
  }
}

async function getSupportCategoryPool() {
  const ageGroups = await Category.find({ type: 'age_group', isActive: true, daxoa: { $ne: true } })
    .select('_id name tendanhmuc slug')
    .sort({ order: 1, thutu: 1, _id: 1 })
    .lean();

  const occasions = await Category.find({ type: 'occasion', isActive: true, daxoa: { $ne: true } })
    .select('_id name tendanhmuc slug')
    .sort({ order: 1, thutu: 1, _id: 1 })
    .lean();

  return {
    ageGroups,
    occasions
  };
}

async function seedBrands(imagePools, scale) {
  const target = BRAND_NAMES.length;
  let created = 0;
  let updated = 0;

  for (let i = 1; i <= target; i += 1) {
    const name = BRAND_NAMES[i - 1];
    const slug = toSlug(name);
    const logo = pick(imagePools.brands, i - 1) || '/images/avatar/avatar.png';

    const doc = {
      ten: name,
      name,
      slug,
      logo,
      description: `Thuong hieu mau so ${i}, duoc tao tu script seed.`,
      moTa: `Thuong hieu mau so ${i}, duoc tao tu script seed.`,
      noiBat: i % 3 === 0,
      isFeatured: i % 3 === 0,
      hienthi: true,
      isActive: true,
      thuTu: i,
      order: i,
      daXoa: false,
      deletedAt: null
    };

    const result = await Brand.updateOne({ slug }, { $set: doc }, { upsert: true });
    if (result.upsertedCount > 0) created += 1;
    else updated += 1;
  }

  const brands = await Brand.find({ slug: { $in: BRAND_NAMES.map((n) => toSlug(n)) }, daXoa: { $ne: true } })
    .select('_id ten slug logo')
    .sort({ slug: 1 })
    .lean();

  return { created, updated, brands };
}

function buildProductVariants(seedIndex, imagePools, group) {
  if (group === 'tui') {
    return {
      sizes: [],
      soluong_chinh: 0,
      bienthe: []
    };
  }

  const sizeListByGroup = {
    ao: SIZE_LIST,
    quan: SIZE_LIST,
    vay: ['S', 'M', 'L'],
    giay: ['38', '39', '40', '41', '42']
  };

  const sizes = sizeListByGroup[group] || SIZE_LIST;
  const mainSizes = sizes.map((size, idx) => ({
    size,
    soluong: 0
  }));

  const variantCount = pseudoNumber(`variant-count-${seedIndex}`, 1, 3);
  const bienthe = [];
  for (let i = 0; i < variantCount; i += 1) {
    const color = pick(COLORS, seedIndex + i + 3);
    const image = pick(imagePools.products, seedIndex + 11 + i);
    const priceAdjust = pseudoNumber(`price-${seedIndex}-${i}`, 10000, 70000);
    bienthe.push({
      mausac: color,
      hinhanh: image,
      gia: 0,
      phantramgiamgia: pseudoNumber(`discount-${seedIndex}-${i}`, 0, 25),
      soluong: 0,
      sizes: sizes.map((size, sIdx) => ({
        size,
        soluong: 0
      }))
    });
  }

  return {
    sizes: mainSizes,
    soluong_chinh: 0,
    bienthe
  };
}

function totalStockForProduct(doc) {
  const mainBySize = (doc.sizes || []).reduce((sum, row) => sum + Number(row.soluong || 0), 0);
  const mainQty = Number(doc.soluong_chinh || 0);
  const variantTotal = (doc.bienthe || []).reduce((sum, variant) => {
    const bySize = (variant.sizes || []).reduce((acc, row) => acc + Number(row.soluong || 0), 0);
    const byQty = Number(variant.soluong || 0);
    return sum + bySize + byQty;
  }, 0);
  return mainBySize + mainQty + variantTotal;
}

async function seedProducts(imagePools, scale, brands, categories, supportPool) {
  const target = Math.max(120, imagePools.products.length * scale);
  const categoryAo = categories.find((c) => normalize(c.slug || c.name || c.tendanhmuc).includes('ao')) || categories[0] || null;
  const categoryPhuKien = categories.find((c) => normalize(c.slug || c.name || c.tendanhmuc).includes('phu-kien') || normalize(c.slug || c.name || c.tendanhmuc).includes('phukien')) || categories[1] || categoryAo;

  let created = 0;
  let updated = 0;

  for (let i = 1; i <= target; i += 1) {
    const code = `${PRODUCT_PREFIX}_${String(i).padStart(5, '0')}`;
    const marker = buildSeedMarker(code);
    const image = pick(imagePools.products, i - 1) || '/images/avatar/avatar.png';
    const group = detectProductGroupByImagePath(image);
    const loaisanpham = groupToLoaiSanPham(group);
    const categoryRef = group === 'tui' ? categoryPhuKien : categoryAo;
    const brand = pick(brands, i - 1);
    const ageGroupRef = pick(supportPool?.ageGroups || [], i - 1)?._id || null;
    const occasionRef = pick(supportPool?.occasions || [], i - 1)?._id || null;

    const basePrice = group === 'tui'
      ? pseudoNumber(`price-pk-${i}`, 90000, 390000)
      : pseudoNumber(`price-ao-${i}`, 180000, 790000);

    const variantPayload = buildProductVariants(i, imagePools, group);
    const bienthe = (variantPayload.bienthe || []).map((variant, idx) => ({
      ...variant,
      gia: basePrice + pseudoNumber(`variant-price-delta-${i}-${idx}`, 10000, 90000)
    }));

    const productDoc = {
      tensanpham: buildProductName(group, i - 1),
      mota: `${marker} duoc tao boi script seed du lieu gia.`,
      mota_hinhanh: image,
      gia: basePrice,
      phantramgiamgia: pseudoNumber(`discount-main-${i}`, 0, 30),
      category: categoryRef?._id || null,
      danhmuc_id: categoryRef?._id || null,
      occasion: occasionRef,
      occasions: occasionRef ? [occasionRef] : [],
      dip_sudung_id: occasionRef,
      ageGroup: ageGroupRef,
      nhomtuoi_id: ageGroupRef,
      thuonghieu_id: brand?._id || null,
      brand: brand?._id || null,
      thuonghieu: brand?._id || null,
      mausac_chinh: pick(COLORS, i) || 'Den',
      sizes: variantPayload.sizes,
      soluong_chinh: variantPayload.soluong_chinh,
      soluongton: 0,
      gioitinh: i % 3 === 0 ? 'nu' : i % 3 === 1 ? 'nam' : 'unisex',
      loaisanpham,
      bienthe,
      hinhanh: image,
      trangthai: 'dangban',
      daxoa: false,
      luotmua: pseudoNumber(`luotmua-${i}`, 0, 250),
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    };

    productDoc.soluongton = totalStockForProduct(productDoc);

    const result = await Product.updateOne(
      { mota: { $regex: `\\[${code}\\]` } },
      { $set: productDoc },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created += 1;
    else updated += 1;
  }

  const products = await Product.find({ mota: { $regex: `\\[${PRODUCT_PREFIX}_` }, daxoa: { $ne: true } })
    .select('_id tensanpham loaisanpham gia sizes soluong_chinh bienthe hinhanh')
    .sort({ tensanpham: 1 })
    .lean();

  return { created, updated, products };
}

async function seedBlogs(imagePools, scale) {
  const target = BLOG_LOOKBOOK_STORIES.length;
  let created = 0;
  let updated = 0;

  for (let i = 1; i <= target; i += 1) {
    const story = BLOG_LOOKBOOK_STORIES[i - 1];
    const slug = `${toSlug(BLOG_PREFIX)}-${story.key}`;
    const title = story.title;
    const image = pick(imagePools.blogLookbook, i - 1) || pick(imagePools.products, i - 1) || '/images/avatar/avatar.png';
    const body = (story.content || []).map((line) => `<p>${line}</p>`).join('');

    const doc = {
      tieude: title,
      slug,
      tomtat: story.summary,
      noidung: `${body}<p><em>Hinh anh: ${image}</em></p>`,
      hinhanh: image,
      xuatban: true,
      ngayxuatban: new Date(Date.now() - i * 86400000),
      ngaycapnhat: new Date()
    };

    const result = await BlogPost.updateOne({ slug }, { $set: doc }, { upsert: true });
    if (result.upsertedCount > 0) created += 1;
    else updated += 1;
  }

  return { created, updated };
}

async function seedLookbooks(imagePools, scale, products) {
  const target = BLOG_LOOKBOOK_STORIES.length;
  if (!products.length) return { created: 0, updated: 0 };

  const productIds = products.map((p) => p._id);
  let created = 0;
  let updated = 0;

  for (let i = 1; i <= target; i += 1) {
    const story = BLOG_LOOKBOOK_STORIES[i - 1];
    const slug = `${toSlug(LOOKBOOK_PREFIX)}-${story.key}`;
    const title = story.title;
    const image = pick(imagePools.blogLookbook, i - 1) || pick(imagePools.products, i + 3) || '/images/avatar/avatar.png';

    const chunkSize = pseudoNumber(`lookbook-size-${i}`, 3, 8);
    const chosenProducts = [];
    for (let k = 0; k < chunkSize; k += 1) {
      chosenProducts.push(pick(productIds, i * 7 + k));
    }

    const productsUnique = uniqueBy(chosenProducts.filter(Boolean), (id) => String(id));
    if (!productsUnique.length) continue;

    const doc = {
      title,
      tenmua: title,
      slug,
      image,
      hinhanh: image,
      description: story.lookbookDescription,
      mota: story.lookbookDescription,
      products: productsUnique,
      sanpham_ids: productsUnique,
      order: i,
      thuTu: i,
      isActive: true,
      hienthi: true,
      startDate: new Date(Date.now() - i * 86400000),
      endDate: null,
      deletedAt: null
    };

    const result = await Lookbook.updateOne({ slug }, { $set: doc }, { upsert: true });
    if (result.upsertedCount > 0) created += 1;
    else updated += 1;
  }

  return { created, updated };
}

function buildImportItemsForProduct(product, itemSeed) {
  const output = [];

  const mainHasSizes = Array.isArray(product.sizes) && product.sizes.length > 0;
  if (mainHasSizes) {
    const size = pick(product.sizes, itemSeed)?.size || 'M';
    const qty = pseudoNumber(`import-main-size-${product._id}-${itemSeed}`, 6, 30);
    output.push({
      sanphamid: product._id,
      tensanpham: product.tensanpham,
      masku: `${product.tensanpham}-${size}`,
      hinhanh: product.hinhanh || '',
      bientheid: null,
      kichco: size,
      mausac: 'Mac dinh',
      soluong: qty,
      gianhap: Math.round(Number(product.gia || 0) * 0.55)
    });
  } else {
    const qty = pseudoNumber(`import-main-${product._id}-${itemSeed}`, 6, 30);
    output.push({
      sanphamid: product._id,
      tensanpham: product.tensanpham,
      masku: `${product.tensanpham}-MAIN`,
      hinhanh: product.hinhanh || '',
      bientheid: null,
      kichco: '',
      mausac: 'Mac dinh',
      soluong: qty,
      gianhap: Math.round(Number(product.gia || 0) * 0.55)
    });
  }

  const variant = pick(product.bienthe || [], itemSeed + 5);
  if (variant && variant._id) {
    const variantHasSizes = Array.isArray(variant.sizes) && variant.sizes.length > 0;
    if (variantHasSizes) {
      const size = pick(variant.sizes, itemSeed + 1)?.size || 'M';
      const qty = pseudoNumber(`import-variant-size-${product._id}-${variant._id}-${itemSeed}`, 3, 16);
      output.push({
        sanphamid: product._id,
        tensanpham: product.tensanpham,
        masku: `${product.tensanpham}-V-${String(variant._id).slice(-4)}-${size}`,
        hinhanh: variant.hinhanh || product.hinhanh || '',
        bientheid: variant._id,
        kichco: size,
        mausac: variant.mausac || 'Bien the',
        soluong: qty,
        gianhap: Math.round(Number(variant.gia || product.gia || 0) * 0.55)
      });
    } else {
      const qty = pseudoNumber(`import-variant-${product._id}-${variant._id}-${itemSeed}`, 4, 20);
      output.push({
        sanphamid: product._id,
        tensanpham: product.tensanpham,
        masku: `${product.tensanpham}-V-${String(variant._id).slice(-4)}`,
        hinhanh: variant.hinhanh || product.hinhanh || '',
        bientheid: variant._id,
        kichco: '',
        mausac: variant.mausac || 'Bien the',
        soluong: qty,
        gianhap: Math.round(Number(variant.gia || product.gia || 0) * 0.55)
      });
    }
  }

  return output;
}

function applyImportQtyToProduct(product, item) {
  const delta = Number(item.soluong || 0);
  if (!Number.isFinite(delta) || delta <= 0) return;

  const variantId = item.bientheid ? String(item.bientheid) : '';
  const size = String(item.kichco || '').trim();

  if (!variantId) {
    if (size) {
      product.sizes = Array.isArray(product.sizes) ? product.sizes : [];
      const row = product.sizes.find((it) => String(it.size) === size);
      if (row) row.soluong = Number(row.soluong || 0) + delta;
      else product.sizes.push({ size, soluong: delta });
    } else {
      product.soluong_chinh = Number(product.soluong_chinh || 0) + delta;
    }
    return;
  }

  product.bienthe = Array.isArray(product.bienthe) ? product.bienthe : [];
  const variant = product.bienthe.find((it) => String(it._id) === variantId);
  if (!variant) return;

  if (size) {
    variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const row = variant.sizes.find((it) => String(it.size) === size);
    if (row) row.soluong = Number(row.soluong || 0) + delta;
    else variant.sizes.push({ size, soluong: delta });
  } else {
    variant.soluong = Number(variant.soluong || 0) + delta;
  }
}

async function seedImportReceipts(products, scale) {
  if (!products.length) return { created: 0, skipped: 0, lotCreated: 0, stockUpdated: 0 };

  const target = Math.max(36, Math.floor(products.length / 3) * scale);
  let created = 0;
  let skipped = 0;
  let lotCreated = 0;
  let stockUpdated = 0;

  for (let i = 1; i <= target; i += 1) {
    const maphieu = `${RECEIPT_PREFIX}-${String(i).padStart(5, '0')}`;
    const existed = await ImportReceipt.findOne({ maphieu }).select('_id').lean();
    if (existed?._id) {
      skipped += 1;
      continue;
    }

    const productCount = pseudoNumber(`receipt-product-count-${i}`, 3, 8);
    const pickedProducts = [];
    for (let k = 0; k < productCount; k += 1) {
      pickedProducts.push(pick(products, i * 13 + k));
    }
    const uniqueProducts = uniqueBy(pickedProducts.filter(Boolean), (p) => String(p._id));

    const items = [];
    for (let pIndex = 0; pIndex < uniqueProducts.length; pIndex += 1) {
      const product = uniqueProducts[pIndex];
      const built = buildImportItemsForProduct(product, i + pIndex);
      items.push(...built);
    }

    if (!items.length) {
      skipped += 1;
      continue;
    }

    const tongtiennhap = items.reduce((sum, item) => sum + Number(item.gianhap || 0) * Number(item.soluong || 0), 0);
    const ngaynhap = new Date(Date.now() - i * 3600000);

    const receipt = await ImportReceipt.create({
      code: maphieu,
      maphieu,
      ma_phieu: maphieu,
      loaiphieu: 'standard',
      tenloaiphieu: 'Nhap kho',
      nguonnhap: 'Seed fake data',
      ngaynhap,
      nhacungcap: `Nha cung cap seed ${((i - 1) % 20) + 1}`,
      ghichu: `Du lieu gia tao boi script ${RECEIPT_PREFIX}`,
      tongtiennhap,
      chitiet: items,
      daxuatkho: false,
      ngayxuatkho: null,
      nguoixuatkho: null,
      nhanvienky: {
        tennhanvien: 'Seeder Bot',
        idnhanvien: 'SEED-0001',
        anhchuky: '',
        thoigianky: new Date()
      },
      nguoitao: null,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    // Seed receipts are created in "Chua nhap kho" state.
    // Stock is not updated until the user confirms import in the admin flow.

    created += 1;
  }

  return { created, skipped, lotCreated, stockUpdated };
}

async function run() {
  const scale = parseScaleArg();

  await database.connect();
  await cleanupSeedData();

  const imagePools = await getImagePools();
  const categories = await ensureBaseCategories();
  await ensureSupportCategories();
  const supportPool = await getSupportCategoryPool();

  const seededBrands = await seedBrands(imagePools, scale);
  const seededProducts = await seedProducts(imagePools, scale, seededBrands.brands, categories, supportPool);
  const seededBlogs = await seedBlogs(imagePools, scale);
  const seededLookbooks = await seedLookbooks(imagePools, scale, seededProducts.products);
  const seededImports = await seedImportReceipts(seededProducts.products, Math.max(1, Math.floor(scale / 2)));

  console.log('Seed fake catalog data done.');
  console.log(
    JSON.stringify(
      {
        scale,
        images: {
          all: imagePools.all.length,
          products: imagePools.products.length,
          brands: imagePools.brands.length,
          blogLookbook: imagePools.blogLookbook.length
        },
        brands: { created: seededBrands.created, updated: seededBrands.updated, totalSeeded: seededBrands.brands.length },
        products: { created: seededProducts.created, updated: seededProducts.updated, totalSeeded: seededProducts.products.length },
        blogs: seededBlogs,
        lookbooks: seededLookbooks,
        imports: seededImports
      },
      null,
      2
    )
  );

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Seed fake catalog failed:', error);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
