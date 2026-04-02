const donhang = require('../../models/order_model');
const chitietdonhang = require('../../models/order_item_model');
const nguoidung = require('../../models/user_model');
const {
  getOrCreateCart,
  dongBoGiaGioHang,
  truTonTheoItem,
  hoanTonTheoItem,
  kiemTraTonKhoDatHang,
  normalizeShippingRegion,
  calcShippingFee
} = require('../cart.service');
const SHIPPING_CONFIG = require('../../config/shipping');
const {
  normalizeCode,
  validateVoucherForOrder,
  reserveVoucherUsage,
  releaseVoucherUsage,
  markVoucherUsed,
  unmarkVoucherUsed
} = require('../payment/voucher.service.js');
const { taoThanhToanMoMo } = require('../payment/momo.service.js');
const { taoThanhToanVnpay } = require('../payment/vnpay.service.js');
const {
  taoGiaoDichThanhToan
} = require('../payment/payment.service.js');

async function getCheckoutPageData({ userId, itemIdsQuery }) {
  const giohang = await getOrCreateCart(userId);
  const daDongBoGia = await dongBoGiaGioHang(giohang);
  if (daDongBoGia) await giohang.save();

  const thamso = itemIdsQuery;
  const danhsachidchon = Array.isArray(thamso) ? thamso.map(String) : (thamso ? [String(thamso)] : []);
  const tapidchon = new Set(danhsachidchon);
  const danhsachitem = danhsachidchon.length
    ? (giohang.sanpham || []).filter(it => tapidchon.has(String(it._id)))
    : (giohang.sanpham || []);

  const tamtinh = danhsachitem.reduce((sum, it) => {
    const lineTotal = Number.isFinite(Number(it.thanhtien))
      ? Number(it.thanhtien)
      : ((it.giagiam || it.gia || 0) * (it.soluong || 1));
    return sum + lineTotal;
  }, 0);

  const defaultRegion = SHIPPING_CONFIG.defaultRegion || 'noithanh';
  const regionConfig = SHIPPING_CONFIG.regions || {};
  const shippingFee = tamtinh >= SHIPPING_CONFIG.freeShipThreshold
    ? 0
    : (regionConfig[defaultRegion]?.fee || 0);
  const finalTotal = Math.max(0, tamtinh + shippingFee);

  const taikhoan = await nguoidung.findOne({ _id: userId, daxoa: { $ne: true } }).lean();
  const danhsachdiachi = Array.isArray(taikhoan?.diachiList) ? taikhoan.diachiList : [];
  const danhsachdiachihienthi = [];

  if (taikhoan?.diachi) {
    danhsachdiachihienthi.push({
      _id: 'profile',
      label: 'Địa chỉ mặc định',
      tennguoinhan: taikhoan?.hoten || '',
      sodienthoai: taikhoan?.sodienthoai || '',
      diachi: taikhoan?.diachi || ''
    });
  }

  danhsachdiachi.forEach((diachi) => {
    danhsachdiachihienthi.push({
      _id: String(diachi._id),
      label: diachi.label || 'Địa chỉ',
      tennguoinhan: diachi.tennguoinhan || taikhoan?.hoten || '',
      sodienthoai: diachi.sodienthoai || taikhoan?.sodienthoai || '',
      diachi: diachi.diachi || ''
    });
  });

  return {
    cart: giohang,
    items: danhsachitem,
    subtotal: tamtinh,
    shippingFee,
    finalTotal,
    shippingConfig: SHIPPING_CONFIG,
    selectedShippingRegion: defaultRegion,
    selectedIds: danhsachitem.map(it => String(it._id)),
    userProfile: {
      hoten: taikhoan?.hoten || '',
      sodienthoai: taikhoan?.sodienthoai || '',
      email: taikhoan?.email || '',
      diachi: taikhoan?.diachi || ''
    },
    addresses: danhsachdiachihienthi
  };
}

async function processCheckout({ userId, body, protocol, host, headers, socketRemoteAddress, ip }) {
  let voucherDoc = null;
  let reservedVoucher = false;
  let orderCreated = false;
  let donhangdoc = null;
  let voucherMarkedUsed = false;
  const deductedItems = [];

  try {
    const giohang = await getOrCreateCart(userId);
    const daDongBoGia = await dongBoGiaGioHang(giohang);
    if (daDongBoGia) await giohang.save();
    if (!giohang.sanpham || giohang.sanpham.length === 0) return { redirect: '/cart' };

    const idsraw = body.itemIds;
    const danhsachidchon = Array.isArray(idsraw) ? idsraw.map(String) : (idsraw ? [String(idsraw)] : []);
    const tapidchon = new Set(danhsachidchon);
    const danhsachitem = danhsachidchon.length
      ? giohang.sanpham.filter(it => tapidchon.has(String(it._id)))
      : giohang.sanpham;

    if (!danhsachitem.length) return { redirect: '/cart', flash: { type: 'error', message: 'Vui lòng chọn sản phẩm để thanh toán' } };

    const taikhoan = await nguoidung.findOne({ _id: userId, daxoa: { $ne: true } });

    const iddiachi = String(body.addressId || '');
    let tennguoinhan = '';
    let sodienthoai = '';
    let diachigiao = '';

    if (iddiachi && iddiachi !== 'new') {
      if (iddiachi === 'profile') {
        tennguoinhan = String(taikhoan?.hoten || '').trim();
        sodienthoai = String(taikhoan?.sodienthoai || '').trim();
        diachigiao = String(taikhoan?.diachi || '').trim();
      } else {
        const diachitimthay = (taikhoan?.diachiList || []).find(a => String(a._id) === iddiachi);
        if (diachitimthay) {
          tennguoinhan = String(diachitimthay.tennguoinhan || taikhoan?.hoten || '').trim();
          sodienthoai = String(diachitimthay.sodienthoai || taikhoan?.sodienthoai || '').trim();
          diachigiao = String(diachitimthay.diachi || '').trim();
        }
      }
    }

    if (!tennguoinhan || !sodienthoai || !diachigiao) {
      tennguoinhan = String(body.tennguoinhan || '').trim();
      sodienthoai = String(body.sodienthoai || '').trim();
      diachigiao = String(body.diachigiao || '').trim();
    }

    if (!tennguoinhan || !sodienthoai || !diachigiao) {
      return { redirect: '/cart/checkout', flash: { type: 'error', message: 'Vui lòng nhập đầy đủ họ tên, số điện thoại, địa chỉ' } };
    }

    const emaillienhe = String(body.email || taikhoan?.email || '').trim();
    const ghichu = String(body.ghichu || '').trim();
    const phuongthucthanhtoan = String(body.phuongthucthanhtoan || 'cod');

    let shouldSaveProfile = false;

    if (taikhoan && !String(taikhoan.diachi || '').trim()) {
      taikhoan.diachi = diachigiao;
      if (!String(taikhoan.hoten || '').trim()) taikhoan.hoten = tennguoinhan;
      if (!String(taikhoan.sodienthoai || '').trim()) taikhoan.sodienthoai = sodienthoai;
      shouldSaveProfile = true;
    }

    if (String(body.saveAddress || '') && taikhoan && (iddiachi === 'new' || !iddiachi)) {
      taikhoan.diachiList = taikhoan.diachiList || [];
      taikhoan.diachiList.push({
        label: String(body.addressLabel || '').trim() || 'Địa chỉ',
        tennguoinhan,
        sodienthoai,
        diachi: diachigiao
      });
      shouldSaveProfile = true;
    }

    if (shouldSaveProfile) await taikhoan.save();

    const tamtinh = danhsachitem.reduce((sum, it) => {
      const lineTotal = Number.isFinite(Number(it.thanhtien))
        ? Number(it.thanhtien)
        : ((it.giagiam || it.gia || 0) * (it.soluong || 1));
      return sum + lineTotal;
    }, 0);

    const shippingRegion = normalizeShippingRegion(body.shippingRegion);
    const phivanchuyen = calcShippingFee(tamtinh, shippingRegion);

    const stockCheck = await kiemTraTonKhoDatHang(danhsachitem);
    if (!stockCheck.ok) {
      return {
        redirect: '/cart/checkout',
        flash: { type: 'error', message: stockCheck.message || 'San pham khong du hang de thanh toan.' }
      };
    }

    let giamgia = 0;
    const voucherCode = normalizeCode(body.voucherCode);

    if (voucherCode) {
      const validation = await validateVoucherForOrder({
        code: voucherCode,
        userId,
        orderTotal: tamtinh
      });

      if (!validation.ok) {
        return { redirect: '/cart/checkout', flash: { type: 'error', message: validation.message || 'Voucher không hợp lệ' } };
      }

      voucherDoc = validation.voucher;
      giamgia = Math.min(Number(validation.discount || 0), tamtinh);

      reservedVoucher = await reserveVoucherUsage(voucherDoc._id);
      if (!reservedVoucher) {
        return { redirect: '/cart/checkout', flash: { type: 'error', message: 'Voucher đã hết lượt sử dụng' } };
      }
    }

    const tongtien = Math.max(0, tamtinh - giamgia + phivanchuyen);
    try {
      donhangdoc = await donhang.create({
        nguoidung_id: userId,
        tennguoinhan,
        sodienthoai,
        email: emaillienhe,
        diachigiao,
        ghichu,
        phuongthucthanhtoan,
        phuongthucvanchuyen: shippingRegion,
        tamtinh,
        giamgia,
        phivanchuyen,
        tongtien,
        voucher_id: voucherDoc?._id || undefined,
        voucher_code: voucherDoc?.code || undefined,
        voucher_type: voucherDoc?.loai || undefined,
        voucher_value: voucherDoc?.giatri || undefined,
        voucher_discount: giamgia,
        trangthai: 'choxacnhan',
        ngaycapnhat: new Date()
      });
      orderCreated = true;
    } catch (error) {
      if (reservedVoucher && voucherDoc) await releaseVoucherUsage(voucherDoc._id);
      throw error;
    }

    for (const it of danhsachitem) {
      let inventoryResult;
      try {
        inventoryResult = await truTonTheoItem(it);
      } catch (inventoryError) {
        for (let i = deductedItems.length - 1; i >= 0; i -= 1) {
          const rollbackItem = deductedItems[i];
          await hoanTonTheoItem(rollbackItem.item, rollbackItem.inventoryResult).catch(() => {});
        }

        await chitietdonhang.deleteMany({ donhang_id: donhangdoc._id }).catch(() => {});
        await donhang.deleteOne({ _id: donhangdoc._id }).catch(() => {});
        orderCreated = false;
        donhangdoc = null;

        if (reservedVoucher && voucherDoc) {
          await releaseVoucherUsage(voucherDoc._id).catch(() => {});
          reservedVoucher = false;
        }

        return {
          redirect: '/cart/checkout',
          flash: {
            type: 'error',
            message: inventoryError && inventoryError.message ? inventoryError.message : 'San pham khong du hang de thanh toan.'
          }
        };
      }

      deductedItems.push({ item: it, inventoryResult });
      const fifoAllocations = Array.isArray(inventoryResult?.fifoAllocations)
        ? inventoryResult.fifoAllocations
          .map((a) => ({
            lotId: String(a?.lotId || ''),
            soLuong: Number(a?.soLuong || 0),
            giaNhap: Number(a?.giaNhap || 0),
            giaBanDeXuat: Number(a?.giaBanDeXuat || 0)
          }))
          .filter((a) => a.soLuong > 0)
        : [];

      const lineTotal = Number.isFinite(Number(it.thanhtien))
        ? Number(it.thanhtien)
        : ((it.giagiam || it.gia || 0) * (it.soluong || 1));
      const unitPriceAfterDiscount = (it.soluong || 1) > 0 ? (lineTotal / (it.soluong || 1)) : (it.giagiam || it.gia || 0);

      await chitietdonhang.create({
        donhang_id: donhangdoc._id,
        sanpham_id: it.sanpham_id,
        bienthe_id: it.bienthe_id,
        tensanpham: it.tensanpham,
        hinhanh: it.hinhanh,
        mausac: it.mausac,
        kichco: it.kichco,
        giagoc: it.gia,
        giaban: unitPriceAfterDiscount,
        soluong: it.soluong,
        thanhtien: lineTotal,
        fifoAllocations
      });
    }

    if (voucherDoc) {
      await markVoucherUsed({ voucherId: voucherDoc._id, userId });
      voucherMarkedUsed = true;
    }

    const tapdathanhtoan = new Set(danhsachitem.map(it => String(it._id)));
    giohang.sanpham = giohang.sanpham.filter(it => !tapdathanhtoan.has(String(it._id)));
    await giohang.save();

    if (phuongthucthanhtoan === 'momo') {
      const redirectUrl = String(process.env.MOMO_REDIRECT_URL || `${protocol}://${host}/cart/momo/return`);
      const ipnUrl = String(process.env.MOMO_IPN_URL || `${protocol}://${host}/cart/momo/ipn`);
      const orderInfo = `Thanh toán đơn hàng ${donhangdoc.madonhang || String(donhangdoc._id)}`;
      const maMoMo = `${donhangdoc._id}-${Date.now()}`;
      const extraData = Buffer.from(JSON.stringify({ orderId: String(donhangdoc._id) })).toString('base64');
      const soTienThanhToan = Math.max(0, Math.round(tongtien));

      const ketqua = await taoThanhToanMoMo({
        orderId: maMoMo,
        requestId: maMoMo,
        amount: String(soTienThanhToan),
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
          nguoidungId: userId,
          phuongthuc: 'momo',
          sotien: soTienThanhToan,
          magiaodich: maMoMo,
          trangthai: ketqua?.payUrl ? 'choduyet' : 'thatbai',
          response: ketqua,
          ghichu: ketqua?.payUrl ? 'Tạo thanh toán MoMo' : (ketqua?.message || 'Không thể tạo thanh toán MoMo')
        });
      } catch {
        // best-effort
      }

      if (ketqua && ketqua.payUrl) return { redirect: ketqua.payUrl };
      return { redirect: `/orders/${donhangdoc._id}`, flash: { type: 'error', message: ketqua?.message || 'Không thể tạo thanh toán MoMo' } };
    }

    if (phuongthucthanhtoan === 'vnpay') {
      const returnUrl = String(process.env.VNPAY_RETURN_URL || `${protocol}://${host}/cart/vnpay/return`);
      const ipnUrl = String(process.env.VNPAY_IPN_URL || `${protocol}://${host}/cart/vnpay/ipn`);
      const now = new Date();
      const txnRef = `${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
      const orderInfo = `Thanh toan cho ma GD:${txnRef}`;
      const ipAddr = String(headers['x-forwarded-for'] || socketRemoteAddress || ip || '127.0.0.1').split(',')[0].trim();

      await donhang.updateOne({ _id: donhangdoc._id }, { $set: { vnpayTxnRef: txnRef } });

      const soTienThanhToan = Math.max(0, Math.round(tongtien));
      const payUrl = taoThanhToanVnpay({
        orderId: txnRef,
        amount: soTienThanhToan,
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
          nguoidungId: userId,
          phuongthuc: 'vnpay',
          sotien: soTienThanhToan,
          magiaodich: txnRef,
          trangthai: 'choduyet',
          response: { txnRef, payUrl },
          ghichu: 'Tạo thanh toán VNPAY'
        });
      } catch {
        // best-effort
      }

      return { redirect: payUrl };
    }

    if (phuongthucthanhtoan === 'cod') {
      return { redirect: `/orders/${donhangdoc._id}`, flash: { type: 'success', message: 'Đặt hàng thành công!' } };
    }

    return { redirect: `/orders/${donhangdoc._id}` };
  } catch (e) {
    if (orderCreated && donhangdoc?._id) {
      for (let i = deductedItems.length - 1; i >= 0; i -= 1) {
        const rollbackItem = deductedItems[i];
        await hoanTonTheoItem(rollbackItem.item, rollbackItem.inventoryResult).catch(() => {});
      }
      await chitietdonhang.deleteMany({ donhang_id: donhangdoc._id }).catch(() => {});
      await donhang.deleteOne({ _id: donhangdoc._id }).catch(() => {});
    }

    if (voucherMarkedUsed && voucherDoc?._id) {
      try {
        await unmarkVoucherUsed({ voucherId: voucherDoc._id, userId });
      } catch {
        // ignore
      }
      try {
        await releaseVoucherUsage(voucherDoc._id);
      } catch {
        // ignore
      }
    }

    if (reservedVoucher && voucherDoc && !orderCreated) {
      try {
        await releaseVoucherUsage(voucherDoc._id);
      } catch {
        // ignore
      }
    }
    throw e;
  }
}

module.exports = {
  getCheckoutPageData,
  processCheckout
};
