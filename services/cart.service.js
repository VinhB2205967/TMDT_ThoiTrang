const Giohang = require('../models/cart_model');
const sanpham = require('../models/product_model');
const TonKhoLo = require('../models/inventory_lot_model');
const mongoose = require('mongoose');
const { NO_SIZE_TYPES } = require('../config/constants');
const SHIPPING_CONFIG = require('../config/shipping');
const { getFlashSalePercentMap, tinhGiaFlash } = require('./catalog/flashSale.service.js');
const { fixMojibakeText } = require('../helpers/textEncoding');
const {
  xuatTonTheoLoFIFO
} = require('./inventory/exportReceipt.service.js');
// hàm chuẩn hóa đường dẫn hình ảnh, đảm bảo luôn có hình mặc định nếu không có hoặc đường dẫn không hợp lệ
function normalizeImage(path) {
  if (!path) return '/images/shopping.png';
  if (path.startsWith('/public')) return path.replace('/public', '');
  return path;
}
// hàm kiểm tra xem loại sản phẩm có phải là loại không có size hay không, dựa trên danh sách NO_SIZE_TYPES
function laLoaiKhongSize(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}
// hàm tính tổng tồn kho của một sản phẩm, bao gồm cả tồn kho chính và tồn kho của các biến thể, cũng như tồn kho theo size nếu có
function tinhTongTon(productdoc) {
  if (!productdoc) return 0;

  const coSize = !laLoaiKhongSize(productdoc.loaisanpham);
  let tong = 0;

  if (coSize) {
    (productdoc.sizes || []).forEach((s) => {
      tong += s && s.soluong ? Number(s.soluong) : 0;
    });

    (productdoc.bienthe || []).forEach((v) => {
      (v.sizes || []).forEach((s) => {
        tong += s && s.soluong ? Number(s.soluong) : 0;
      });
    });

    return tong;
  }

  tong += Number(productdoc.soluong_chinh || 0);
  (productdoc.bienthe || []).forEach((v) => {
    tong += Number(v.soluong || 0);
  });

  return tong;
}
// hàm lấy thông tin biến thể và tồn kho của sản phẩm dựa trên productdoc, biến thể id và kích cỡ, trả về đối tượng chứa thông tin cần thiết cho giỏ hàng
function layBienTheVaTon(productdoc, bientheId, kichco) {
  const coSize = !laLoaiKhongSize(productdoc.loaisanpham);
  const laChinh = !bientheId || bientheId === 'main';

  if (laChinh) {
    const mausac = productdoc.mausac_chinh || 'Mặc định';
    const hinhanh = normalizeImage(productdoc.hinhanh);
    const gia = productdoc.gia || 0;
    const giamgia = productdoc.phantramgiamgia || 0;
    const giagiam = giamgia > 0 ? Math.round((gia * (100 - giamgia)) / 100) : gia;

    if (coSize) {
      const sizes = Array.isArray(productdoc.sizes) ? productdoc.sizes : [];
      const dongsize = sizes.find((s) => s.size === kichco);
      const tonkho = dongsize ? dongsize.soluong || 0 : 0;
      return {
        hasSize: coSize,
        stock: tonkho,
        bienTheObjId: null,
        mausac,
        hinhanh,
        gia,
        giagiam
      };
    }

    const tonkho = productdoc.soluong_chinh || 0;
    return {
      hasSize: coSize,
      stock: tonkho,
      bienTheObjId: null,
      mausac,
      hinhanh,
      gia,
      giagiam
    };
  }

  const bienthe = (productdoc.bienthe || []).find((v) => String(v._id) === String(bientheId));
  if (!bienthe) return { error: 'Biến thể không tồn tại' };

  const mausac = bienthe.mausac || 'Màu';
  const hinhanh = normalizeImage(bienthe.hinhanh) || normalizeImage(productdoc.hinhanh);
  const gia = bienthe.gia || productdoc.gia || 0;
  const giamgia = bienthe.phantramgiamgia != null ? bienthe.phantramgiamgia : productdoc.phantramgiamgia || 0;
  const giagiam = giamgia > 0 ? Math.round((gia * (100 - giamgia)) / 100) : gia;

  if (coSize) {
    const sizes = Array.isArray(bienthe.sizes) ? bienthe.sizes : [];
    const dongsize = sizes.find((s) => s.size === kichco);
    const tonkho = dongsize ? dongsize.soluong || 0 : 0;
    return {
      hasSize: coSize,
      stock: tonkho,
      bienTheObjId: bienthe._id,
      mausac,
      hinhanh,
      gia,
      giagiam
    };
  }

  const tonkho = bienthe.soluong || 0;
  return {
    hasSize: coSize,
    stock: tonkho,
    bienTheObjId: bienthe._id,
    mausac,
    hinhanh,
    gia,
    giagiam
  };
}
// hàm lấy hoặc tạo giỏ hàng cho người dùng, nếu đã có giỏ hàng thì trả về giỏ hàng đó, nếu chưa có thì tạo mới và trả về
async function getOrCreateCart(userId) {
  let cart = await Giohang.findOne({ nguoidung_id: userId });
  if (!cart) cart = await Giohang.create({ nguoidung_id: userId, sanpham: [] });
  return cart;
}
// hàm tính phần trăm giảm giá dựa trên giá gốc và giá sau giảm, trả về phần trăm làm tròn, nếu có lỗi hoặc điều kiện không hợp lệ thì trả về 0
function tinhPhanTramTuGia(giaGoc, giaSauGiam) {
  const goc = Number(giaGoc || 0);
  const giam = Number(giaSauGiam || 0);
  if (!(goc > 0) || !(giam > 0) || giam >= goc) return 0;
  return Math.round(((goc - giam) / goc) * 100);
}
// hàm tính tổng số lượng sản phẩm hiển thị trong giỏ hàng, nếu giỏ hàng không hợp lệ hoặc không có sản phẩm thì trả về 0
function tinhSoLuongHienThiGio(giohang) {
  if (!giohang || !Array.isArray(giohang.sanpham)) return 0;
  return giohang.sanpham.length;
}
// hàm tính tổng tiền của giỏ hàng, dựa trên danh sách sản phẩm và số lượng, nếu giỏ hàng không hợp lệ hoặc không có sản phẩm thì trả về 0
function tinhTongTienGio(giohang) {
  if (!giohang || !Array.isArray(giohang.sanpham)) return 0;
  return giohang.sanpham.reduce((sum, item) => {
    const lineTotal = Number.isFinite(Number(item?.thanhtien))
      ? Number(item.thanhtien)
      : (Number(item?.giagiam || item?.gia || 0) * Number(item?.soluong || 1));
    return sum + Math.max(0, Number(lineTotal || 0));
  }, 0);
}
// hàm tạo điều kiện truy vấn biến thể cho tồn kho theo lô, nếu biến thể là 'main' hoặc không có thì trả về điều kiện tìm biến thể null hoặc không tồn tại, nếu có biến thể hợp lệ thì trả về điều kiện tìm theo ObjectId của biến thể đó, nếu biến thể không hợp lệ thì trả về null
function taoDieuKienBienTheChoLo(variantId) {
  const raw = String(variantId || '').trim();
  if (!raw || raw === 'main') {
    return {
      $or: [
        { bientheid: null },
        { bientheid: { $exists: false } }
      ]
    };
  }

  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  return { bientheid: new mongoose.Types.ObjectId(raw) };
}
// hàm tính giá theo phương pháp FIFO cho một item trong giỏ hàng, dựa trên tồn kho theo lô của sản phẩm, nếu có lỗi hoặc không đủ thông tin thì trả về null, nếu thành công thì trả về đối tượng chứa tổng tiền, đơn giá bình quân và phân bổ số lượng theo lô
async function tinhGiaTheoLoFIFO({ productDoc, item, giaMacDinh }) {
  const productId = String(item?.sanpham_id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;

  const soLuongCan = Math.max(1, Number(item?.soluong || 1));
  const variantCond = taoDieuKienBienTheChoLo(item?.bienthe_id);
  if (!variantCond) return null;

  const hasSize = !laLoaiKhongSize(productDoc?.loaisanpham);
  const sizeKey = hasSize ? String(item?.kichco || '').trim() : '';

  const lots = await TonKhoLo.find({
    sanphamid: new mongoose.Types.ObjectId(productId),
    kichco: sizeKey,
    soluongconlai: { $gt: 0 },
    ...variantCond
  })
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 })
    .select('soluongconlai giabandexuat')
    .lean();

  if (!lots.length) return null;

  let conLai = soLuongCan;
  let tongTien = 0;
  let daLay = 0;
  const allocations = [];

  for (const lot of lots) {
    if (conLai <= 0) break;
    const ton = Math.max(0, Number(lot?.soluongconlai || 0));
    if (ton <= 0) continue;

    const lay = Math.min(ton, conLai);
    const giaLo = Math.max(0, Number(lot?.giabandexuat || 0)) || Math.max(0, Number(giaMacDinh || 0));

    tongTien += (lay * giaLo);
    daLay += lay;
    conLai -= lay;
    allocations.push({ soLuong: lay, gia: giaLo });
  }

  if (daLay <= 0) return null;

  if (conLai > 0) {
    const fallbackGia = Math.max(0, Number(giaMacDinh || 0));
    tongTien += conLai * fallbackGia;
    allocations.push({ soLuong: conLai, gia: fallbackGia });
    daLay += conLai;
  }

  return {
    tongTien,
    donGiaBinhQuan: daLay > 0 ? (tongTien / daLay) : Math.max(0, Number(giaMacDinh || 0)),
    allocations
  };
}
// hàm lấy phần trăm giảm giá mặc định cho một item trong giỏ hàng, ưu tiên phần trăm giảm của biến thể nếu có, nếu không có thì lấy phần trăm giảm của sản phẩm, nếu vẫn không có thì tính phần trăm giảm từ giá gốc và giá sau giảm, nếu có lỗi hoặc điều kiện không hợp lệ thì trả về 0
function layPhanTramGiamMacDinh({ productDoc, item, ketqua }) {
  const variantId = String(item?.bienthe_id || '').trim();
  if (variantId && variantId !== 'main') {
    const variant = (productDoc?.bienthe || []).find((v) => String(v?._id) === variantId);
    if (Number.isFinite(Number(variant?.phantramgiamgia))) {
      return Math.max(0, Number(variant.phantramgiamgia));
    }
  }

  if (Number.isFinite(Number(productDoc?.phantramgiamgia))) {
    return Math.max(0, Number(productDoc.phantramgiamgia));
  }

  return Math.max(0, tinhPhanTramTuGia(ketqua?.gia, ketqua?.giagiam));
}
// hàm đồng bộ giá và tồn kho của giỏ hàng dựa trên thông tin sản phẩm mới nhất từ cơ sở dữ liệu, nếu có lỗi hoặc giỏ hàng không hợp lệ thì trả về false, nếu có sự thay đổi nào được thực hiện thì trả về true, tham số capNhatTonKho nếu true sẽ cập nhật tồn kho trong giỏ hàng theo tồn kho thực tế của sản phẩm, nếu false thì chỉ đồng bộ giá và thông tin khác mà không thay đổi tồn kho
async function dongBoGiaGioHang(giohang, { capNhatTonKho = false } = {}) {
  if (!giohang || !Array.isArray(giohang.sanpham) || !giohang.sanpham.length) return false;

  const productIds = [...new Set(
    giohang.sanpham
      .map((it) => String(it.sanpham_id || '').trim())
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
  )];

  if (!productIds.length) return false;

  const docs = await sanpham.find({
    _id: { $in: productIds },
    daxoa: { $ne: true },
    trangthai: 'dangban'
  });

  const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));
  const flashPercentMap = await getFlashSalePercentMap(productIds);

  let changed = false;

  for (const item of giohang.sanpham) {
    const productDoc = docMap.get(String(item.sanpham_id || ''));
    if (!productDoc) {
      if (capNhatTonKho && item.tonkho !== 0) item.tonkho = 0;
      continue;
    }

    const ketqua = layBienTheVaTon(productDoc, item.bienthe_id, item.kichco);

    if (capNhatTonKho) {
      const tonkho = ketqua?.error ? 0 : Math.max(0, Number(ketqua.stock || 0));
      item.tonkho = tonkho;
      if (tonkho > 0 && Number(item.soluong || 0) > tonkho) {
        item.soluong = tonkho;
        changed = true;
      }
    }

    if (ketqua?.error) continue;

    const tenSanPhamChuan = fixMojibakeText(productDoc.tensanpham || item.tensanpham || '');
    if (String(item.tensanpham || '') !== tenSanPhamChuan) {
      item.tensanpham = tenSanPhamChuan;
      changed = true;
    }

    const mauSacChuan = fixMojibakeText(ketqua.mausac || item.mausac || '');
    if (String(item.mausac || '') !== mauSacChuan) {
      item.mausac = mauSacChuan;
      changed = true;
    }

    const kichCoChuan = fixMojibakeText(item.kichco || '');
    if (String(item.kichco || '') !== kichCoChuan) {
      item.kichco = kichCoChuan;
      changed = true;
    }

    const qty = Math.max(1, Number(item.soluong || 1));
    const giaGoc = Number(ketqua.gia || item.gia || 0);

    const phanTramGoc = layPhanTramGiamMacDinh({ productDoc, item, ketqua });
    const phanTramFlash = Number(flashPercentMap.get(String(item.sanpham_id || '')) || 0);
    const phanTramApDung = phanTramFlash > 0 ? phanTramFlash : phanTramGoc;

    const giaGiam = phanTramApDung > 0 ? (tinhGiaFlash(giaGoc, phanTramApDung) || giaGoc) : giaGoc;
    const lineTotal = Math.round(giaGiam * qty);

    if (Number(item.gia || 0) !== giaGoc) {
      item.gia = giaGoc;
      changed = true;
    }
    if (Number(item.giagiam || 0) !== giaGiam) {
      item.giagiam = giaGiam;
      changed = true;
    }
    if (Number(item.thanhtien || 0) !== lineTotal) {
      item.thanhtien = lineTotal;
      changed = true;
    }
  }

  return changed;
}
// hàm tính giá theo phương pháp FIFO và đồng thời trừ tồn kho của sản phẩm dựa trên item trong giỏ hàng, nếu có lỗi hoặc không đủ thông tin thì trả về lỗi, nếu thành công thì trả về đối tượng chứa thông tin phân bổ theo lô và cờ cho biết có áp dụng FIFO hay không
async function truTonTheoItem(item) {
  const idsanpham = item.sanpham_id;
  const idbienthe = item.bienthe_id;
  const kichco = item.kichco;
  const soluong = item.soluong || 1;

  const sanphamdoc = await sanpham.findById(idsanpham);
  if (!sanphamdoc) throw new Error('Sản phẩm không tồn tại');

  const variantId = idbienthe ? String(idbienthe) : null;
  const sizeKey = String(kichco || '').trim();
  let fifoAllocations = [];

  try {
    const fifoCost = await xuatTonTheoLoFIFO({
      productId: String(idsanpham),
      variantId,
      size: sizeKey,
      qty: soluong
    });

    fifoAllocations = Array.isArray(fifoCost?.allocations)
      ? fifoCost.allocations
        .map((a) => ({
          lotId: String(a?.lotId || ''),
          soLuong: Number(a?.soLuong || 0),
          giaNhap: Number(a?.giaNhap || 0),
          giaBanDeXuat: Number(a?.giaBanDeXuat || 0)
        }))
        .filter((a) => a.soLuong > 0)
      : [];

  } catch {
    // Compatibility fallback: proceed with product-stock deduction when lots are legacy/incomplete.
  }

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
    return {
      fifoAllocations,
      fifoApplied: fifoAllocations.length > 0
    };
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

  return {
    fifoAllocations,
    fifoApplied: fifoAllocations.length > 0
  };
}
// hàm chuẩn hóa vùng giao hàng, nếu vùng không hợp lệ thì trả về vùng mặc định, nếu có cấu hình vùng giao hàng thì kiểm tra và trả về vùng hợp lệ, nếu không có cấu hình thì trả về 'noithanh' làm mặc định
function normalizeShippingRegion(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (SHIPPING_CONFIG.regions && SHIPPING_CONFIG.regions[key]) return key;
  return SHIPPING_CONFIG.defaultRegion || 'noithanh';
}
// hàm tính phí vận chuyển dựa trên tổng tiền hàng và vùng giao hàng, nếu có lỗi hoặc điều kiện không hợp lệ thì trả về 0, nếu tổng tiền hàng vượt ngưỡng miễn phí thì cũng trả về 0, nếu có cấu hình phí vận chuyển theo vùng thì trả về phí tương ứng, nếu không có cấu hình thì trả về 0
function calcShippingFee(subtotal, regionKey) {
  const total = Number(subtotal || 0);
  if (total >= Number(SHIPPING_CONFIG.freeShipThreshold || 0)) return 0;
  return Number(SHIPPING_CONFIG.regions?.[regionKey]?.fee || 0);
}

module.exports = {
  getOrCreateCart,
  normalizeImage,
  tinhSoLuongHienThiGio,
  tinhTongTienGio,
  dongBoGiaGioHang,
  truTonTheoItem,
  normalizeShippingRegion,
  calcShippingFee
};
