const mongoose = require('mongoose');
const Sanpham = require('../../models/product_model');
const PhieuXuatKho = require('../../models/export_receipt_model');
const { SIZE_LIST } = require('../../config/constants');
const { tinhTongTon } = require('../../services/catalog/productStock.service.js');
const {
  calcTotals,
  calcFinanceByAllocations,
  buildCostMapForProductIds,
  consumeLotsFIFO,
  resolveAvgCost,
  taoThongTinNhanVienKy,
  taoMaPhieuXuat,
  truTonKhoTheoDong,
  congTonKhoTheoDong
} = require('../../services/inventory/exportReceipt.service.js');

function normalizeItems(bodyItems) {
  if (!bodyItems) return [];
  if (Array.isArray(bodyItems)) return bodyItems;
  return [bodyItems];
}

function normalizeBienTheId(raw) {
  const v = String(raw || '').trim();
  if (!v || v === 'main') return null;
  return v;
}

async function findExportByIdOrCode(idOrCode) {
  const raw = String(idOrCode || '').trim();
  if (!raw) return null;
  if (mongoose.Types.ObjectId.isValid(raw)) {
    const doc = await PhieuXuatKho.findById(raw);
    if (doc) return doc;
  }
  return PhieuXuatKho.findOne({ maphieu: raw });
}

const danhSach = async (req, res) => {
  try {
    const receipts = await PhieuXuatKho.find({})
      .sort({ ngaytao: -1 })
      .limit(50)
      .populate('donhang_id', 'madonhang')
      .lean();

    return res.render('admin/pages/exports/index.pug', {
      titlePage: 'Phiếu xuất kho',
      receipts
    });
  } catch (error) {
    console.error('Load export receipts error:', error);
    return res.status(500).send('Không tải được danh sách phiếu xuất');
  }
};

const taoMoi = async (req, res) => {
  try {
    const products = await Sanpham.find({ daxoa: { $ne: true } })
      .sort({ ngaytao: -1 })
      .select('_id tensanpham loaisanpham gia mausac_chinh hinhanh bienthe sizes soluong_chinh')
      .lean();

    return res.render('admin/pages/exports/create.pug', {
      titlePage: 'Tạo phiếu xuất kho',
      maPhieu: taoMaPhieuXuat(),
      products,
      sizeList: SIZE_LIST
    });
  } catch (error) {
    console.error('Create export receipt page error:', error);
    return res.status(500).send('Không thể tải trang xuất kho');
  }
};

const taoMoiPost = async (req, res) => {
  try {
    const maphieu = String(req.body.maphieu || '').trim() || taoMaPhieuXuat();
    const ngayxuat = req.body.ngayxuat ? new Date(req.body.ngayxuat) : new Date();
    const noinhan = String(req.body.noinhan || '').trim();
    const lydo = String(req.body.lydo || '').trim();

    const itemsRaw = normalizeItems(req.body.chitiet || req.body.items);
    if (!itemsRaw.length) {
      req.flash('error', 'Vui lòng thêm ít nhất 1 dòng xuất kho');
      return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/exports/create'));
    }

    const existedCode = await PhieuXuatKho.findOne({ maphieu }).select('_id').lean();
    if (existedCode) {
      req.flash('error', 'Mã phiếu xuất đã tồn tại, vui lòng thử lại');
      return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/exports/create'));
    }

    const normalizedItems = [];
    for (const raw of itemsRaw) {
      const productId = String(raw.sanphamid || '').trim();
      if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Sản phẩm không hợp lệ');

      const qty = Number(raw.soluong || 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Số lượng xuất phải > 0');

      normalizedItems.push({
        sanphamid: productId,
        tensanpham: String(raw.tensanpham || '').trim(),
        bientheid: normalizeBienTheId(raw.bientheid),
        kichco: String(raw.kichco || '').trim(),
        mausac: String(raw.mausac || '').trim(),
        soluong: qty,
        hinhanh: String(raw.hinhanh || '').trim(),
        ghichudong: String(raw.ghichudong || '').trim()
      });
    }

    const productIds = Array.from(new Set(normalizedItems.map((it) => String(it.sanphamid)).filter((id) => mongoose.Types.ObjectId.isValid(id))));
    const costMap = await buildCostMapForProductIds(productIds);

    for (const it of normalizedItems) {
      const productDoc = await Sanpham.findById(it.sanphamid);
      if (!productDoc) throw new Error('Sản phẩm không tồn tại');
      const variantId = it.bientheid ? String(it.bientheid) : null;
      const variant = variantId
        ? (productDoc.bienthe || []).find((v) => String(v._id) === variantId)
        : null;

      if (!it.tensanpham) it.tensanpham = productDoc.tensanpham || '';
      if (!it.mausac) {
        it.mausac = !it.bientheid ? (productDoc.mausac_chinh || '') : (variant?.mausac || '');
      }
      if (!it.hinhanh) {
        it.hinhanh = !it.bientheid
          ? String(productDoc.hinhanh || '')
          : String(variant?.hinhanh || productDoc.hinhanh || '');
      }

      const giaBan = variant ? Number(variant.gia || productDoc.gia || 0) : Number(productDoc.gia || 0);
      const phanTramGiam = variant
        ? Number(variant.phantramgiamgia ?? productDoc.phantramgiamgia ?? 0)
        : Number(productDoc.phantramgiamgia || 0);
      let fifoCost;
      try {
        fifoCost = await consumeLotsFIFO({
          productId: it.sanphamid,
          variantId,
          size: it.kichco,
          qty: it.soluong
        });
      } catch (fifoErr) {
        const giaNhapFallback = resolveAvgCost(costMap, {
          productId: it.sanphamid,
          variantId,
          size: it.kichco
        });
        fifoCost = {
          tongGiaVon: Number(it.soluong || 0) * giaNhapFallback,
          giaNhapBinhQuan: giaNhapFallback
        };
      }

      congTonKhoTheoDong(productDoc, {
        variantId,
        size: it.kichco,
        qty: it.soluong
      });

      productDoc.soluongton = tinhTongTon(productDoc);
      productDoc.ngaycapnhat = new Date();
      await productDoc.save();

      const fallbackAllocations = fifoCost.allocations && fifoCost.allocations.length
        ? fifoCost.allocations
        : [{ soLuong: Number(it.soluong || 0), giaNhap: fifoCost.giaNhapBinhQuan, giaBanDeXuat: giaBan }];

      const allocationFinance = calcFinanceByAllocations({
        allocations: fallbackAllocations,
        fallbackGiaBan: giaBan,
        fallbackPhanTramGiam: phanTramGiam
      });

      const avgGiaBan = allocationFinance.giaban;
      const avgGiaSauGiam = allocationFinance.giasaugiam;
      const avgPhanTram = avgGiaBan > 0
        ? Math.max(0, Number((((avgGiaBan - avgGiaSauGiam) / avgGiaBan) * 100).toFixed(2)))
        : 0;

      it.gianhap = allocationFinance.gianhap;
      it.giaban = avgGiaBan;
      it.phantramgiam = avgPhanTram;
      it.giasaugiam = avgGiaSauGiam;
      it.doanhthu = allocationFinance.tongDoanhThu;
      it.giavon = allocationFinance.tongGiaVon;
      it.loinhuan = allocationFinance.tongLoiNhuan;
      it.allocations = allocationFinance.allocations;
    }

    const totals = calcTotals(normalizedItems);

    const receipt = new PhieuXuatKho({
      maphieu,
      ngayxuat,
      noinhan,
      lydo,
      ...totals,
      nguoitaophieu: 'manual',
      chitiet: normalizedItems,
      nhanvienky: taoThongTinNhanVienKy(req.adminUser || req.user),
      nguoitao: req.adminUser?._id || req.user?._id || null,
      ngaytao: new Date(),
      ngaycapnhat: new Date()
    });

    await receipt.save();

    req.flash('success', 'Tạo phiếu xuất thành công và đã cập nhật tồn sản phẩm');
    return res.redirect(req.app.locals.admin + '/exports/' + receipt._id);
  } catch (error) {
    console.error('Create export receipt error:', error);
    req.flash('error', 'Không thể tạo phiếu xuất: ' + error.message);
    return res.redirect(req.get('Referrer') || (req.app.locals.admin + '/exports/create'));
  }
};

const chiTiet = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const receiptDoc = await findExportByIdOrCode(id);
    if (!receiptDoc) return res.status(404).send('Không tìm thấy phiếu xuất');

    if (receiptDoc.nguoitao) {
      await receiptDoc.populate({ path: 'nguoitao', select: 'hoten email avatar' });
    }
    if (receiptDoc.donhang_id) {
      await receiptDoc.populate({ path: 'donhang_id', select: 'madonhang' });
    }

    const receipt = receiptDoc.toObject();
    const nhanVienKy = {
      tennhanvien: receipt?.nhanvienky?.tennhanvien || receipt?.nguoitao?.hoten || receipt?.nguoitao?.email || '',
      idnhanvien: receipt?.nhanvienky?.idnhanvien || (receipt?.nguoitao?._id ? String(receipt.nguoitao._id) : ''),
      anhchuky: receipt?.nhanvienky?.anhchuky || receipt?.nguoitao?.avatar || '',
      thoigianky: receipt?.nhanvienky?.thoigianky || receipt?.ngaytao || null
    };

    return res.render('admin/pages/exports/show.pug', {
      titlePage: 'Chi tiết phiếu xuất',
      receipt,
      nhanVienKy
    });
  } catch (error) {
    console.error('Export receipt detail error:', error);
    return res.status(500).send('Không tải được chi tiết phiếu xuất');
  }
};

module.exports = {
  danhSach,
  taoMoi,
  taoMoiPost,
  chiTiet
};
