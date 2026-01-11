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

module.exports = {
    Sanpham,
    Nguoidung,
    Danhmuc,
    Giohang,
    Donhang,
    Chitietdonhang,
    Thanhtoan,
    Danhgia,
    Yeuthich
};
