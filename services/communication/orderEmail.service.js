const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const { sendMail } = require('../communication/mailer.service.js');

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRows(items) {
  return (items || []).map((item, index) => {
    const name = escapeHtml(item.tensanpham || 'Sáº£n pháº©m');
    const variant = [item.mausac ? `MÃ u: ${escapeHtml(item.mausac)}` : '', item.kichco ? `Size: ${escapeHtml(item.kichco)}` : '']
      .filter(Boolean)
      .join(' | ');
    const qty = Number(item.soluong || 0);
    const unitPrice = Number(item.giaban || item.giagoc || 0);
    const lineTotal = Number(item.thanhtien || unitPrice * qty);

    return `
      <tr>
        <td style="padding:10px;border:1px solid #e5e7eb;">${index + 1}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;">
          <div style="font-weight:600;">${name}</div>
          ${variant ? `<div style="font-size:12px;color:#6b7280;">${variant}</div>` : ''}
        </td>
        <td style="padding:10px;border:1px solid #e5e7eb;text-align:center;">${qty}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;">${formatCurrency(unitPrice)}</td>
        <td style="padding:10px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(lineTotal)}</td>
      </tr>
    `;
  }).join('');
}

function buildOrderConfirmedTemplate({ order, items, estimatedDeliveryAt }) {
  const customerName = escapeHtml(order.tennguoinhan || 'KhÃ¡ch hÃ ng');
  const orderCode = escapeHtml(order.madonhang || String(order._id || ''));
  const address = escapeHtml(order.diachigiao || '');
  const rows = buildRows(items);

  const html = `
  <div style="font-family:Arial,sans-serif;background:#f6f8ff;padding:24px;">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:20px;color:#fff;">
        <h2 style="margin:0;">ÄÆ¡n hÃ ng #${orderCode} Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n</h2>
      </div>
      <div style="padding:20px;color:#111827;">
        <p>Xin chÃ o <strong>${customerName}</strong>,</p>
        <p>ÄÆ¡n hÃ ng cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n vÃ  Ä‘ang Ä‘Æ°á»£c xá»­ lÃ½.</p>

        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:10px;border:1px solid #e5e7eb;">#</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Sáº£n pháº©m</th>
              <th style="padding:10px;border:1px solid #e5e7eb;">SL</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:right;">ÄÆ¡n giÃ¡</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:right;">ThÃ nh tiá»n</th>
            </tr>
          </thead>
          <tbody>${rows || ''}</tbody>
        </table>

        <div style="margin-top:16px;line-height:1.8;">
          <div><strong>Tá»•ng thanh toÃ¡n:</strong> ${formatCurrency(order.tongtien || order.tamtinh || 0)}</div>
          <div><strong>Äá»‹a chá»‰ giao hÃ ng:</strong> ${address}</div>
          <div><strong>Dá»± kiáº¿n giao:</strong> ${formatDate(estimatedDeliveryAt)}</div>
        </div>
      </div>
    </div>
  </div>`;

  const text = [
    `Xin chÃ o ${customerName},`,
    `ÄÆ¡n hÃ ng #${orderCode} Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n.`,
    `Tá»•ng thanh toÃ¡n: ${formatCurrency(order.tongtien || order.tamtinh || 0)}`,
    `Äá»‹a chá»‰ giao hÃ ng: ${address}`,
    `Dá»± kiáº¿n giao: ${formatDate(estimatedDeliveryAt)}`
  ].join('\n');

  return {
    subject: `ÄÆ¡n hÃ ng #${orderCode} Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n`,
    html,
    text
  };
}

function buildOrderDeliveredTemplate({ order, reviewUrl }) {
  const customerName = escapeHtml(order.tennguoinhan || 'KhÃ¡ch hÃ ng');
  const orderCode = escapeHtml(order.madonhang || String(order._id || ''));

  const html = `
  <div style="font-family:Arial,sans-serif;background:#f6f8ff;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:20px;color:#fff;">
        <h2 style="margin:0;">ÄÆ¡n hÃ ng #${orderCode} Ä‘Ã£ Ä‘Æ°á»£c giao thÃ nh cÃ´ng</h2>
      </div>
      <div style="padding:20px;color:#111827;line-height:1.7;">
        <p>Xin chÃ o <strong>${customerName}</strong>,</p>
        <p>ÄÆ¡n hÃ ng cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c giao thÃ nh cÃ´ng. Cáº£m Æ¡n báº¡n Ä‘Ã£ mua sáº¯m táº¡i Fashion Store ðŸ’š</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${reviewUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">ÄÃ¡nh giÃ¡ sáº£n pháº©m</a>
        </p>
        <p>Náº¿u cÃ³ báº¥t ká»³ váº¥n Ä‘á» nÃ o vá»›i Ä‘Æ¡n hÃ ng, vui lÃ²ng pháº£n há»“i email nÃ y hoáº·c liÃªn há»‡ hotline há»— trá»£.</p>
      </div>
    </div>
  </div>`;

  const text = [
    `Xin chÃ o ${customerName},`,
    `ÄÆ¡n hÃ ng #${orderCode} Ä‘Ã£ Ä‘Æ°á»£c giao thÃ nh cÃ´ng.`,
    'Cáº£m Æ¡n báº¡n Ä‘Ã£ mua sáº¯m táº¡i Fashion Store.',
    `ÄÃ¡nh giÃ¡ sáº£n pháº©m táº¡i: ${reviewUrl}`,
    'Náº¿u cÃ³ váº¥n Ä‘á», vui lÃ²ng liÃªn há»‡ bá»™ pháº­n há»— trá»£.'
  ].join('\n');

  return {
    subject: `ÄÆ¡n hÃ ng #${orderCode} Ä‘Ã£ Ä‘Æ°á»£c giao thÃ nh cÃ´ng`,
    html,
    text
  };
}

function getBaseUrl() {
  return String(process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function sendOrderConfirmedEmail({ orderId }) {
  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order || !order.email) return { sent: false, reason: 'missing-order-or-email' };

  const claim = await Donhang.findOneAndUpdate(
    { _id: order._id, emailxacnhan_dagui: { $ne: true } },
    { $set: { emailxacnhan_dagui: true, emailxacnhan_guio: new Date(), emailloi_cuoi: '' } },
    { new: false }
  ).lean();

  if (!claim) return { sent: false, reason: 'already-sent' };

  const items = await Chitietdonhang.find({ donhang_id: order._id }).lean();
  const estimatedDeliveryAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const emailContent = buildOrderConfirmedTemplate({ order, items, estimatedDeliveryAt });

  try {
    const info = await sendMail({
      to: order.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });

    return { sent: true, info };
  } catch (error) {
    await Donhang.updateOne(
      { _id: order._id },
      { $set: { emailxacnhan_dagui: false, emailloi_cuoi: String(error && error.message ? error.message : error) } }
    );
    throw error;
  }
}

async function sendOrderDeliveredEmail({ orderId }) {
  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order || !order.email) return { sent: false, reason: 'missing-order-or-email' };

  const claim = await Donhang.findOneAndUpdate(
    { _id: order._id, emaildagiao_dagui: { $ne: true } },
    { $set: { emaildagiao_dagui: true, emaildagiao_guio: new Date(), emailloi_cuoi: '' } },
    { new: false }
  ).lean();

  if (!claim) return { sent: false, reason: 'already-sent' };

  const reviewUrl = `${getBaseUrl()}/orders`;
  const emailContent = buildOrderDeliveredTemplate({ order, reviewUrl });

  try {
    const info = await sendMail({
      to: order.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });

    return { sent: true, info };
  } catch (error) {
    await Donhang.updateOne(
      { _id: order._id },
      { $set: { emaildagiao_dagui: false, emailloi_cuoi: String(error && error.message ? error.message : error) } }
    );
    throw error;
  }
}

module.exports = {
  sendOrderConfirmedEmail,
  sendOrderDeliveredEmail,
  buildOrderConfirmedTemplate,
  buildOrderDeliveredTemplate
};

