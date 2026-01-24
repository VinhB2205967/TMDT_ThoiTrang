const sanpham = require('../../models/product_model');
const donhang = require('../../models/order_model');
const chitietdonhang = require('../../models/order_item_model');
const nguoidung = require('../../models/user_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');

function muonJSON(req) {
  const chapnhan = String(req.headers.accept || '');
  return req.xhr || chapnhan.includes('application/json') || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
}

function laLoaiKhongSize(loaisanpham) {
  return ['tui', 'phukien'].includes(String(loaisanpham || '').toLowerCase());
}

function tinhTongTon(productdoc) {
  if (!productdoc) return 0;

  const cosize = !laLoaiKhongSize(productdoc.loaisanpham);
  let tong = 0;

  if (cosize) {
    (productdoc.sizes || []).forEach(s => { tong += (s && s.soluong) ? Number(s.soluong) : 0; });
    (productdoc.bienthe || []).forEach(v => {
      (v.sizes || []).forEach(s => { tong += (s && s.soluong) ? Number(s.soluong) : 0; });
    });
    return tong;
  }

  tong += Number(productdoc.soluong_chinh || 0);
  (productdoc.bienthe || []).forEach(v => { tong += Number(v.soluong || 0); });
  return tong;
}

// Dùng chung service

function layBienTheVaTon(productdoc, bientheid, kichco) {
  const cosize = !laLoaiKhongSize(productdoc.loaisanpham);
  const lachinh = !bientheid || bientheid === 'main';

  if (lachinh) {
    const mausac = productdoc.mausac_chinh || 'Mặc định';
    const hinhanh = normalizeImage(productdoc.hinhanh);
    const gia = productdoc.gia || 0;
    const giamgia = productdoc.phantramgiamgia || 0;
    const giagiam = giamgia > 0 ? Math.round(gia * (100 - giamgia) / 100) : gia;

    if (cosize) {
      const sizes = Array.isArray(productdoc.sizes) ? productdoc.sizes : [];
      const dongsize = sizes.find(s => s.size === kichco);
      const tonkho = dongsize ? (dongsize.soluong || 0) : 0;
      return { hasSize: cosize, stock: tonkho, bienTheObjId: null, mausac, hinhanh, gia, giagiam };
    }

    const tonkho = productdoc.soluong_chinh || 0;
    return { hasSize: cosize, stock: tonkho, bienTheObjId: null, mausac, hinhanh, gia, giagiam };
  }

  const bienthe = (productdoc.bienthe || []).find(v => String(v._id) === String(bientheid));
  if (!bienthe) return { error: 'Biến thể không tồn tại' };

  const mausac = bienthe.mausac || 'Màu';
  const hinhanh = normalizeImage(bienthe.hinhanh) || normalizeImage(productdoc.hinhanh);
  const gia = bienthe.gia || productdoc.gia || 0;
  const giamgia = bienthe.phantramgiamgia != null ? bienthe.phantramgiamgia : (productdoc.phantramgiamgia || 0);
  const giagiam = giamgia > 0 ? Math.round(gia * (100 - giamgia) / 100) : gia;

  if (cosize) {
    const sizes = Array.isArray(bienthe.sizes) ? bienthe.sizes : [];
    const dongsize = sizes.find(s => s.size === kichco);
    const tonkho = dongsize ? (dongsize.soluong || 0) : 0;
    return { hasSize: cosize, stock: tonkho, bienTheObjId: bienthe._id, mausac, hinhanh, gia, giagiam };
  }

  const tonkho = bienthe.soluong || 0;
  return { hasSize: cosize, stock: tonkho, bienTheObjId: bienthe._id, mausac, hinhanh, gia, giagiam };
}

module.exports.danhSach = async (req, res) => {
  const giohang = await getOrCreateCart(req.user._id);
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
  const iditem = req.body.itemId;
  const soluong = Math.max(1, parseInt(req.body.soluong, 10) || 1);

  const giohang = await getOrCreateCart(req.user._id);
  const dongitem = giohang.sanpham.id(iditem);
  if (dongitem) dongitem.soluong = soluong;
  await giohang.save();

  return muonJSON(req) ? res.json({ success: true, cartCount: giohang.sanpham.length }) : res.redirect('/cart');
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

    // Lưu địa chỉ mới
    if (String(req.body.saveAddress || '') && taikhoan && (iddiachi === 'new' || !iddiachi)) {
      taikhoan.diachiList = taikhoan.diachiList || [];
      taikhoan.diachiList.push({
        label: String(req.body.addressLabel || '').trim() || 'Địa chỉ',
        tennguoinhan: tennguoinhan,
        sodienthoai: sodienthoai,
        diachi: diachigiao
      });
      await taikhoan.save();
    }

    const tamtinh = danhsachitem.reduce((sum, it) => {
      const gia = it.giagiam || it.gia || 0;
      return sum + (gia * (it.soluong || 1));
    }, 0);

    const donhangdoc = await donhang.create({
      nguoidung_id: req.user._id,
      tennguoinhan: tennguoinhan,
      sodienthoai: sodienthoai,
      email: emaillienhe,
      diachigiao: diachigiao,
      ghichu: ghichu,
      phuongthucthanhtoan: phuongthucthanhtoan,
      tamtinh: tamtinh,
      tongtien: tamtinh,
      trangthai: 'choxacnhan'
    });

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

    if (phuongthucthanhtoan === 'cod') {
      req.flash?.('success', 'Đặt hàng thành công!');
    }

    return res.redirect(`/orders/${donhangdoc._id}`);
  } catch (e) {
    if (muonJSON(req)) return res.status(500).json({ success: false, message: e.message || 'Có lỗi xảy ra' });
    req.flash?.('error', e.message || 'Có lỗi xảy ra');
    return res.redirect('/cart/checkout');
  }
};
