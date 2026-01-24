const nhantrangthai = {
  all: 'Tất cả',
  choxacnhan: 'Chờ xác nhận',
  daxacnhan: 'Đã xác nhận',
  dangchuanbi: 'Đang chuẩn bị',
  danggiao: 'Đang giao',
  dagiao: 'Đã giao',
  dahuy: 'Đã hủy',
  hoanhang: 'Hoàn hàng'
};

function layTrangThaiChoPhep() {
  return ['all', 'choxacnhan', 'daxacnhan', 'dangchuanbi', 'danggiao', 'dagiao', 'dahuy', 'hoanhang'];
}

module.exports = {
  nhantrangthai,
  layTrangThaiChoPhep
};
