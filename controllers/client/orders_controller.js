const donhang = require('../../models/order_model');
const chitietdonhang = require('../../models/order_item_model');
const danhgia = require('../../models/review_model');
const sanpham = require('../../models/product_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');
const { laLoaiKhongSize, tinhTongTon } = require('../../services/productStock.service');
const { taoHoanTienMoMo, taoThanhToanMoMo, truyVanGiaoDichMoMo } = require('../../services/momo.service');
const { taoThanhToanVnpay } = require('../../services/vnpay.service');
const { taoGiaoDichThanhToan, capNhatGiaoDichThanhToan, danhDauThatBaiTheoDonHang, danhDauThatBaiTatCaPendingTheoDonHang, danhDauHoanTienMoMoTheoDonHang, danhDauThanhCongTheoDonHang } = require('../../services/payment.service');
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

    // Đồng bộ trạng thái item theo đơn hủy
    try {
      await chitietdonhang.updateMany(
        { donhang_id: updated._id },
        { $set: { trangthai: 'dahuy' } }
      );
    } catch {
      // best-effort
    }

    // Đánh dấu giao dịch thanh toán (nếu có) là thất bại do quá hạn.
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

module.exports.danhSach = async (req, res) => {
  await tuDongHuyDonQuaHan(req.user._id);

  const trangthai = String(req.query.status || 'all');
  const tapchophep = new Set(layTrangThaiChoPhep());
  const trangthaihientai = tapchophep.has(trangthai) ? trangthai : 'all';

  const boloc = { nguoidung_id: req.user._id, daxoa: { $ne: true } };
  if (trangthaihientai !== 'all') boloc.trangthai = trangthaihientai;

  const tongDon = await donhang.countDocuments(boloc);
  let phanTrang = { currentPage: 1, limit: 10 };
  phanTrang = phanTrangHelper(phanTrang, req.query, tongDon);

  const danhsachdon = await donhang.find(boloc)
    .sort({ ngaycapnhat: -1, ngaytao: -1 })
    .skip(phanTrang.skip)
    .limit(phanTrang.limit)
    .lean();

  // Thêm hạn thanh toán cho MoMo/VNPAY để UI đếm ngược
  const nowMs = Date.now();
  for (const o of (danhsachdon || [])) {
    if (!laDonChoThanhToanOnline(o)) continue;
    const deadline = tinhHanThanhToanMs(o);
    if (!deadline) continue;
    o.paymentDeadline = deadline;
    o.paymentRemainingMs = Math.max(0, deadline - nowMs);
  }

  // Preview
  if (danhsachdon && danhsachdon.length) {
    const danhsachiddon = danhsachdon.map(o => o._id);
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
        productId: thongtin.first && thongtin.first.sanpham_id ? String(thongtin.first.sanpham_id) : null
      };
    }
  }

  res.render('client/pages/orders/index.pug', {
    titlePage: 'Đơn hàng của tôi',
    orders: danhsachdon || [],
    currentStatus: trangthaihientai,
    statusOptions: layTrangThaiChoPhep(),
    statusLabels: nhantrangthai,
    pagination: phanTrang
  });
};

module.exports.chiTiet = async (req, res) => {

  if (String(req.query.paid || '') === '1') {
    req.flash?.('success', 'Thanh toán thành công!');
    return res.redirect(`/orders/${req.params.id}`);
  }

  const donhangdoc = await donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) {
    return res.status(404).render('client/pages/orders/detail.pug', {
      titlePage: 'Không tìm thấy đơn hàng',
      order: null,
      items: [],
      statusLabels: nhantrangthai
    });
  }

  // Nếu đã quá hạn 24h thì tự hủy và hoàn tồn kho
  if (laDonChoThanhToanOnline(donhangdoc)) {
    const deadline = tinhHanThanhToanMs(donhangdoc);
    if (deadline && Date.now() > deadline) {
      await tuDongHuyDonQuaHan(req.user._id);
      return res.redirect(`/orders/${req.params.id}`);
    }
    donhangdoc.paymentDeadline = deadline;
    donhangdoc.paymentRemainingMs = deadline ? Math.max(0, deadline - Date.now()) : null;
  }

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id }).lean();
  const reviewed = await danhgia.find({
    nguoidung_id: req.user._id,
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

  return res.render('client/pages/orders/detail.pug', {
    titlePage: `Chi tiết ${donhangdoc.madonhang || 'đơn hàng'}`,
    order: donhangdoc,
    items: danhsachdaxuly,
    statusLabels: nhantrangthai,
    returnEligible: coTheYeuCauHoan(donhangdoc),
    returnReasonLabels: LY_DO_HOAN_LABELS
  });
};

module.exports.yeuCauHoanHang = async (req, res) => {
  try {
    const order = await donhang.findOne({
      _id: req.params.id,
      nguoidung_id: req.user._id,
      daxoa: { $ne: true }
    });

    if (!order) {
      req.flash?.('error', 'Không tìm thấy đơn hàng.');
      return res.redirect('/orders');
    }

    if (!coTheYeuCauHoan(order)) {
      req.flash?.('error', 'Đơn hàng này không đủ điều kiện gửi yêu cầu hoàn hàng.');
      return res.redirect(`/orders/${order._id}`);
    }

    const reason = String(req.body.reason || '').trim();
    const detail = String(req.body.detail || '').trim();
    const refundMethod = String(req.body.refundMethod || '').trim();

    if (!LY_DO_HOAN_LABELS[reason]) {
      req.flash?.('error', 'Lý do hoàn hàng không hợp lệ.');
      return res.redirect(`/orders/${order._id}`);
    }

    if (!['momo', 'bank', 'wallet'].includes(refundMethod)) {
      req.flash?.('error', 'Phương thức hoàn tiền không hợp lệ.');
      return res.redirect(`/orders/${order._id}`);
    }

    const proofMedias = Array.isArray(req.files)
      ? req.files
        .filter((f) => f && f.filename)
        .map((f) => `/uploads/returns/${f.filename}`)
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

    req.flash?.('success', 'Đã gửi yêu cầu hoàn hàng. Vui lòng chờ admin duyệt.');
    return res.redirect(`/orders/${order._id}`);
  } catch (err) {
    console.error('client return request error:', err);
    req.flash?.('error', 'Không thể gửi yêu cầu hoàn hàng lúc này.');
    return res.redirect(`/orders/${req.params.id}`);
  }
};

module.exports.huyDon = async (req, res) => {
  const lydo = String(req.body.reason || '').trim() || 'Khách hàng hủy đơn';

  // Cập nhật trạng thái
  const donhangdoc = await donhang.findOneAndUpdate(
    { _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true }, trangthai: 'choxacnhan' },
    { $set: { trangthai: 'dahuy', lydohuy: lydo, ngaycapnhat: new Date() } },
    { new: true }
  );

  if (!donhangdoc) {
    const tontai = await donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } })
      .select('_id trangthai')
      .lean();

    if (!tontai) {
      req.flash?.('error', 'Không tìm thấy đơn hàng.');
      return res.redirect('/orders');
    }

    req.flash?.('error', 'Đơn hàng này không thể hủy ở trạng thái hiện tại.');
    return res.redirect(`/orders/${tontai._id}`);
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
    req.flash?.('error', 'Đã hủy đơn, nhưng có lỗi khi hoàn tồn kho cho một số sản phẩm. Vui lòng liên hệ shop.');
    return res.redirect(`/orders/${donhangdoc._id}`);
  }

  // Đồng bộ trạng thái item theo đơn hủy
  try {
    await chitietdonhang.updateMany(
      { donhang_id: donhangdoc._id },
      { $set: { trangthai: 'dahuy' } }
    );
  } catch {
    // best-effort
  }

  // Nếu hủy đơn khi chưa thanh toán, đánh dấu tất cả giao dịch pending là failed.
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
        await donhang.updateOne(
          { _id: donhangdoc._id },
          { $set: { momoRefunded: true, momoRefundAt: new Date() } }
        );

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

        req.flash?.('success', 'Đã hủy đơn hàng, hoàn tiền MoMo thành công.');
        return res.redirect('/orders');
      }

      req.flash?.('error', ketqua?.message || 'Đã hủy đơn nhưng hoàn tiền MoMo thất bại.');
      return res.redirect(`/orders/${donhangdoc._id}`);
    } catch (e) {
      req.flash?.('error', 'Đã hủy đơn nhưng hoàn tiền MoMo lỗi.');
      return res.redirect(`/orders/${donhangdoc._id}`);
    }
  }

  req.flash?.('success', 'Đã hủy đơn hàng và hoàn lại số lượng sản phẩm.');
  return res.redirect('/orders');
};

module.exports.muaLai = async (req, res) => {
  const donhangdoc = await donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) {
    req.flash('success', 'Không tìm thấy đơn hàng.');
    return res.redirect('/orders');
  }

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id }).lean();
  if (!danhsachitem || !danhsachitem.length) {
    req.flash('success', 'Đơn hàng không có sản phẩm để mua lại.');
    return res.redirect('/orders');
  }

  const giohang = await getOrCreateCart(req.user._id);

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
  req.flash('success', `Đã thêm ${sodathem} sản phẩm vào giỏ hàng${soboqua ? ` (bỏ qua ${soboqua} sản phẩm đã ngừng bán)` : ''}.`);
  return res.redirect('/cart');
};

module.exports.thanhToanLai = async (req, res) => {
  try {
    const donhangdoc = await donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
    if (!donhangdoc) {
      req.flash?.('error', 'Không tìm thấy đơn hàng.');
      return res.redirect('/orders');
    }

    const dangcho = donhangdoc.trangthai === 'choxacnhan';
    const chuathanhtoan = !donhangdoc.dathanhtoan;
    const phuongthuc = String(donhangdoc.phuongthucthanhtoan || 'cod');

    if (!dangcho || !chuathanhtoan || (phuongthuc !== 'momo' && phuongthuc !== 'vnpay')) {
      req.flash?.('error', 'Đơn hàng không thể thanh toán lại.');
      return res.redirect(`/orders/${donhangdoc._id}`);
    }

    const tongtien = Math.max(0, Math.round(donhangdoc.tongtien || donhangdoc.tamtinh || 0));

    if (phuongthuc === 'momo') {
      const redirectUrl = String(process.env.MOMO_REDIRECT_URL || `${req.protocol}://${req.get('host')}/cart/momo/return`);
      const ipnUrl = String(process.env.MOMO_IPN_URL || `${req.protocol}://${req.get('host')}/cart/momo/ipn`);
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

      if (ketqua && ketqua.payUrl) {
        return res.redirect(ketqua.payUrl);
      }

      req.flash?.('error', ketqua?.message || 'Không thể tạo thanh toán MoMo');
      return res.redirect(`/orders/${donhangdoc._id}`);
    }

    const returnUrl = String(process.env.VNPAY_RETURN_URL || `${req.protocol}://${req.get('host')}/cart/vnpay/return`);
    const ipnUrl = String(process.env.VNPAY_IPN_URL || `${req.protocol}://${req.get('host')}/cart/vnpay/ipn`);
    const now = new Date();
    const txnRef = `${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const orderInfo = `Thanh toan cho ma GD:${txnRef}`;
    const ipAddr = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1').split(',')[0].trim();

    await donhang.updateOne(
      { _id: donhangdoc._id },
      { $set: { vnpayTxnRef: txnRef } }
    );

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

    return res.redirect(payUrl);
  } catch (e) {
    req.flash?.('error', 'Có lỗi khi tạo thanh toán lại.');
    return res.redirect(`/orders/${req.params.id}`);
  }
};

// API: dùng để polling (khi user bấm Back/Quay về từ QR) để tự cập nhật đơn hàng đã thanh toán.
module.exports.kiemTraThanhToan = async (req, res) => {
  try {
    const donhangdoc = await donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } })
      .select('_id nguoidung_id tongtien tamtinh dathanhtoan phuongthucthanhtoan momoOrderId momoRequestId momoTransId')
      .lean();

    if (!donhangdoc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    if (donhangdoc.dathanhtoan) {
      return res.json({ success: true, paid: true });
    }

    const method = String(donhangdoc.phuongthucthanhtoan || '');
    if (method !== 'momo') {
      // VNPAY/COD: chỉ chờ IPN/return update DB
      return res.json({ success: true, paid: false });
    }

    const momoOrderId = String(donhangdoc.momoOrderId || '').trim();
    const momoRequestId = String(donhangdoc.momoRequestId || momoOrderId || '').trim();
    if (!momoOrderId) {
      return res.json({ success: true, paid: false });
    }

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

      return res.json({ success: true, paid: true });
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

    return res.json({ success: true, paid: false, resultCode, message: ketqua?.message || '' });
  } catch {
    return res.status(200).json({ success: false, paid: false });
  }
};

module.exports.doiPhuongThucThanhToan = async (req, res) => {
  try {
    const phuongthucMoi = String(req.body.phuongthucthanhtoan || '').trim();
    const hopLe = ['cod', 'momo', 'vnpay'];

    if (!hopLe.includes(phuongthucMoi)) {
      req.flash?.('error', 'Phương thức thanh toán không hợp lệ.');
      return res.redirect(`/orders/${req.params.id}`);
    }

    const donhangdoc = await donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } });
    if (!donhangdoc) {
      req.flash?.('error', 'Không tìm thấy đơn hàng.');
      return res.redirect('/orders');
    }

    if (donhangdoc.trangthai !== 'choxacnhan' || donhangdoc.dathanhtoan) {
      req.flash?.('error', 'Đơn hàng không thể đổi phương thức thanh toán.');
      return res.redirect(`/orders/${donhangdoc._id}`);
    }

    if (String(donhangdoc.phuongthucthanhtoan || 'cod') === phuongthucMoi) {
      req.flash?.('success', 'Phương thức thanh toán không thay đổi.');
      return res.redirect(`/orders/${donhangdoc._id}`);
    }

    const capnhat = {
      phuongthucthanhtoan: phuongthucMoi,
      vnpayTxnRef: undefined,
      vnpayTransId: undefined,
      vnpayBankCode: undefined,
      momoTransId: undefined
    };

    await donhang.updateOne({ _id: donhangdoc._id }, { $set: capnhat });
    req.flash?.('success', 'Đã cập nhật phương thức thanh toán.');

    const referer = req.get('referer');
    return res.redirect(referer || `/orders/${donhangdoc._id}`);
  } catch (e) {
    req.flash?.('error', 'Không thể đổi phương thức thanh toán.');
    return res.redirect(`/orders/${req.params.id}`);
  }
};
