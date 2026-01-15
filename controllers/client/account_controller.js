const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const Nguoidung = require('../../models/user_model');
const { normalizePhone, isValidPhoneVN, isSafeImageUrl } = require('../../helpers/validators');

function normalizeString(value) {
  return String(value || '').trim();
}

function toDateInputValue(d) {
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

function validateNewPassword(password) {
  const p = String(password || '');
  if (p.length < 6) return 'Mật khẩu phải tối thiểu 6 ký tự';
  return null;
}

// GET /account
module.exports.page = async (req, res) => {
  const user = req.user;
  res.render('client/pages/account/index.pug', {
    titlePage: 'Thông tin tài khoản',
    profile: {
      hoten: user?.hoten || '',
      email: user?.email || '',
      sodienthoai: user?.sodienthoai || '',
      diachi: user?.diachi || '',
      gioitinh: user?.gioitinh || '',
      ngaysinh: toDateInputValue(user?.ngaysinh),
      avatar: user?.avatar || ''
    },
    hasPassword: Boolean(user?.matkhau)
  });
};

// POST /account/profile
module.exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? String(req.user._id) : null;
    if (!userId) return res.redirect('/auth?mode=login');

    const hoten = normalizeString(req.body.hoten);
    const rawPhone = normalizeString(req.body.sodienthoai);
    if (rawPhone && !isValidPhoneVN(rawPhone)) {
      req.flash?.('error', 'Số điện thoại không đúng định dạng');
      return res.redirect('/account');
    }
    const sodienthoai = rawPhone ? normalizePhone(rawPhone) : '';
    const diachi = normalizeString(req.body.diachi);
    const gioitinh = normalizeString(req.body.gioitinh);
    const avatarUrl = normalizeString(req.body.avatarUrl || req.body.avatar);

    if (avatarUrl && !isSafeImageUrl(avatarUrl)) {
      req.flash?.('error', 'Avatar URL không hợp lệ');
      return res.redirect('/account');
    }

    let ngaysinh = null;
    if (req.body.ngaysinh) {
      const parsed = new Date(req.body.ngaysinh);
      if (!Number.isNaN(parsed.getTime())) ngaysinh = parsed;
    }

    let avatar = '';
    if (req.file && req.file.filename) {
      avatar = `/uploads/avatars/${req.file.filename}`;

      // Best-effort delete old avatar file if it was also an uploaded avatar
      const oldAvatar = String(req.user?.avatar || '');
      if (oldAvatar.startsWith('/uploads/avatars/')) {
        const oldName = path.basename(oldAvatar);
        const oldPath = path.join(process.cwd(), 'public', 'uploads', 'avatars', oldName);
        fs.promises.unlink(oldPath).catch(() => {});
      }
    }

    if (!avatar && avatarUrl) avatar = avatarUrl;

    const $set = {
      hoten,
      sodienthoai,
      diachi,
      gioitinh,
      ngaysinh,
      ngaycapnhat: new Date()
    };

    // Only update avatar if user provided a file or a URL (avoid wiping existing avatar)
    if (avatar) $set.avatar = avatar;

    await Nguoidung.updateOne(
      { _id: userId, daxoa: { $ne: true } },
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

// POST /account/password
module.exports.changePassword = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? String(req.user._id) : null;
    if (!userId) return res.redirect('/auth?mode=login');

    const oldPassword = String(req.body.oldPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    const pwError = validateNewPassword(newPassword);
    if (pwError) {
      req.flash?.('error', pwError);
      return res.redirect('/account');
    }

    if (newPassword !== confirmPassword) {
      req.flash?.('error', 'Xác nhận mật khẩu không khớp');
      return res.redirect('/account');
    }

    const user = await Nguoidung.findOne({ _id: userId, daxoa: { $ne: true } });
    if (!user) {
      req.flash?.('error', 'Không tìm thấy tài khoản');
      return res.redirect('/auth?mode=login');
    }

    if (user.matkhau) {
      const ok = await bcrypt.compare(oldPassword, user.matkhau);
      if (!ok) {
        req.flash?.('error', 'Mật khẩu hiện tại không đúng');
        return res.redirect('/account');
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await Nguoidung.updateOne(
      { _id: userId, daxoa: { $ne: true } },
      { $set: { matkhau: hashed, ngaycapnhat: new Date() } }
    );

    req.flash?.('success', 'Đổi mật khẩu thành công');
    return res.redirect('/account');
  } catch (err) {
    console.error('changePassword error:', err);
    req.flash?.('error', 'Không thể đổi mật khẩu');
    return res.redirect('/account');
  }
};

// POST /account/delete
module.exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? String(req.user._id) : null;
    if (!userId) return res.redirect('/auth?mode=login');

    await Nguoidung.updateOne(
      { _id: userId, daxoa: { $ne: true } },
      { $set: { daxoa: true, trangthai: 'noactive', ngaycapnhat: new Date() } }
    );

    // Mark offline immediately
    const ONLINE_WINDOW_MS = 5 * 60 * 1000;
    const offlineAt = new Date(Date.now() - ONLINE_WINDOW_MS - 1000);
    Nguoidung.updateOne(
      { _id: userId },
      { $set: { lastSeenAt: offlineAt } }
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
