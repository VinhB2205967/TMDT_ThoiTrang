const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const nguoidung = require('../../models/user_model');
const { chuanHoaSoDienThoai, laSoDienThoaiVN, laUrlAnhAnToan } = require('../../helpers/validators');

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
  const taikhoan = req.user;
  res.render('client/pages/account/index.pug', {
    titlePage: 'Thông tin tài khoản',
    profile: {
      hoten: taikhoan?.hoten || '',
      email: taikhoan?.email || '',
      sodienthoai: taikhoan?.sodienthoai || '',
      diachi: taikhoan?.diachi || '',
      gioitinh: taikhoan?.gioitinh || '',
      ngaysinh: dinhDangNgayInput(taikhoan?.ngaysinh),
      avatar: taikhoan?.avatar || ''
    },
    hasPassword: Boolean(taikhoan?.matkhau)
  });
};

// Cập nhật hồ sơ
module.exports.capNhatHoSo = async (req, res) => {
  try {
    const idnguoidung = req.user && req.user._id ? String(req.user._id) : null;
    if (!idnguoidung) return res.redirect('/auth?mode=login');

    const hoten = chuanHoaChuoi(req.body.hoten);
    const sdtraw = chuanHoaChuoi(req.body.sodienthoai);
    if (sdtraw && !laSoDienThoaiVN(sdtraw)) {
      req.flash?.('error', 'Số điện thoại không đúng định dạng');
      return res.redirect('/account');
    }
    const sodienthoai = sdtraw ? chuanHoaSoDienThoai(sdtraw) : '';
    const diachi = chuanHoaChuoi(req.body.diachi);
    const gioitinh = chuanHoaChuoi(req.body.gioitinh);
    const avatarurl = chuanHoaChuoi(req.body.avatarUrl || req.body.avatar);

    if (avatarurl && !laUrlAnhAnToan(avatarurl)) {
      req.flash?.('error', 'Avatar URL không hợp lệ');
      return res.redirect('/account');
    }

    let ngaysinh = null;
    if (req.body.ngaysinh) {
      const ngayparsed = new Date(req.body.ngaysinh);
      if (!Number.isNaN(ngayparsed.getTime())) ngaysinh = ngayparsed;
    }

    let avatar = '';
    if (req.file && req.file.filename) {
      avatar = `/uploads/avatars/${req.file.filename}`;

      // Xóa ảnh cũ
      const avatarcu = String(req.user?.avatar || '');
      if (avatarcu.startsWith('/uploads/avatars/')) {
        const tencu = path.basename(avatarcu);
        const duongdancu = path.join(process.cwd(), 'public', 'uploads', 'avatars', tencu);
        fs.promises.unlink(duongdancu).catch(() => {});
      }
    }

    if (!avatar && avatarurl) avatar = avatarurl;

    const $set = {
      hoten,
      sodienthoai,
      diachi,
      gioitinh,
      ngaysinh,
      ngaycapnhat: new Date()
    };

    // Chỉ cập nhật khi có avatar
    if (avatar) $set.avatar = avatar;

    await nguoidung.updateOne(
      { _id: idnguoidung, daxoa: { $ne: true } },
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
    const idnguoidung = req.user && req.user._id ? String(req.user._id) : null;
    if (!idnguoidung) return res.redirect('/auth?mode=login');

    const matkhaucu = String(req.body.oldPassword || '');
    const matkhaumoi = String(req.body.newPassword || '');
    const xacnhanmatkhau = String(req.body.confirmPassword || '');

    const loimatkhau = kiemTraMatKhauMoi(matkhaumoi);
    if (loimatkhau) {
      req.flash?.('error', loimatkhau);
      return res.redirect('/account');
    }

    if (matkhaumoi !== xacnhanmatkhau) {
      req.flash?.('error', 'Xác nhận mật khẩu không khớp');
      return res.redirect('/account');
    }

    const taikhoan = await nguoidung.findOne({ _id: idnguoidung, daxoa: { $ne: true } });
    if (!taikhoan) {
      req.flash?.('error', 'Không tìm thấy tài khoản');
      return res.redirect('/auth?mode=login');
    }

    if (taikhoan.matkhau) {
      const hople = await bcrypt.compare(matkhaucu, taikhoan.matkhau);
      if (!hople) {
        req.flash?.('error', 'Mật khẩu hiện tại không đúng');
        return res.redirect('/account');
      }
    }

    const matkhaumahoa = await bcrypt.hash(matkhaumoi, 10);
    await nguoidung.updateOne(
      { _id: idnguoidung, daxoa: { $ne: true } },
      { $set: { matkhau: matkhaumahoa, ngaycapnhat: new Date() } }
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
    const idnguoidung = req.user && req.user._id ? String(req.user._id) : null;
    if (!idnguoidung) return res.redirect('/auth?mode=login');

    await nguoidung.updateOne(
      { _id: idnguoidung, daxoa: { $ne: true } },
      { $set: { daxoa: true, trangthai: 'noactive', ngaycapnhat: new Date() } }
    );

    // Offline ngay
    const onlinewindowms = 5 * 60 * 1000;
    const thoidiemoffline = new Date(Date.now() - onlinewindowms - 1000);
    nguoidung.updateOne(
      { _id: idnguoidung },
      { $set: { lastSeenAt: thoidiemoffline } }
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
