const fs = require('fs');
const { Sanpham } = require('../../../models');
const { buildDataContext, askAI } = require('../../../services/content/aiChat.service.js');
const { rankProductsByQuery, rankProductsByImage } = require('../../../services/catalog/openClip.service.js');

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

function toSuggestedProducts(context, answerText) {
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
  const candidates = Array.from(byId.values());
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

  return (matched.length > 0 ? matched : candidates).slice(0, 4);
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
    if (requestedColor && answerHasNegativeAvailability(answer)) {
      const corrected = buildColorAvailabilityAnswer(context, requestedColor);
      if (corrected) answer = corrected;
    }

    return res.json({
      success: true,
      data: {
        answer,
        model: ai.model,
        provider: ai.provider || provider,
        suggestedProducts: (provider === 'openclip' || shouldSuggestProducts(question)) ? toSuggestedProducts(context, answer) : [],
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
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(280)
      .lean();

    const products = (rows || []).map((item) => {
      const basePrice = Number(item.gia || 0);
      const percent = Number(item.phantramgiamgia || 0);
      return {
        id: String(item._id || ''),
        tensanpham: String(item.tensanpham || 'Sản phẩm'),
        imageUrl: String(item.hinhanh || '/images/shopping.png'),
        url: item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: percent > 0 ? Math.round(basePrice * (1 - percent / 100)) : basePrice,
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

    const rows = await Sanpham.find({
      daxoa: { $ne: true },
      trangthai: { $in: ['active', 'dangban'] },
      hinhanh: { $exists: true, $ne: '' }
    })
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(500)
      .lean();

    const products = (rows || []).map((item) => {
      const basePrice = Number(item.gia || 0);
      const percent = Number(item.phantramgiamgia || 0);
      return {
        id: String(item._id || ''),
        tensanpham: String(item.tensanpham || 'Sản phẩm'),
        imageUrl: String(item.hinhanh || '/images/shopping.png'),
        url: item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: percent > 0 ? Math.round(basePrice * (1 - percent / 100)) : basePrice,
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
          candidates: Number(ranked.meta && ranked.meta.candidates ? ranked.meta.candidates : 0)
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
