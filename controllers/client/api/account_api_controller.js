const nguoidung = require('../../../models/user_model');
const {
  chuanHoaSoDienThoai,
  laSoDienThoaiVN,
  laUrlAnhAnToan
} = require('../../../helpers/validators');
const {
  hasLocalPassword,
  verifyPasswordWithLegacy,
  setPasswordByUserId,
  getAccountByUserId
} = require('../../../services/account.service');

function chuanHoaChuoi(value) {
  return String(value || '').trim();
}

function kiemTraMatKhauMoi(password) {
  if (String(password || '').length < 6) {
    return 'Mật khẩu phải tối thiểu 6 ký tự';
  }
  return null;
}

module.exports.getProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });

    let coMatKhau = false;
    let loaiTaiKhoan = 'local';

    const account = await getAccountByUserId({ userId: user._id }).catch(() => null);
    if (account && account.provider) loaiTaiKhoan = String(account.provider);
    coMatKhau = await hasLocalPassword({ userId: user._id });

    return res.json({
      success: true,
      data: {
        profile: {
          hoten: user.hoten || '',
          email: user.email || '',
          sodienthoai: user.sodienthoai || '',
          diachi: user.diachi || '',
          gioitinh: user.gioitinh || '',
          ngaysinh: user.ngaysinh || '',
          avatar: user.avatar || ''
        },
        hasPassword: coMatKhau,
        canChangePassword: loaiTaiKhoan !== 'google'
      }
    });
  } catch (err) {
    console.error('accountApi.getProfile error:', err);
    return res.status(500).json({ success: false, message: 'Loi server' });
  }
};

module.exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? String(req.user._id) : null;
    if (!userId) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });

    const hoten = chuanHoaChuoi(req.body.hoten);
    const sdtraw = chuanHoaChuoi(req.body.sodienthoai);
    if (sdtraw && !laSoDienThoaiVN(sdtraw)) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
    }

    const sodienthoai = sdtraw ? chuanHoaSoDienThoai(sdtraw) : '';
    const diachi = chuanHoaChuoi(req.body.diachi);
    const gioitinh = chuanHoaChuoi(req.body.gioitinh);
    const avatar = chuanHoaChuoi(req.body.avatar);

    if (avatar && !laUrlAnhAnToan(avatar)) {
      return res.status(400).json({ success: false, message: 'Avatar không hợp lệ' });
    }

    let ngaysinh = null;
    if (req.body.ngaysinh) {
      const date = new Date(req.body.ngaysinh);
      if (!Number.isNaN(date.getTime())) ngaysinh = date;
    }

    const $set = {
      hoten,
      sodienthoai,
      diachi,
      gioitinh,
      ngaysinh,
      ngaycapnhat: new Date()
    };
    if (avatar) $set.avatar = avatar;

    await nguoidung.updateOne({ _id: userId, daxoa: { $ne: true } }, { $set });

    const userMoi = await nguoidung.findOne({ _id: userId, daxoa: { $ne: true } }).lean();
    return res.json({
      success: true,
      message: 'Cap nhat thanh cong',
      data: {
        profile: {
          hoten: userMoi && userMoi.hoten ? userMoi.hoten : '',
          email: userMoi && userMoi.email ? userMoi.email : '',
          sodienthoai: userMoi && userMoi.sodienthoai ? userMoi.sodienthoai : '',
          diachi: userMoi && userMoi.diachi ? userMoi.diachi : '',
          gioitinh: userMoi && userMoi.gioitinh ? userMoi.gioitinh : '',
          ngaysinh: userMoi && userMoi.ngaysinh ? userMoi.ngaysinh : '',
          avatar: userMoi && userMoi.avatar ? userMoi.avatar : ''
        }
      }
    });
  } catch (err) {
    console.error('accountApi.updateProfile error:', err);
    return res.status(500).json({ success: false, message: 'Không thể cập nhật' });
  }
};

module.exports.changePassword = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? String(req.user._id) : null;
    if (!userId) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });

    const account = await getAccountByUserId({ userId }).catch(() => null);
    if (account && String(account.provider || '') === 'google') {
      return res.status(400).json({ success: false, message: 'Tài khoản Google không hỗ trợ đổi mật khẩu tại đây' });
    }

    const oldPassword = String(req.body.oldPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    const errMsg = kiemTraMatKhauMoi(newPassword);
    if (errMsg) return res.status(400).json({ success: false, message: errMsg });
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Mật khẩu xác nhận không khớp' });
    }

    const user = await nguoidung.findOne({ _id: userId, daxoa: { $ne: true } });
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });

    const daCoMatKhau = await hasLocalPassword({ userId }) || Boolean(user.matkhau);
    if (daCoMatKhau) {
      const valid = await verifyPasswordWithLegacy({ userDoc: user, passwordPlain: oldPassword });
      if (!valid) return res.status(400).json({ success: false, message: 'Mật khẩu cũ không đúng' });
    }

    await setPasswordByUserId({ userId, newPasswordPlain: newPassword });
    await nguoidung.updateOne({ _id: userId, daxoa: { $ne: true } }, { $set: { ngaycapnhat: new Date() } });

    return res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error('accountApi.changePassword error:', err);
    return res.status(500).json({ success: false, message: 'Không thể đổi mật khẩu' });
  }
};

module.exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? String(req.user._id) : null;
    if (!userId) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });

    await nguoidung.updateOne(
      { _id: userId, daxoa: { $ne: true } },
      { $set: { daxoa: true, trangthai: 'noactive', ngaycapnhat: new Date() } }
    );

    try {
      req.logout(() => {});
    } catch {}

    return res.json({ success: true, message: 'Da xoa tai khoan' });
  } catch (err) {
    console.error('accountApi.deleteAccount error:', err);
    return res.status(500).json({ success: false, message: 'Không thể xóa tài khoản' });
  }
};


