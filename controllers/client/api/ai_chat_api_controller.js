const fs = require('fs');
const { Sanpham } = require('../../../models');
const { buildDataContext, askAI } = require('../../../services/content/aiChat.service.js');
const { rankProductsByQuery, rankProductsByImage, classifyImageCategory } = require('../../../services/catalog/openClip.service.js');

const ALLOWED_PRODUCT_TYPES = new Set(['ao', 'quan', 'vay', 'phukien', 'giay', 'tui', 'aokhoac']);
const OPENCLIP_IMAGE_TYPE_MIN_SCORE = Number(process.env.OPENCLIP_IMAGE_TYPE_MIN_SCORE || 0.23);
const OPENCLIP_IMAGE_TYPE_MIN_MARGIN = Number(process.env.OPENCLIP_IMAGE_TYPE_MIN_MARGIN || 0.03);
const OPENCLIP_IMAGE_CATEGORY_LABELS = [
  {
    key: 'ao',
    prompts: ['áo', 'áo thun', 'áo sơ mi', 'shirt', 't-shirt', 'fashion top']
  },
  {
    key: 'aokhoac',
    prompts: ['áo khoác', 'jacket', 'blazer', 'outerwear jacket']
  },
  {
    key: 'quan',
    prompts: ['quần', 'quần jean', 'trousers', 'pants', 'fashion bottom']
  },
  {
    key: 'vay',
    prompts: ['váy', 'đầm', 'dress', 'skirt']
  },
  {
    key: 'giay',
    prompts: ['giày', 'sneaker', 'shoe', 'sandal']
  },
  {
    key: 'tui',
    prompts: ['túi', 'túi xách', 'handbag', 'bag']
  },
  {
    key: 'phukien',
    prompts: ['phụ kiện thời trang', 'accessory', 'fashion accessory', 'thắt lưng', 'mũ']
  }
];

function normalizeMessage(input) {
  return String(input || '').trim();
}

function normalizeForCompare(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCurrentPriceFromRecord(item) {
  const row = item && typeof item === 'object' ? item : {};
  const candidates = [];

  const fromVirtual = Number(row.giaMoi || 0);
  if (Number.isFinite(fromVirtual) && fromVirtual > 0) candidates.push(fromVirtual);

  const fromDiscountField = Number(row.giaSauGiam || 0);
  if (Number.isFinite(fromDiscountField) && fromDiscountField > 0) candidates.push(fromDiscountField);

  const base = Number(row.gia || 0);
  const percent = Number(row.phantramgiamgia || 0);
  if (base > 0) {
    const effectiveBase = percent > 0 ? Math.round(base * (1 - percent / 100)) : base;
    if (effectiveBase > 0) candidates.push(effectiveBase);
  }

  if (Array.isArray(row.bienthe)) {
    row.bienthe.forEach((variant) => {
      if (!variant || typeof variant !== 'object') return;
      const variantBase = Number(variant.gia || 0);
      if (!Number.isFinite(variantBase) || variantBase <= 0) return;
      const variantPercent = Number(variant.phantramgiamgia || 0);
      const variantCurrent = variantPercent > 0
        ? Math.round(variantBase * (1 - variantPercent / 100))
        : variantBase;
      if (variantCurrent > 0) candidates.push(variantCurrent);
    });
  }

  if (candidates.length === 0) return 0;
  return Math.min(...candidates);
}

function parseMoneyToVnd(valueText, unitText = '') {
  const rawNumber = String(valueText || '').replace(/\s+/g, '').replace(/,/g, '.').replace(/\.(?=\d{3}(\D|$))/g, '');
  const base = Number(rawNumber);
  if (!Number.isFinite(base) || base <= 0) return 0;

  const unit = String(unitText || '').toLowerCase();
  if (unit.startsWith('tr') || unit.includes('trieu') || unit.includes('triệu')) return Math.round(base * 1000000);
  if (unit === 'k' || unit.includes('ngan') || unit.includes('ngàn')) return Math.round(base * 1000);
  // Vietnamese shopping queries often use shorthand like "duoi 60" meaning 60.000đ.
  if (!unit && base < 1000) return Math.round(base * 1000);
  return Math.round(base);
}

function extractPriceConstraint(question) {
  const q = String(question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

  if (!q) return null;
  const amount = '(\\d[\\d\\s.,]*)(?:\\s*(k|ngan|tr|trieu|d))?';

  const rangeMatch = q.match(new RegExp(`(?:tu|from)\\s*${amount}\\s*(?:den|toi|to|-)\\s*${amount}`));
  if (rangeMatch) {
    const min = parseMoneyToVnd(rangeMatch[1], rangeMatch[2]);
    const max = parseMoneyToVnd(rangeMatch[3], rangeMatch[4]);
    if (min > 0 && max > 0) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
        minInclusive: true,
        maxInclusive: true
      };
    }
  }

  const underMatch = q.match(new RegExp(`(?:duoi|nho hon|it hon|less than)\\s*${amount}`));
  if (underMatch) {
    const max = parseMoneyToVnd(underMatch[1], underMatch[2]);
    if (max > 0) return { max, maxInclusive: false };
  }

  const maxMatch = q.match(new RegExp(`(?:toi da|khong qua|khong vuot qua|max|duoi bang|<=)\\s*${amount}`));
  if (maxMatch) {
    const max = parseMoneyToVnd(maxMatch[1], maxMatch[2]);
    if (max > 0) return { max, maxInclusive: true };
  }

  const overMatch = q.match(new RegExp(`(?:tren|lon hon|hon|more than|greater than)\\s*${amount}`));
  if (overMatch) {
    const min = parseMoneyToVnd(overMatch[1], overMatch[2]);
    if (min > 0) return { min, minInclusive: false };
  }

  const minMatch = q.match(new RegExp(`(?:tu|from|>=|tren bang)\\s*${amount}`));
  if (minMatch) {
    const min = parseMoneyToVnd(minMatch[1], minMatch[2]);
    if (min > 0) return { min, minInclusive: true };
  }

  return null;
}

function matchPriceConstraint(price, constraint) {
  const amount = Number(price || 0);
  if (!constraint || !Number.isFinite(amount) || amount <= 0) return true;

  if (Number.isFinite(constraint.min)) {
    const allow = constraint.minInclusive ? amount >= constraint.min : amount > constraint.min;
    if (!allow) return false;
  }

  if (Number.isFinite(constraint.max)) {
    const allow = constraint.maxInclusive ? amount <= constraint.max : amount < constraint.max;
    if (!allow) return false;
  }

  return true;
}

function applyPriceConstraintToProducts(products, constraint) {
  const rows = Array.isArray(products) ? products : [];
  if (!constraint) return rows;
  return rows.filter((item) => {
    const finalPrice = Number(item && (item.giaSauGiam || item.gia) || 0);
    return matchPriceConstraint(finalPrice, constraint);
  });
}

function shouldSuggestProducts(question) {
  const q = String(question || '').toLowerCase();
  if (!q) return false;

  // Only show product cards when user explicitly asks to view/suggest products.
 const includePatterns = [
  /goi\s*y|gợi\s*ý/i,
  /de\s*xuat|đề\s*xuất/i,
  /tu\s*van|tư\s*vấn/i,

  /san\s*pham|sản\s*phẩm/i,
  /xem\s*(san\s*pham|sản\s*phẩm|mau|mẫu)/i,
  /link\s*(san\s*pham|sản\s*phẩm)/i,

  /mau\s*nao|mẫu\s*nào|mau\s*ao|mẫu\s*áo/i,
  /cho\s*toi\s*xem|cho\s*m[iì]nh\s*xem/i,

  /mua\s*(do|đồ|san\s*pham|sản\s*phẩm|ao|áo|quan|quần|vay|váy|tui|túi)/i,

    // Intent-only queries still need product cards
    /di\s*choi|đi\s*chơi/i,
    /di\s*lam|đi\s*làm/i,
    /du\s*tiec|dự\s*tiệc/i,
    /the\s*thao|thể\s*thao/i,
    /o\s*nha|ở\s*nhà/i,
    /tuoi|tuổi|be|bé|tre|trẻ/i,
    /thuong\s*hieu|thương\s*hiệu|brand/i,

  // Áo
  /ao|áo|ao\s*thun|áo\s*thun|t\s*shirt|tee/i,
  /hoodie|sweater|ao\s*len|áo\s*len/i,
  /so\s*mi|sơ\s*mi|ao\s*so\s*mi|áo\s*sơ\s*mi/i,
  /ao\s*khoac|áo\s*khoác|jacket|blazer/i,

  // Quần
  /quan|quần|jean|quần\s*jean|denim/i,
  /short|quan\s*short|quần\s*short/i,
  /quan\s*tay|quần\s*tây|trouser/i,
  /jogger|quan\s*jogger|quần\s*jogger/i,

  // Váy / đầm
  /vay|váy|dam|đầm/i,
  /chan\s*vay|chân\s*váy|skirt/i,
  /maxi|vay\s*maxi|váy\s*maxi/i,

  // Phụ kiện
  /tui|túi|tui\s*xach|túi\s*xách|bag/i,
  /that\s*lung|thắt\s*lưng|belt/i,
  /mu|mũ|non|nón|cap|hat/i,
  /khan\s*choang|khăn\s*choàng|scarf/i,

  // Giày dép
  /giay|giày|sneaker/i,
  /dep|dép|sandal/i,
  /boot|boots/i
];

  return includePatterns.some((pattern) => pattern.test(q));
}

function extractMentionedProductIds(text) {
  const ids = new Set();
  const str = String(text || '');
  const regex = /\b([a-f0-9]{24})\b/gi;
  let match = regex.exec(str);
  while (match) {
    ids.add(String(match[1] || '').toLowerCase());
    match = regex.exec(str);
  }
  return ids;
}

function extractRequestedColor(question) {
  const q = normalizeForCompare(question);
  if (!q) return '';
  const colors = ['hong', 'xanh', 'xanh la', 'trang', 'den', 'do', 'vang', 'tim', 'cam', 'nau', 'be', 'xam'];
  for (const color of colors) {
    if (q.includes(color)) return color;
  }
  return '';
}

function normalizeColor(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerHasNegativeAvailability(answer) {
  const t = normalizeForCompare(answer);
  return /khong co|chua co|het hang|khong tim thay/.test(t);
}

function isProductFilterQuestion(question) {
  const q = normalizeForCompare(question);
  if (!q) return false;

  return /tuoi|be|tre|thuong hieu|brand|dip|di choi|di lam|du tiec|the thao|o nha/.test(q);
}

function buildAvailableProductsAnswer(context, question) {
  const products = Array.isArray(context && context.products) && context.products.length
    ? context.products
    : (Array.isArray(context && context.topSelling) ? context.topSelling : []);
  if (!products.length) return '';

  const picked = products.slice(0, 3);
  const lines = [
    'Shop hiện có sản phẩm phù hợp với nhu cầu bạn hỏi. Bạn tham khảo nhanh:'
  ];

  picked.forEach((item, index) => {
    const name = String(item && item.tensanpham ? item.tensanpham : 'Sản phẩm');
    const finalPrice = Number(item && (item.giaSauGiam || item.gia) || 0);
    const priceText = finalPrice > 0 ? ` - ${finalPrice.toLocaleString('vi-VN')}đ` : '';
    const url = item && item.url ? ` (${item.url})` : '';
    lines.push(`${index + 1}. ${name}${priceText}${url}`);
  });

  if (isProductFilterQuestion(question)) {
    lines.push('Bạn muốn mình lọc hẹp hơn theo thương hiệu, dịp hoặc nhóm tuổi cụ thể không?');
  }

  return lines.join('\n');
}

function sanitizeBadLinksInAnswer(answer) {
  let text = String(answer || '').trim();
  if (!text) return text;

  // Replace malformed/placeholder domains with internal routes.
  text = text
    .replace(/-?\s*(?:https?:\/\/)?(?:www\.)?ban-thoi-trang\.com\/(new|best-selling|san-pham|sanpham|products?)\b/gi, '/products')
    .replace(/-?\s*(?:https?:\/\/)?(?:www\.)?(?:website|example\.com|localhost(?::\d+)?)\/(new|best-selling|san-pham|sanpham|products?)\b/gi, '/products')
    .replace(/\((?:https?:\/\/)?(?:www\.)?ban-thoi-trang\.com\/[^\)]*\)/gi, '(/products)')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?ban-thoi-trang\.com\/[^\s)]*/gi, '/products')
    .replace(/\b(?:https?:\/\/)?(?:www\.)?(?:website|example\.com|localhost(?::\d+)?)\/[^\s)]*/gi, '/products');

  return text;
}

function buildAvailableSuggestedAnswer(suggestedProducts) {
  const items = Array.isArray(suggestedProducts) ? suggestedProducts.slice(0, 3) : [];
  if (!items.length) return '';

  const lines = ['Shop hiện có sản phẩm phù hợp, bạn xem nhanh:'];
  items.forEach((item, index) => {
    const name = String(item && item.name ? item.name : 'Sản phẩm');
    const price = Number(item && item.price || 0);
    const priceText = price > 0 ? ` - ${price.toLocaleString('vi-VN')}đ` : '';
    const url = item && item.url ? ` (${item.url})` : '';
    lines.push(`${index + 1}. ${name}${priceText}${url}`);
  });
  lines.push('Bạn muốn mình lọc chính xác hơn theo tuổi, dịp hoặc thương hiệu không?');
  return lines.join('\n');
}

function findProductsByRequestedColor(context, requestedColor) {
  if (!requestedColor) return [];
  const products = Array.isArray(context && context.products) ? context.products : [];

  return products
    .map((p) => {
      const colorDetails = Array.isArray(p && p.mauSacChiTiet) ? p.mauSacChiTiet : [];
      const matchedDetails = colorDetails.filter((c) => normalizeColor(c && c.ten).includes(requestedColor));
      const matchedAny = matchedDetails.length > 0;
      const hasSizeInMatchedColor = matchedDetails.some((c) => Boolean(c && c.conSize));

      return {
        product: p,
        matchedAny,
        hasSizeInMatchedColor
      };
    })
    .filter((x) => x.matchedAny);
}

function buildColorAvailabilityAnswer(context, requestedColor) {
  const matches = findProductsByRequestedColor(context, requestedColor);
  if (!matches.length) return '';

  const available = matches.filter((m) => m.hasSizeInMatchedColor).slice(0, 3);
  const unavailable = matches.filter((m) => !m.hasSizeInMatchedColor).slice(0, 3);

  const lines = [];
  if (available.length) {
    lines.push('Shop có màu bạn cần. Bạn tham khảo nhanh:');
    available.forEach((m, idx) => {
      const p = m.product || {};
      const price = Number(p.giaSauGiam || p.gia || 0);
      lines.push(`${idx + 1}. ${p.tensanpham || 'Sản phẩm'}${price > 0 ? ` - ${price.toLocaleString('vi-VN')}đ` : ''}${p.url ? ` (${p.url})` : ''}`);
    });
  }

  if (!available.length && unavailable.length) {
    lines.push('Shop có màu bạn hỏi nhưng hiện màu này đang hết size để đặt hàng.');
  }

  if (available.length && unavailable.length) {
    lines.push('Một số mẫu khác có màu này hiện đang hết size.');
  }

  lines.push('Bạn muốn mình lọc thêm theo size còn hàng hoặc màu gần giống không?');
  return lines.join('\n');
}

function detectRequestedGroups(question) {
  const q = normalizeForCompare(question);
  if (!q) return [];

  const groups = [];
  if (/(\bnon\b|\bmu\b|\bhat\b|\bcap\b)/.test(q)) groups.push('hat');
  if (/(\bao\b|\bpolo\b|\bthun\b|\bso mi\b|\bkhoac\b|\bhoodie\b|\bblazer\b|\bshirt\b)/.test(q)) groups.push('top');
  if (/(\bquan\b|\bjean\b|\bshort\b|\bjogger\b|\btrouser\b|\bpant\b)/.test(q)) groups.push('bottom');

  return groups;
}

function productMatchesGroup(product, group) {
  const text = normalizeForCompare(`${product && product.name ? product.name : ''} ${product && product.url ? product.url : ''}`);
  if (!text) return false;

  if (group === 'hat') return /(\bnon\b|\bmu\b|\bhat\b|\bcap\b)/.test(text);
  if (group === 'top') return /(\bao\b|\bpolo\b|\bthun\b|\bso mi\b|\bkhoac\b|\bhoodie\b|\bblazer\b|\bshirt\b)/.test(text);
  if (group === 'bottom') return /(\bquan\b|\bjean\b|\bshort\b|\bjogger\b|\btrouser\b|\bpant\b)/.test(text);
  return false;
}

function toSuggestedProducts(context, answerText, questionText) {
  const byId = new Map();

  const push = (item) => {
    if (!item) return;
    const id = String(item.id || '').trim();
    if (!id || byId.has(id)) return;
    const finalPrice = Number(item.giaSauGiam || item.gia || 0);
    const originalPrice = Number(item.gia || 0);
    const hasDiscount = originalPrice > 0 && finalPrice > 0 && finalPrice < originalPrice;
    byId.set(id, {
      id,
      name: String(item.tensanpham || 'Sản phẩm'),
      url: String(item.url || `/products/${id}`),
      imageUrl: String(item.imageUrl || '/images/shopping.png'),
      price: finalPrice,
      originalPrice,
      hasDiscount,
      priceText: finalPrice > 0 ? `${finalPrice.toLocaleString('vi-VN')}đ` : '',
      originalPriceText: hasDiscount ? `${originalPrice.toLocaleString('vi-VN')}đ` : ''
    });
  };

  // Suggest from both contextual search results and top-selling products.
  (Array.isArray(context.products) ? context.products : []).forEach(push);
  (Array.isArray(context.topSelling) ? context.topSelling : []).forEach(push);
  const priceConstraint = extractPriceConstraint(questionText);
  const candidates = Array.from(byId.values()).filter((item) => matchPriceConstraint(item.price, priceConstraint));
  if (candidates.length === 0) return [];

  const answerNorm = normalizeForCompare(answerText);
  if (!answerNorm) return candidates.slice(0, 4);

  const mentionedIds = extractMentionedProductIds(answerText);
  const byMentionedId = candidates.filter((item) => mentionedIds.has(String(item.id || '').toLowerCase()));
  if (byMentionedId.length > 0) return byMentionedId.slice(0, 4);

  const matched = candidates.filter((item) => {
    const nameNorm = normalizeForCompare(item.name);
    if (!nameNorm) return false;
    if (answerNorm.includes(nameNorm)) return true;

    const tokens = nameNorm.split(' ').filter((token) => token.length >= 4);
    if (tokens.length === 0) return false;
    return tokens.some((token) => answerNorm.includes(token));
  });

  const baseList = matched.length > 0 ? matched : candidates;

  const requestedGroups = detectRequestedGroups(questionText);
  if (requestedGroups.length === 0) {
    return baseList.slice(0, 4);
  }

  const selected = [];
  const selectedIds = new Set();
  const take = (item) => {
    if (!item) return;
    const id = String(item.id || '');
    if (!id || selectedIds.has(id)) return;
    selected.push(item);
    selectedIds.add(id);
  };

  // Ensure each requested outfit group has at least one representative if available.
  requestedGroups.forEach((group) => {
    const first = baseList.find((item) => productMatchesGroup(item, group));
    take(first);
  });

  baseList.forEach(take);
  return selected.slice(0, 4);
}

function extractOrderCodes(message) {
  const text = String(message || '').toUpperCase();
  if (!text) return [];
  const matches = text.match(/\bDH\d{8,}\b/g) || [];
  return Array.from(new Set(matches));
}

function getOrderStatusLabel(status) {
  const map = {
    choxacnhan: 'Chờ xác nhận',
    daxacnhan: 'Đã xác nhận',
    dangchuanbi: 'Đang chuẩn bị',
    danggiao: 'Đang giao',
    dagiao: 'Đã giao',
    requested_return: 'Yêu cầu hoàn hàng',
    approved_return: 'Đã duyệt hoàn hàng',
    rejected_return: 'Từ chối hoàn hàng',
    return_shipping: 'Đang gửi hàng hoàn',
    returned: 'Đã nhận hàng hoàn',
    refunded: 'Đã hoàn tiền',
    yeucau_hoanhang: 'Yêu cầu hoàn hàng',
    daduyet_hoanhang: 'Đã duyệt hoàn hàng',
    tuchoi_hoanhang: 'Từ chối hoàn hàng',
    danggui_hanghoan: 'Đang gửi hàng hoàn',
    danhan_hanghoan: 'Đã nhận hàng hoàn',
    dahoantien: 'Đã hoàn tiền',
    dahuy: 'Đã hủy',
    hoanhang: 'Hoàn hàng'
  };
  return map[String(status || '').toLowerCase()] || String(status || 'Không rõ');
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function buildExactOrderAnswer(orderCode, myOrders) {
  const codes = extractOrderCodes(orderCode);
  if (!myOrders || !Array.isArray(myOrders.matchedOrders) || codes.length === 0) return null;

  const orderMap = new Map((myOrders.matchedOrders || [])
    .filter((item) => item && item.madonhang)
    .map((item) => [String(item.madonhang || '').toUpperCase(), item]));

  const targetCode = codes[0];
  const target = orderMap.get(targetCode);
  if (!target) {
    return {
      answer: `Mình không tìm thấy đơn ${targetCode} trong tài khoản của bạn. Bạn vui lòng kiểm tra lại mã đơn hoặc vào trang /orders để xem danh sách đơn hiện có.`
    };
  }

  const created = target.ngaytao ? new Date(target.ngaytao).toLocaleString('vi-VN') : 'Không rõ';
  const statusLabel = getOrderStatusLabel(target.trangthai);
  const reasonText = target.trangthai === 'dahuy' && target.lydohuy
    ? `\n- Lý do hủy: ${String(target.lydohuy).trim()}`
    : '';

  return {
    answer: [
      `📌 Thông tin đơn ${targetCode}`,
      `- Trạng thái: ${statusLabel}`,
      `- Tổng tiền: ${formatMoney(target.tongtien)}`,
      `- Ngày tạo: ${created}`,
      `- Phương thức thanh toán: ${target.phuongthucthanhtoan || 'Không rõ'}`,
      reasonText
    ].filter(Boolean).join('\n')
  };
}

module.exports.sendMessage = async (req, res) => {
  try {
    const question = normalizeMessage(req.body && req.body.message);
    const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];
    const provider = normalizeMessage(req.body && req.body.provider).toLowerCase() || 'ollama';
    const model = normalizeMessage(req.body && req.body.model);

    if (!question) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập câu hỏi' });
    }

    if (question.length > 1200) {
      return res.status(400).json({ success: false, message: 'Câu hỏi quá dài (tối đa 1200 ký tự)' });
    }

    const context = await buildDataContext({
      question,
      userId: req.user && req.user._id ? req.user._id : null,
      useOpenClip: provider === 'openclip'
    });

    const priceConstraint = extractPriceConstraint(question);
    if (priceConstraint) {
      context.products = applyPriceConstraintToProducts(context.products, priceConstraint).slice(0, 6);
      context.topSelling = applyPriceConstraintToProducts(context.topSelling, priceConstraint).slice(0, 8);
    }

    const exactOrder = buildExactOrderAnswer(question, context && context.myOrders);
    if (exactOrder) {
      return res.json({
        success: true,
        data: {
          answer: exactOrder.answer,
          model: 'db-verified',
          provider: 'system',
          suggestedProducts: [],
          contextMeta: {
            products: Array.isArray(context.products) ? context.products.length : 0,
            hasFlashSale: Boolean(context.flashSale),
            vouchers: Array.isArray(context.vouchers) ? context.vouchers.length : 0,
            sizeGuides: Array.isArray(context.sizeGuides) ? context.sizeGuides.length : 0,
            topSelling: Array.isArray(context.topSelling) ? context.topSelling.length : 0,
            topRated: Array.isArray(context.topRated) ? context.topRated.length : 0,
            reviewsRecent: context.reviews && Array.isArray(context.reviews.recent) ? context.reviews.recent.length : 0,
            reviewsMine: context.reviews && Array.isArray(context.reviews.mine) ? context.reviews.mine.length : 0,
            settings: Array.isArray(context.settings) ? context.settings.length : 0,
            myOrders: context.myOrders ? Number(context.myOrders.totalOrders || 0) : 0,
            myVouchers: context.myVouchers ? Number(context.myVouchers.totalSaved || 0) : 0,
            matchedOrders: context.myOrders && Array.isArray(context.myOrders.matchedOrders)
              ? context.myOrders.matchedOrders.length
              : 0
          }
        }
      });
    }

    const ai = await askAI({ question, history, context, provider, model });

    let answer = String(ai && ai.content ? ai.content : '').trim();
    const requestedColor = extractRequestedColor(question);
    answer = sanitizeBadLinksInAnswer(answer);

    if (requestedColor && answerHasNegativeAvailability(answer)) {
      const corrected = buildColorAvailabilityAnswer(context, requestedColor);
      if (corrected) answer = corrected;
    }

    if (answerHasNegativeAvailability(answer)) {
      const corrected = buildAvailableProductsAnswer(context, question);
      if (corrected) answer = corrected;
    }

    const fallbackSuggestedProducts = toSuggestedProducts(context, '', question);
    if (answerHasNegativeAvailability(answer) && fallbackSuggestedProducts.length > 0) {
      const corrected = buildAvailableSuggestedAnswer(fallbackSuggestedProducts);
      if (corrected) answer = corrected;
    }

    const shouldShowCards = provider === 'openclip' || shouldSuggestProducts(question);
    const suggestedProducts = shouldShowCards
      ? toSuggestedProducts(context, answer, question)
      : [];

    if (answerHasNegativeAvailability(answer) && suggestedProducts.length > 0) {
      const corrected = buildAvailableSuggestedAnswer(suggestedProducts);
      if (corrected) answer = corrected;
    }

    answer = sanitizeBadLinksInAnswer(answer);

    return res.json({
      success: true,
      data: {
        answer,
        model: ai.model,
        provider: ai.provider || provider,
        suggestedProducts,
        contextMeta: {
          products: Array.isArray(context.products) ? context.products.length : 0,
          hasFlashSale: Boolean(context.flashSale),
          vouchers: Array.isArray(context.vouchers) ? context.vouchers.length : 0,
          sizeGuides: Array.isArray(context.sizeGuides) ? context.sizeGuides.length : 0,
          topSelling: Array.isArray(context.topSelling) ? context.topSelling.length : 0,
          topRated: Array.isArray(context.topRated) ? context.topRated.length : 0,
          openClipUsed: Boolean(context.openClip && context.openClip.used),
          openClipModel: context.openClip && context.openClip.model ? context.openClip.model : '',
          reviewsRecent: context.reviews && Array.isArray(context.reviews.recent) ? context.reviews.recent.length : 0,
          reviewsMine: context.reviews && Array.isArray(context.reviews.mine) ? context.reviews.mine.length : 0,
          settings: Array.isArray(context.settings) ? context.settings.length : 0,
          myOrders: context.myOrders ? Number(context.myOrders.totalOrders || 0) : 0,
          myVouchers: context.myVouchers ? Number(context.myVouchers.totalSaved || 0) : 0
        }
      }
    });
  } catch (error) {
    const msg = String(error && error.message ? error.message : 'Lỗi không xác định');
    const selectedProvider = normalizeMessage(req.body && req.body.provider).toLowerCase() || 'ollama';
    if (msg.includes('GEMINI_API_KEY_MISSING')) {
      return res.status(503).json({
        success: false,
        message: 'Chưa cấu hình Gemini API key. Vui lòng thêm GEMINI_API_KEY trong .env.'
      });
    }

    if (msg.includes('OPENROUTER_API_KEY_MISSING')) {
      return res.status(503).json({
        success: false,
        message: 'Chưa cấu hình OpenRouter API key. Vui lòng thêm OPENROUTER_API_KEY trong .env.'
      });
    }

    if (msg.toLowerCase().includes('developer instruction is not enabled')) {
      return res.status(503).json({
        success: false,
        message: 'Model Gemini hiện tại chưa được bật cho API key này. Hệ thống sẽ ưu tiên dùng gemini-2.5-flash nếu có thể.'
      });
    }

    const lower = msg.toLowerCase();
    if (lower.includes('high demand') || lower.includes('try again later')) {
      return res.status(503).json({
        success: false,
        message: 'Model Gemini đang quá tải tạm thời. Vui lòng thử lại sau vài giây.'
      });
    }

    const isConnectionError = lower.includes('fetch failed')
      || lower.includes('econnrefused')
      || lower.includes('abort')
      || lower.includes('timed out')
      || lower.includes('timeout');

    if (isConnectionError) {
      if (selectedProvider === 'gemini') {
        return res.status(503).json({
          success: false,
          message: 'Không kết nối được Gemini hoặc phản hồi quá chậm. Vui lòng thử lại sau ít giây.'
        });
      }

      if (selectedProvider === 'openrouter') {
        return res.status(503).json({
          success: false,
          message: 'Không kết nối được OpenRouter hoặc phản hồi quá chậm. Vui lòng thử lại sau ít giây.'
        });
      }

      return res.status(503).json({
        success: false,
        message: 'Không kết nối được Ollama. Hãy bật Ollama và pull model trước khi chat.'
      });
    }

    if (msg.includes('OLLAMA_MEMORY_INSUFFICIENT') || lower.includes('requires more system memory')) {
      return res.status(503).json({
        success: false,
        message: 'Model Ollama hiện tại cần nhiều RAM hơn máy đang có. Vui lòng đổi model nhẹ hơn (ví dụ gemma3:1b hoặc gemma2:2b), hoặc chọn Gemini/OpenRouter.'
      });
    }

    console.error('AI chat error:', error);
    return res.status(500).json({ success: false, message: 'Không thể xử lý câu hỏi lúc này' });
  }
};

module.exports.searchOpenClip = async (req, res) => {
  try {
    const query = normalizeMessage(req.body && req.body.query);
    if (!query) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mô tả sản phẩm' });
    }

    if (query.length > 500) {
      return res.status(400).json({ success: false, message: 'Mô tả quá dài (tối đa 500 ký tự)' });
    }

    const rows = await Sanpham.find({
      daxoa: { $ne: true },
      trangthai: { $in: ['active', 'dangban'] },
      hinhanh: { $exists: true, $ne: '' }
    })
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(280)
      .lean({ virtuals: true });

    const products = (rows || []).map((item) => {
      const basePrice = Number(item.gia || 0);
      const percent = Number(item.phantramgiamgia || 0);
      const currentPrice = getCurrentPriceFromRecord(item);
      return {
        id: String(item._id || ''),
        tensanpham: String(item.tensanpham || 'Sản phẩm'),
        imageUrl: String(item.hinhanh || '/images/shopping.png'),
        url: item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: currentPrice,
        phantramgiamgia: percent,
        soluongton: Number(item.soluongton || 0),
        gioitinh: String(item.gioitinh || ''),
        loaisanpham: String(item.loaisanpham || ''),
        openClipScore: 0
      };
    });

    const ranked = await rankProductsByQuery({ query, products, topK: 12 });

    return res.json({
      success: true,
      data: {
        query,
        products: Array.isArray(ranked.matches) ? ranked.matches : [],
        openClipMeta: {
          used: Boolean(ranked.used),
          model: ranked.meta && ranked.meta.model ? ranked.meta.model : '',
          pretrained: ranked.meta && ranked.meta.pretrained ? ranked.meta.pretrained : '',
          device: ranked.meta && ranked.meta.device ? ranked.meta.device : '',
          candidates: Number(ranked.meta && ranked.meta.candidates ? ranked.meta.candidates : 0)
        }
      }
    });
  } catch (error) {
    console.error('OpenCLIP search error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tìm kiếm OpenCLIP lúc này' });
  }
};

module.exports.searchOpenClipByImage = async (req, res) => {
  const uploadedPath = req.file && req.file.path ? String(req.file.path) : '';
  try {
    if (!uploadedPath) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh để tìm kiếm' });
    }

    const requestedType = String(req.body && req.body.loaisanpham || '').trim().toLowerCase();
    const manualType = ALLOWED_PRODUCT_TYPES.has(requestedType) ? requestedType : '';

    let detectedType = '';
    let confidentDetectedType = '';
    let detectMeta = null;

    if (!manualType) {
      try {
        const detected = await classifyImageCategory({
          imagePath: uploadedPath,
          labels: OPENCLIP_IMAGE_CATEGORY_LABELS
        });

        detectedType = String(detected && detected.predictedKey ? detected.predictedKey : '').trim().toLowerCase();
        if (!ALLOWED_PRODUCT_TYPES.has(detectedType)) detectedType = '';

        const scoredLabels = Array.isArray(detected && detected.labels) ? detected.labels : [];
        const top1 = scoredLabels[0] || null;
        const top2 = scoredLabels[1] || null;
        const top1Score = Number(top1 && top1.score);
        const top2Score = Number(top2 && top2.score);
        const scoreMargin = Number.isFinite(top1Score) && Number.isFinite(top2Score)
          ? (top1Score - top2Score)
          : Number.POSITIVE_INFINITY;

        const passMinScore = Number.isFinite(top1Score) && top1Score >= OPENCLIP_IMAGE_TYPE_MIN_SCORE;
        const passMargin = Number.isFinite(scoreMargin) && scoreMargin >= OPENCLIP_IMAGE_TYPE_MIN_MARGIN;

        if (detectedType && passMinScore && passMargin) {
          confidentDetectedType = detectedType;
        }

        detectMeta = {
          ...detected,
          top1Score: Number.isFinite(top1Score) ? top1Score : 0,
          top2Score: Number.isFinite(top2Score) ? top2Score : 0,
          scoreMargin: Number.isFinite(scoreMargin) ? scoreMargin : 0,
          minScoreThreshold: OPENCLIP_IMAGE_TYPE_MIN_SCORE,
          minMarginThreshold: OPENCLIP_IMAGE_TYPE_MIN_MARGIN,
          passMinScore,
          passMargin,
          confident: Boolean(detectedType && passMinScore && passMargin)
        };
      } catch (detectError) {
        detectMeta = {
          used: false,
          reason: 'CLASSIFY_FAILED',
          message: detectError && detectError.message ? String(detectError.message) : 'UNKNOWN'
        };
      }
    }

    const selectedType = manualType || confidentDetectedType;

    const baseFilter = {
      daxoa: { $ne: true },
      trangthai: { $in: ['active', 'dangban'] },
      hinhanh: { $exists: true, $ne: '' }
    };

    const typedFilter = selectedType ? { ...baseFilter, loaisanpham: selectedType } : { ...baseFilter };

    let rows = await Sanpham.find(typedFilter)
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(selectedType ? 180 : 320)
      .lean({ virtuals: true });

    let broadened = false;
    if (selectedType && rows.length < 24) {
      broadened = true;
      rows = await Sanpham.find(baseFilter)
        .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham bienthe')
        .sort({ ngaycapnhat: -1, ngaytao: -1 })
        .limit(300)
        .lean({ virtuals: true });
    }

    const products = (rows || []).map((item) => {
      const basePrice = Number(item.gia || 0);
      const percent = Number(item.phantramgiamgia || 0);
      const currentPrice = getCurrentPriceFromRecord(item);
      return {
        id: String(item._id || ''),
        tensanpham: String(item.tensanpham || 'Sản phẩm'),
        imageUrl: String(item.hinhanh || '/images/shopping.png'),
        url: item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: currentPrice,
        phantramgiamgia: percent,
        soluongton: Number(item.soluongton || 0),
        gioitinh: String(item.gioitinh || ''),
        loaisanpham: String(item.loaisanpham || '')
      };
    });

    const ranked = await rankProductsByImage({
      imagePath: uploadedPath,
      products,
      topK: 12
    });

    return res.json({
      success: true,
      data: {
        products: Array.isArray(ranked.matches) ? ranked.matches : [],
        openClipMeta: {
          used: Boolean(ranked.used),
          model: ranked.meta && ranked.meta.model ? ranked.meta.model : '',
          pretrained: ranked.meta && ranked.meta.pretrained ? ranked.meta.pretrained : '',
          device: ranked.meta && ranked.meta.device ? ranked.meta.device : '',
          mode: ranked.meta && ranked.meta.mode ? ranked.meta.mode : 'image',
          candidates: Number(ranked.meta && ranked.meta.candidates ? ranked.meta.candidates : 0),
          selectedType,
          typeFilterApplied: Boolean(selectedType) && !broadened,
          typeFilterBroadened: Boolean(selectedType) && broadened,
          manualType,
          detectedType,
          confidentDetectedType,
          classifyUsed: Boolean(detectMeta && detectMeta.used),
          classifyReason: detectMeta && detectMeta.reason ? detectMeta.reason : '',
          classifyConfident: Boolean(detectMeta && detectMeta.confident),
          classifyTop1Score: detectMeta && Number.isFinite(Number(detectMeta.top1Score)) ? Number(detectMeta.top1Score) : 0,
          classifyTop2Score: detectMeta && Number.isFinite(Number(detectMeta.top2Score)) ? Number(detectMeta.top2Score) : 0,
          classifyScoreMargin: detectMeta && Number.isFinite(Number(detectMeta.scoreMargin)) ? Number(detectMeta.scoreMargin) : 0,
          classifyMinScoreThreshold: OPENCLIP_IMAGE_TYPE_MIN_SCORE,
          classifyMinMarginThreshold: OPENCLIP_IMAGE_TYPE_MIN_MARGIN,
          classifyTopScore: detectMeta && Array.isArray(detectMeta.labels) && detectMeta.labels[0] && Number.isFinite(Number(detectMeta.labels[0].score))
            ? Number(detectMeta.labels[0].score)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('OpenCLIP image search error:', error);
    return res.status(500).json({ success: false, message: 'Không thể tìm kiếm theo ảnh lúc này' });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlink(uploadedPath, () => {});
    }
  }
};
