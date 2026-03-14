const nhantrangthai = {
  all: 'Tất cả',
  choxacnhan: 'Chờ xác nhận',
  daxacnhan: 'Đã xác nhận',
  dangchuanbi: 'Đang chuẩn bị',
  danggiao: 'Đang giao',
  dagiao: 'Đã giao',
  requested_return: 'Yêu cầu hoàn hàng',
  approved_return: 'Đã duyệt hoàn hàng',
  rejected_return: 'Từ chối hoàn hàng',
  return_shipping: 'Đang gửi hàng hoàn',
  returned: 'Đã nhận hàng hoàn',
  refunded: 'Đã hoàn tiền',
  dahuy: 'Đã hủy',
  hoanhang: 'Hoàn hàng'
};

function layTrangThaiChoPhep() {
  return [
    'all',
    'choxacnhan',
    'daxacnhan',
    'dangchuanbi',
    'danggiao',
    'dagiao',
    'requested_return',
    'approved_return',
    'rejected_return',
    'return_shipping',
    'returned',
    'refunded',
    'dahuy',
    'hoanhang'
  ];
}

module.exports = {
  nhantrangthai,
  layTrangThaiChoPhep
};
