// Export tất cả models
const Sanpham = require('./product_model');
const Nguoidung = require('./user_model');
const Danhmuc = require('./category_model');
const Giohang = require('./cart_model');
const Donhang = require('./order_model');
const Chitietdonhang = require('./order_item_model');
const Thanhtoan = require('./pay_model');
const Danhgia = require('./review_model');
const Yeuthich = require('./favorite_model');
const Coupon = require('./coupon_model');
const UserVoucher = require('./user_voucher_model');
const LoginLog = require('./login_log_model');
const Taikhoan = require('./accounts_model');
const Banner = require('./banner_model');
const HomeSection = require('./home_section_model');
const Setting = require('./setting_model');
const FlashSale = require('./flash_sale_model');
const Lookbook = require('./lookbook_model');
const Brand = require('./brand_model');
const BlogPost = require('./blog_model');
const ChatMessage = require('./chat_message_model');
const PhieuXuatKho = require('./export_receipt_model');
const TonKhoLo = require('./inventory_lot_model');
const SizeGuide = require('./size_guide_model');

module.exports = {
    Sanpham,
    Nguoidung,
    Danhmuc,
    Giohang,
    Donhang,
    Chitietdonhang,
    Thanhtoan,
    Danhgia,
    Yeuthich,
    Coupon,
    UserVoucher,
    LoginLog,
    Taikhoan,
    Banner,
    HomeSection,
    Setting,
    FlashSale,
    Lookbook,
    Brand,
    BlogPost,
    ChatMessage,
    PhieuXuatKho,
    TonKhoLo,
    SizeGuide
};
