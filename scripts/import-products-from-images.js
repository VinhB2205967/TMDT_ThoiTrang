require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');

const database = require('../config/database');
const Product = require('../models/product_model');
const Category = require('../models/category_model');

const ROOT_DIR = path.join(__dirname, '..', 'public', 'images', 'sanpham');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const COLOR_MAP = {
  den: 'Đen',
  trang: 'Trắng',
  do: 'Đỏ',
  xanh: 'Xanh',
  xanhla: 'Xanh lá',
  xam: 'Xám',
  nau: 'Nâu',
  hong: 'Hồng',
  vang: 'Vàng',
  tim: 'Tím',
  cam: 'Cam',
  be: 'Be'
};

const PRODUCT_TYPE_CONFIG = {
  ao: {
    loaisanpham: 'ao',
    basePrice: 299000,
    defaultVariantSizes: [],
    defaultVariantQty: 0
  },
  phukien: {
    loaisanpham: 'phukien',
    basePrice: 99000,
    defaultVariantSizes: [],
    defaultVariantQty: 15
  }
};

const SHIRT_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'];
const SHIRT_STYLE_WORDS = ['Thanh lịch', 'Hiện đại', 'Năng động', 'Tối giản', 'Cá tính', 'Trẻ trung'];
const SHIRT_MOOD_WORDS = ['Phong cách', 'Bản sắc', 'Xu hướng', 'Đa dụng', 'Êm nhẹ', 'Nổi bật'];
const ACCESSORY_STYLE_WORDS = ['Ấm áp', 'Tinh tế', 'Thời thượng', 'Dễ phối', 'Nhẹ nhàng', 'Tiện dụng'];
const ACCESSORY_MOOD_WORDS = ['Hằng ngày', 'Dạo phố', 'Mùa đông', 'Đi làm', 'Đi chơi', 'Nổi bật'];

function stripExtension(fileName) {
  const ext = path.extname(fileName);
  return fileName.slice(0, fileName.length - ext.length);
}

function titleCase(input) {
  return String(input || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeForCompare(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function hashString(input) {
  let hash = 0;
  const raw = String(input || '');
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickBySeed(items, seed) {
  return items[seed % items.length];
}

function escapeRegex(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function humanizeToken(token) {
  const raw = String(token || '').trim().toLowerCase();
  const mapped = {
    nonlen: 'nón len',
    aomuadong: 'áo mùa đông',
    muadong: 'mùa đông'
  };

  const normalized = (mapped[raw] || raw)
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();

  return titleCase(normalized);
}

function normalizeColor(rawColor, variantCode) {
  const key = String(rawColor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key && COLOR_MAP[key]) return COLOR_MAP[key];
  if (key) return humanizeToken(key);
  return String(variantCode || '').toLowerCase() === 'a'
    ? 'Màu chính'
    : `Màu biến thể ${String(variantCode || '').toUpperCase()}`;
}

async function listImageFilesRecursive(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await listImageFilesRecursive(absPath);
      files.push(...nested);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    files.push(absPath);
  }

  return files;
}

function parseImageInfo(absPath) {
  const relative = path.relative(path.join(__dirname, '..', 'public'), absPath).replace(/\\/g, '/');
  const publicPath = `/${relative}`;

  const relFromRoot = path.relative(ROOT_DIR, absPath).replace(/\\/g, '/');
  const parts = relFromRoot.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const typeRoot = parts[0].toLowerCase();
  if (!PRODUCT_TYPE_CONFIG[typeRoot]) return null;

  const folderParts = parts.slice(1, -1);
  const fileName = parts[parts.length - 1];
  const stem = stripExtension(fileName).toLowerCase();

  const tokens = stem.split('_').filter(Boolean);
  const variantTokenIndex = tokens.findIndex((token) => /^\d+[a-z]$/i.test(token));
  if (variantTokenIndex === -1) return null;

  const variantToken = tokens[variantTokenIndex];
  const match = variantToken.match(/^(\d+)([a-z])$/i);
  if (!match) return null;

  const productNumber = match[1];
  const variantCode = match[2].toLowerCase();

  const baseNameTokens = tokens.slice(0, variantTokenIndex);
  const baseName = baseNameTokens.length ? baseNameTokens.join(' ') : typeRoot;

  const colorToken = tokens.slice(variantTokenIndex + 1).join('_');
  const colorName = normalizeColor(colorToken, variantCode);

  const subFolder = folderParts.join('/').toLowerCase();
  const groupKey = `${typeRoot}|${subFolder}|${baseName}|${productNumber}`;

  return {
    groupKey,
    typeRoot,
    subFolder,
    baseName,
    productNumber,
    variantCode,
    colorName,
    publicPath
  };
}

function buildProductName(group) {
  const seed = hashString(group.groupKey);
  const typeLabel = group.typeRoot === 'ao' ? 'Áo' : 'Phụ kiện';
  const baseLabel = humanizeToken(group.baseName);
  const normalizedBase = normalizeForCompare(baseLabel);
  const typeWord = normalizeForCompare(typeLabel);
  const baseWithoutType = normalizedBase === typeWord ? '' : baseLabel;
  const collection = group.subFolder ? humanizeToken(group.subFolder) : 'Bộ sưu tập mới';

  if (group.typeRoot === 'ao') {
    const styleWord = pickBySeed(SHIRT_STYLE_WORDS, seed);
    const moodWord = pickBySeed(SHIRT_MOOD_WORDS, seed + 7);
    return `${typeLabel} ${baseWithoutType} ${styleWord} ${moodWord} - ${collection}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  const styleWord = pickBySeed(ACCESSORY_STYLE_WORDS, seed);
  const moodWord = pickBySeed(ACCESSORY_MOOD_WORDS, seed + 5);
  return `${typeLabel} ${baseWithoutType} ${styleWord} ${moodWord} - ${collection}`
    .replace(/\s+/g, ' ')
    .trim();
}

function compareVariantCode(a, b) {
  return a.variantCode.localeCompare(b.variantCode, 'en');
}

async function findCategoryIdForType(typeRoot) {
  const candidates =
    typeRoot === 'ao'
      ? ['ao', 'aokhoac', 'thoi-trang-nam', 'thoi-trang-nu']
      : ['phukien', 'phu-kien'];

  const bySlug = await Category.findOne({ slug: { $in: candidates }, daxoa: { $ne: true } }).select('_id').lean();
  if (bySlug?._id) return bySlug._id;

  const nameRegex = typeRoot === 'ao' ? /ao/i : /phu\s*kien/i;
  const byName = await Category.findOne({
    daxoa: { $ne: true },
    $or: [{ name: nameRegex }, { tendanhmuc: nameRegex }]
  })
    .select('_id')
    .lean();

  return byName?._id || null;
}

function buildShirtVariantSizes(groupKey, info) {
  const seed = hashString(`${groupKey}|${info.variantCode}|${info.colorName}`);
  return SHIRT_SIZE_ORDER.map((size, index) => {
    const min = 3 + index;
    const spread = 4 + (seed % 3);
    const soluong = min + ((seed + index * 11) % spread);
    return { size, soluong };
  });
}

function buildVariantDoc(typeRoot, info, basePrice, variantIndex, groupKey) {
  const config = PRODUCT_TYPE_CONFIG[typeRoot];
  const price = basePrice + variantIndex * 10000;

  if (typeRoot === 'phukien') {
    const seed = hashString(`${groupKey}|${info.variantCode}|${info.colorName}`);
    const qty = 10 + (seed % 16);
    return {
      mausac: info.colorName,
      hinhanh: info.publicPath,
      gia: price,
      phantramgiamgia: 0,
      soluong: qty,
      sizes: []
    };
  }

  const sizes = buildShirtVariantSizes(groupKey, info);

  return {
    mausac: info.colorName,
    hinhanh: info.publicPath,
    gia: price,
    phantramgiamgia: 0,
    soluong: 0,
    sizes
  };
}

function buildStockSummaryByVariant(typeRoot, variants) {
  if (typeRoot === 'phukien') {
    return variants
      .map((variant) => `- ${variant.mausac}: ${variant.soluong} sản phẩm`)
      .join('\n');
  }

  return variants
    .map((variant) => {
      const sizeText = (variant.sizes || [])
        .map((item) => `${item.size}:${item.soluong}`)
        .join(', ');
      return `- ${variant.mausac}: ${sizeText}`;
    })
    .join('\n');
}

function buildLongDescription(group, mainVariant, variants) {
  const collection = group.subFolder ? humanizeToken(group.subFolder) : 'New Season';
  const typeTitle = group.typeRoot === 'ao' ? 'áo thời trang' : 'phụ kiện';
  const allVariants = [mainVariant, ...variants];
  const stockSummary = buildStockSummaryByVariant(group.typeRoot, allVariants);
  const colorNames = allVariants.map((v) => v.mausac).join(', ');
  const mainSizeSummary =
    group.typeRoot === 'ao'
      ? (mainVariant.sizes || []).map((item) => `${item.size}:${item.soluong}`).join(', ')
      : `${mainVariant.soluong} sản phẩm`;

  return [
    `Thuộc bộ sưu tập ${collection}, mẫu ${typeTitle} này được thiết kế theo phong cách hiện đại, dễ mặc mỗi ngày và linh hoạt khi phối đồ.`,
    'Chất liệu mềm, form gọn gàng, ảnh thật bám sát màu thực tế và sản phẩm được kiểm tra kỹ trước khi gửi đi.',
    `Màu chính: ${mainVariant.mausac}. Tồn kho màu chính: ${mainSizeSummary}.`,
    `Các màu hiện có: ${colorNames}.`,
    'Tồn kho chi tiết theo màu và size:',
    stockSummary,
    'Cam kết đóng gói cẩn thận, hỗ trợ đổi size theo chính sách của shop.'
  ].join('\n');
}

function sumStock(typeRoot, variants) {
  if (typeRoot === 'phukien') {
    return variants.reduce((total, variant) => total + (variant.soluong || 0), 0);
  }

  return variants.reduce((total, variant) => {
    const sizeTotal = (variant.sizes || []).reduce((sum, sizeItem) => sum + (sizeItem.soluong || 0), 0);
    return total + sizeTotal;
  }, 0);
}

async function run() {
  await database.connect();

  const imageFiles = await listImageFilesRecursive(ROOT_DIR);
  if (!imageFiles.length) {
    console.log('Khong tim thay anh trong public/images/sanpham.');
    await mongoose.connection.close();
    return;
  }

  const grouped = new Map();
  for (const absPath of imageFiles) {
    const parsed = parseImageInfo(absPath);
    if (!parsed) continue;

    if (!grouped.has(parsed.groupKey)) {
      grouped.set(parsed.groupKey, {
        ...parsed,
        variants: []
      });
    }

    grouped.get(parsed.groupKey).variants.push(parsed);
  }

  let created = 0;
  let updated = 0;

  for (const group of grouped.values()) {
    group.variants.sort(compareVariantCode);

    const config = PRODUCT_TYPE_CONFIG[group.typeRoot];
    const categoryId = await findCategoryIdForType(group.typeRoot);
    const basePrice = config.basePrice;
    const variantsRaw = group.variants.map((variant, index) => buildVariantDoc(group.typeRoot, variant, basePrice, index, group.groupKey));
    const mainIndex = Math.max(
      0,
      group.variants.findIndex((variant) => String(variant.variantCode || '').toLowerCase() === 'a')
    );
    const mainInfo = group.variants[mainIndex] || group.variants[0];
    const mainVariant = variantsRaw[mainIndex] || variantsRaw[0];
    const variants = variantsRaw.filter((_, index) => index !== mainIndex);

    const stock = sumStock(group.typeRoot, [mainVariant, ...variants]);
    const marker = `AUTO_IMPORT_IMG:${group.groupKey}`;
    const description = buildLongDescription(group, mainVariant, variants);

    const baseSizes = group.typeRoot === 'ao' ? (mainVariant.sizes || []) : [];
    const baseQty = group.typeRoot === 'phukien' ? (mainVariant.soluong || 0) : 0;

    const productDoc = {
      tensanpham: buildProductName(group),
      mota: description,
      mota_hinhanh: mainInfo?.publicPath || '',
      gia: basePrice,
      phantramgiamgia: 0,
      category: categoryId,
      mausac_chinh: mainVariant?.mausac || '',
      sizes: baseSizes,
      soluong_chinh: baseQty,
      soluongton: stock,
      gioitinh: 'unisex',
      loaisanpham: config.loaisanpham,
      bienthe: variants,
      hinhanh: mainInfo?.publicPath || '',
      trangthai: 'dangban',
      daxoa: false,
      ngaycapnhat: new Date(),
      ngaytao: new Date()
    };

    const existing = await Product.findOne({
      loaisanpham: config.loaisanpham,
      hinhanh: mainInfo?.publicPath || '',
      daxoa: { $ne: true }
    })
      .select('_id ngaytao')
      .lean();

    if (existing?._id) {
      productDoc.ngaytao = existing.ngaytao || new Date();
      await Product.updateOne({ _id: existing._id }, { $set: productDoc });
      updated += 1;
    } else {
      await Product.create(productDoc);
      created += 1;
    }
  }

  console.log(`Import hoan tat. Tao moi: ${created}, Cap nhat: ${updated}, Nhom san pham: ${grouped.size}`);
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Import loi:', error);
  try {
    await mongoose.connection.close();
  } catch (closeError) {
    console.error(closeError);
  }
  process.exit(1);
});
