const systemConfig = require('../../../config/system');
const {
  xacThucDangNhapAdmin,
  luuSessionAdmin,
  danhDauOfflineAdmin,
  xoaSessionAdmin
} = require('../../../services/auth/admin-auth.service');
const { traJsonThanhCong, traJsonThatBai } = require('../../../services/communication/hybrid-response.service');

module.exports.trangThai = (req, res) => {
  if (req.session?.adminUserId) {
    return traJsonThanhCong(res, {
      message: 'Đã đăng nhập',
      data: {
        authenticated: true,
        adminUserId: req.session.adminUserId,
        redirectTo: systemConfig.prefigAdmin
      }
    });
  }

  return traJsonThanhCong(res, {
    message: 'Chưa đăng nhập',
    data: {
      authenticated: false,
      loginPath: `${systemConfig.prefigAdmin}/api/auth/login`
    }
  });
};

module.exports.dangNhap = async (req, res) => {
  try {
    const ketqua = await xacThucDangNhapAdmin({
      req,
      email: req.body.email,
      password: req.body.password
    });

    if (!ketqua.ok) {
      return traJsonThatBai(res, {
        status: ketqua.status || 400,
        code: ketqua.code,
        message: ketqua.message
      });
    }

    luuSessionAdmin(req, ketqua.user);
    return traJsonThanhCong(res, {
      message: ketqua.message,
      data: {
        redirectTo: systemConfig.prefigAdmin,
        adminUserId: String(ketqua.user._id)
      }
    });
  } catch (error) {
    console.error('Admin API login error:', error);
    return traJsonThatBai(res, {
      status: 500,
      code: 'LOGIN_ERROR',
      message: 'Có lỗi khi đăng nhập Admin'
    });
  }
};

module.exports.dangXuat = async (req, res) => {
  const idadmin = req.session && req.session.adminUserId;
  await danhDauOfflineAdmin({ userId: idadmin });
  xoaSessionAdmin(req);

  return traJsonThanhCong(res, {
    message: 'Đăng xuất thành công',
    data: {
      redirectTo: `${systemConfig.prefigAdmin}/login`
    }
  });
};
