const donhang = require('../../models/order_model');
const chitietdonhang = require('../../models/order_item_model');
const danhgia = require('../../models/review_model');
const sanpham = require('../../models/product_model');
const { getOrCreateCart, normalizeImage } = require('../cart.service');
const { laLoaiKhongSize, tinhTongTon } = require('../catalog/productStock.service.js');
const { taoHoanTienMoMo, taoThanhToanMoMo, truyVanGiaoDichMoMo } = require('../payment/momo.service.js');
const { taoThanhToanVnpay } = require('../payment/vnpay.service.js');
const {
  taoGiaoDichThanhToan,
  capNhatGiaoDichThanhToan,
  danhDauThatBaiTatCaPendingTheoDonHang,
  danhDauHoanTienMoMoTheoDonHang,
  danhDauThanhCongTheoDonHang
} = require('../payment/payment.service.js');
const { nhantrangthai, layTrangThaiChoPhep } = require('../../helpers/orderStatus');
const phanTrangHelper = require('../../helpers/pagination');

const THOI_GIAN_CHO_THANH_TOAN_MS = 24 * 60 * 60 * 1000;
const CUA_SO_HOAN_HANG_MS = 7 * 24 * 60 * 60 * 1000;

const LY_DO_HOAN_LABELS = {
  sai_size: 'Sai size',
  loi_san_pham: 'Lỗi sản phẩm',
  khong_giong_mo_ta: 'Không giống mô tả',
  khac: 'Khác'
};

function layMocDaGiao(order) {
  if (!order) return null;
  return order.ngaygiaohang || order.ngaycapnhat || order.ngaytao || null;
}

function coTheYeuCauHoan(order) {
  if (!order) return false;
  if (String(order.trangthai || '') !== 'dagiao') return false;
  if (order && order.yeucauhoanhang && order.yeucauhoanhang.requestedAt) return false;
  const moc = layMocDaGiao(order);
  if (!moc) return false;
  const delta = Date.now() - new Date(moc).getTime();
  return Number.isFinite(delta) && delta >= 0 && delta <= CUA_SO_HOAN_HANG_MS;
}

function laDonChoThanhToanOnline(don) {
  return don
    && String(don.trangthai || '') === 'choxacnhan'
    && !don.dathanhtoan
    && (String(don.phuongthucthanhtoan || '') === 'momo' || String(don.phuongthucthanhtoan || '') === 'vnpay');
}

function tinhHanThanhToanMs(don) {
  if (!don || !don.ngaytao) return null;
  const t = new Date(don.ngaytao).getTime();
  if (!Number.isFinite(t)) return null;
  return t + THOI_GIAN_CHO_THANH_TOAN_MS;
}

async function congTonChoChiTietDon(orderitemdoc) {
  const productid = orderitemdoc.sanpham_id;
  const variantid = orderitemdoc.bienthe_id;
  const size = orderitemdoc.kichco;
  const qty = Math.max(1, parseInt(orderitemdoc.soluong, 10) || 1);

  const product = await sanpham.findById(productid);
  if (!product) throw new Error('Sản phẩm không tồn tại');

  const basetotal = (typeof product.soluongton === 'number') ? product.soluongton : tinhTongTon(product);
  const hassize = !laLoaiKhongSize(product.loaisanpham);

  if (!variantid) {
    if (hassize) {
      product.sizes = product.sizes || [];
      let row = (product.sizes || []).find(s => s.size === size);
      if (!row) {
        product.sizes.push({ size, soluong: qty });
      } else {
        row.soluong = Number(row.soluong || 0) + qty;
      }
    } else {
      product.soluong_chinh = Number(product.soluong_chinh || 0) + qty;
    }

    product.soluongton = basetotal + qty;
    await product.save();
    return;
  }

  const v = (product.bienthe || []).id(variantid);
  if (!v) throw new Error('Biến thể không tồn tại');

  if (hassize) {
    v.sizes = v.sizes || [];
    let row = (v.sizes || []).find(s => s.size === size);
    if (!row) {
      v.sizes.push({ size, soluong: qty });
    } else {
      row.soluong = Number(row.soluong || 0) + qty;
    }
  } else {
    v.soluong = Number(v.soluong || 0) + qty;
  }

  product.soluongton = basetotal + qty;
  await product.save();
}

async function tuDongHuyDonQuaHan(userId) {
  const cutoff = new Date(Date.now() - THOI_GIAN_CHO_THANH_TOAN_MS);
  const danhsach = await donhang.find({
    nguoidung_id: userId,
    daxoa: { $ne: true },
    trangthai: 'choxacnhan',
    dathanhtoan: false,
    phuongthucthanhtoan: { $in: ['momo', 'vnpay'] },
    ngaytao: { $lt: cutoff }
  }).select('_id').limit(30).lean();

  for (const row of (danhsach || [])) {
    const updated = await donhang.findOneAndUpdate(
      { _id: row._id, trangthai: 'choxacnhan', dathanhtoan: false, daxoa: { $ne: true } },
      { $set: { trangthai: 'dahuy', lydohuy: 'Hết hạn thanh toán (24h)', ngaycapnhat: new Date() } },
      { new: false }
    );

    if (!updated) continue;

    try {
      await chitietdonhang.updateMany(
        { donhang_id: updated._id },
        { $set: { trangthai: 'dahuy' } }
      );
    } catch {
      // best-effort
    }

    try {
      await danhDauThatBaiTatCaPendingTheoDonHang({
        donhangId: updated._id,
        response: { autoCancel: true, reason: 'Hết hạn thanh toán (24h)' },
        ghichu: 'Đơn bị hủy do quá hạn thanh toán'
      });
    } catch {
      // best-effort
    }

    const danhsachitem = await chitietdonhang.find({ donhang_id: row._id });
    for (const it of (danhsachitem || [])) {
      try {
        await congTonChoChiTietDon(it);
      } catch {
        // best-effort
      }
    }
  }
}

async function getOrdersPageData({ userId, query }) {
  await tuDongHuyDonQuaHan(userId);

  const trangthai = String(query.status || 'all');
  const tapchophep = new Set(layTrangThaiChoPhep());
  const trangthaihientai = tapchophep.has(trangthai) ? trangthai : 'all';

  const boloc = { nguoidung_id: userId, daxoa: { $ne: true } };
  if (trangthaihientai !== 'all') boloc.trangthai = trangthaihientai;

  const tongDon = await donhang.countDocuments(boloc);
  let phanTrang = { currentPage: 1, limit: 10 };
  phanTrang = phanTrangHelper(phanTrang, query, tongDon);

  const danhsachdon = await donhang.find(boloc)
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .skip(phanTrang.skip)
    .limit(phanTrang.limit)
    .lean();

  const nowMs = Date.now();
  for (const o of (danhsachdon || [])) {
    if (!laDonChoThanhToanOnline(o)) continue;
    const deadline = tinhHanThanhToanMs(o);
    if (!deadline) continue;
    o.paymentDeadline = deadline;
    o.paymentRemainingMs = Math.max(0, deadline - nowMs);
  }

  if (danhsachdon && danhsachdon.length) {
    const danhsachiddon = danhsachdon.map(o => o._id);
    const reviewed = await danhgia.find({
      nguoidung_id: userId,
      donhang_id: { $in: danhsachiddon },
      daxoa: { $ne: true }
    }).select('_id chitietdonhang_id').lean();
    const reviewedMap = new Map((reviewed || []).map((r) => [String(r.chitietdonhang_id), String(r._id)]));

    const danhsachchitiet = await chitietdonhang.find({ donhang_id: { $in: danhsachiddon } })
      .select('_id donhang_id tensanpham hinhanh sanpham_id')
      .sort({ ngaytao: 1 })
      .lean();

    const mapdon = new Map();
    for (const it of (danhsachchitiet || [])) {
      const key = String(it.donhang_id);
      const tontai = mapdon.get(key);
      if (!tontai) {
        mapdon.set(key, { first: it, count: 1 });
      } else {
        tontai.count += 1;
      }
    }

    for (const don of danhsachdon) {
      const thongtin = mapdon.get(String(don._id));
      if (!thongtin) {
        don.preview = null;
        continue;
      }
      don.preview = {
        name: thongtin.first && thongtin.first.tensanpham ? String(thongtin.first.tensanpham) : 'Sản phẩm',
        image: normalizeImage(thongtin.first && thongtin.first.hinhanh ? String(thongtin.first.hinhanh) : ''),
        count: thongtin.count || 1,
        itemId: thongtin.first ? String(thongtin.first._id) : null,
        productId: thongtin.first && thongtin.first.sanpham_id ? String(thongtin.first.sanpham_id) : null,
        reviewed: thongtin.first ? reviewedMap.has(String(thongtin.first._id)) : false,
        reviewId: thongtin.first && reviewedMap.has(String(thongtin.first._id))
          ? reviewedMap.get(String(thongtin.first._id))
          : null
      };
    }
  }

  return {
    orders: danhsachdon || [],
    currentStatus: trangthaihientai,
    statusOptions: layTrangThaiChoPhep(),
    statusLabels: nhantrangthai,
    pagination: phanTrang
  };
}

async function getOrderDetailPageData({ userId, orderId, paidFlag }) {
  if (String(paidFlag || '') === '1') {
    return { redirect: `/orders/${orderId}`, flash: { type: 'success', message: 'Thanh toán thành công!' } };
  }

  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) {
    return {
      notFound: true,
      titlePage: 'Không tìm thấy đơn hàng',
      order: null,
      items: [],
      statusLabels: nhantrangthai
    };
  }

  if (laDonChoThanhToanOnline(donhangdoc)) {
    const deadline = tinhHanThanhToanMs(donhangdoc);
    if (deadline && Date.now() > deadline) {
      await tuDongHuyDonQuaHan(userId);
      return { redirect: `/orders/${orderId}` };
    }
    donhangdoc.paymentDeadline = deadline;
    donhangdoc.paymentRemainingMs = deadline ? Math.max(0, deadline - Date.now()) : null;
  }

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id }).lean();
  const reviewed = await danhgia.find({
    nguoidung_id: userId,
    donhang_id: donhangdoc._id,
    daxoa: { $ne: true }
  }).select('_id chitietdonhang_id').lean();
  const reviewMap = new Map((reviewed || []).map(r => [String(r.chitietdonhang_id), r]));

  const danhsachdaxuly = (danhsachitem || []).map((it) => ({
    ...it,
    hinhanh: normalizeImage(it.hinhanh),
    daDanhGia: reviewMap.has(String(it._id)),
    reviewId: reviewMap.get(String(it._id)) ? String(reviewMap.get(String(it._id))._id) : null
  }));

  return {
    titlePage: `Chi tiết ${donhangdoc.madonhang || 'đơn hàng'}`,
    order: donhangdoc,
    items: danhsachdaxuly,
    statusLabels: nhantrangthai,
    returnEligible: coTheYeuCauHoan(donhangdoc),
    returnReasonLabels: LY_DO_HOAN_LABELS
  };
}

async function createReturnRequest({ userId, orderId, body, files }) {
  const order = await donhang.findOne({
    _id: orderId,
    nguoidung_id: userId,
    daxoa: { $ne: true }
  });

  if (!order) return { ok: false, redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };
  if (!coTheYeuCauHoan(order)) {
    return { ok: false, redirect: `/orders/${order._id}`, flash: { type: 'error', message: 'Đơn hàng này không đủ điều kiện gửi yêu cầu hoàn hàng.' } };
  }

  const reason = String(body.reason || '').trim();
  const detail = String(body.detail || '').trim();
  const refundMethod = String(body.refundMethod || '').trim();

  if (!LY_DO_HOAN_LABELS[reason]) {
    return { ok: false, redirect: `/orders/${order._id}`, flash: { type: 'error', message: 'Lý do hoàn hàng không hợp lệ.' } };
  }

  if (!['momo', 'bank', 'wallet'].includes(refundMethod)) {
    return { ok: false, redirect: `/orders/${order._id}`, flash: { type: 'error', message: 'Phương thức hoàn tiền không hợp lệ.' } };
  }

  const proofMedias = Array.isArray(files)
    ? files.filter((f) => f && f.filename).map((f) => `/uploads/returns/${f.filename}`)
    : [];
  const proofMedia = proofMedias.length ? proofMedias[0] : '';

  order.trangthai = 'requested_return';
  order.yeucauhoanhang = {
    ...(order.yeucauhoanhang || {}),
    requestedAt: new Date(),
    reason,
    reasonLabel: LY_DO_HOAN_LABELS[reason],
    detail: detail || '',
    proofMedias,
    proofMedia,
    proofImage: proofMedia,
    refundMethod,
    adminNote: '',
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
    returnedAt: null,
    refundedAt: null
  };
  order.ngaycapnhat = new Date();
  await order.save();

  return { ok: true, redirect: `/orders/${order._id}`, flash: { type: 'success', message: 'Đã gửi yêu cầu hoàn hàng. Vui lòng chờ admin duyệt.' } };
}

async function cancelOrderByUser({ userId, orderId, reason }) {
  const lydo = String(reason || '').trim() || 'Khách hàng hủy đơn';

  const donhangdoc = await donhang.findOneAndUpdate(
    { _id: orderId, nguoidung_id: userId, daxoa: { $ne: true }, trangthai: 'choxacnhan' },
    { $set: { trangthai: 'dahuy', lydohuy: lydo, ngaycapnhat: new Date() } },
    { new: true }
  );

  if (!donhangdoc) {
    const tontai = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } })
      .select('_id trangthai')
      .lean();

    if (!tontai) return { ok: false, redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };
    return { ok: false, redirect: `/orders/${tontai._id}`, flash: { type: 'error', message: 'Đơn hàng này không thể hủy ở trạng thái hiện tại.' } };
  }

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id });
  const danhsachloi = [];
  for (const it of (danhsachitem || [])) {
    try {
      await congTonChoChiTietDon(it);
    } catch (e) {
      danhsachloi.push(e?.message || 'Có lỗi khi hoàn tồn kho');
    }
  }

  if (danhsachloi.length) {
    return {
      ok: false,
      redirect: `/orders/${donhangdoc._id}`,
      flash: { type: 'error', message: 'Đã hủy đơn, nhưng có lỗi khi hoàn tồn kho cho một số sản phẩm. Vui lòng liên hệ shop.' }
    };
  }

  try {
    await chitietdonhang.updateMany({ donhang_id: donhangdoc._id }, { $set: { trangthai: 'dahuy' } });
  } catch {
    // best-effort
  }

  if (!donhangdoc.dathanhtoan) {
    try {
      await danhDauThatBaiTatCaPendingTheoDonHang({
        donhangId: donhangdoc._id,
        response: { cancel: true, reason: lydo },
        ghichu: 'Hủy đơn trước khi thanh toán'
      });
    } catch {
      // best-effort
    }
  }

  if (donhangdoc.phuongthucthanhtoan === 'momo' && donhangdoc.dathanhtoan && donhangdoc.momoTransId && !donhangdoc.momoRefunded) {
    try {
      const ketqua = await taoHoanTienMoMo({
        orderId: String(donhangdoc._id),
        requestId: String(donhangdoc._id) + '-refund',
        amount: String(Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0))),
        transId: String(donhangdoc.momoTransId),
        description: `Hoàn tiền đơn hàng ${donhangdoc.madonhang || String(donhangdoc._id)}`
      });

      if (ketqua && (ketqua.resultCode === 0 || ketqua.message === 'Success')) {
        await donhang.updateOne({ _id: donhangdoc._id }, { $set: { momoRefunded: true, momoRefundAt: new Date() } });

        try {
          await danhDauHoanTienMoMoTheoDonHang({
            donhangId: donhangdoc._id,
            nguoidungId: donhangdoc.nguoidung_id,
            sotien: Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0)),
            magiaodich: donhangdoc.momoOrderId || undefined,
            refundResponse: ketqua,
            ghichu: 'Hoàn tiền MoMo thành công'
          });
        } catch {
          // best-effort
        }

        return { ok: true, redirect: '/orders', flash: { type: 'success', message: 'Đã hủy đơn hàng, hoàn tiền MoMo thành công.' } };
      }

      return { ok: false, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: ketqua?.message || 'Đã hủy đơn nhưng hoàn tiền MoMo thất bại.' } };
    } catch {
      return { ok: false, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: 'Đã hủy đơn nhưng hoàn tiền MoMo lỗi.' } };
    }
  }

  return { ok: true, redirect: '/orders', flash: { type: 'success', message: 'Đã hủy đơn hàng và hoàn lại số lượng sản phẩm.' } };
}

async function reorderFromOldOrder({ userId, orderId }) {
  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) return { redirect: '/orders', flash: { type: 'success', message: 'Không tìm thấy đơn hàng.' } };

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id }).lean();
  if (!danhsachitem || !danhsachitem.length) return { redirect: '/orders', flash: { type: 'success', message: 'Đơn hàng không có sản phẩm để mua lại.' } };

  const giohang = await getOrCreateCart(userId);
  let sodathem = 0;
  let soboqua = 0;

  for (const it of danhsachitem) {
    const sanphamdoc = await sanpham.findOne({ _id: it.sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' }).lean();
    if (!sanphamdoc) {
      soboqua += 1;
      continue;
    }

    const bientheid = it.bienthe_id ? String(it.bienthe_id) : '';
    const sizeval = it.kichco ? String(it.kichco) : '';

    const tontai = (giohang.sanpham || []).find(ci => String(ci.sanpham_id) === String(it.sanpham_id)
      && String(ci.bienthe_id || '') === bientheid
      && String(ci.kichco || '') === sizeval);

    const qty = Math.max(1, parseInt(it.soluong, 10) || 1);

    if (tontai) {
      tontai.soluong = (tontai.soluong || 0) + qty;
    } else {
      giohang.sanpham.push({
        sanpham_id: it.sanpham_id,
        bienthe_id: it.bienthe_id || null,
        tensanpham: it.tensanpham || sanphamdoc.tensanpham,
        hinhanh: normalizeImage(it.hinhanh) || normalizeImage(sanphamdoc.hinhanh),
        mausac: it.mausac || sanphamdoc.mausac_chinh || 'Mặc định',
        kichco: it.kichco || null,
        gia: it.giagoc || it.giaban || sanphamdoc.gia || 0,
        giagiam: it.giaban || it.giagoc || sanphamdoc.gia || 0,
        soluong: qty
      });
    }

    sodathem += 1;
  }

  await giohang.save();
  return {
    redirect: '/cart',
    flash: {
      type: 'success',
      message: `Đã thêm ${sodathem} sản phẩm vào giỏ hàng${soboqua ? ` (bỏ qua ${soboqua} sản phẩm đã ngừng bán)` : ''}.`
    }
  };
}

async function repayOrder({ userId, orderId, protocol, host, headers, socketRemoteAddress, ip }) {
  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) return { redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };

  const dangcho = donhangdoc.trangthai === 'choxacnhan';
  const chuathanhtoan = !donhangdoc.dathanhtoan;
  const phuongthuc = String(donhangdoc.phuongthucthanhtoan || 'cod');

  if (!dangcho || !chuathanhtoan || (phuongthuc !== 'momo' && phuongthuc !== 'vnpay')) {
    return { redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: 'Đơn hàng không thể thanh toán lại.' } };
  }

  const tongtien = Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0));

  if (phuongthuc === 'momo') {
    const redirectUrl = String(process.env.MOMO_REDIRECT_URL || `${protocol}://${host}/cart/momo/return`);
    const ipnUrl = String(process.env.MOMO_IPN_URL || `${protocol}://${host}/cart/momo/ipn`);
    const orderInfo = `Thanh toán đơn hàng ${donhangdoc.madonhang || String(donhangdoc._id)}`;
    const maMoMo = `${donhangdoc._id}-${Date.now()}`;
    const extraData = Buffer.from(JSON.stringify({ orderId: String(donhangdoc._id) })).toString('base64');

    const ketqua = await taoThanhToanMoMo({
      orderId: maMoMo,
      requestId: maMoMo,
      amount: String(tongtien),
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData
    });

    await donhang.updateOne(
      { _id: donhangdoc._id },
      { $set: { momoOrderId: maMoMo, momoRequestId: maMoMo, momoPayUrl: ketqua?.payUrl || undefined, ngaycapnhat: new Date() } }
    );

    try {
      await taoGiaoDichThanhToan({
        donhangId: donhangdoc._id,
        nguoidungId: donhangdoc.nguoidung_id,
        phuongthuc: 'momo',
        sotien: tongtien,
        magiaodich: maMoMo,
        trangthai: ketqua?.payUrl ? 'choduyet' : 'thatbai',
        response: ketqua,
        ghichu: ketqua?.payUrl ? 'Thanh toán lại MoMo' : (ketqua?.message || 'Không thể tạo thanh toán MoMo')
      });
    } catch {
      // best-effort
    }

    if (ketqua && ketqua.payUrl) return { redirect: ketqua.payUrl };
    return { redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: ketqua?.message || 'Không thể tạo thanh toán MoMo' } };
  }

  const returnUrl = String(process.env.VNPAY_RETURN_URL || `${protocol}://${host}/cart/vnpay/return`);
  const ipnUrl = String(process.env.VNPAY_IPN_URL || `${protocol}://${host}/cart/vnpay/ipn`);
  const now = new Date();
  const txnRef = `${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
  const orderInfo = `Thanh toan cho ma GD:${txnRef}`;
  const ipAddr = String(headers['x-forwarded-for'] || socketRemoteAddress || ip || '127.0.0.1').split(',')[0].trim();

  await donhang.updateOne({ _id: donhangdoc._id }, { $set: { vnpayTxnRef: txnRef } });

  const payUrl = taoThanhToanVnpay({
    orderId: txnRef,
    amount: tongtien,
    orderInfo,
    returnUrl,
    ipnUrl,
    ipAddr,
    locale: 'vn',
    orderType: 'other'
  });

  try {
    await taoGiaoDichThanhToan({
      donhangId: donhangdoc._id,
      nguoidungId: donhangdoc.nguoidung_id,
      phuongthuc: 'vnpay',
      sotien: tongtien,
      magiaodich: txnRef,
      trangthai: 'choduyet',
      response: { txnRef, payUrl },
      ghichu: 'Thanh toán lại VNPAY'
    });
  } catch {
    // best-effort
  }

  return { redirect: payUrl };
}

async function checkOrderPaymentStatus({ userId, orderId }) {
  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } })
    .select('_id nguoidung_id tongtien tamtinh dathanhtoan phuongthucthanhtoan momoOrderId momoRequestId momoTransId')
    .lean();

  if (!donhangdoc) return { status: 404, payload: { success: false, message: 'Không tìm thấy đơn hàng' } };
  if (donhangdoc.dathanhtoan) return { status: 200, payload: { success: true, paid: true } };

  const method = String(donhangdoc.phuongthucthanhtoan || '');
  if (method !== 'momo') return { status: 200, payload: { success: true, paid: false } };

  const momoOrderId = String(donhangdoc.momoOrderId || '').trim();
  const momoRequestId = String(donhangdoc.momoRequestId || momoOrderId || '').trim();
  if (!momoOrderId) return { status: 200, payload: { success: true, paid: false } };

  const ketqua = await truyVanGiaoDichMoMo({ orderId: momoOrderId, requestId: momoRequestId });
  const resultCode = Number(ketqua?.resultCode ?? -1);
  const transId = ketqua?.transId ? String(ketqua.transId) : '';

  if (resultCode === 0) {
    await donhang.updateOne(
      { _id: donhangdoc._id },
      { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), momoTransId: transId || undefined, ngaycapnhat: new Date() } }
    );

    try {
      await danhDauThanhCongTheoDonHang({
        donhangId: donhangdoc._id,
        nguoidungId: donhangdoc.nguoidung_id,
        phuongthuc: 'momo',
        sotien: Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0)),
        magiaodich: momoOrderId || undefined,
        successResponse: ketqua,
        ghichu: 'Polling MoMo: success'
      });
    } catch {
      // best-effort
    }

    return { status: 200, payload: { success: true, paid: true } };
  }

  try {
    await capNhatGiaoDichThanhToan({
      donhangId: donhangdoc._id,
      nguoidungId: donhangdoc.nguoidung_id,
      phuongthuc: 'momo',
      sotien: Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0)),
      magiaodich: momoOrderId || undefined,
      trangthai: 'choduyet',
      response: ketqua,
      ghichu: `Polling MoMo: resultCode=${resultCode}`
    });
  } catch {
    // best-effort
  }

  return { status: 200, payload: { success: true, paid: false, resultCode, message: ketqua?.message || '' } };
}

async function changePaymentMethod({ userId, orderId, newMethod }) {
  const phuongthucMoi = String(newMethod || '').trim();
  const hopLe = ['cod', 'momo', 'vnpay'];
  if (!hopLe.includes(phuongthucMoi)) return { ok: false, redirect: `/orders/${orderId}`, flash: { type: 'error', message: 'Phương thức thanh toán không hợp lệ.' } };

  const donhangdoc = await donhang.findOne({ _id: orderId, nguoidung_id: userId, daxoa: { $ne: true } });
  if (!donhangdoc) return { ok: false, redirect: '/orders', flash: { type: 'error', message: 'Không tìm thấy đơn hàng.' } };

  if (donhangdoc.trangthai !== 'choxacnhan' || donhangdoc.dathanhtoan) {
    return { ok: false, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: 'Đơn hàng không thể đổi phương thức thanh toán.' } };
  }

  if (String(donhangdoc.phuongthucthanhtoan || 'cod') === phuongthucMoi) {
    return { ok: true, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'success', message: 'Phương thức thanh toán không thay đổi.' } };
  }

  const capnhat = {
    phuongthucthanhtoan: phuongthucMoi,
    vnpayTxnRef: undefined,
    vnpayTransId: undefined,
    vnpayBankCode: undefined,
    momoTransId: undefined
  };

  await donhang.updateOne({ _id: donhangdoc._id }, { $set: capnhat });
  return { ok: true, redirect: `/orders/${donhangdoc._id}`, flash: { type: 'success', message: 'Đã cập nhật phương thức thanh toán.' } };
}

module.exports = {
  getOrdersPageData,
  getOrderDetailPageData,
  createReturnRequest,
  cancelOrderByUser,
  reorderFromOldOrder,
  repayOrder,
  checkOrderPaymentStatus,
  changePaymentMethod
};
