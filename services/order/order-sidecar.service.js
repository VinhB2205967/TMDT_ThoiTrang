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
      madongdonhang: toObjectIdOrNull(item?.madongdonhang || item?.orderItemId || item?._id),
      soluongyeucauhoan: Number(item?.soluongyeucauhoan || item?.qty || 0) || 0,
      soluongdamua: Number(item?.soluongdamua || item?.boughtQty || 0) || 0,
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
    requestedAt: raw.thoigianguiyeucau || raw.requestedAt || null,
    reason: toStringSafe(raw.lydo || raw.reason, ''),
    reasonLabel: toStringSafe(raw.nhanlydo || raw.reasonLabel, ''),
    detail: toStringSafe(raw.motachitiet || raw.detail, ''),
    requestedItems: normalizeRequestedItems(raw.danhsachsanphamyeucauhoan || raw.requestedItems).map((item) => ({
      orderItemId: item.madongdonhang,
      qty: item.soluongyeucauhoan,
      boughtQty: item.soluongdamua,
      tensanpham: item.tensanpham,
      hinhanh: item.hinhanh,
      kichco: item.kichco,
      mausac: item.mausac,
      gianhap: item.gianhap,
      giabandexuat: item.giabandexuat
    })),
    receivedItems: normalizeRequestedItems(raw.danhsachsanphamdanhanhoan || raw.receivedItems).map((item) => ({
      orderItemId: item.madongdonhang,
      qty: item.soluongyeucauhoan,
      boughtQty: item.soluongdamua,
      tensanpham: item.tensanpham,
      hinhanh: item.hinhanh,
      kichco: item.kichco,
      mausac: item.mausac,
      gianhap: item.gianhap,
      giabandexuat: item.giabandexuat
    })),
    proofMedias: Array.isArray(raw.danhsachminhchung || raw.proofMedias)
      ? (raw.danhsachminhchung || raw.proofMedias).map((item) => toStringSafe(item, ''))
      : [],
    proofMedia: toStringSafe(raw.minhchung || raw.proofMedia, ''),
    proofImage: toStringSafe(raw.hinhanhminhchung || raw.proofImage, ''),
    refundMethod: toStringSafe(raw.phuongthuchoantien || raw.refundMethod, ''),
    refundWallet: toStringSafe(raw.vihoantien || raw.refundWallet, ''),
    refundBankName: toStringSafe(raw.tennganhanghoantien || raw.refundBankName, ''),
    refundBankAccountName: toStringSafe(raw.tenchutaikhoanhoantien || raw.refundBankAccountName, ''),
    refundBankAccountNumber: toStringSafe(raw.sotaikhoanhoantien || raw.refundBankAccountNumber, ''),
    refundAmount: Number(raw.sotienhoan || raw.refundAmount || 0) || 0,
    adminNote: toStringSafe(raw.ghichuadmin || raw.adminNote, ''),
    reviewedAt: raw.thoigianduyet || raw.reviewedAt || null,
    approvedAt: raw.thoigianduyetchapnhan || raw.approvedAt || null,
    rejectedAt: raw.thoigiantuchoi || raw.rejectedAt || null,
    returnedAt: raw.thoigiannhanhanghoan || raw.returnedAt || null,
    refundedAt: raw.thoigianhoantien || raw.refundedAt || null,
    canceledByUser: Boolean(raw.dahuyboibannguoidung || raw.canceledByUser),
    canceledByUserAt: raw.thoigianhuyboibannguoidung || raw.canceledByUserAt || null
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
  const existingRefund = await OrderRefund.findOne({ donhang_id: order._id }).lean();
  const existingSnapshot = normalizeRefundSnapshot(existingRefund);
  const actorInfo = buildActorSnapshot(actor);
  const requestedItems = normalizeRequestedItems(
    req.requestedItems
      || req.returnItems
      || req.danhsachsanphamyeucauhoan
      || existingSnapshot.requestedItems
  );
  const receivedItems = normalizeRequestedItems(
    req.receivedItems
      || req.danhsachsanphamdanhanhoan
      || existingSnapshot.receivedItems
  );
  const requestedAt = toDateOrNull(req.requestedAt || req.thoigianguiyeucau || existingSnapshot.requestedAt);
  const reason = toStringSafe(req.reason || req.lydo || existingSnapshot.reason, '');
  const reasonLabel = toStringSafe(req.reasonLabel || req.nhanlydo || existingSnapshot.reasonLabel, '');
  const detail = toStringSafe(req.detail || req.motachitiet || existingSnapshot.detail, '');
  const proofMedias = Array.isArray(req.proofMedias)
    ? req.proofMedias
    : (Array.isArray(req.danhsachminhchung)
      ? req.danhsachminhchung
      : (Array.isArray(existingSnapshot.proofMedias) ? existingSnapshot.proofMedias : []));
  const proofMedia = toStringSafe(req.proofMedia || req.minhchung || existingSnapshot.proofMedia, '');
  const proofImage = toStringSafe(req.proofImage || req.hinhanhminhchung || existingSnapshot.proofImage, '');
  const refundMethod = toStringSafe(req.refundMethod || req.phuongthuchoantien || existingSnapshot.refundMethod, '');
  const refundWallet = toStringSafe(req.refundWallet || req.vihoantien || existingSnapshot.refundWallet, '');
  const refundBankName = toStringSafe(req.refundBankName || req.tennganhanghoantien || existingSnapshot.refundBankName, '');
  const refundBankAccountName = toStringSafe(req.refundBankAccountName || req.tenchutaikhoanhoantien || existingSnapshot.refundBankAccountName, '');
  const refundBankAccountNumber = toStringSafe(req.refundBankAccountNumber || req.sotaikhoanhoantien || existingSnapshot.refundBankAccountNumber, '');
  const refundAmount = Number(req.refundAmount || req.sotienhoan || existingSnapshot.refundAmount || 0) || 0;
  const adminNote = toStringSafe(req.adminNote || req.ghichuadmin || existingSnapshot.adminNote, '');
  const reviewedAt = toDateOrNull(req.reviewedAt || req.thoigianduyet || existingSnapshot.reviewedAt);
  const approvedAt = toDateOrNull(req.approvedAt || req.thoigianduyetchapnhan || existingSnapshot.approvedAt);
  const rejectedAt = toDateOrNull(req.rejectedAt || req.thoigiantuchoi || existingSnapshot.rejectedAt);
  const returnedAt = toDateOrNull(req.returnedAt || req.thoigiannhanhanghoan || existingSnapshot.returnedAt);
  const refundedAt = toDateOrNull(req.refundedAt || req.thoigianhoantien || existingSnapshot.refundedAt);
  const canceledByUser = Boolean(req.canceledByUser || req.dahuyboibannguoidung || existingSnapshot.canceledByUser);
  const canceledByUserAt = toDateOrNull(req.canceledByUserAt || req.thoigianhuyboibannguoidung || existingSnapshot.canceledByUserAt);
  const now = new Date();

  await OrderRefund.updateOne(
    { donhang_id: order._id },
    {
      $set: {
        nguoidung_id: toObjectIdOrNull(order.nguoidung_id),
        madonhang: toStringSafe(order.madonhang, ''),
        trangthai_donhang: toStringSafe(order.trangthai, ''),
        thoigianguiyeucau: requestedAt,
        lydo: reason,
        nhanlydo: reasonLabel,
        motachitiet: detail,
        danhsachsanphamyeucauhoan: requestedItems,
        danhsachsanphamdanhanhoan: receivedItems,
        danhsachminhchung: proofMedias.map((item) => toStringSafe(item, '')),
        minhchung: proofMedia,
        hinhanhminhchung: proofImage,
        phuongthuchoantien: refundMethod,
        vihoantien: refundWallet,
        tennganhanghoantien: refundBankName,
        tenchutaikhoanhoantien: refundBankAccountName,
        sotaikhoanhoantien: refundBankAccountNumber,
        sotienhoan: refundAmount,
        ghichuadmin: adminNote,
        thoigianduyet: reviewedAt,
        thoigianduyetchapnhan: approvedAt,
        thoigiantuchoi: rejectedAt,
        thoigiannhanhanghoan: returnedAt,
        thoigianhoantien: refundedAt,
        dahuyboibannguoidung: canceledByUser,
        thoigianhuyboibannguoidung: canceledByUserAt,
        hanhdongcuoi: toStringSafe(action, ''),
        nguoithuchiencuoi_id: actorInfo.actorId,
        vaitronguoithuchiencuoi: actorInfo.actorRole,
        tennguoithuchiencuoi: actorInfo.actorName,
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
