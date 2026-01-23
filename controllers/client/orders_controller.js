const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');
const { statusLabels, getAllowedStatuses } = require('../../helpers/orderStatus');

function laLoaiKhongSize(loaisanpham) {
  return ['tui', 'phukien'].includes(String(loaisanpham || '').toLowerCase());
}

function tinhTongTon(productDoc) {
  if (!productDoc) return 0;

  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  let total = 0;

  if (hasSize) {
    (productDoc.sizes || []).forEach(s => { total += (s && s.soluong) ? Number(s.soluong) : 0; });
    (productDoc.bienthe || []).forEach(v => {
      (v.sizes || []).forEach(s => { total += (s && s.soluong) ? Number(s.soluong) : 0; });
    });
    return total;
  }

  total += Number(productDoc.soluong_chinh || 0);
  (productDoc.bienthe || []).forEach(v => { total += Number(v.soluong || 0); });
  return total;
}

async function congTonChoChiTietDon(orderItemDoc) {
  const productId = orderItemDoc.sanpham_id;
  const variantId = orderItemDoc.bienthe_id;
  const size = orderItemDoc.kichco;
  const qty = Math.max(1, parseInt(orderItemDoc.soluong, 10) || 1);

  const product = await Sanpham.findById(productId);
  if (!product) throw new Error('Sản phẩm không tồn tại');

  const baseTotal = (typeof product.soluongton === 'number') ? product.soluongton : tinhTongTon(product);
  const hasSize = !laLoaiKhongSize(product.loaisanpham);

  if (!variantId) {
    if (hasSize) {
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

    product.soluongton = baseTotal + qty;
    await product.save();
    return;
  }

  const v = (product.bienthe || []).id(variantId);
  if (!v) throw new Error('Biến thể không tồn tại');

  if (hasSize) {
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

  product.soluongton = baseTotal + qty;
  await product.save();
}

module.exports.danhSach = async (req, res) => {
  const trangThai = String(req.query.status || 'all');
  const tapChoPhep = new Set(getAllowedStatuses());
  const trangThaiHienTai = tapChoPhep.has(trangThai) ? trangThai : 'all';

  const boLoc = { nguoidung_id: req.user._id, daxoa: { $ne: true } };
  if (trangThaiHienTai !== 'all') boLoc.trangthai = trangThaiHienTai;

  const danhSachDon = await Donhang.find(boLoc)
    .sort({ ngaytao: -1 })
    .lean();

  // Preview
  if (danhSachDon && danhSachDon.length) {
    const danhSachIdDon = danhSachDon.map(o => o._id);
    const danhSachChiTiet = await Chitietdonhang.find({ donhang_id: { $in: danhSachIdDon } })
      .select('donhang_id tensanpham hinhanh')
      .sort({ ngaytao: 1 })
      .lean();

    const mapDon = new Map();
    for (const it of (danhSachChiTiet || [])) {
      const key = String(it.donhang_id);
      const tonTai = mapDon.get(key);
      if (!tonTai) {
        mapDon.set(key, { first: it, count: 1 });
      } else {
        tonTai.count += 1;
      }
    }

    for (const don of danhSachDon) {
      const thongTin = mapDon.get(String(don._id));
      if (!thongTin) {
        don.preview = null;
        continue;
      }
      don.preview = {
        name: thongTin.first && thongTin.first.tensanpham ? String(thongTin.first.tensanpham) : 'Sản phẩm',
        image: normalizeImage(thongTin.first && thongTin.first.hinhanh ? String(thongTin.first.hinhanh) : ''),
        count: thongTin.count || 1
      };
    }
  }

  res.render('client/pages/orders/index.pug', {
    titlePage: 'Đơn hàng của tôi',
    orders: danhSachDon || [],
    currentStatus: trangThaiHienTai,
    statusOptions: getAllowedStatuses(),
    statusLabels
  });
};

module.exports.chiTiet = async (req, res) => {
  const donHang = await Donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!donHang) {
    return res.status(404).render('client/pages/orders/detail.pug', {
      titlePage: 'Không tìm thấy đơn hàng',
      order: null,
      items: [],
      statusLabels
    });
  }

  const danhSachItem = await Chitietdonhang.find({ donhang_id: donHang._id }).lean();

  return res.render('client/pages/orders/detail.pug', {
    titlePage: `Chi tiết ${donHang.madonhang || 'đơn hàng'}`,
    order: donHang,
    items: danhSachItem || [],
    statusLabels
  });
};

module.exports.huyDon = async (req, res) => {
  const lyDo = String(req.body.reason || '').trim() || 'Khách hàng hủy đơn';

  // Cập nhật trạng thái
  const donHang = await Donhang.findOneAndUpdate(
    { _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true }, trangthai: 'choxacnhan' },
    { $set: { trangthai: 'dahuy', lydohuy: lyDo, ngaycapnhat: new Date() } },
    { new: true }
  );

  if (!donHang) {
    const tonTai = await Donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } })
      .select('_id trangthai')
      .lean();

    if (!tonTai) {
      req.flash?.('error', 'Không tìm thấy đơn hàng.');
      return res.redirect('/orders');
    }

    req.flash?.('error', 'Đơn hàng này không thể hủy ở trạng thái hiện tại.');
    return res.redirect(`/orders/${tonTai._id}`);
  }

  const danhSachItem = await Chitietdonhang.find({ donhang_id: donHang._id });
  const danhSachLoi = [];

  for (const it of (danhSachItem || [])) {
    try {
      await congTonChoChiTietDon(it);
    } catch (e) {
      danhSachLoi.push(e?.message || 'Có lỗi khi hoàn tồn kho');
    }
  }

  if (danhSachLoi.length) {
    req.flash?.('error', 'Đã hủy đơn, nhưng có lỗi khi hoàn tồn kho cho một số sản phẩm. Vui lòng liên hệ shop.');
    return res.redirect(`/orders/${donHang._id}`);
  }

  req.flash?.('success', 'Đã hủy đơn hàng và hoàn lại số lượng sản phẩm.');
  return res.redirect('/orders');
};

module.exports.muaLai = async (req, res) => {
  const donHang = await Donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!donHang) {
    req.flash('success', 'Không tìm thấy đơn hàng.');
    return res.redirect('/orders');
  }

  const danhSachItem = await Chitietdonhang.find({ donhang_id: donHang._id }).lean();
  if (!danhSachItem || !danhSachItem.length) {
    req.flash('success', 'Đơn hàng không có sản phẩm để mua lại.');
    return res.redirect('/orders');
  }

  const gioHang = await getOrCreateCart(req.user._id);

  let soDaThem = 0;
  let soBoQua = 0;

  for (const it of danhSachItem) {
    const sanPham = await Sanpham.findOne({ _id: it.sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' }).lean();
    if (!sanPham) {
      soBoQua += 1;
      continue;
    }

    const bientheId = it.bienthe_id ? String(it.bienthe_id) : '';
    const sizeVal = it.kichco ? String(it.kichco) : '';

    const tonTai = (gioHang.sanpham || []).find(ci => String(ci.sanpham_id) === String(it.sanpham_id)
      && String(ci.bienthe_id || '') === bientheId
      && String(ci.kichco || '') === sizeVal);

    const qty = Math.max(1, parseInt(it.soluong, 10) || 1);

    if (tonTai) {
      tonTai.soluong = (tonTai.soluong || 0) + qty;
    } else {
      gioHang.sanpham.push({
        sanpham_id: it.sanpham_id,
        bienthe_id: it.bienthe_id || null,
        tensanpham: it.tensanpham || sanPham.tensanpham,
        hinhanh: normalizeImage(it.hinhanh) || normalizeImage(sanPham.hinhanh),
        mausac: it.mausac || sanPham.mausac_chinh || 'Mặc định',
        kichco: it.kichco || null,
        gia: it.giagoc || it.giaban || sanPham.gia || 0,
        giagiam: it.giaban || it.giagoc || sanPham.gia || 0,
        soluong: qty
      });
    }

    soDaThem += 1;
  }

  await gioHang.save();
  req.flash('success', `Đã thêm ${soDaThem} sản phẩm vào giỏ hàng${soBoQua ? ` (bỏ qua ${soBoQua} sản phẩm đã ngừng bán)` : ''}.`);
  return res.redirect('/cart');
};
