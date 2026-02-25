const sanpham = require('../../models/product_model');
const donhang = require('../../models/order_model');
const chitietdonhang = require('../../models/order_item_model');
const nguoidung = require('../../models/user_model');
const { getOrCreateCart } = require('../../services/cart.service');
const { laLoaiKhongSize, tinhTongTon, layBienTheVaTon } = require('../../services/productStock.service');
const { muonJSON } = require('../../helpers/http');
const { taoThanhToanMoMo } = require('../../services/momo.service');
const { taoThanhToanVnpay, kiemTraChuKyVnpay } = require('../../services/vnpay.service');
const { taoGiaoDichThanhToan, capNhatGiaoDichThanhToan, danhDauThanhCongTheoDonHang } = require('../../services/payment.service');
const SHIPPING_CONFIG = require('../../config/shipping');
const {
  normalizeCode,
  validateVoucherForOrder,
  reserveVoucherUsage,
  releaseVoucherUsage,
  markVoucherUsed
} = require('../../services/voucher.service');

// laLoaiKhongSize / tinhTongTon / layBienTheVaTon đã được tách sang services/productStock.service

module.exports.danhSach = async (req, res) => {
  const giohang = await getOrCreateCart(req.user._id);

  let dacapnhat = false;
  const danhsachsanpham = giohang.sanpham || [];
  for (const item of danhsachsanpham) {
    let tonkho = 0;
    try {
      const sanphamdoc = await sanpham.findOne({ _id: item.sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
      if (sanphamdoc) {
        const ketqua = layBienTheVaTon(sanphamdoc, item.bienthe_id, item.kichco);
        tonkho = ketqua?.error ? 0 : Math.max(0, Number(ketqua.stock || 0));
      }
    } catch {
      tonkho = 0;
    }

    item.tonkho = tonkho;
    if (tonkho > 0 && (item.soluong || 0) > tonkho) {
      item.soluong = tonkho;
      dacapnhat = true;
    }
  }

  if (dacapnhat) {
    await giohang.save();
  }

  res.render('client/pages/cart/index.pug', {
    titlePage: 'Giỏ hàng',
    cart: giohang
  });
};

module.exports.them = async (req, res) => {
  try {
    const { sanpham_id, bienthe_id, kichco } = req.body;
    const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const sanphamdoc = await sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!sanphamdoc) {
      return muonJSON(req) ? res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' }) : res.redirect('/products');
    }

    const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);
    if (cosize && !kichco) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Vui lòng chọn size' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const ketqua = layBienTheVaTon(sanphamdoc, bienthe_id, kichco);
    if (ketqua.error) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: ketqua.error }) : res.redirect(`/products/${sanpham_id}`);
    }

    if (ketqua.stock <= 0) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Hết hàng' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const soluongthem = Math.min(soluong, ketqua.stock);

    const giohang = await getOrCreateCart(req.user._id);
    const tontai = giohang.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
      && String(i.bienthe_id || '') === String(ketqua.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    if (tontai) {
      tontai.soluong = Math.min(ketqua.stock, (tontai.soluong || 0) + soluongthem);
    } else {
      giohang.sanpham.push({
        sanpham_id,
        bienthe_id: ketqua.bienTheObjId,
        tensanpham: sanphamdoc.tensanpham,
        hinhanh: ketqua.hinhanh,
        mausac: ketqua.mausac,
        kichco: kichco || null,
        gia: ketqua.gia,
        giagiam: ketqua.giagiam,
        soluong: soluongthem
      });
    }

    await giohang.save();

    if (muonJSON(req)) {
      return res.json({ success: true, cartCount: giohang.sanpham.length });
    }

    return res.redirect('/cart');
  } catch (e) {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/cart');
  }
};

module.exports.muaNgay = async (req, res) => {
  try {
    const { sanpham_id, bienthe_id, kichco } = req.body;
    const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const sanphamdoc = await sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!sanphamdoc) {
      return muonJSON(req) ? res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' }) : res.redirect('/products');
    }

    const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);
    if (cosize && !kichco) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Vui lòng chọn size' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const ketqua = layBienTheVaTon(sanphamdoc, bienthe_id, kichco);
    if (ketqua.error) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: ketqua.error }) : res.redirect(`/products/${sanpham_id}`);
    }

    if (ketqua.stock <= 0) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Hết hàng' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const soluongthem = Math.min(soluong, ketqua.stock);
    const giohang = await getOrCreateCart(req.user._id);

    const tontai = giohang.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
      && String(i.bienthe_id || '') === String(ketqua.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    let iditemdich;
    if (tontai) {
      tontai.soluong = soluongthem;
      iditemdich = tontai._id;
    } else {
      giohang.sanpham.push({
        sanpham_id,
        bienthe_id: ketqua.bienTheObjId,
        tensanpham: sanphamdoc.tensanpham,
        hinhanh: ketqua.hinhanh,
        mausac: ketqua.mausac,
        kichco: kichco || null,
        gia: ketqua.gia,
        giagiam: ketqua.giagiam,
        soluong: soluongthem
      });
      iditemdich = giohang.sanpham[giohang.sanpham.length - 1]._id;
    }

    await giohang.save();

    const duongdanchuyen = iditemdich ? `/cart/checkout?itemIds=${iditemdich}` : '/cart/checkout';

    if (muonJSON(req)) {
      return res.json({ success: true, cartCount: giohang.sanpham.length, redirect: duongdanchuyen });
    }

    return res.redirect(duongdanchuyen);
  } catch (e) {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/cart');
  }
};

module.exports.capNhatSoLuong = async (req, res) => {
  const iditem = String(req.body.itemId || '').trim();
  const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

  const giohang = await getOrCreateCart(req.user._id);
  const dongitem = giohang.sanpham.id(iditem);
  if (!dongitem) {
    return muonJSON(req) ? res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm trong giỏ' }) : res.redirect('/cart');
  }

  let soluongcapnhat = soluong;
  let tonkho = null;

  try {
    const sanphamdoc = await sanpham.findOne({ _id: dongitem.sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (sanphamdoc) {
      const ketqua = layBienTheVaTon(sanphamdoc, dongitem.bienthe_id, dongitem.kichco);
      if (!ketqua?.error) {
        tonkho = Math.max(0, Number(ketqua.stock || 0));
        if (tonkho > 0) {
          soluongcapnhat = Math.min(soluongcapnhat, tonkho);
        } else {
          soluongcapnhat = Math.min(soluongcapnhat, Number(dongitem.soluong || 1));
        }
      }
    }
  } catch {
    // ignore
  }

  soluongcapnhat = Math.max(1, soluongcapnhat);
  dongitem.soluong = soluongcapnhat;
  await giohang.save();

  return muonJSON(req)
    ? res.json({ success: true, cartCount: giohang.sanpham.length, quantity: soluongcapnhat, maxStock: tonkho })
    : res.redirect('/cart');
};

module.exports.capNhatTuyChon = async (req, res) => {
  try {
    const iditem = String(req.body.itemId || '').trim();
    const idsanpham = String(req.body.sanpham_id || '').trim();
    const idbienthe = req.body.bienthe_id ? String(req.body.bienthe_id).trim() : null;
    const kichco = req.body.kichco ? String(req.body.kichco).trim() : null;
    const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const giohang = await getOrCreateCart(req.user._id);
    const dongitem = giohang.sanpham.id(iditem);
    if (!dongitem) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm trong giỏ' });

    const idsanphamthuc = idsanpham || String(dongitem.sanpham_id);
    const sanphamdoc = await sanpham.findOne({ _id: idsanphamthuc, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!sanphamdoc) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

    const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);
    if (cosize && !kichco) return res.status(400).json({ success: false, message: 'Vui lòng chọn size' });

    const ketqua = layBienTheVaTon(sanphamdoc, idbienthe, kichco);
    if (ketqua.error) return res.status(400).json({ success: false, message: ketqua.error });
    if (ketqua.stock <= 0) return res.status(400).json({ success: false, message: 'Hết hàng' });

    const soluonghople = Math.min(soluong, ketqua.stock);

    // Gộp dòng
    const dongtrung = giohang.sanpham.find(i => String(i._id) !== String(iditem)
      && String(i.sanpham_id) === String(idsanphamthuc)
      && String(i.bienthe_id || '') === String(ketqua.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    if (dongtrung) {
      dongtrung.soluong = Math.min(ketqua.stock, (dongtrung.soluong || 0) + soluonghople);
      dongitem.remove();
    } else {
      dongitem.sanpham_id = idsanphamthuc;
      dongitem.bienthe_id = ketqua.bienTheObjId;
      dongitem.tensanpham = sanphamdoc.tensanpham;
      dongitem.hinhanh = ketqua.hinhanh;
      dongitem.mausac = ketqua.mausac;
      dongitem.kichco = kichco || null;
      dongitem.gia = ketqua.gia;
      dongitem.giagiam = ketqua.giagiam;
      dongitem.soluong = soluonghople;
    }

    await giohang.save();
    return res.json({ success: true, cartCount: giohang.sanpham.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.xoa = async (req, res) => {
  const iditem = req.body.itemId;

  const giohang = await getOrCreateCart(req.user._id);
  giohang.sanpham = giohang.sanpham.filter(i => String(i._id) !== String(iditem));
  await giohang.save();

  return muonJSON(req) ? res.json({ success: true, cartCount: giohang.sanpham.length }) : res.redirect('/cart');
};

module.exports.xoaHet = async (req, res) => {
  const giohang = await getOrCreateCart(req.user._id);
  giohang.sanpham = [];
  await giohang.save();
  return muonJSON(req) ? res.json({ success: true, cartCount: 0 }) : res.redirect('/cart');
};

module.exports.trangThanhToan = async (req, res) => {
  const giohang = await getOrCreateCart(req.user._id);

  const thamso = req.query.itemIds;
  const danhsachidchon = Array.isArray(thamso) ? thamso.map(String) : (thamso ? [String(thamso)] : []);
  const tapidchon = new Set(danhsachidchon);
  const danhsachitem = danhsachidchon.length
    ? (giohang.sanpham || []).filter(it => tapidchon.has(String(it._id)))
    : (giohang.sanpham || []);

  const tamtinh = danhsachitem.reduce((sum, it) => {
    const gia = it.giagiam || it.gia || 0;
    return sum + (gia * (it.soluong || 1));
  }, 0);

  const defaultRegion = SHIPPING_CONFIG.defaultRegion || 'noithanh';
  const regionConfig = SHIPPING_CONFIG.regions || {};
  const shippingFee = tamtinh >= SHIPPING_CONFIG.freeShipThreshold
    ? 0
    : (regionConfig[defaultRegion]?.fee || 0);
  const finalTotal = Math.max(0, tamtinh + shippingFee);

  const taikhoan = await nguoidung.findOne({ _id: req.user._id, daxoa: { $ne: true } }).lean();
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

  res.render('client/pages/cart/checkout.pug', {
    titlePage: 'Thanh toán',
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
  });
};

async function truTonTheoItem(item) {
  const idsanpham = item.sanpham_id;
  const idbienthe = item.bienthe_id;
  const kichco = item.kichco;
  const soluong = item.soluong || 1;

  const sanphamdoc = await sanpham.findById(idsanpham);
  if (!sanphamdoc) throw new Error('Sản phẩm không tồn tại');

  const tonggoc = (typeof sanphamdoc.soluongton === 'number') ? sanphamdoc.soluongton : tinhTongTon(sanphamdoc);

  const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);

  if (!idbienthe) {
    if (cosize) {
      const dong = (sanphamdoc.sizes || []).find(s => s.size === kichco);
      if (!dong || dong.soluong < soluong) throw new Error('Không đủ hàng');
      dong.soluong -= soluong;
    } else {
      if ((sanphamdoc.soluong_chinh || 0) < soluong) throw new Error('Không đủ hàng');
      sanphamdoc.soluong_chinh = (sanphamdoc.soluong_chinh || 0) - soluong;
    }

    sanphamdoc.soluongton = Math.max(0, tonggoc - soluong);
    await sanphamdoc.save();
    return;
  }

  const bienthe = (sanphamdoc.bienthe || []).id(idbienthe);
  if (!bienthe) throw new Error('Biến thể không tồn tại');

  if (cosize) {
    const dong = (bienthe.sizes || []).find(s => s.size === kichco);
    if (!dong || dong.soluong < soluong) throw new Error('Không đủ hàng');
    dong.soluong -= soluong;
  } else {
    if ((bienthe.soluong || 0) < soluong) throw new Error('Không đủ hàng');
    bienthe.soluong = (bienthe.soluong || 0) - soluong;
  }

  sanphamdoc.soluongton = Math.max(0, tonggoc - soluong);
  await sanphamdoc.save();
}

function normalizeShippingRegion(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (SHIPPING_CONFIG.regions && SHIPPING_CONFIG.regions[key]) return key;
  return SHIPPING_CONFIG.defaultRegion || 'noithanh';
}

function calcShippingFee(subtotal, regionKey) {
  const total = Number(subtotal || 0);
  if (total >= Number(SHIPPING_CONFIG.freeShipThreshold || 0)) return 0;
  return Number(SHIPPING_CONFIG.regions?.[regionKey]?.fee || 0);
}

module.exports.xuLyThanhToan = async (req, res) => {
  try {
    const giohang = await getOrCreateCart(req.user._id);
    if (!giohang.sanpham || giohang.sanpham.length === 0) {
      return res.redirect('/cart');
    }

    const idsraw = req.body.itemIds;
    const danhsachidchon = Array.isArray(idsraw) ? idsraw.map(String) : (idsraw ? [String(idsraw)] : []);
    const tapidchon = new Set(danhsachidchon);
    const danhsachitem = danhsachidchon.length
      ? giohang.sanpham.filter(it => tapidchon.has(String(it._id)))
      : giohang.sanpham;

    if (!danhsachitem.length) {
      req.flash?.('error', 'Vui lòng chọn sản phẩm để thanh toán');
      return res.redirect('/cart');
    }

    const taikhoan = await nguoidung.findOne({ _id: req.user._id, daxoa: { $ne: true } });

    const iddiachi = String(req.body.addressId || '');
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

    // Fallback
    if (!tennguoinhan || !sodienthoai || !diachigiao) {
      tennguoinhan = String(req.body.tennguoinhan || '').trim();
      sodienthoai = String(req.body.sodienthoai || '').trim();
      diachigiao = String(req.body.diachigiao || '').trim();
    }

    if (!tennguoinhan || !sodienthoai || !diachigiao) {
      req.flash?.('error', 'Vui lòng nhập đầy đủ họ tên, số điện thoại, địa chỉ');
      return res.redirect('/cart/checkout');
    }

    const emaillienhe = String(req.body.email || taikhoan?.email || '').trim();
    const ghichu = String(req.body.ghichu || '').trim();
    const phuongthucthanhtoan = String(req.body.phuongthucthanhtoan || 'cod');

    let shouldSaveProfile = false;

    if (taikhoan && !String(taikhoan.diachi || '').trim()) {
      taikhoan.diachi = diachigiao;
      if (!String(taikhoan.hoten || '').trim()) taikhoan.hoten = tennguoinhan;
      if (!String(taikhoan.sodienthoai || '').trim()) taikhoan.sodienthoai = sodienthoai;
      shouldSaveProfile = true;
    }

    // Lưu địa chỉ mới
    if (String(req.body.saveAddress || '') && taikhoan && (iddiachi === 'new' || !iddiachi)) {
      taikhoan.diachiList = taikhoan.diachiList || [];
      taikhoan.diachiList.push({
        label: String(req.body.addressLabel || '').trim() || 'Địa chỉ',
        tennguoinhan: tennguoinhan,
        sodienthoai: sodienthoai,
        diachi: diachigiao
      });
      shouldSaveProfile = true;
    }

    if (shouldSaveProfile) {
      await taikhoan.save();
    }

    const tamtinh = danhsachitem.reduce((sum, it) => {
      const gia = it.giagiam || it.gia || 0;
      return sum + (gia * (it.soluong || 1));
    }, 0);

    const shippingRegion = normalizeShippingRegion(req.body.shippingRegion);
    const phivanchuyen = calcShippingFee(tamtinh, shippingRegion);

    let giamgia = 0;
    let voucherDoc = null;
    let reservedVoucher = false;
    let orderCreated = false;

    const voucherCodeRaw = req.body.voucherCode;
    const voucherCode = normalizeCode(voucherCodeRaw);
    if (voucherCode) {
      const validation = await validateVoucherForOrder({
        code: voucherCode,
        userId: req.user._id,
        orderTotal: tamtinh
      });

      if (!validation.ok) {
        req.flash?.('error', validation.message || 'Voucher không hợp lệ');
        return res.redirect('/cart/checkout');
      }

      voucherDoc = validation.voucher;
      giamgia = Math.min(Number(validation.discount || 0), tamtinh);

      reservedVoucher = await reserveVoucherUsage(voucherDoc._id);
      if (!reservedVoucher) {
        req.flash?.('error', 'Voucher đã hết lượt sử dụng');
        return res.redirect('/cart/checkout');
      }
    }

    const tongtien = Math.max(0, tamtinh - giamgia + phivanchuyen);

    let donhangdoc = null;
    try {
      donhangdoc = await donhang.create({
      nguoidung_id: req.user._id,
      tennguoinhan: tennguoinhan,
      sodienthoai: sodienthoai,
      email: emaillienhe,
      diachigiao: diachigiao,
      ghichu: ghichu,
      phuongthucthanhtoan: phuongthucthanhtoan,
      phuongthucvanchuyen: shippingRegion,
      tamtinh: tamtinh,
      giamgia: giamgia,
      phivanchuyen: phivanchuyen,
      tongtien: tongtien,
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
      if (reservedVoucher && voucherDoc) {
        await releaseVoucherUsage(voucherDoc._id);
      }
      throw error;
    }

    if (voucherDoc) {
      await markVoucherUsed({ voucherId: voucherDoc._id, userId: req.user._id });
    }

    for (const it of danhsachitem) {
      await truTonTheoItem(it);
      await chitietdonhang.create({
        donhang_id: donhangdoc._id,
        sanpham_id: it.sanpham_id,
        bienthe_id: it.bienthe_id,
        tensanpham: it.tensanpham,
        hinhanh: it.hinhanh,
        mausac: it.mausac,
        kichco: it.kichco,
        giagoc: it.gia,
        giaban: it.giagiam || it.gia,
        soluong: it.soluong,
        thanhtien: (it.giagiam || it.gia || 0) * (it.soluong || 1)
      });
    }

    const tapdathanhtoan = new Set(danhsachitem.map(it => String(it._id)));
    giohang.sanpham = giohang.sanpham.filter(it => !tapdathanhtoan.has(String(it._id)));
    await giohang.save();

    if (phuongthucthanhtoan === 'momo') {
      const redirectUrl = String(process.env.MOMO_REDIRECT_URL || `${req.protocol}://${req.get('host')}/cart/momo/return`);
      const ipnUrl = String(process.env.MOMO_IPN_URL || `${req.protocol}://${req.get('host')}/cart/momo/ipn`);
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

      // Lưu lại mã giao dịch để có thể truy vấn trạng thái khi user rời trang QR/quay về bằng nút Back.
      await donhang.updateOne(
        { _id: donhangdoc._id },
        { $set: { momoOrderId: maMoMo, momoRequestId: maMoMo, momoPayUrl: ketqua?.payUrl || undefined, ngaycapnhat: new Date() } }
      );

      try {
        await taoGiaoDichThanhToan({
          donhangId: donhangdoc._id,
          nguoidungId: req.user._id,
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

      if (ketqua && ketqua.payUrl) {
        return res.redirect(ketqua.payUrl);
      }

      req.flash?.('error', ketqua?.message || 'Không thể tạo thanh toán MoMo');
      return res.redirect(`/orders/${donhangdoc._id}`);
    }

    if (phuongthucthanhtoan === 'vnpay') {
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
          nguoidungId: req.user._id,
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

      return res.redirect(payUrl);
    }


    if (phuongthucthanhtoan === 'cod') {
      req.flash?.('success', 'Đặt hàng thành công!');
    }

    return res.redirect(`/orders/${donhangdoc._id}`);
  } catch (e) {
    if (reservedVoucher && voucherDoc && !orderCreated) {
      try {
        await releaseVoucherUsage(voucherDoc._id);
      } catch {
        // ignore
      }
    }
    if (muonJSON(req)) return res.status(500).json({ success: false, message: e.message || 'Có lỗi xảy ra' });
    req.flash?.('error', e.message || 'Có lỗi xảy ra');
    return res.redirect('/cart/checkout');
  }
};

module.exports.momoReturn = async (req, res) => {
  try {
    const orderId = String(req.query.orderId || '').trim();
    const extraData = String(req.query.extraData || '').trim();
    let idDon = '';

    if (extraData) {
      try {
        const json = JSON.parse(Buffer.from(extraData, 'base64').toString('utf8'));
        idDon = json?.orderId ? String(json.orderId) : '';
      } catch {
        idDon = '';
      }
    }

    if (!idDon && orderId) {
      idDon = String(orderId).split('-')[0];
    }

    const resultCode = Number(req.query.resultCode || -1);

    if (idDon) {
      const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();
      const transId = req.query.transId ? String(req.query.transId) : '';
      if (resultCode === 0) {
        await donhang.updateOne(
          { _id: idDon },
          { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), momoTransId: transId || undefined, momoOrderId: orderId || undefined, momoRequestId: (req.query.requestId ? String(req.query.requestId) : orderId) || undefined, ngaycapnhat: new Date() } }
        );

        if (orderDoc) {
          try {
            await danhDauThanhCongTheoDonHang({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'momo',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: orderId || undefined,
              successResponse: req.query,
              ghichu: 'MoMo return: success'
            });
          } catch {
            // best-effort
          }
        }

        req.flash?.('success', 'Thanh toán MoMo thành công!');
      } else {
        // User có thể bấm Back/Quay về trước khi IPN cập nhật; chuyển sang trạng thái chờ xác nhận.
        await donhang.updateOne(
          { _id: idDon },
          { $set: { momoOrderId: orderId || undefined, momoRequestId: (req.query.requestId ? String(req.query.requestId) : orderId) || undefined, ngaycapnhat: new Date() } }
        );

        if (orderDoc) {
          try {
            await capNhatGiaoDichThanhToan({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'momo',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: orderId || undefined,
              trangthai: 'choduyet',
              response: req.query,
              ghichu: `MoMo return: resultCode=${resultCode}`
            });
          } catch {
            // best-effort
          }
        }

        req.flash?.('info', 'Đang chờ xác nhận thanh toán MoMo...');
      }
      return res.redirect(`/orders/${idDon}`);
    }

    req.flash?.('error', 'Không tìm thấy đơn hàng.');
    return res.redirect('/orders');
  } catch (e) {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán MoMo');
    return res.redirect('/orders');
  }
};

module.exports.momoIpn = async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || '').trim();
    const extraData = String(req.body?.extraData || '').trim();
    let idDon = '';

    if (extraData) {
      try {
        const json = JSON.parse(Buffer.from(extraData, 'base64').toString('utf8'));
        idDon = json?.orderId ? String(json.orderId) : '';
      } catch {
        idDon = '';
      }
    }

    if (!idDon && orderId) {
      idDon = String(orderId).split('-')[0];
    }

    const resultCode = Number(req.body?.resultCode || -1);
    const transId = req.body?.transId ? String(req.body.transId) : '';

    if (idDon) {
      if (resultCode === 0) {
        await donhang.updateOne(
          { _id: idDon },
          { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), momoTransId: transId || undefined, momoOrderId: orderId || undefined, momoRequestId: (req.body?.requestId ? String(req.body.requestId) : orderId) || undefined, ngaycapnhat: new Date() } }
        );
      }

      const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();
      if (orderDoc) {
        try {
          if (resultCode === 0) {
            await danhDauThanhCongTheoDonHang({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'momo',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: orderId || undefined,
              successResponse: req.body,
              ghichu: 'MoMo IPN: success'
            });
          } else {
            await capNhatGiaoDichThanhToan({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'momo',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: orderId || undefined,
              trangthai: 'thatbai',
              response: req.body,
              ghichu: `MoMo IPN: resultCode=${resultCode}`
            });
          }
        } catch {
          // best-effort
        }
      }
    }

    return res.json({ success: true });
  } catch (e) {
    return res.status(200).json({ success: false });
  }
};

module.exports.vnpayReturn = async (req, res) => {
  try {
    if (!kiemTraChuKyVnpay(req.query || {})) {
      req.flash?.('error', 'Chữ ký VNPAY không hợp lệ.');
      return res.redirect('/orders');
    }

    const txnRef = String(req.query.vnp_TxnRef || '').trim();
    const responseCode = String(req.query.vnp_ResponseCode || '').trim();
    const transNo = String(req.query.vnp_TransactionNo || '').trim();
    const bankCode = String(req.query.vnp_BankCode || '').trim();

    let idDon = '';
    if (txnRef) {
      const found = await donhang.findOne({ vnpayTxnRef: txnRef }).select('_id').lean();
      idDon = found ? String(found._id) : '';
    }

    if (!idDon && txnRef) {
      idDon = txnRef.split('-')[0];
    }

    if (idDon) {
      const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();
      if (responseCode === '00') {
        await donhang.updateOne(
          { _id: idDon },
          { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), vnpayTransId: transNo || undefined, vnpayBankCode: bankCode || undefined } }
        );

        if (orderDoc) {
          try {
            await danhDauThanhCongTheoDonHang({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'vnpay',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: txnRef || undefined,
              chitiet: { nganhang: bankCode || undefined },
              successResponse: req.query,
              ghichu: 'VNPAY return: success'
            });
          } catch {
            // best-effort
          }
        }

        req.flash?.('success', 'Thanh toán VNPAY thành công!');
      } else {
        if (orderDoc) {
          try {
            await capNhatGiaoDichThanhToan({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'vnpay',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: txnRef || undefined,
              trangthai: 'thatbai',
              chitiet: { nganhang: bankCode || undefined },
              response: req.query,
              ghichu: `VNPAY return: responseCode=${responseCode}`
            });
          } catch {
            // best-effort
          }
        }

        req.flash?.('error', 'Thanh toán VNPAY thất bại hoặc bị hủy.');
      }
      return res.redirect(`/orders/${idDon}`);
    }

    req.flash?.('error', 'Không tìm thấy đơn hàng.');
    return res.redirect('/orders');
  } catch (e) {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán VNPAY');
    return res.redirect('/orders');
  }
};

module.exports.vnpayIpn = async (req, res) => {
  try {
    const payload = Object.keys(req.query || {}).length ? req.query : req.body || {};
    if (!kiemTraChuKyVnpay(payload)) {
      return res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
    }

    const txnRef = String(payload.vnp_TxnRef || '').trim();
    const responseCode = String(payload.vnp_ResponseCode || '').trim();
    const transNo = String(payload.vnp_TransactionNo || '').trim();
    const bankCode = String(payload.vnp_BankCode || '').trim();

    let idDon = '';
    if (txnRef) {
      const found = await donhang.findOne({ vnpayTxnRef: txnRef }).select('_id').lean();
      idDon = found ? String(found._id) : '';
    }

    if (!idDon && txnRef) {
      idDon = txnRef.split('-')[0];
    }

    if (idDon) {
      if (responseCode === '00') {
        await donhang.updateOne(
          { _id: idDon },
          { $set: { dathanhtoan: true, ngaythanhtoan: new Date(), vnpayTransId: transNo || undefined, vnpayBankCode: bankCode || undefined } }
        );
      }

      const orderDoc = await donhang.findById(idDon).select('_id nguoidung_id tongtien tamtinh').lean();
      if (orderDoc) {
        try {
          if (responseCode === '00') {
            await danhDauThanhCongTheoDonHang({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'vnpay',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: txnRef || undefined,
              successResponse: payload,
              ghichu: 'VNPAY IPN: success'
            });
          } else {
            await capNhatGiaoDichThanhToan({
              donhangId: orderDoc._id,
              nguoidungId: orderDoc.nguoidung_id,
              phuongthuc: 'vnpay',
              sotien: Math.max(0, Math.round(orderDoc.tongtien || orderDoc.tamtinh || 0)),
              magiaodich: txnRef || undefined,
              trangthai: 'thatbai',
              chitiet: { nganhang: bankCode || undefined },
              response: payload,
              ghichu: `VNPAY IPN: responseCode=${responseCode}`
            });
          }
        } catch {
          // best-effort
        }
      }
    }

    return res.status(200).json({ RspCode: '00', Message: 'Success' });
  } catch (e) {
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
};

