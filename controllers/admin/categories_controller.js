const categoriesService = require('../../services/catalog/admin-categories.service.js');

function muonJSON(req) {
  const accept = String(req.get('accept') || '').toLowerCase();
  return req.xhr || accept.includes('application/json') || String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
}

function redirectVeDanhMuc(req, res) {
  const referer = String(req.get('referer') || '').trim();
  if (referer && referer !== 'back' && !/\/back([/?#]|$)/i.test(referer)) {
    return res.redirect(referer);
  }
  return res.redirect('/admin/categories');
}

module.exports.danhSach = async (req, res) => {
  const viewData = await categoriesService.getDanhSachData(req.query || {});
  res.render('admin/pages/categories/index.pug', viewData);
};

module.exports.taoMoi = async (req, res) => {
  try {
    const result = await categoriesService.taoDanhMuc(req.body || {});
    if (!result.ok) {
      if (muonJSON(req)) return res.status(result.status || 400).json({ success: false, message: result.message });
      req.flash('error', result.message);
      return redirectVeDanhMuc(req, res);
    }

    if (muonJSON(req)) return res.json({ success: true, data: result.data, message: result.message });
    req.flash('success', result.message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể tạo danh mục: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.capNhat = async (req, res) => {
  try {
    const result = await categoriesService.capNhatDanhMuc(req.params.id, req.body || {});
    if (!result.ok) {
      if (muonJSON(req)) return res.status(result.status || 400).json({ success: false, message: result.message });
      req.flash('error', result.message);
      return redirectVeDanhMuc(req, res);
    }

    if (muonJSON(req)) return res.json({ success: true, message: result.message });
    req.flash('success', result.message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể cập nhật danh mục: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.xoa = async (req, res) => {
  try {
    const result = await categoriesService.xoaDanhMuc(req.params.id);
    if (!result.ok) {
      if (muonJSON(req)) return res.status(result.status || 400).json({ success: false, message: result.message });
      req.flash('error', result.message);
      return redirectVeDanhMuc(req, res);
    }

    if (muonJSON(req)) return res.json({ success: true, message: result.message });
    req.flash('success', result.message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể xóa danh mục: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.doiTrangThai = async (req, res) => {
  try {
    const result = await categoriesService.doiTrangThaiDanhMuc(req.params.id);
    if (!result.ok) {
      if (muonJSON(req)) return res.status(result.status || 400).json({ success: false, message: result.message });
      req.flash('error', result.message);
      return redirectVeDanhMuc(req, res);
    }

    if (muonJSON(req)) return res.json({ success: true, message: result.message, ...result.data });
    req.flash('success', result.message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    const message = `Không thể cập nhật trạng thái: ${error.message}`;
    if (muonJSON(req)) return res.status(400).json({ success: false, message });
    req.flash('error', message);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.sapXep = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const result = await categoriesService.sapXepDanhMuc(items);
    if (!result.ok) {
      req.flash('error', result.message);
      return redirectVeDanhMuc(req, res);
    }

    req.flash('success', result.message);
    return redirectVeDanhMuc(req, res);
  } catch (error) {
    req.flash('error', `Không thể sắp xếp danh mục: ${error.message}`);
    return redirectVeDanhMuc(req, res);
  }
};

module.exports.treeJson = async (req, res) => {
  const result = await categoriesService.getTreeJsonData(req.query || {});
  res.status(result.status || 200).json({ success: result.ok, data: result.data || [] });
};
