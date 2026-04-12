const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
	nguoidung_id: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Nguoidung',
		required: true,
		unique: true,
		index: true
	},
	email: {
		type: String,
		alias: 'thu_dien_tu',
		required: true,
		unique: true,
		index: true
	},
	// Mật khẩu local (bcrypt hash). Có thể null nếu tài khoản chỉ đăng nhập Google.
	matkhau: {
		type: String,
		default: null
	},
	provider: {
		type: String,
		alias: 'phuongthucdangnhap',
		default: 'local'
	},
	vaitro: {
		type: String,
		default: 'user'
	},
	trangthai: {
		type: String,
		enum: ['active', 'noactive'],
		default: 'active'
	},
	xacthuc: {
		type: Boolean,
		default: false
	},
	tokenxacthuc: String,
	tokenquenmatkhau: String,
	thoigianhethan: Date,
	ngaytao: {
		type: Date,
		default: Date.now
	},
	ngaycapnhat: Date
});

const Taikhoan = mongoose.model('Taikhoan', accountSchema, 'accounts');
module.exports = Taikhoan;
