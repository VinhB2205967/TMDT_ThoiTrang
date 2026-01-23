const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const Nguoidung = require('../../models/user_model');
const { normalizePhone, isValidPhoneVN, isSafeImageUrl } = require('../../helpers/validators');

function chuanHoaChuoi(value) {
  return String(value || '').trim();
}

function dinhDangNgayInput(d) {
  try {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

function kiemTraMatKhauMoi(password) {
  const p = String(password || '');
  if (p.length < 6) return 'Mật khẩu phải tối thiểu 6 ký tự';
  return null;
}

// Thông tin
module.exports.trang = async (req, res) => {
  const nguoiDung = req.user;
  res.render('client/pages/account/index.pug', {
    titlePage: 'Thông tin tài khoản',
    profile: {
      hoten: nguoiDung?.hoten || '',
      email: nguoiDung?.email || '',
      sodienthoai: nguoiDung?.sodienthoai || '',
      diachi: nguoiDung?.diachi || '',
      gioitinh: nguoiDung?.gioitinh || '',
      ngaysinh: dinhDangNgayInput(nguoiDung?.ngaysinh),
      avatar: nguoiDung?.avatar || ''
    },
    hasPassword: Boolean(nguoiDung?.matkhau)
  });
};

// Cập nhật hồ sơ
module.exports.capNhatHoSo = async (req, res) => {
  try {
    const idNguoiDung = req.user && req.user._id ? String(req.user._id) : null;
    if (!idNguoiDung) return res.redirect('/auth?mode=login');

    const hoTen = chuanHoaChuoi(req.body.hoten);
    const sdtRaw = chuanHoaChuoi(req.body.sodienthoai);
    if (sdtRaw && !isValidPhoneVN(sdtRaw)) {
      req.flash?.('error', 'Số điện thoại không đúng định dạng');
      return res.redirect('/account');
    }
    const sodienthoai = sdtRaw ? normalizePhone(sdtRaw) : '';
    const diachi = chuanHoaChuoi(req.body.diachi);
    const gioitinh = chuanHoaChuoi(req.body.gioitinh);
    const avatarUrl = chuanHoaChuoi(req.body.avatarUrl || req.body.avatar);

    if (avatarUrl && !isSafeImageUrl(avatarUrl)) {
      req.flash?.('error', 'Avatar URL không hợp lệ');
      return res.redirect('/account');
    }

    let ngaySinh = null;
    if (req.body.ngaysinh) {
      const ngayParsed = new Date(req.body.ngaysinh);
      if (!Number.isNaN(ngayParsed.getTime())) ngaySinh = ngayParsed;
    }

    let avatar = '';
    if (req.file && req.file.filename) {
      avatar = `/uploads/avatars/${req.file.filename}`;

      // Xóa ảnh cũ
      const avatarCu = String(req.user?.avatar || '');
      if (avatarCu.startsWith('/uploads/avatars/')) {
        const tenCu = path.basename(avatarCu);
        const duongDanCu = path.join(process.cwd(), 'public', 'uploads', 'avatars', tenCu);
        fs.promises.unlink(duongDanCu).catch(() => {});
      }
    }

    if (!avatar && avatarUrl) avatar = avatarUrl;

    const $set = {
      hoten: hoTen,
      sodienthoai,
      diachi,
      gioitinh,
      ngaysinh: ngaySinh,
      ngaycapnhat: new Date()
    };

    // Chỉ cập nhật khi có avatar
    if (avatar) $set.avatar = avatar;

    await Nguoidung.updateOne(
      { _id: idNguoiDung, daxoa: { $ne: true } },
      {
        $set
      }
    );

    req.flash?.('success', 'Cập nhật thông tin thành công');
    return res.redirect('/account');
  } catch (err) {
    console.error('updateProfile error:', err);
    req.flash?.('error', 'Không thể cập nhật thông tin');
    return res.redirect('/account');
  }
};

// Đổi mật khẩu
module.exports.doiMatKhau = async (req, res) => {
  try {
    const idNguoiDung = req.user && req.user._id ? String(req.user._id) : null;
    if (!idNguoiDung) return res.redirect('/auth?mode=login');

    const matKhauCu = String(req.body.oldPassword || '');
    const matKhauMoi = String(req.body.newPassword || '');
    const xacNhanMatKhau = String(req.body.confirmPassword || '');

    const loiMatKhau = kiemTraMatKhauMoi(matKhauMoi);
    if (loiMatKhau) {
      req.flash?.('error', loiMatKhau);
      return res.redirect('/account');
    }

    if (matKhauMoi !== xacNhanMatKhau) {
      req.flash?.('error', 'Xác nhận mật khẩu không khớp');
      return res.redirect('/account');
    }

    const nguoiDung = await Nguoidung.findOne({ _id: idNguoiDung, daxoa: { $ne: true } });
    if (!nguoiDung) {
      req.flash?.('error', 'Không tìm thấy tài khoản');
      return res.redirect('/auth?mode=login');
    }

    if (nguoiDung.matkhau) {
      const hopLe = await bcrypt.compare(matKhauCu, nguoiDung.matkhau);
      if (!hopLe) {
        req.flash?.('error', 'Mật khẩu hiện tại không đúng');
        return res.redirect('/account');
      }
    }

    const matKhauMaHoa = await bcrypt.hash(matKhauMoi, 10);
    await Nguoidung.updateOne(
      { _id: idNguoiDung, daxoa: { $ne: true } },
      { $set: { matkhau: matKhauMaHoa, ngaycapnhat: new Date() } }
    );

    req.flash?.('success', 'Đổi mật khẩu thành công');
    return res.redirect('/account');
  } catch (err) {
    console.error('changePassword error:', err);
    req.flash?.('error', 'Không thể đổi mật khẩu');
    return res.redirect('/account');
  }
};

// Xóa tài khoản
module.exports.xoaTaiKhoan = async (req, res) => {
  try {
    const idNguoiDung = req.user && req.user._id ? String(req.user._id) : null;
    if (!idNguoiDung) return res.redirect('/auth?mode=login');

    await Nguoidung.updateOne(
      { _id: idNguoiDung, daxoa: { $ne: true } },
      { $set: { daxoa: true, trangthai: 'noactive', ngaycapnhat: new Date() } }
    );

    // Offline ngay
    const ONLINE_WINDOW_MS = 5 * 60 * 1000;
    const thoiDiemOffline = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
    Nguoidung.updateOne(
      { _id: idNguoiDung },
      { $set: { lastSeenAt: thoiDiemOffline } }
    ).catch(() => {});

    try {
      req.logout(() => {});
    } catch {}

    req.flash?.('success', 'Đã xóa tài khoản');
    return res.redirect('/');
  } catch (err) {
    console.error('deleteAccount error:', err);
    req.flash?.('error', 'Không thể xóa tài khoản');
    return res.redirect('/account');
  }
};
