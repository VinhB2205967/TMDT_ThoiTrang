const mongoose = require('mongoose');
const Donhang = require('../../models/order_model');
const Chitietdonhang = require('../../models/order_item_model');
const Sanpham = require('../../models/product_model');
const PhieuNhapKho = require('../../models/import_receipt_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const TonKhoLo = require('../../models/inventory_lot_model');
const { NO_SIZE_TYPES } = require('../../config/constants');
const { tinhTongTon } = require('../catalog/productStock.service.js');
const { chuanIdNhanVienHienThi } = require('../../helpers/user-display-id');
// Dịch vụ này cung cấp các hàm liên quan đến việc tạo phiếu xuất kho từ đơn hàng, bao gồm việc tính toán giá vốn theo phương pháp FIFO, điều chỉnh tồn kho, và tính toán tài chính cho từng dòng sản phẩm trong phiếu xuất. Nó cũng xử lý các trường hợp đặc biệt như sản phẩm không có size và áp dụng giá đề xuất sau khi trừ tồn kho.
function laLoaiKhongSize(loaisanpham) {
  return NO_SIZE_TYPES.includes(String(loaisanpham || '').toLowerCase());
}
// Hàm tiện ích để chuyển giá trị sang số, nếu không phải là số hợp lệ thì trả về giá trị fallback (mặc định là 0)
function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0));
}

function allocateProportionalAmounts(rows, totalAmount) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({
      id: String(row && row.id ? row.id : '').trim(),
      weight: Math.max(0, roundMoney(row && row.amount ? row.amount : 0)),
      index
    }))
    .filter((row) => row.id);

  const result = {};
  for (const row of normalizedRows) result[row.id] = 0;

  const target = Math.max(0, roundMoney(totalAmount));
  if (!normalizedRows.length || target <= 0) return result;

  const totalWeight = normalizedRows.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return result;

  const allocations = normalizedRows.map((row) => {
    const exact = (target * row.weight) / totalWeight;
    const floorVal = Math.floor(exact);
    return {
      ...row,
      value: floorVal,
      fraction: exact - floorVal
    };
  });

  let assigned = allocations.reduce((sum, row) => sum + row.value, 0);
  let remain = target - assigned;

  allocations.sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.index - b.index;
  });

  let cursor = 0;
  while (remain > 0 && allocations.length) {
    allocations[cursor % allocations.length].value += 1;
    remain -= 1;
    cursor += 1;
  }

  for (const row of allocations) result[row.id] = row.value;
  return result;
}
// Hàm tạo mã phiếu xuất kho duy nhất dựa trên thời gian hiện tại và một số ngẫu nhiên, định dạng mã sẽ là "XKYYYYMMDD-HHMMSS-RAND"
function taoMaPhieuXuat() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `XK${y}${m}${day}-${h}${min}${s}-${rand}`;
}
// Hàm tạo thông tin nhân viên ký phiếu xuất kho, nếu có thông tin người dùng quản trị thì sử dụng thông tin đó, nếu không thì sử dụng thông tin fallback nếu có, nếu vẫn không có thì trả về các trường rỗng hoặc mặc định
function taoThongTinNhanVienKy(adminUser, fallback = {}) {
  const u = adminUser || null;
  const rawId = String(fallback.idnhanvien || u?._id || '').trim();
  return {
    tennhanvien: String(fallback.tennhanvien || u?.hoten || u?.email || '').trim(),
    idnhanvien: chuanIdNhanVienHienThi({
      rawId,
      createdAt: u?.ngaytao || fallback.thoigianky || new Date()
    }),
    anhchuky: String(fallback.anhchuky || u?.chukyso || u?.chuKy || u?.avatar || '').trim(),
    thoigianky: fallback.thoigianky || new Date()
  };
}
// Hàm xây dựng bản đồ chi phí trung bình cho một danh sách các ID sản phẩm, sử dụng dữ liệu từ phiếu nhập kho để tính toán chi phí trung bình theo từng biến thể và kích cỡ, kết quả trả về là một Map với khóa là "productId|variantId|size" và giá trị là chi phí trung bình
async function taoBanDoGiaVonTrungBinhTheoSanPham(productIds) {
  if (!productIds.length) return new Map();
  const objectIds = productIds
    .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
  if (!objectIds.length) return new Map();

  const rows = await PhieuNhapKho.aggregate([
    { $unwind: '$chitiet' },
    { $match: { 'chitiet.sanphamid': { $in: objectIds } } },
    {
      $group: {
        _id: {
          sanphamid: '$chitiet.sanphamid',
          bientheid: '$chitiet.bientheid',
          kichco: '$chitiet.kichco'
        },
        avgCost: { $avg: '$chitiet.gianhap' }
      }
    }
  ]);

  const map = new Map();
  rows.forEach((row) => {
    const pid = row?._id?.sanphamid ? String(row._id.sanphamid) : '';
    const vid = row?._id?.bientheid ? String(row._id.bientheid) : 'main';
    const size = row?._id?.kichco ? String(row._id.kichco) : 'nosize';
    map.set(`${pid}|${vid}|${size}`, toNumber(row.avgCost, 0));
  });
  return map;
}

function layGiaVonTrungBinh(costMap, { productId, variantId, size }) {
  const pid = String(productId || '');
  const vid = variantId ? String(variantId) : 'main';
  const sizeKey = String(size || '').trim() || 'nosize';

  return (
    toNumber(costMap.get(`${pid}|${vid}|${sizeKey}`), NaN)
    || toNumber(costMap.get(`${pid}|${vid}|nosize`), NaN)
    || toNumber(costMap.get(`${pid}|main|${sizeKey}`), NaN)
    || toNumber(costMap.get(`${pid}|main|nosize`), 0)
  );
}

function taoTruyVanLoTon({ productId, variantId, size }) {
  const query = {
    sanphamid: new mongoose.Types.ObjectId(String(productId)),
    soluongconlai: { $gt: 0 }
  };

  if (variantId && mongoose.Types.ObjectId.isValid(String(variantId))) {
    query.bientheid = new mongoose.Types.ObjectId(String(variantId));
  } else {
    query.bientheid = null;
  }

  const sizeKey = String(size || '').trim();
  if (sizeKey) {
    query.kichco = sizeKey;
  } else {
    query.kichco = '';
  }

  return query;
}
// Hàm giải quyết xuất kho fifo
async function xuatTonTheoLoFIFO({ productId, variantId, size, qty }) {
  const soLuongCanXuat = toNumber(qty, 0);
  if (soLuongCanXuat <= 0) throw new Error('Số lượng xuất không hợp lệ');

  const lots = await TonKhoLo.find(taoTruyVanLoTon({ productId, variantId, size }))
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 });

  let conLaiCanXuat = soLuongCanXuat;
  let tongGiaVon = 0;
  const allocations = [];

  for (const lot of lots) {
    if (conLaiCanXuat <= 0) break;
    const available = toNumber(lot.soluongconlai, 0);
    if (available <= 0) continue;

    const take = Math.min(available, conLaiCanXuat);
    const unitCost = toNumber(lot.gianhap, 0);

    lot.soluongconlai = available - take;
    lot.ngaycapnhat = new Date();
    await lot.save();

    allocations.push({
      lotId: String(lot._id),
      soLuong: take,
      giaNhap: unitCost,
      giaBanDeXuat: toNumber(lot.giabandexuat, 0)
    });

    tongGiaVon += take * unitCost;
    conLaiCanXuat -= take;
  }

  if (conLaiCanXuat > 0) {
    throw new Error('Không đủ tồn theo lô FIFO để xuất kho');
  }

  return {
    tongGiaVon,
    giaNhapBinhQuan: soLuongCanXuat > 0 ? (tongGiaVon / soLuongCanXuat) : 0,
    allocations
  };
}

async function layGiaDeXuatSauKhiXuat({ productId, variantId, size, allocations }) {
  const currentLot = await TonKhoLo.findOne(taoTruyVanLoTon({ productId, variantId, size }))
    .sort({ ngaynhap: 1, ngaytao: 1, _id: 1 })
    .select('giabandexuat')
    .lean();

  const fromRemaining = toNumber(currentLot?.giabandexuat, 0);
  if (fromRemaining > 0) return fromRemaining;

  const alloc = Array.isArray(allocations) ? allocations : [];
  for (let i = alloc.length - 1; i >= 0; i -= 1) {
    const price = toNumber(alloc[i]?.giaBanDeXuat, 0);
    if (price > 0) return price;
  }

  return 0;
}

function apDungGiaDeXuatChoSanPham(productDoc, { variantId, suggestedPrice }) {
  const price = toNumber(suggestedPrice, 0);
  if (price <= 0) return false;

  const isMain = !variantId;
  if (isMain) {
    if (toNumber(productDoc.gia, 0) === price) return false;
    productDoc.gia = price;
    return true;
  }

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
  if (!variant) return false;
  if (toNumber(variant.gia, 0) === price) return false;
  variant.gia = price;
  return true;
}

function truTonKhoTheoDong(productDoc, { variantId, size, qty }) {
  const soLuong = toNumber(qty, 0);
  if (soLuong <= 0) throw new Error('Số lượng xuất không hợp lệ');

  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const isMain = !variantId;

  if (hasSize) {
    const sizeKey = String(size || '').trim();
    if (!sizeKey) throw new Error('Thiếu size cho sản phẩm có size');

    if (isMain) {
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const row = productDoc.sizes.find((s) => String(s.size) === sizeKey);
      const current = toNumber(row?.soluong, 0);
      const next = current - soLuong;
      if (next < 0) throw new Error('Tồn kho không đủ để xuất (size chính)');
      if (row) row.soluong = next;
      else productDoc.sizes.push({ size: sizeKey, soluong: 0 });
      return;
    }

    const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
    if (!variant) throw new Error('Biến thể không tồn tại');
    variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const row = variant.sizes.find((s) => String(s.size) === sizeKey);
    const current = toNumber(row?.soluong, 0);
    const next = current - soLuong;
    if (next < 0) throw new Error('Tồn kho không đủ để xuất (size biến thể)');
    if (row) row.soluong = next;
    else variant.sizes.push({ size: sizeKey, soluong: 0 });
    return;
  }

  if (isMain) {
    const current = toNumber(productDoc.soluong_chinh, 0);
    const next = current - soLuong;
    if (next < 0) throw new Error('Tồn kho không đủ để xuất (sản phẩm chính)');
    productDoc.soluong_chinh = next;
    return;
  }

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
  if (!variant) throw new Error('Biến thể không tồn tại');
  const current = toNumber(variant.soluong, 0);
  const next = current - soLuong;
  if (next < 0) throw new Error('Tồn kho không đủ để xuất (biến thể)');
  variant.soluong = next;
}

function congTonKhoTheoDong(productDoc, { variantId, size, qty }) {
  const soLuong = toNumber(qty, 0);
  if (soLuong <= 0) throw new Error('Số lượng xuất không hợp lệ');

  const hasSize = !laLoaiKhongSize(productDoc.loaisanpham);
  const isMain = !variantId;

  if (hasSize) {
    const sizeKey = String(size || '').trim();
    if (!sizeKey) throw new Error('Thiếu size cho sản phẩm có size');

    if (isMain) {
      productDoc.sizes = Array.isArray(productDoc.sizes) ? productDoc.sizes : [];
      const row = productDoc.sizes.find((s) => String(s.size) === sizeKey);
      const current = toNumber(row?.soluong, 0);
      const next = current + soLuong;
      if (row) row.soluong = next;
      else productDoc.sizes.push({ size: sizeKey, soluong: soLuong });
      return;
    }

    const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
    if (!variant) throw new Error('Biến thể không tồn tại');
    variant.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
    const row = variant.sizes.find((s) => String(s.size) === sizeKey);
    const current = toNumber(row?.soluong, 0);
    const next = current + soLuong;
    if (row) row.soluong = next;
    else variant.sizes.push({ size: sizeKey, soluong: soLuong });
    return;
  }

  if (isMain) {
    const current = toNumber(productDoc.soluong_chinh, 0);
    productDoc.soluong_chinh = current + soLuong;
    return;
  }

  const variant = (productDoc.bienthe || []).find((v) => String(v._id) === String(variantId));
  if (!variant) throw new Error('Biến thể không tồn tại');
  const current = toNumber(variant.soluong, 0);
  variant.soluong = current + soLuong;
}
// Hàm tính toán tài chính cho một dòng sản phẩm dựa trên số lượng, giá nhập, giá bán, phần trăm giảm và giá vốn (nếu có), kết quả trả về bao gồm giá sau giảm, doanh thu, giá vốn và lợi nhuận
function tinhTaiChinhTheoDong({ qty, giaNhap, giaBan, phanTramGiam, giaVon: giaVonOverride }) {
  const soLuong = toNumber(qty, 0);
  const priceNhap = toNumber(giaNhap, 0);
  const priceBan = toNumber(giaBan, 0);
  const giam = Math.max(0, toNumber(phanTramGiam, 0));
  const giaSauGiam = giam > 0 ? Math.round(priceBan - (priceBan * giam / 100)) : priceBan;
  const doanhThu = soLuong * giaSauGiam;
  const giaVon = Number.isFinite(Number(giaVonOverride)) ? Number(giaVonOverride) : (soLuong * priceNhap);
  const loiNhuan = doanhThu - giaVon;
  return {
    giaSauGiam,
    doanhThu,
    giaVon,
    loiNhuan
  };
}
// Hàm tính toán tài chính cho một dòng sản phẩm dựa trên các phân bổ theo lô, nếu không có phân bổ thì sử dụng giá bán và phần trăm giảm fallback, kết quả trả về bao gồm tổng số lượng, tổng doanh thu, tổng giá vốn, tổng lợi nhuận, giá bán đồng nhất (nếu có), giá sau giảm đồng nhất (nếu có), phần trăm giảm đồng nhất (nếu có) và cờ cho biết có nhiều mức giá hay không
function tinhTaiChinhTheoPhanBo({ allocations, fallbackGiaBan = 0, fallbackPhanTramGiam = 0 }) {
  const src = Array.isArray(allocations) ? allocations : [];
  const fallbackBan = Math.max(0, toNumber(fallbackGiaBan, 0));
  const fallbackGiam = Math.max(0, toNumber(fallbackPhanTramGiam, 0));

  const out = [];
  let tongSoLuong = 0;
  let tongGiaBan = 0;
  let tongGiaSauGiam = 0;
  let tongDoanhThu = 0;
  let tongGiaVon = 0;
  const tapGiaBan = new Set();
  const tapGiaSauGiam = new Set();
  const tapPhanTramGiam = new Set();

  for (const a of src) {
    const soLuong = Math.max(0, toNumber(a?.soLuong, 0));
    if (soLuong <= 0) continue;

    const giaNhap = Math.max(0, toNumber(a?.giaNhap, 0));
    const giaBanDeXuat = Math.max(0, toNumber(a?.giaBanDeXuat, 0));
    const giaBan = giaBanDeXuat > 0 ? giaBanDeXuat : fallbackBan;
    const phanTramGiam = fallbackGiam;
    const giaSauGiam = phanTramGiam > 0
      ? Math.round(giaBan - (giaBan * phanTramGiam / 100))
      : giaBan;

    const doanhThu = soLuong * giaSauGiam;
    const giaVon = soLuong * giaNhap;
    const loiNhuan = doanhThu - giaVon;

    out.push({
      lotId: a?.lotId || null,
      soLuong,
      giaNhap,
      giaBanDeXuat,
      giaban: giaBan,
      phantramgiam: phanTramGiam,
      giasaugiam: giaSauGiam,
      doanhthu: doanhThu,
      giavon: giaVon,
      loinhuan: loiNhuan
    });

    tapGiaBan.add(giaBan);
    tapGiaSauGiam.add(giaSauGiam);
    tapPhanTramGiam.add(phanTramGiam);

    tongSoLuong += soLuong;
    tongGiaBan += soLuong * giaBan;
    tongGiaSauGiam += soLuong * giaSauGiam;
    tongDoanhThu += doanhThu;
    tongGiaVon += giaVon;
  }

  const tongLoiNhuan = tongDoanhThu - tongGiaVon;
  const coNhieuMucGia = tapGiaBan.size > 1;

  const giaBanDongNhat = tapGiaBan.size === 1
    ? Number(Array.from(tapGiaBan)[0] || 0)
    : 0;
  const giaSauGiamDongNhat = tapGiaSauGiam.size === 1
    ? Number(Array.from(tapGiaSauGiam)[0] || 0)
    : 0;
  const phanTramGiamDongNhat = tapPhanTramGiam.size === 1
    ? Number(Array.from(tapPhanTramGiam)[0] || 0)
    : 0;

  return {
    allocations: out,
    tongSoLuong,
    tongDoanhThu,
    tongGiaVon,
    tongLoiNhuan,
    gianhap: tongSoLuong > 0 ? (tongGiaVon / tongSoLuong) : 0,
    giaban: giaBanDongNhat,
    giasaugiam: giaSauGiamDongNhat,
    phantramgiam: phanTramGiamDongNhat,
    nhieumucgia: coNhieuMucGia,
    giabantrungbinh: tongSoLuong > 0 ? (tongGiaBan / tongSoLuong) : 0,
    giasaugiamtrungbinh: tongSoLuong > 0 ? (tongGiaSauGiam / tongSoLuong) : 0
  };
}

function tinhTongSoLieu(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const tongSoLuong = arr.reduce((sum, it) => sum + toNumber(it.soluong, 0), 0);
  const tongDoanhThu = arr.reduce((sum, it) => sum + toNumber(it.doanhthu, 0), 0);
  const tongGiaVon = arr.reduce((sum, it) => sum + toNumber(it.giavon, 0), 0);
  const tongLoiNhuan = tongDoanhThu - tongGiaVon;
  const tySuat = tongDoanhThu > 0 ? (tongLoiNhuan / tongDoanhThu) * 100 : 0;

  return {
    tongsoluong: tongSoLuong,
    tongdoanhthu: tongDoanhThu,
    tonggiavon: tongGiaVon,
    tongloinhuan: tongLoiNhuan,
    tysuatloinhuan: Number(tySuat.toFixed(2))
  };
}

function apDungVoucherDonHangChoPhieuXuat({ lines, order }) {
  const rows = Array.isArray(lines) ? lines : [];
  if (!rows.length) return 0;

  const goodsSubtotal = Math.max(0, roundMoney(rows.reduce((sum, row) => sum + toNumber(row?.doanhthu, 0), 0)));
  if (goodsSubtotal <= 0) return 0;

  const voucherRaw = toNumber(order?.voucher_discount, NaN);
  const voucherDiscount = Math.min(
    goodsSubtotal,
    Math.max(0, roundMoney(Number.isFinite(voucherRaw) ? voucherRaw : toNumber(order?.giamgia, 0)))
  );
  if (voucherDiscount <= 0) return 0;

  const voucherByLine = allocateProportionalAmounts(
    rows.map((row, index) => ({
      id: String(index),
      amount: roundMoney(row?.doanhthu || 0)
    })),
    voucherDiscount
  );

  rows.forEach((line, lineIndex) => {
    const lineDiscount = Math.max(0, roundMoney(voucherByLine[String(lineIndex)] || 0));
    const lineRevenueBefore = Math.max(0, roundMoney(line?.doanhthu || 0));
    const lineRevenueAfter = Math.max(0, lineRevenueBefore - lineDiscount);
    const lineCost = Math.max(0, roundMoney(line?.giavon || 0));

    line.doanhthu = lineRevenueAfter;
    line.loinhuan = roundMoney(lineRevenueAfter - lineCost);

    const allocs = Array.isArray(line?.allocations) ? line.allocations : [];
    if (!allocs.length || lineDiscount <= 0) return;

    const weightRows = allocs.map((alloc, allocIndex) => {
      const qty = Math.max(0, toNumber(alloc?.soLuong, 0));
      const fallbackRevenue = qty * (
        toNumber(alloc?.giasaugiam, 0)
        || toNumber(alloc?.giaban, 0)
        || toNumber(alloc?.giaBanDeXuat, 0)
      );
      const baseRevenue = Math.max(0, roundMoney(toNumber(alloc?.doanhthu, 0) || fallbackRevenue));
      const weight = baseRevenue > 0 ? baseRevenue : Math.max(0, roundMoney(qty));
      return {
        id: String(allocIndex),
        amount: weight
      };
    });

    const voucherByAlloc = allocateProportionalAmounts(weightRows, lineDiscount);

    allocs.forEach((alloc, allocIndex) => {
      const qty = Math.max(0, toNumber(alloc?.soLuong, 0));
      const fallbackRevenue = qty * (
        toNumber(alloc?.giasaugiam, 0)
        || toNumber(alloc?.giaban, 0)
        || toNumber(alloc?.giaBanDeXuat, 0)
      );
      const baseRevenue = Math.max(0, roundMoney(toNumber(alloc?.doanhthu, 0) || fallbackRevenue));
      const allocDiscount = Math.max(0, roundMoney(voucherByAlloc[String(allocIndex)] || 0));
      const revenueAfter = Math.max(0, baseRevenue - allocDiscount);
      const allocCost = Math.max(0, roundMoney(toNumber(alloc?.giavon, 0) || (qty * toNumber(alloc?.giaNhap, 0))));

      alloc.doanhthu = revenueAfter;
      alloc.loinhuan = roundMoney(revenueAfter - allocCost);
    });
  });

  return voucherDiscount;
}
// Hàm chính để tạo phiếu xuất kho từ đơn hàng, nó kiểm tra tính hợp lệ của orderId, kiểm tra xem đã tồn tại phiếu xuất kho cho đơn hàng này chưa, lấy thông tin đơn hàng và chi tiết đơn hàng, tính toán chi phí và điều chỉnh tồn kho theo từng dòng sản phẩm, sau đó tạo và lưu phiếu xuất kho mới vào cơ sở dữ liệu
async function taoPhieuXuatTuDonHang({ orderId, adminUser, note = '', skipInventoryAdjustments = false }) {
  const oid = String(orderId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(oid)) {
    throw new Error('orderId khÃ´ng há»£p lá»‡');
  }

  const existed = await PhieuXuatKho.findOne({ donhang_id: oid }).select('_id maphieu').lean();
  if (existed) {
    return { created: false, receiptId: String(existed._id), maphieu: existed.maphieu, reason: 'already_exists' };
  }

  const order = await Donhang.findOne({ _id: oid, daxoa: { $ne: true } }).lean();
  if (!order) throw new Error('KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng');

  const orderItems = await Chitietdonhang.find({ donhang_id: oid }).lean();
  if (!orderItems.length) throw new Error('ÄÆ¡n hÃ ng chÆ°a cÃ³ sáº£n pháº©m');

  const productIds = Array.from(new Set(orderItems.map((it) => String(it.sanpham_id || '')).filter((id) => mongoose.Types.ObjectId.isValid(id))));
  const productDocs = await Sanpham.find({ _id: { $in: productIds } });
  const productMap = new Map(productDocs.map((p) => [String(p._id), p]));

  const costMap = await taoBanDoGiaVonTrungBinhTheoSanPham(productIds);

  const lines = [];

  for (const item of orderItems) {
    const productId = String(item.sanpham_id || '').trim();
    const productDoc = productMap.get(productId);
    if (!productDoc) throw new Error('Sáº£n pháº©m trong Ä‘Æ¡n khÃ´ng tá»“n táº¡i');

    const variantId = item.bienthe_id ? String(item.bienthe_id) : null;
    const size = String(item.kichco || '').trim();
    const qty = Math.max(1, parseInt(item.soluong, 10) || 1);

    let variant = null;
    if (variantId) {
      variant = (productDoc.bienthe || []).find((v) => String(v._id) === variantId) || null;
      if (!variant) throw new Error('Biáº¿n thá»ƒ trong Ä‘Æ¡n khÃ´ng tá»“n táº¡i');
    }

    if (!skipInventoryAdjustments) {
      truTonKhoTheoDong(productDoc, { variantId, size, qty });
    }

    const giaBanGoc = toNumber(item.giagoc, toNumber(variant?.gia, toNumber(productDoc.gia, 0)));
    const giaSauGiamFromOrder = toNumber(item.giaban, giaBanGoc);
    const percent = giaBanGoc > 0
      ? Math.max(0, Number((((giaBanGoc - giaSauGiamFromOrder) / giaBanGoc) * 100).toFixed(2)))
      : 0;

    const orderFifoAllocations = Array.isArray(item.fifoAllocations)
      ? item.fifoAllocations
        .map((a) => ({
          lotId: a?.lotId || null,
          soLuong: toNumber(a?.soLuong, 0),
          giaNhap: toNumber(a?.giaNhap, 0),
          // Keep lot linkage/cost, but revenue must follow the sold price stored on the order item.
          giaBanDeXuat: toNumber(item.giagoc, toNumber(a?.giaBanDeXuat, 0))
        }))
        .filter((a) => a.soLuong > 0)
      : [];
    const hasOrderFifoAllocations = orderFifoAllocations.length > 0;

    let fifoCost;
    if (skipInventoryAdjustments && hasOrderFifoAllocations) {
      const tongGiaVonFifo = orderFifoAllocations.reduce((sum, a) => sum + (a.soLuong * a.giaNhap), 0);
      fifoCost = {
        tongGiaVon: tongGiaVonFifo,
        giaNhapBinhQuan: qty > 0 ? (tongGiaVonFifo / qty) : 0,
        allocations: orderFifoAllocations
      };
    } else if (!skipInventoryAdjustments) {
      try {
        fifoCost = await xuatTonTheoLoFIFO({ productId, variantId, size, qty });
      } catch (fifoErr) {
        // Fallback nếu không đủ tồn theo lô FIFO, sẽ sử dụng giá vốn trung bình để tính toán
        const giaNhapFallback = layGiaVonTrungBinh(costMap, { productId, variantId, size });
        fifoCost = {
          tongGiaVon: qty * giaNhapFallback,
          giaNhapBinhQuan: giaNhapFallback,
          allocations: []
        };
      }

    } else {
      const giaNhapFallback = layGiaVonTrungBinh(costMap, { productId, variantId, size });
      fifoCost = {
        tongGiaVon: qty * giaNhapFallback,
        giaNhapBinhQuan: giaNhapFallback,
        allocations: []
      };
    }

    const fallbackAllocationsRaw = fifoCost.allocations && fifoCost.allocations.length
      ? fifoCost.allocations
      : [{ soLuong: qty, giaNhap: fifoCost.giaNhapBinhQuan, giaBanDeXuat: giaBanGoc }];
    const fallbackAllocations = fallbackAllocationsRaw.map((alloc) => ({
      ...alloc,
      giaBanDeXuat: giaBanGoc > 0
        ? giaBanGoc
        : toNumber(alloc?.giaBanDeXuat, 0)
    }));

    const allocationFinance = tinhTaiChinhTheoPhanBo({
      allocations: fallbackAllocations,
      fallbackGiaBan: giaBanGoc,
      fallbackPhanTramGiam: percent
    });

    lines.push({
      sanphamid: productDoc._id,
      tensanpham: item.tensanpham || productDoc.tensanpham || '',
      bientheid: variant?._id || null,
      kichco: size,
      mausac: item.mausac || variant?.mausac || productDoc.mausac_chinh || '',
      soluong: qty,
      gianhap: allocationFinance.gianhap,
      giaban: allocationFinance.giaban,
      phantramgiam: allocationFinance.phantramgiam,
      giasaugiam: allocationFinance.giasaugiam,
      doanhthu: allocationFinance.tongDoanhThu,
      giavon: allocationFinance.tongGiaVon,
      loinhuan: allocationFinance.tongLoiNhuan,
      allocations: allocationFinance.allocations,
      hinhanh: item.hinhanh || variant?.hinhanh || productDoc.hinhanh || '',
      ghichudong: ''
    });
  }

  if (!skipInventoryAdjustments) {
    for (const productDoc of productDocs) {
      productDoc.soluongton = tinhTongTon(productDoc);
      productDoc.ngaycapnhat = new Date();
      await productDoc.save();
    }
  }

  apDungVoucherDonHangChoPhieuXuat({
    lines,
    order
  });

  const totals = tinhTongSoLieu(lines);

  const receipt = new PhieuXuatKho({
    maphieu: taoMaPhieuXuat(),
    donhang_id: order._id,
    madonhang: order.madonhang || '',
    ngayxuat: new Date(),
    noinhan: order.diachigiao || '',
    lydo: note || 'Xuất kho theo đơn hàng đã xác nhận',
    ...totals,
    nguoitaophieu: 'order',
    chitiet: lines,
    nhanvienky: taoThongTinNhanVienKy(adminUser),
    nguoitao: adminUser?._id || null,
    ngaytao: new Date(),
    ngaycapnhat: new Date()
  });

  try {
    await receipt.save();
  } catch (err) {
    if (err && Number(err.code) === 11000) {
      const doc = await PhieuXuatKho.findOne({ donhang_id: order._id }).select('_id maphieu').lean();
      if (doc) {
        return { created: false, receiptId: String(doc._id), maphieu: doc.maphieu, reason: 'already_exists' };
      }
    }
    throw err;
  }

  return { created: true, receiptId: String(receipt._id), maphieu: receipt.maphieu };
}

module.exports = {
  taoPhieuXuatTuDonHang,
  tinhTaiChinhTheoDong,
  tinhTongSoLieu,
  taoBanDoGiaVonTrungBinhTheoSanPham,
  layGiaVonTrungBinh,
  xuatTonTheoLoFIFO,
  layGiaDeXuatSauKhiXuat,
  apDungGiaDeXuatChoSanPham,
  taoThongTinNhanVienKy,
  taoMaPhieuXuat,
  truTonKhoTheoDong,
  congTonKhoTheoDong,
  tinhTaiChinhTheoPhanBo
};

