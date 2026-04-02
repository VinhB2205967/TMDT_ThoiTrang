const mongoose = require('mongoose');
const OrderRefund = require('../../models/order_refund_model');
const OrderStatusLog = require('../../models/order_status_log_model');

function toObjectIdOrNull(value) {
  const text = String(value || '').trim();
  if (!text || !mongoose.Types.ObjectId.isValid(text)) return null;
  return new mongoose.Types.ObjectId(text);
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toStringSafe(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

function normalizeRequestedItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => ({
      orderItemId: toObjectIdOrNull(item?.orderItemId || item?._id),
      qty: Number(item?.qty || 0) || 0,
      boughtQty: Number(item?.boughtQty || 0) || 0,
      tensanpham: toStringSafe(item?.tensanpham, ''),
      hinhanh: toStringSafe(item?.hinhanh, ''),
      kichco: toStringSafe(item?.kichco, ''),
      mausac: toStringSafe(item?.mausac, ''),
      gianhap: Number(item?.gianhap || 0) || 0,
      giabandexuat: Number(item?.giabandexuat || 0) || 0
    }));
}

function buildActorSnapshot(actor = null, fallbackRole = 'system') {
  return {
    actorId: toObjectIdOrNull(actor?._id || actor?.id),
    actorRole: toStringSafe(actor?.vaitro || actor?.role || fallbackRole, fallbackRole),
    actorName: toStringSafe(
      actor?.hoten
      || actor?.ten
      || actor?.email
      || actor?.username
      || actor?.name,
      ''
    )
  };
}

function normalizeRefundSnapshot(refundDoc) {
  if (!refundDoc) return {};
  const raw = typeof refundDoc.toObject === 'function' ? refundDoc.toObject() : { ...refundDoc };
  return {
    requestedAt: raw.requestedAt || null,
    reason: toStringSafe(raw.reason, ''),
    reasonLabel: toStringSafe(raw.reasonLabel, ''),
    detail: toStringSafe(raw.detail, ''),
    requestedItems: normalizeRequestedItems(raw.requestedItems),
    receivedItems: normalizeRequestedItems(raw.receivedItems),
    proofMedias: Array.isArray(raw.proofMedias) ? raw.proofMedias.map((item) => toStringSafe(item, '')) : [],
    proofMedia: toStringSafe(raw.proofMedia, ''),
    proofImage: toStringSafe(raw.proofImage, ''),
    refundMethod: toStringSafe(raw.refundMethod, ''),
    refundWallet: toStringSafe(raw.refundWallet, ''),
    refundBankName: toStringSafe(raw.refundBankName, ''),
    refundBankAccountName: toStringSafe(raw.refundBankAccountName, ''),
    refundBankAccountNumber: toStringSafe(raw.refundBankAccountNumber, ''),
    refundAmount: Number(raw.refundAmount || 0) || 0,
    adminNote: toStringSafe(raw.adminNote, ''),
    reviewedAt: raw.reviewedAt || null,
    approvedAt: raw.approvedAt || null,
    rejectedAt: raw.rejectedAt || null,
    returnedAt: raw.returnedAt || null,
    refundedAt: raw.refundedAt || null,
    canceledByUser: Boolean(raw.canceledByUser),
    canceledByUserAt: raw.canceledByUserAt || null
  };
}

async function layThongTinHoanHangTheoDon(orderId) {
  if (!orderId) return {};
  const refund = await OrderRefund.findOne({ donhang_id: orderId }).lean();
  return normalizeRefundSnapshot(refund);
}

async function ganThongTinHoanHangChoDon(order) {
  if (!order || !order._id) return order;
  order.yeucauhoanhang = await layThongTinHoanHangTheoDon(order._id);
  return order;
}

async function ganThongTinHoanHangChoDanhSachDon(orders) {
  const rows = Array.isArray(orders) ? orders : [];
  if (!rows.length) return rows;
  const ids = rows
    .map((row) => toObjectIdOrNull(row?._id))
    .filter(Boolean);
  if (!ids.length) return rows;

  const refunds = await OrderRefund.find({ donhang_id: { $in: ids } }).lean();
  const refundMap = new Map(refunds.map((row) => [String(row.donhang_id), normalizeRefundSnapshot(row)]));
  rows.forEach((row) => {
    row.yeucauhoanhang = refundMap.get(String(row._id)) || {};
  });
  return rows;
}

async function dongBoYeuCauHoanHangTuDon({ order, action = '', actor = null }) {
  if (!order?._id) return;

  const req = order.yeucauhoanhang || {};
  const actorInfo = buildActorSnapshot(actor);
  const requestedItems = normalizeRequestedItems(req.requestedItems || req.returnItems);
  const receivedItems = normalizeRequestedItems(req.receivedItems);
  const now = new Date();

  await OrderRefund.updateOne(
    { donhang_id: order._id },
    {
      $set: {
        nguoidung_id: toObjectIdOrNull(order.nguoidung_id),
        madonhang: toStringSafe(order.madonhang, ''),
        trangthai_donhang: toStringSafe(order.trangthai, ''),
        requestedAt: toDateOrNull(req.requestedAt),
        reason: toStringSafe(req.reason, ''),
        reasonLabel: toStringSafe(req.reasonLabel, ''),
        detail: toStringSafe(req.detail, ''),
        requestedItems,
        receivedItems,
        proofMedias: Array.isArray(req.proofMedias) ? req.proofMedias.map((item) => toStringSafe(item, '')) : [],
        proofMedia: toStringSafe(req.proofMedia, ''),
        proofImage: toStringSafe(req.proofImage, ''),
        refundMethod: toStringSafe(req.refundMethod, ''),
        refundWallet: toStringSafe(req.refundWallet, ''),
        refundBankName: toStringSafe(req.refundBankName, ''),
        refundBankAccountName: toStringSafe(req.refundBankAccountName, ''),
        refundBankAccountNumber: toStringSafe(req.refundBankAccountNumber, ''),
        refundAmount: Number(req.refundAmount || 0) || 0,
        adminNote: toStringSafe(req.adminNote, ''),
        reviewedAt: toDateOrNull(req.reviewedAt),
        approvedAt: toDateOrNull(req.approvedAt),
        rejectedAt: toDateOrNull(req.rejectedAt),
        returnedAt: toDateOrNull(req.returnedAt),
        refundedAt: toDateOrNull(req.refundedAt),
        canceledByUser: Boolean(req.canceledByUser),
        canceledByUserAt: toDateOrNull(req.canceledByUserAt),
        lastAction: toStringSafe(action, ''),
        lastActorId: actorInfo.actorId,
        lastActorRole: actorInfo.actorRole,
        lastActorName: actorInfo.actorName,
        ngaycapnhat: now
      },
      $setOnInsert: {
        donhang_id: order._id,
        ngaytao: now
      }
    },
    { upsert: true }
  );
}

async function ghiNhanLichSuTrangThaiDonHang({
  order,
  previousStatus = '',
  nextStatus = '',
  action = '',
  actor = null,
  note = '',
  metadata = {}
}) {
  if (!order?._id || !nextStatus) return;

  const actorInfo = buildActorSnapshot(actor);
  await OrderStatusLog.create({
    donhang_id: order._id,
    nguoidung_id: toObjectIdOrNull(order.nguoidung_id),
    madonhang: toStringSafe(order.madonhang, ''),
    trangthai_cu: toStringSafe(previousStatus, ''),
    trangthai_moi: toStringSafe(nextStatus, ''),
    hanhdong: toStringSafe(action, ''),
    ghichu: toStringSafe(note, ''),
    actorId: actorInfo.actorId,
    actorRole: actorInfo.actorRole,
    actorName: actorInfo.actorName,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    ngaytao: new Date()
  });
}

module.exports = {
  dongBoYeuCauHoanHangTuDon,
  ghiNhanLichSuTrangThaiDonHang,
  layThongTinHoanHangTheoDon,
  ganThongTinHoanHangChoDon,
  ganThongTinHoanHangChoDanhSachDon
};
