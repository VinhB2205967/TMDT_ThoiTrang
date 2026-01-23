const Sanpham = require('../../models/product_model');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Nguoidung = require('../../models/user_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');

function muonJSON(req) {
  const chapNhan = String(req.headers.accept || '');
  return req.xhr || chapNhan.includes('application/json') || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
}

function laLoaiKhongSize(loaisanpham) {
  return ['tui', 'phukien'].includes(String(loaisanpham || '').toLowerCase());
}

function tinhTongTon(productDoc) {
  if (!productDoc) return 0;

  const coSize = !laLoaiKhongSize(productDoc.loaisanpham);
  let tong = 0;

  if (coSize) {
    (productDoc.sizes || []).forEach(s => { tong += (s && s.soluong) ? Number(s.soluong) : 0; });
    (productDoc.bienthe || []).forEach(v => {
      (v.sizes || []).forEach(s => { tong += (s && s.soluong) ? Number(s.soluong) : 0; });
    });
    return tong;
  }

  tong += Number(productDoc.soluong_chinh || 0);
  (productDoc.bienthe || []).forEach(v => { tong += Number(v.soluong || 0); });
  return tong;
}

// Dùng chung service

function layBienTheVaTon(productDoc, bientheId, kichco) {
  const coSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const laChinh = !bientheId || bientheId === 'main';

  if (laChinh) {
    const mausac = productDoc.mausac_chinh || 'Mặc định';
    const hinhanh = normalizeImage(productDoc.hinhanh);
    const gia = productDoc.gia || 0;
    const giamGia = productDoc.phantramgiamgia || 0;
    const giagiam = giamGia > 0 ? Math.round(gia * (100 - giamGia) / 100) : gia;

    if (coSize) {
      const sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const dongSize = sizes.find(s => s.size === kichco);
      const tonKho = dongSize ? (dongSize.soluong || 0) : 0;
      return { hasSize: coSize, stock: tonKho, bienTheObjId: null, mausac, hinhanh, gia, giagiam };
    }

    const tonKho = productDoc.soluong_chinh || 0;
    return { hasSize: coSize, stock: tonKho, bienTheObjId: null, mausac, hinhanh, gia, giagiam };
  }

  const bienThe = (productDoc.bienthe || []).find(v => String(v._id) === String(bientheId));
  if (!bienThe) return { error: 'Biến thể không tồn tại' };

  const mausac = bienThe.mausac || 'Màu';
  const hinhanh = normalizeImage(bienThe.hinhanh) || normalizeImage(productDoc.hinhanh);
  const gia = bienThe.gia || productDoc.gia || 0;
  const giamGia = bienThe.phantramgiamgia != null ? bienThe.phantramgiamgia : (productDoc.phantramgiamgia || 0);
  const giagiam = giamGia > 0 ? Math.round(gia * (100 - giamGia) / 100) : gia;

  if (coSize) {
    const sizes = Array.isArray(bienThe.sizes) ? bienThe.sizes : [];
    const dongSize = sizes.find(s => s.size === kichco);
    const tonKho = dongSize ? (dongSize.soluong || 0) : 0;
    return { hasSize: coSize, stock: tonKho, bienTheObjId: bienThe._id, mausac, hinhanh, gia, giagiam };
  }

  const tonKho = bienThe.soluong || 0;
  return { hasSize: coSize, stock: tonKho, bienTheObjId: bienThe._id, mausac, hinhanh, gia, giagiam };
}

module.exports.danhSach = async (req, res) => {
  const gioHang = await getOrCreateCart(req.user._id);
  res.render('client/pages/cart/index.pug', {
    titlePage: 'Giỏ hàng',
    cart: gioHang
  });
};

module.exports.them = async (req, res) => {
  try {
    const { sanpham_id, bienthe_id, kichco } = req.body;
    const soLuong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const sanPham = await Sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!sanPham) {
      return muonJSON(req) ? res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' }) : res.redirect('/products');
    }

    const coSize = !laLoaiKhongSize(sanPham.loaisanpham);
    if (coSize && !kichco) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Vui lòng chọn size' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const ketQua = layBienTheVaTon(sanPham, bienthe_id, kichco);
    if (ketQua.error) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: ketQua.error }) : res.redirect(`/products/${sanpham_id}`);
    }

    if (ketQua.stock <= 0) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Hết hàng' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const soLuongThem = Math.min(soLuong, ketQua.stock);

    const gioHang = await getOrCreateCart(req.user._id);
    const tonTai = gioHang.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
      && String(i.bienthe_id || '') === String(ketQua.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    if (tonTai) {
      tonTai.soluong = Math.min(ketQua.stock, (tonTai.soluong || 0) + soLuongThem);
    } else {
      gioHang.sanpham.push({
        sanpham_id,
        bienthe_id: ketQua.bienTheObjId,
        tensanpham: sanPham.tensanpham,
        hinhanh: ketQua.hinhanh,
        mausac: ketQua.mausac,
        kichco: kichco || null,
        gia: ketQua.gia,
        giagiam: ketQua.giagiam,
        soluong: soLuongThem
      });
    }

    await gioHang.save();

    if (muonJSON(req)) {
      return res.json({ success: true, cartCount: gioHang.sanpham.length });
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
    const soLuong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const sanPham = await Sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!sanPham) {
      return muonJSON(req) ? res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' }) : res.redirect('/products');
    }

    const coSize = !laLoaiKhongSize(sanPham.loaisanpham);
    if (coSize && !kichco) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Vui lòng chọn size' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const ketQua = layBienTheVaTon(sanPham, bienthe_id, kichco);
    if (ketQua.error) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: ketQua.error }) : res.redirect(`/products/${sanpham_id}`);
    }

    if (ketQua.stock <= 0) {
      return muonJSON(req) ? res.status(400).json({ success: false, message: 'Hết hàng' }) : res.redirect(`/products/${sanpham_id}`);
    }

    const soLuongThem = Math.min(soLuong, ketQua.stock);
    const gioHang = await getOrCreateCart(req.user._id);

    const tonTai = gioHang.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
      && String(i.bienthe_id || '') === String(ketQua.bienTheObjId || '')
      && String(i.kichco || '') === String(kichco || ''));

    let idItemDich;
    if (tonTai) {
      tonTai.soluong = soLuongThem;
      idItemDich = tonTai._id;
    } else {
      gioHang.sanpham.push({
        sanpham_id,
        bienthe_id: ketQua.bienTheObjId,
        tensanpham: sanPham.tensanpham,
        hinhanh: ketQua.hinhanh,
        mausac: ketQua.mausac,
        kichco: kichco || null,
        gia: ketQua.gia,
        giagiam: ketQua.giagiam,
        soluong: soLuongThem
      });
      idItemDich = gioHang.sanpham[gioHang.sanpham.length - 1]._id;
    }

    await gioHang.save();

    const duongDanChuyen = idItemDich ? `/cart/checkout?itemIds=${idItemDich}` : '/cart/checkout';

    if (muonJSON(req)) {
      return res.json({ success: true, cartCount: gioHang.sanpham.length, redirect: duongDanChuyen });
    }

    return res.redirect(duongDanChuyen);
  } catch (e) {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
    return res.redirect('/cart');
  }
};

module.exports.capNhatSoLuong = async (req, res) => {
  const idItem = req.body.itemId;
  const soLuong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

  const gioHang = await getOrCreateCart(req.user._id);
  const dongItem = gioHang.sanpham.id(idItem);
  if (dongItem) dongItem.soluong = soLuong;
  await gioHang.save();

  return muonJSON(req) ? res.json({ success: true, cartCount: gioHang.sanpham.length }) : res.redirect('/cart');
};

module.exports.capNhatTuyChon = async (req, res) => {
  try {
    const idItem = String(req.body.itemId || '').trim();
    const idSanPham = String(req.body.sanpham_id || '').trim();
    const idBienThe = req.body.bienthe_id ? String(req.body.bienthe_id).trim() : null;
    const kichCo = req.body.kichco ? String(req.body.kichco).trim() : null;
    const soLuong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

    const gioHang = await getOrCreateCart(req.user._id);
    const dongItem = gioHang.sanpham.id(idItem);
    if (!dongItem) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm trong giỏ' });

    const idSanPhamThuc = idSanPham || String(dongItem.sanpham_id);
    const sanPham = await Sanpham.findOne({ _id: idSanPhamThuc, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (!sanPham) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });

    const coSize = !laLoaiKhongSize(sanPham.loaisanpham);
    if (coSize && !kichCo) return res.status(400).json({ success: false, message: 'Vui lòng chọn size' });

    const ketQua = layBienTheVaTon(sanPham, idBienThe, kichCo);
    if (ketQua.error) return res.status(400).json({ success: false, message: ketQua.error });
    if (ketQua.stock <= 0) return res.status(400).json({ success: false, message: 'Hết hàng' });

    const soLuongHopLe = Math.min(soLuong, ketQua.stock);

    // Gộp dòng
    const dongTrung = gioHang.sanpham.find(i => String(i._id) !== String(idItem)
      && String(i.sanpham_id) === String(idSanPhamThuc)
      && String(i.bienthe_id || '') === String(ketQua.bienTheObjId || '')
      && String(i.kichco || '') === String(kichCo || ''));

    if (dongTrung) {
      dongTrung.soluong = Math.min(ketQua.stock, (dongTrung.soluong || 0) + soLuongHopLe);
      dongItem.remove();
    } else {
      dongItem.sanpham_id = idSanPhamThuc;
      dongItem.bienthe_id = ketQua.bienTheObjId;
      dongItem.tensanpham = sanPham.tensanpham;
      dongItem.hinhanh = ketQua.hinhanh;
      dongItem.mausac = ketQua.mausac;
      dongItem.kichco = kichCo || null;
      dongItem.gia = ketQua.gia;
      dongItem.giagiam = ketQua.giagiam;
      dongItem.soluong = soLuongHopLe;
    }

    await gioHang.save();
    return res.json({ success: true, cartCount: gioHang.sanpham.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
};

module.exports.xoa = async (req, res) => {
  const idItem = req.body.itemId;

  const gioHang = await getOrCreateCart(req.user._id);
  gioHang.sanpham = gioHang.sanpham.filter(i => String(i._id) !== String(idItem));
  await gioHang.save();

  return muonJSON(req) ? res.json({ success: true, cartCount: gioHang.sanpham.length }) : res.redirect('/cart');
};

module.exports.xoaHet = async (req, res) => {
  const gioHang = await getOrCreateCart(req.user._id);
  gioHang.sanpham = [];
  await gioHang.save();
  return muonJSON(req) ? res.json({ success: true, cartCount: 0 }) : res.redirect('/cart');
};

module.exports.trangThanhToan = async (req, res) => {
  const gioHang = await getOrCreateCart(req.user._id);

  const thamSo = req.query.itemIds;
  const danhSachIdChon = Array.isArray(thamSo) ? thamSo.map(String) : (thamSo ? [String(thamSo)] : []);
  const tapIdChon = new Set(danhSachIdChon);
  const danhSachItem = danhSachIdChon.length
    ? (gioHang.sanpham || []).filter(it => tapIdChon.has(String(it._id)))
    : (gioHang.sanpham || []);

  const tamTinh = danhSachItem.reduce((sum, it) => {
    const gia = it.giagiam || it.gia || 0;
    return sum + (gia * (it.soluong || 1));
  }, 0);

  const nguoiDung = await Nguoidung.findOne({ _id: req.user._id, daxoa: { $ne: true } }).lean();
  const danhSachDiaChi = Array.isArray(nguoiDung?.diachiList) ? nguoiDung.diachiList : [];
  const danhSachDiaChiHienThi = [];
  if (nguoiDung?.diachi) {
    danhSachDiaChiHienThi.push({
      _id: 'profile',
      label: 'Địa chỉ mặc định',
      tennguoinhan: nguoiDung?.hoten || '',
      sodienthoai: nguoiDung?.sodienthoai || '',
      diachi: nguoiDung?.diachi || ''
    });
  }
  danhSachDiaChi.forEach((diaChi) => {
    danhSachDiaChiHienThi.push({
      _id: String(diaChi._id),
      label: diaChi.label || 'Địa chỉ',
      tennguoinhan: diaChi.tennguoinhan || nguoiDung?.hoten || '',
      sodienthoai: diaChi.sodienthoai || nguoiDung?.sodienthoai || '',
      diachi: diaChi.diachi || ''
    });
  });

  res.render('client/pages/cart/checkout.pug', {
    titlePage: 'Thanh toán',
    cart: gioHang,
    items: danhSachItem,
    subtotal: tamTinh,
    selectedIds: danhSachItem.map(it => String(it._id)),
    userProfile: {
      hoten: nguoiDung?.hoten || '',
      sodienthoai: nguoiDung?.sodienthoai || '',
      email: nguoiDung?.email || '',
      diachi: nguoiDung?.diachi || ''
    },
    addresses: danhSachDiaChiHienThi
  });
};

async function truTonTheoItem(item) {
  const idSanPham = item.sanpham_id;
  const idBienThe = item.bienthe_id;
  const kichCo = item.kichco;
  const soLuong = item.soluong || 1;

  const sanPham = await Sanpham.findById(idSanPham);
  if (!sanPham) throw new Error('Sản phẩm không tồn tại');

  const tongGoc = (typeof sanPham.soluongton === 'number') ? sanPham.soluongton : tinhTongTon(sanPham);

  const coSize = !laLoaiKhongSize(sanPham.loaisanpham);

  if (!idBienThe) {
    if (coSize) {
      const dong = (sanPham.sizes || []).find(s => s.size === kichCo);
      if (!dong || dong.soluong < soLuong) throw new Error('Không đủ hàng');
      dong.soluong -= soLuong;
    } else {
      if ((sanPham.soluong_chinh || 0) < soLuong) throw new Error('Không đủ hàng');
      sanPham.soluong_chinh = (sanPham.soluong_chinh || 0) - soLuong;
    }

    sanPham.soluongton = Math.max(0, tongGoc - soLuong);
    await sanPham.save();
    return;
  }

  const bienThe = (sanPham.bienthe || []).id(idBienThe);
  if (!bienThe) throw new Error('Biến thể không tồn tại');

  if (coSize) {
    const dong = (bienThe.sizes || []).find(s => s.size === kichCo);
    if (!dong || dong.soluong < soLuong) throw new Error('Không đủ hàng');
    dong.soluong -= soLuong;
  } else {
    if ((bienThe.soluong || 0) < soLuong) throw new Error('Không đủ hàng');
    bienThe.soluong = (bienThe.soluong || 0) - soLuong;
  }

  sanPham.soluongton = Math.max(0, tongGoc - soLuong);
  await sanPham.save();
}

module.exports.xuLyThanhToan = async (req, res) => {
  try {
    const gioHang = await getOrCreateCart(req.user._id);
    if (!gioHang.sanpham || gioHang.sanpham.length === 0) {
      return res.redirect('/cart');
    }

    const idsRaw = req.body.itemIds;
    const danhSachIdChon = Array.isArray(idsRaw) ? idsRaw.map(String) : (idsRaw ? [String(idsRaw)] : []);
    const tapIdChon = new Set(danhSachIdChon);
    const danhSachItem = danhSachIdChon.length
      ? gioHang.sanpham.filter(it => tapIdChon.has(String(it._id)))
      : gioHang.sanpham;

    if (!danhSachItem.length) {
      req.flash?.('error', 'Vui lòng chọn sản phẩm để thanh toán');
      return res.redirect('/cart');
    }

    const nguoiDung = await Nguoidung.findOne({ _id: req.user._id, daxoa: { $ne: true } });

    const idDiaChi = String(req.body.addressId || '');
    let tenNguoiNhan = '';
    let soDienThoai = '';
    let diaChiGiao = '';

    if (idDiaChi && idDiaChi !== 'new') {
      if (idDiaChi === 'profile') {
        tenNguoiNhan = String(nguoiDung?.hoten || '').trim();
        soDienThoai = String(nguoiDung?.sodienthoai || '').trim();
        diaChiGiao = String(nguoiDung?.diachi || '').trim();
      } else {
        const diaChiTimThay = (nguoiDung?.diachiList || []).find(a => String(a._id) === idDiaChi);
        if (diaChiTimThay) {
          tenNguoiNhan = String(diaChiTimThay.tennguoinhan || nguoiDung?.hoten || '').trim();
          soDienThoai = String(diaChiTimThay.sodienthoai || nguoiDung?.sodienthoai || '').trim();
          diaChiGiao = String(diaChiTimThay.diachi || '').trim();
        }
      }
    }

    // Fallback
    if (!tenNguoiNhan || !soDienThoai || !diaChiGiao) {
      tenNguoiNhan = String(req.body.tennguoinhan || '').trim();
      soDienThoai = String(req.body.sodienthoai || '').trim();
      diaChiGiao = String(req.body.diachigiao || '').trim();
    }

    if (!tenNguoiNhan || !soDienThoai || !diaChiGiao) {
      req.flash?.('error', 'Vui lòng nhập đầy đủ họ tên, số điện thoại, địa chỉ');
      return res.redirect('/cart/checkout');
    }

    const emailLienHe = String(req.body.email || nguoiDung?.email || '').trim();
    const ghiChu = String(req.body.ghichu || '').trim();
    const phuongThucThanhToan = String(req.body.phuongthucthanhtoan || 'cod');

    // Lưu địa chỉ mới
    if (String(req.body.saveAddress || '') && nguoiDung && (idDiaChi === 'new' || !idDiaChi)) {
      nguoiDung.diachiList = nguoiDung.diachiList || [];
      nguoiDung.diachiList.push({
        label: String(req.body.addressLabel || '').trim() || 'Địa chỉ',
        tennguoinhan: tenNguoiNhan,
        sodienthoai: soDienThoai,
        diachi: diaChiGiao
      });
      await nguoiDung.save();
    }

    const tamTinh = danhSachItem.reduce((sum, it) => {
      const gia = it.giagiam || it.gia || 0;
      return sum + (gia * (it.soluong || 1));
    }, 0);

    const donHang = await Donhang.create({
      nguoidung_id: req.user._id,
      tennguoinhan: tenNguoiNhan,
      sodienthoai: soDienThoai,
      email: emailLienHe,
      diachigiao: diaChiGiao,
      ghichu: ghiChu,
      phuongthucthanhtoan: phuongThucThanhToan,
      tamtinh: tamTinh,
      tongtien: tamTinh,
      trangthai: 'choxacnhan'
    });

    for (const it of danhSachItem) {
      await truTonTheoItem(it);
      await Chitietdonhang.create({
        donhang_id: donHang._id,
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

    const tapDaThanhToan = new Set(danhSachItem.map(it => String(it._id)));
    gioHang.sanpham = gioHang.sanpham.filter(it => !tapDaThanhToan.has(String(it._id)));
    await gioHang.save();

    if (phuongThucThanhToan === 'cod') {
      req.flash?.('success', 'Đặt hàng thành công!');
    }

    return res.redirect(`/orders/${donHang._id}`);
  } catch (e) {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: e.message || 'Có lỗi xảy ra' });
    req.flash?.('error', e.message || 'Có lỗi xảy ra');
    return res.redirect('/cart/checkout');
  }
};
