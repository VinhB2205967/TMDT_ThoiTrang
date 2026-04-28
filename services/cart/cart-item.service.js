const sanpham = require('../../models/product_model');
const {
  getOrCreateCart,
  tinhSoLuongHienThiGio,
  tinhTongTienGio,
  dongBoGiaGioHang
} = require('../cart.service');
const { laLoaiKhongSize, layBienTheVaTon } = require('../catalog/productStock.service.js');
const { fixMojibakeText } = require('../../helpers/textEncoding');

function chuanHoaChuoiHienThiGio(item = {}) {
  if (!item || typeof item !== 'object') return item;
  item.tensanpham = fixMojibakeText(item.tensanpham || '');
  item.mausac = fixMojibakeText(item.mausac || '');
  item.kichco = fixMojibakeText(item.kichco || '');
  return item;
}

function chuanHoaToanBoDongGio(giohang) {
  if (!giohang || !Array.isArray(giohang.sanpham)) return;
  giohang.sanpham.forEach((item) => chuanHoaChuoiHienThiGio(item));
}
// Định dạng số tiền sang VND
function dinhDangTienVND(value) {
  const n = Math.max(0, Math.round(Number(value || 0)));
  return `${n.toLocaleString('vi-VN')}đ`;
}

function taoCanhBaoGiaFifoKhiTangSoLuong({
  soLuongCu,
  soLuongMoi,
  donGiaCu,
  donGiaMoi
}) {
  if (!(Number(soLuongMoi) > Number(soLuongCu))) return '';

  const cu = Math.round(Number(donGiaCu || 0));
  const moi = Math.round(Number(donGiaMoi || 0));
  if (!(cu > 0) || !(moi > 0) || cu === moi) return '';

  return `Giá sản phẩm có thể thay đổi khi thay đổi số lượng`;
}
// Đồng bộ giá và tồn kho của giỏ hàng, trả về true nếu có cập nhật
async function getCartPageData({ userId }) {
  const giohang = await getOrCreateCart(userId);
  const giaTruocKhiDongBo = new Map(
    (giohang.sanpham || []).map((item) => [
      String(item._id),
      {
        gia: Number(item.gia || 0),
        giagiam: Number(item.giagiam || item.gia || 0)
      }
    ])
  );
  const tongTruocKhiDongBo = tinhTongTienGio(giohang);

  const dacapnhat = await dongBoGiaGioHang(giohang, { capNhatTonKho: true });
  if (dacapnhat) await giohang.save();

  const tongSauKhiDongBo = tinhTongTienGio(giohang);
  const daThayDoiTong = Math.round(tongTruocKhiDongBo) !== Math.round(tongSauKhiDongBo);
  const daDoiGiaSanPham = (giohang.sanpham || []).some((item) => {
    const cu = giaTruocKhiDongBo.get(String(item._id));
    if (!cu) return false;
    const giaMoi = Number(item.gia || 0);
    const giaGiamMoi = Number(item.giagiam || item.gia || 0);
    return cu.gia !== giaMoi || cu.giagiam !== giaGiamMoi;
  });

  const fifoPriceNotice = (dacapnhat && daDoiGiaSanPham)
    ? (
      daThayDoiTong
        ? `Giá theo lô đã thay đổi: ${Math.round(tongTruocKhiDongBo).toLocaleString('vi-VN')}đ -> ${Math.round(tongSauKhiDongBo).toLocaleString('vi-VN')}đ`
        : 'Giá theo lô của một số sản phẩm đã được cập nhật.'
    )
    : '';

  chuanHoaToanBoDongGio(giohang);

  return { cart: giohang, fifoPriceNotice };
}
// Thêm sản phẩm vào giỏ hàng
async function addToCart({ userId, body }) {
  const { sanpham_id, bienthe_id, kichco } = body;
  const soluong = Math.max(1, parseInt(body.soluong, 10) || 1);

  const sanphamdoc = await sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
  if (!sanphamdoc) return { ok: false, status: 404, message: 'Sản phẩm không tồn tại', redirect: '/products' };

  const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);
  if (cosize && !kichco) return { ok: false, status: 400, message: 'Vui lòng chọn size', redirect: `/products/${sanpham_id}` };

  const ketqua = layBienTheVaTon(sanphamdoc, bienthe_id, kichco);
  if (ketqua.error) return { ok: false, status: 400, message: ketqua.error, redirect: `/products/${sanpham_id}` };
  if (ketqua.stock <= 0) return { ok: false, status: 400, message: 'Hết hàng', redirect: `/products/${sanpham_id}` };

  const soluongthem = Math.min(soluong, ketqua.stock);
  const giohang = await getOrCreateCart(userId);
  const tontai = giohang.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
    && String(i.bienthe_id || '') === String(ketqua.bienTheObjId || '')
    && String(i.kichco || '') === String(kichco || ''));

  if (tontai) {
    tontai.soluong = Math.min(ketqua.stock, (tontai.soluong || 0) + soluongthem);
    chuanHoaChuoiHienThiGio(tontai);
  } else {
    giohang.sanpham.push({
      sanpham_id,
      bienthe_id: ketqua.bienTheObjId,
      tensanpham: fixMojibakeText(sanphamdoc.tensanpham),
      hinhanh: ketqua.hinhanh,
      mausac: fixMojibakeText(ketqua.mausac),
      kichco: fixMojibakeText(kichco || null),
      gia: ketqua.gia,
      giagiam: ketqua.giagiam,
      soluong: soluongthem
    });
  }

  await giohang.save();
  return { ok: true, cartCount: tinhSoLuongHienThiGio(giohang), redirect: '/cart' };
}
// Mua ngay từ trang sản phẩm
async function buyNowFromProduct({ userId, body }) {
  const { sanpham_id, bienthe_id, kichco } = body;
  const soluong = Math.max(1, parseInt(body.soluong, 10) || 1);

  const sanphamdoc = await sanpham.findOne({ _id: sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
  if (!sanphamdoc) return { ok: false, status: 404, message: 'Sản phẩm không tồn tại', redirect: '/products' };

  const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);
  if (cosize && !kichco) return { ok: false, status: 400, message: 'Vui lòng chọn size', redirect: `/products/${sanpham_id}` };

  const ketqua = layBienTheVaTon(sanphamdoc, bienthe_id, kichco);
  if (ketqua.error) return { ok: false, status: 400, message: ketqua.error, redirect: `/products/${sanpham_id}` };
  if (ketqua.stock <= 0) return { ok: false, status: 400, message: 'Hết hàng', redirect: `/products/${sanpham_id}` };

  const soluongthem = Math.min(soluong, ketqua.stock);
  const giohang = await getOrCreateCart(userId);

  const tontai = giohang.sanpham.find(i => String(i.sanpham_id) === String(sanpham_id)
    && String(i.bienthe_id || '') === String(ketqua.bienTheObjId || '')
    && String(i.kichco || '') === String(kichco || ''));

  let iditemdich;
  if (tontai) {
    tontai.soluong = soluongthem;
    chuanHoaChuoiHienThiGio(tontai);
    iditemdich = tontai._id;
  } else {
    giohang.sanpham.push({
      sanpham_id,
      bienthe_id: ketqua.bienTheObjId,
      tensanpham: fixMojibakeText(sanphamdoc.tensanpham),
      hinhanh: ketqua.hinhanh,
      mausac: fixMojibakeText(ketqua.mausac),
      kichco: fixMojibakeText(kichco || null),
      gia: ketqua.gia,
      giagiam: ketqua.giagiam,
      soluong: soluongthem
    });
    iditemdich = giohang.sanpham[giohang.sanpham.length - 1]._id;
  }

  await giohang.save();
  const redirect = iditemdich ? `/cart/checkout?itemIds=${iditemdich}` : '/cart/checkout';
  return { ok: true, cartCount: tinhSoLuongHienThiGio(giohang), redirect };
}
// Cập nhật số lượng sản phẩm trong giỏ hàng
async function updateCartItemQuantity({ userId, body }) {
  const iditem = String(body.itemId || '').trim();
  const soluong = Math.max(1, parseInt(body.soluong, 10) || 1);

  const giohang = await getOrCreateCart(userId);
  const dongitem = giohang.sanpham.id(iditem);
  if (!dongitem) return { ok: false, status: 404, message: 'Không tìm thấy sản phẩm trong giỏ', redirect: '/cart' };

  const soLuongCu = Math.max(1, Number(dongitem.soluong || 1));
  const donGiaCu = Number(dongitem.giagiam || dongitem.gia || 0);

  let soluongcapnhat = soluong;
  let tonkho = null;

  try {
    const sanphamdoc = await sanpham.findOne({ _id: dongitem.sanpham_id, daxoa: { $ne: true }, trangthai: 'dangban' });
    if (sanphamdoc) {
      const ketqua = layBienTheVaTon(sanphamdoc, dongitem.bienthe_id, dongitem.kichco);
      if (!ketqua?.error) {
        tonkho = Math.max(0, Number(ketqua.stock || 0));
        if (tonkho > 0) soluongcapnhat = Math.min(soluongcapnhat, tonkho);
        else soluongcapnhat = Math.min(soluongcapnhat, Number(dongitem.soluong || 1));
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
  const fifoPriceNotice = taoCanhBaoGiaFifoKhiTangSoLuong({
    soLuongCu,
    soLuongMoi: soluongcapnhat,
    donGiaCu,
    donGiaMoi: unitPrice
  });
  const flash = fifoPriceNotice ? { type: 'info', message: fifoPriceNotice } : null;

  return {
    ok: true,
    redirect: '/cart',
    flash,
    payload: {
      success: true,
      cartCount: tinhSoLuongHienThiGio(giohang),
      quantity: soluongcapnhat,
      maxStock: tonkho,
      lineTotal,
      unitPrice,
      cartTotal: Number(giohang.tongtien || 0),
      fifoPriceNotice
    }
  };
}
// Cập nhật biến thể, màu sắc, kích cỡ của sản phẩm trong giỏ hàng
async function updateCartItemOptions({ userId, body }) {
  const iditem = String(body.itemId || '').trim();
  const idsanpham = String(body.sanpham_id || '').trim();
  const idbienthe = body.bienthe_id ? String(body.bienthe_id).trim() : null;
  const kichco = body.kichco ? String(body.kichco).trim() : null;
  const soluong = Math.max(1, parseInt(body.soluong, 10) || 1);

  const giohang = await getOrCreateCart(userId);
  const dongitem = giohang.sanpham.id(iditem);
  if (!dongitem) return { ok: false, status: 404, message: 'Không tìm thấy sản phẩm trong giỏ' };

  const idsanphamthuc = idsanpham || String(dongitem.sanpham_id);
  const sanphamdoc = await sanpham.findOne({ _id: idsanphamthuc, daxoa: { $ne: true }, trangthai: 'dangban' });
  if (!sanphamdoc) return { ok: false, status: 404, message: 'Sản phẩm không tồn tại' };

  const cosize = !laLoaiKhongSize(sanphamdoc.loaisanpham);
  if (cosize && !kichco) return { ok: false, status: 400, message: 'Vui lòng chọn size' };

  const ketqua = layBienTheVaTon(sanphamdoc, idbienthe, kichco);
  if (ketqua.error) return { ok: false, status: 400, message: ketqua.error };
  if (ketqua.stock <= 0) return { ok: false, status: 400, message: 'Hết hàng' };

  const soluonghople = Math.min(soluong, ketqua.stock);

  const dongtrung = giohang.sanpham.find(i => String(i._id) !== String(iditem)
    && String(i.sanpham_id) === String(idsanphamthuc)
    && String(i.bienthe_id || '') === String(ketqua.bienTheObjId || '')
    && String(i.kichco || '') === String(kichco || ''));

  if (dongtrung) {
    dongtrung.soluong = Math.min(ketqua.stock, (dongtrung.soluong || 0) + soluonghople);
    chuanHoaChuoiHienThiGio(dongtrung);
    dongitem.remove();
  } else {
    dongitem.sanpham_id = idsanphamthuc;
    dongitem.bienthe_id = ketqua.bienTheObjId;
    dongitem.tensanpham = fixMojibakeText(sanphamdoc.tensanpham);
    dongitem.hinhanh = ketqua.hinhanh;
    dongitem.mausac = fixMojibakeText(ketqua.mausac);
    dongitem.kichco = fixMojibakeText(kichco || null);
    dongitem.gia = ketqua.gia;
    dongitem.giagiam = ketqua.giagiam;
    dongitem.soluong = soluonghople;
    chuanHoaChuoiHienThiGio(dongitem);
  }

  await dongBoGiaGioHang(giohang, { capNhatTonKho: false });
  await giohang.save();

  return { ok: true, payload: { success: true, cartCount: tinhSoLuongHienThiGio(giohang) } };
}
// Xóa sản phẩm khỏi giỏ hàng
async function removeCartItem({ userId, itemId }) {
  const giohang = await getOrCreateCart(userId);
  giohang.sanpham = giohang.sanpham.filter(i => String(i._id) !== String(itemId));
  await giohang.save();
  return { success: true, cartCount: tinhSoLuongHienThiGio(giohang) };
}

async function clearCart({ userId }) {
  const giohang = await getOrCreateCart(userId);
  giohang.sanpham = [];
  await giohang.save();
  return { success: true, cartCount: 0 };
}

module.exports = {
  getCartPageData,
  addToCart,
  buyNowFromProduct,
  updateCartItemQuantity,
  updateCartItemOptions,
  removeCartItem,
  clearCart
};
