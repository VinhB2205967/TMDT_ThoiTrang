const sanpham = require('../../models/product_model');
const { getOrCreateCart } = require('../../services/cart.service');
const { laLoaiKhongSize, layBienTheVaTon } = require('../../services/productStock.service');
const { muonJSON } = require('../../helpers/http');
const {
  tinhSoLuongHienThiGio,
  dongBoGiaGioHang
} = require('../../services/cartPricing.service');
const {
  getCheckoutPageData,
  orchestrateCheckout,
  handleMomoReturn,
  handleMomoIpn,
  handleVnpayReturn,
  handleVnpayIpn
} = require('../../services/cartCheckout.service');

// Logic pricing/stock của giỏ hàng đã tách sang services/cartPricing.service.

module.exports.danhSach = async (req, res) => {
  const giohang = await getOrCreateCart(req.user._id);

  const dacapnhat = await dongBoGiaGioHang(giohang, { capNhatTonKho: true });
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
      return res.json({ success: true, cartCount: tinhSoLuongHienThiGio(giohang) });
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
      return res.json({ success: true, cartCount: tinhSoLuongHienThiGio(giohang), redirect: duongdanchuyen });
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

  const soLuongCu = Math.max(1, Number(dongitem.soluong || 1));
  const donGiaCu = Math.max(0, Number(dongitem.giagiam || dongitem.gia || 0));
  const giaTheoLoCu = Array.isArray(dongitem.giaTheoLo) ? dongitem.giaTheoLo : [];
  const giaTheoLoCuJson = JSON.stringify(giaTheoLoCu);
  const coNhieuBacGiaCu = giaTheoLoCu.filter((x) => Number(x?.soLuong || 0) > 0).length > 1;

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

  await dongBoGiaGioHang(giohang, { capNhatTonKho: false });
  await giohang.save();

  const dongSauCapNhat = giohang.sanpham.id(iditem);
  const lineTotal = Number(dongSauCapNhat?.thanhtien || 0);
  const unitPrice = Number(dongSauCapNhat?.giagiam || dongSauCapNhat?.gia || 0);
  const giaTheoLoMoi = Array.isArray(dongSauCapNhat?.giaTheoLo) ? dongSauCapNhat.giaTheoLo : [];
  const giaTheoLoMoiJson = JSON.stringify(giaTheoLoMoi);

  const dangTangSoLuong = soluongcapnhat > soLuongCu;
  const thayDoiDonGia = Math.round(unitPrice) !== Math.round(donGiaCu);
  const thayDoiBacGia = giaTheoLoMoiJson !== giaTheoLoCuJson;
  const coNhieuBacGiaMoi = giaTheoLoMoi.filter((x) => Number(x?.soLuong || 0) > 0).length > 1;

  let notice = '';
  if (dangTangSoLuong && (thayDoiDonGia || thayDoiBacGia)) {
    notice = `Giá theo lô đã thay đổi: ${Math.round(donGiaCu).toLocaleString('vi-VN')}₫ -> ${Math.round(unitPrice).toLocaleString('vi-VN')}₫`;
  } else if (dangTangSoLuong && (coNhieuBacGiaCu || coNhieuBacGiaMoi)) {
    notice = 'Giá có thể thay đổi theo lô khi tăng số lượng.';
  }

  return muonJSON(req)
    ? res.json({
      success: true,
      cartCount: tinhSoLuongHienThiGio(giohang),
      quantity: soluongcapnhat,
      maxStock: tonkho,
      lineTotal,
      unitPrice,
      notice,
      cartTotal: Number(giohang.tongtien || 0)
    })
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

    await dongBoGiaGioHang(giohang, { capNhatTonKho: false });
    await giohang.save();
    return res.json({ success: true, cartCount: tinhSoLuongHienThiGio(giohang) });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.xoa = async (req, res) => {
  const iditem = req.body.itemId;

  const giohang = await getOrCreateCart(req.user._id);
  giohang.sanpham = giohang.sanpham.filter(i => String(i._id) !== String(iditem));
  await giohang.save();

  return muonJSON(req) ? res.json({ success: true, cartCount: tinhSoLuongHienThiGio(giohang) }) : res.redirect('/cart');
};

module.exports.xoaHet = async (req, res) => {
  const giohang = await getOrCreateCart(req.user._id);
  giohang.sanpham = [];
  await giohang.save();
  return muonJSON(req) ? res.json({ success: true, cartCount: 0 }) : res.redirect('/cart');
};

module.exports.trangThanhToan = async (req, res) => {
  try {
    const data = await getCheckoutPageData({
      userId: req.user._id,
      itemIds: req.query.itemIds
    });

    return res.render('client/pages/cart/checkout.pug', {
      titlePage: 'Thanh toán',
      ...data
    });
  } catch {
    req.flash?.('error', 'Không thể tải trang thanh toán. Vui lòng thử lại.');
    return res.redirect('/cart');
  }
};

module.exports.xuLyThanhToan = async (req, res) => {
  try {
    const result = await orchestrateCheckout({
      userId: req.user._id,
      body: req.body || {},
      protocol: req.protocol,
      host: req.get('host'),
      forwardedFor: req.headers['x-forwarded-for'],
      remoteAddress: req.socket?.remoteAddress,
      requestIp: req.ip
    });

    if (result?.message) {
      req.flash?.(result.flashType || 'error', result.message);
    }

    if (result?.ok === false) {
      return res.redirect(result.redirectTo || '/cart/checkout');
    }

    return res.redirect(result?.redirectTo || '/orders');
  } catch (e) {
    if (muonJSON(req)) {
      return res.status(500).json({ success: false, message: e.message || 'Có lỗi xảy ra' });
    }
    req.flash?.('error', e.message || 'Có lỗi xảy ra');
    return res.redirect('/cart/checkout');
  }
};

module.exports.momoReturn = async (req, res) => {
  try {
    const result = await handleMomoReturn(req.query || {});
    if (result?.message) {
      req.flash?.(result.flashType || 'error', result.message);
    }
    return res.redirect(result?.redirectTo || '/orders');
  } catch {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán MoMo');
    return res.redirect('/orders');
  }
};

module.exports.momoIpn = async (req, res) => {
  try {
    const payload = await handleMomoIpn(req.body || {});
    return res.status(200).json(payload || { success: true });
  } catch {
    return res.status(200).json({ success: false });
  }
};

module.exports.vnpayReturn = async (req, res) => {
  try {
    const result = await handleVnpayReturn(req.query || {});
    if (result?.message) {
      req.flash?.(result.flashType || 'error', result.message);
    }
    return res.redirect(result?.redirectTo || '/orders');
  } catch {
    req.flash?.('error', 'Có lỗi khi xử lý thanh toán VNPAY');
    return res.redirect('/orders');
  }
};

module.exports.vnpayIpn = async (req, res) => {
  try {
    const payload = await handleVnpayIpn({
      query: req.query || {},
      body: req.body || {}
    });
    return res.status(200).json(payload || { RspCode: '00', Message: 'Success' });
  } catch {
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
};
