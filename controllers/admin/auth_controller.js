const systemConfig = require('../../config/system');
const {
  xacThucDangNhapAdmin,
  luuSessionAdmin,
  danhDauOfflineAdmin,
  xoaSessionAdmin
} = require('../../services/auth/admin-auth.service');

// Đăng nhập
module.exports.trangDangNhap = (req, res) => {
  // nếu đăng nhập => admin
  if (req.session?.adminUserId) return res.redirect(systemConfig.prefigAdmin);

  res.render('admin/pages/auth/login.pug', {
    titlePage: 'Đăng nhập Admin'
  });
};

// Đăng nhập
module.exports.dangNhap = async (req, res) => {
  try {
    const ketqua = await xacThucDangNhapAdmin({
      req,
      email: req.body.email,
      password: req.body.password
    });

    if (!ketqua.ok) {
      req.flash('error', ketqua.message);
      return res.redirect(`${systemConfig.prefigAdmin}/login`);
    }

    luuSessionAdmin(req, ketqua.user);
    req.flash('success', ketqua.message);
    return res.redirect(systemConfig.prefigAdmin);
  } catch (err) {
    console.error('Admin login error:', err);
    req.flash('error', 'Có lỗi khi đăng nhập Admin');
    return res.redirect(`${systemConfig.prefigAdmin}/login`);
  }
};

// Đăng xuất
module.exports.dangXuat = async (req, res) => {
  const idadmin = req.session && req.session.adminUserId;

  await danhDauOfflineAdmin({ userId: idadmin });
  xoaSessionAdmin(req);
  return res.redirect(`${systemConfig.prefigAdmin}/login`);
};
