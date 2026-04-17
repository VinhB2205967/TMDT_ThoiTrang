const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const OrderStatusLog = require('../../models/order_status_log_model');
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
    const name = escapeHtml(item.tensanpham || 'Sản phẩm');
    const variant = [item.mausac ? `Màu: ${escapeHtml(item.mausac)}` : '', item.kichco ? `Size: ${escapeHtml(item.kichco)}` : '']
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
  const customerName = escapeHtml(order.tennguoinhan || 'Khách hàng');
  const orderCode = escapeHtml(order.madonhang || String(order._id || ''));
  const address = escapeHtml(order.diachigiao || '');
  const rows = buildRows(items);

  const html = `
  <div style="font-family:Arial,sans-serif;background:#f6f8ff;padding:24px;">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:20px;color:#fff;">
        <h2 style="margin:0;">Đơn hàng #${orderCode} đã được xác nhận</h2>
      </div>
      <div style="padding:20px;color:#111827;">
        <p>Xin chào <strong>${customerName}</strong>,</p>
        <p>Đơn hàng của bạn đã được xác nhận và đang được xử lý.</p>

        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:10px;border:1px solid #e5e7eb;">#</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Sản phẩm</th>
              <th style="padding:10px;border:1px solid #e5e7eb;">SL</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:right;">Đơn giá</th>
              <th style="padding:10px;border:1px solid #e5e7eb;text-align:right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>${rows || ''}</tbody>
        </table>

        <div style="margin-top:16px;line-height:1.8;">
          <div><strong>Tổng thanh toán:</strong> ${formatCurrency(order.tongtien || order.tamtinh || 0)}</div>
          <div><strong>Địa chỉ giao hàng:</strong> ${address}</div>
          <div><strong>Dự kiến giao:</strong> ${formatDate(estimatedDeliveryAt)}</div>
        </div>
      </div>
    </div>
  </div>`;

  const text = [
    `Xin chào ${customerName},`,
    `Đơn hàng #${orderCode} đã được xác nhận.`,
    `Tổng thanh toán: ${formatCurrency(order.tongtien || order.tamtinh || 0)}`,
    `Địa chỉ giao hàng: ${address}`,
    `Dự kiến giao: ${formatDate(estimatedDeliveryAt)}`
  ].join('\n');

  return {
    subject: `Đơn hàng #${orderCode} đã được xác nhận`,
    html,
    text
  };
}

function buildOrderDeliveredTemplate({ order, reviewUrl }) {
  const customerName = escapeHtml(order.tennguoinhan || 'Khách hàng');
  const orderCode = escapeHtml(order.madonhang || String(order._id || ''));

  const html = `
  <div style="font-family:Arial,sans-serif;background:#f6f8ff;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:20px;color:#fff;">
        <h2 style="margin:0;">Đơn hàng #${orderCode} đã được giao thành công</h2>
      </div>
      <div style="padding:20px;color:#111827;line-height:1.7;">
        <p>Xin chào <strong>${customerName}</strong>,</p>
        <p>Đơn hàng của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm tại Fashion Store.</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${reviewUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">Đánh giá sản phẩm</a>
        </p>
        <p>Nếu có bất kỳ vấn đề nào với đơn hàng, vui lòng phản hồi email này hoặc liên hệ hotline hỗ trợ.</p>
      </div>
    </div>
  </div>`;

  const text = [
    `Xin chào ${customerName},`,
    `Đơn hàng #${orderCode} đã được giao thành công.`,
    'Cảm ơn bạn đã mua sắm tại Fashion Store.',
    `Đánh giá sản phẩm tại: ${reviewUrl}`,
    'Nếu có vấn đề, vui lòng liên hệ bộ phận hỗ trợ.'
  ].join('\n');

  return {
    subject: `Đơn hàng #${orderCode} đã được giao thành công`,
    html,
    text
  };
}

function formatRefundMethod(method) {
  const value = String(method || '').trim().toLowerCase();
  if (value === 'momo') return 'Ví MoMo';
  if (value === 'vnpay') return 'Ví VNPAY';
  if (value === 'bank') return 'Chuyển khoản ngân hàng';
  if (value === 'wallet') return 'Ví điện tử';
  return 'Phương thức khác';
}

function buildOrderRefundedTemplate({ order, refundAmount, refundMethod, refundedAt }) {
  const customerName = escapeHtml(order.tennguoinhan || 'Khách hàng');
  const orderCode = escapeHtml(order.madonhang || String(order._id || ''));
  const amount = formatCurrency(refundAmount || 0);
  const methodLabel = escapeHtml(formatRefundMethod(refundMethod));
  const refundedTime = formatDate(refundedAt || new Date());

  const html = `
  <div style="font-family:Arial,sans-serif;background:#f6f8ff;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0891b2,#0ea5e9);padding:20px;color:#fff;">
        <h2 style="margin:0;">Hoàn tiền thành công cho đơn hàng #${orderCode}</h2>
      </div>
      <div style="padding:20px;color:#111827;line-height:1.7;">
        <p>Xin chào <strong>${customerName}</strong>,</p>
        <p>Yêu cầu hoàn tiền cho đơn hàng của bạn đã được xử lý thành công.</p>
        <div style="margin-top:14px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
          <div><strong>Số tiền hoàn:</strong> ${amount}</div>
          <div><strong>Phương thức hoàn:</strong> ${methodLabel}</div>
          <div><strong>Thời gian hoàn:</strong> ${escapeHtml(refundedTime)}</div>
        </div>
        <p style="margin-top:16px;">Nếu cần hỗ trợ thêm, vui lòng phản hồi email này hoặc liên hệ bộ phận chăm sóc khách hàng.</p>
      </div>
    </div>
  </div>`;

  const text = [
    `Xin chào ${customerName},`,
    `Đơn hàng #${orderCode} đã được hoàn tiền thành công.`,
    `Số tiền hoàn: ${amount}`,
    `Phương thức hoàn: ${formatRefundMethod(refundMethod)}`,
    `Thời gian hoàn: ${refundedTime}`,
    'Nếu cần hỗ trợ, vui lòng liên hệ bộ phận chăm sóc khách hàng.'
  ].join('\n');

  return {
    subject: `Đơn hàng #${orderCode} đã hoàn tiền thành công`,
    html,
    text
  };
}

function getBaseUrl() {
  return String(process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function claimEmailLog({ order, action }) {
  const uniqueKey = `${action}:${String(order._id)}`;
  try {
    await OrderStatusLog.create({
      donhang_id: order._id,
      nguoidung_id: order.nguoidung_id || null,
      madonhang: String(order.madonhang || ''),
      trangthai_cu: String(order.trangthai || ''),
      trangthai_moi: String(order.trangthai || ''),
      hanhdong: action,
      ghichu: '',
      actorRole: 'system',
      actorName: 'mailer',
      uniqueKey,
      metadata: {
        sent: false,
        channel: 'email'
      },
      ngaytao: new Date()
    });
    return { claimed: true, uniqueKey };
  } catch (error) {
    if (error && error.code === 11000) {
      return { claimed: false, reason: 'already-sent' };
    }
    throw error;
  }
}

async function updateEmailLog(uniqueKey, metadata = {}, options = {}) {
  if (!uniqueKey) return;
  const clearClaim = Boolean(options.clearClaim);
  await OrderStatusLog.updateOne(
    { uniqueKey },
    {
      $set: {
        metadata,
        ghichu: String(metadata.error || metadata.message || ''),
        ngaytao: metadata.sentAt || metadata.failedAt || new Date(),
        ...(clearClaim ? { uniqueKey: null } : {})
      }
    }
  );
}

async function sendOrderConfirmedEmail({ orderId }) {
  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order || !order.email) return { sent: false, reason: 'missing-order-or-email' };

  const claim = await claimEmailLog({ order, action: 'email_order_confirmed' });
  if (!claim.claimed) return { sent: false, reason: 'already-sent' };

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

    await updateEmailLog(claim.uniqueKey, {
      sent: true,
      sentAt: new Date(),
      channel: 'email',
      to: String(order.email || ''),
      message: 'order confirmed email sent'
    });

    return { sent: true, info };
  } catch (error) {
    await updateEmailLog(claim.uniqueKey, {
      sent: false,
      failedAt: new Date(),
      channel: 'email',
      to: String(order.email || ''),
      error: String(error && error.message ? error.message : error)
    }, { clearClaim: true });
    throw error;
  }
}

async function sendOrderDeliveredEmail({ orderId }) {
  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order || !order.email) return { sent: false, reason: 'missing-order-or-email' };

  const claim = await claimEmailLog({ order, action: 'email_order_delivered' });
  if (!claim.claimed) return { sent: false, reason: 'already-sent' };

  const reviewUrl = `${getBaseUrl()}/orders`;
  const emailContent = buildOrderDeliveredTemplate({ order, reviewUrl });

  try {
    const info = await sendMail({
      to: order.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });

    await updateEmailLog(claim.uniqueKey, {
      sent: true,
      sentAt: new Date(),
      channel: 'email',
      to: String(order.email || ''),
      message: 'order delivered email sent'
    });

    return { sent: true, info };
  } catch (error) {
    await updateEmailLog(claim.uniqueKey, {
      sent: false,
      failedAt: new Date(),
      channel: 'email',
      to: String(order.email || ''),
      error: String(error && error.message ? error.message : error)
    }, { clearClaim: true });
    throw error;
  }
}

async function sendOrderRefundedEmail({ orderId, refundAmount = 0, refundMethod = '', refundedAt = null }) {
  const order = await Donhang.findOne({ _id: orderId, daxoa: { $ne: true } }).lean();
  if (!order || !order.email) return { sent: false, reason: 'missing-order-or-email' };

  const claim = await claimEmailLog({ order, action: 'email_order_refunded' });
  if (!claim.claimed) return { sent: false, reason: 'already-sent' };

  const emailContent = buildOrderRefundedTemplate({
    order,
    refundAmount,
    refundMethod,
    refundedAt
  });

  try {
    const info = await sendMail({
      to: order.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });

    await updateEmailLog(claim.uniqueKey, {
      sent: true,
      sentAt: new Date(),
      channel: 'email',
      to: String(order.email || ''),
      refundAmount: Number(refundAmount || 0),
      refundMethod: String(refundMethod || ''),
      message: 'order refunded email sent'
    });

    return { sent: true, info };
  } catch (error) {
    await updateEmailLog(claim.uniqueKey, {
      sent: false,
      failedAt: new Date(),
      channel: 'email',
      to: String(order.email || ''),
      error: String(error && error.message ? error.message : error)
    }, { clearClaim: true });
    throw error;
  }
}

module.exports = {
  sendOrderConfirmedEmail,
  sendOrderDeliveredEmail,
  sendOrderRefundedEmail,
  buildOrderConfirmedTemplate,
  buildOrderDeliveredTemplate,
  buildOrderRefundedTemplate
};

