const donhang = require('../../models/order_model');
const chitietdonhang = require('../../models/order_item_model');
const sanpham = require('../../models/product_model');
const { getOrCreateCart, normalizeImage } = require('../../services/cart.service');
const { nhantrangthai, layTrangThaiChoPhep } = require('../../helpers/orderStatus');

function laLoaiKhongSize(loaisanpham) {
  return ['tui', 'phukien'].includes(String(loaisanpham || '').toLowerCase());
}

function tinhTongTon(productdoc) {
  if (!productdoc) return 0;

  const hassize = !laLoaiKhongSize(productdoc.loaisanpham);
  let total = 0;

  if (hassize) {
    (productdoc.sizes || []).forEach(s => { total += (s && s.soluong) ? Number(s.soluong) : 0; });
    (productdoc.bienthe || []).forEach(v => {
      (v.sizes || []).forEach(s => { total += (s && s.soluong) ? Number(s.soluong) : 0; });
    });
    return total;
  }

  total += Number(productdoc.soluong_chinh || 0);
  (productdoc.bienthe || []).forEach(v => { total += Number(v.soluong || 0); });
  return total;
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
  const trangthai = String(req.query.status || 'all');
  const tapchophep = new Set(layTrangThaiChoPhep());
  const trangthaihientai = tapchophep.has(trangthai) ? trangthai : 'all';

  const boloc = { nguoidung_id: req.user._id, daxoa: { $ne: true } };
  if (trangthaihientai !== 'all') boloc.trangthai = trangthaihientai;

  const danhsachdon = await donhang.find(boloc)
    .sort({ ngaytao: -1 })
    .lean();

  // Preview
  if (danhsachdon && danhsachdon.length) {
    const danhsachiddon = danhsachdon.map(o => o._id);
    const danhsachchitiet = await chitietdonhang.find({ donhang_id: { $in: danhsachiddon } })
      .select('donhang_id tensanpham hinhanh')
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
        count: thongtin.count || 1
      };
    }
  }

  res.render('client/pages/orders/index.pug', {
    titlePage: 'Đơn hàng của tôi',
    orders: danhsachdon || [],
    currentStatus: trangthaihientai,
    statusOptions: layTrangThaiChoPhep(),
    statusLabels: nhantrangthai
  });
};

module.exports.chiTiet = async (req, res) => {
  const donhangdoc = await donhang.findOne({ _id: req.params.id, nguoidung_id: req.user._id, daxoa: { $ne: true } }).lean();
  if (!donhangdoc) {
    return res.status(404).render('client/pages/orders/detail.pug', {
      titlePage: 'Không tìm thấy đơn hàng',
      order: null,
      items: [],
      statusLabels: nhantrangthai
    });
  }

  const danhsachitem = await chitietdonhang.find({ donhang_id: donhangdoc._id }).lean();
  const danhsachdaxuly = (danhsachitem || []).map((it) => ({
    ...it,
    hinhanh: normalizeImage(it.hinhanh)
  }));

  return res.render('client/pages/orders/detail.pug', {
    titlePage: `Chi tiết ${donhangdoc.madonhang || 'đơn hàng'}`,
    order: donhangdoc,
    items: danhsachdaxuly,
    statusLabels: nhantrangthai
  });
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
