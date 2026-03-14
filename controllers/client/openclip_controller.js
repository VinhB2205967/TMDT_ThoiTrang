const fs = require('fs');
const { Sanpham } = require('../../models');
const { rankProductsByImage } = require('../../services/openClip.service');

module.exports.index = async (req, res) => {
  const err = String(req.query && req.query.error ? req.query.error : '').trim();
  const errMessage = err === 'only-image'
    ? 'Chỉ hỗ trợ file ảnh (jpg, png, webp...)'
    : err === 'file-too-large'
      ? 'Ảnh quá lớn (tối đa 10MB)'
      : err === 'upload-failed'
        ? 'Upload ảnh thất bại. Vui lòng thử lại.'
        : '';

  return res.render('client/pages/openclip/index.pug', {
    titlePage: 'OpenCLIP Search - Tim san pham theo mo ta',
    queryDefault: String(req.query.q || '').trim(),
    initialProducts: [],
    initialMeta: errMessage ? { message: errMessage } : null
  });
};

module.exports.searchByImagePage = async (req, res) => {
  const uploadedPath = req.file && req.file.path ? String(req.file.path) : '';
  try {
    if (!uploadedPath) {
      return res.render('client/pages/openclip/index.pug', {
        titlePage: 'OpenCLIP Search - Tim san pham theo mo ta',
        queryDefault: '',
        initialProducts: [],
        initialMeta: { message: 'Vui lòng chọn ảnh để tìm kiếm' }
      });
    }

    const rows = await Sanpham.find({
      daxoa: { $ne: true },
      trangthai: { $in: ['active', 'dangban'] },
      hinhanh: { $exists: true, $ne: '' }
    })
      .select('_id tensanpham hinhanh gia phantramgiamgia soluongton gioitinh loaisanpham')
      .sort({ ngaycapnhat: -1, ngaytao: -1 })
      .limit(500)
      .lean();

    const products = (rows || []).map((item) => {
      const basePrice = Number(item.gia || 0);
      const percent = Number(item.phantramgiamgia || 0);
      return {
        id: String(item._id || ''),
        tensanpham: String(item.tensanpham || 'Sản phẩm'),
        imageUrl: String(item.hinhanh || '/images/shopping.png'),
        url: item._id ? `/products/${item._id}` : '',
        gia: basePrice,
        giaSauGiam: percent > 0 ? Math.round(basePrice * (1 - percent / 100)) : basePrice,
        phantramgiamgia: percent,
        openClipScore: 0
      };
    });

    const ranked = await rankProductsByImage({ imagePath: uploadedPath, products, topK: 12 });

    return res.render('client/pages/openclip/index.pug', {
      titlePage: 'OpenCLIP Search - Tim san pham theo mo ta',
      queryDefault: '',
      initialProducts: Array.isArray(ranked.matches) ? ranked.matches : [],
      initialMeta: {
        model: ranked.meta && ranked.meta.model ? ranked.meta.model : '',
        device: ranked.meta && ranked.meta.device ? ranked.meta.device : '',
        count: Array.isArray(ranked.matches) ? ranked.matches.length : 0,
        message: 'Kết quả tìm theo ảnh từ thanh tìm kiếm'
      }
    });
  } catch (error) {
    return res.render('client/pages/openclip/index.pug', {
      titlePage: 'OpenCLIP Search - Tim san pham theo mo ta',
      queryDefault: '',
      initialProducts: [],
      initialMeta: { message: `Không thể tìm theo ảnh lúc này: ${String(error && error.message ? error.message : 'Lỗi')}` }
    });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlink(uploadedPath, () => {});
    }
  }
};
