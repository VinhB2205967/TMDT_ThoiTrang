# Model

Tài liệu này tóm tắt các collection MongoDB đang được khai báo trong thư mục `models/`, đồng thời chuẩn hóa cách mô tả quan hệ `ref`.

## 1. Quy ước mô tả

- Ghi theo dạng: ``collectionA.field -> collectionB._id``.
- Mỗi quan hệ nên ghi rõ loại:
  - `1-1`: một bản ghi bên A gắn với tối đa một bản ghi bên B và ngược lại.
  - `1-n`: một bản ghi bên A gắn với nhiều bản ghi bên B.
  - `n-n`: quan hệ nhiều-nhiều, thường đi qua bảng nối.
- Ví dụ mong muốn:
  - `carts.nguoidung_id -> users._id`
  - Loại quan hệ: `1-1`
  - Diễn giải: mỗi giỏ hàng thuộc đúng một người dùng, và mỗi người dùng có tối đa một giỏ hàng đang hoạt động.

## 2. Các collection chính

### `users` (`Nguoidung`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `hoten`: String, ghi chú: tên hiển thị
- `email`: String, required, unique, ghi chú: thông tin liên hệ/định tuyến
- `sodienthoai`: String, ghi chú: thông tin liên hệ/định tuyến
- `diachi`: String, ghi chú: thông tin liên hệ/định tuyến
- `diachiList[]`: subdocument gồm `label`, `tennguoinhan`, `sodienthoai`, `diachi`, ghi chú: thông tin liên hệ/định tuyến
- `gioitinh`: String, ghi chú: thuộc tính nghiệp vụ
- `ngaysinh`: Date, ghi chú: mốc thời gian nghiệp vụ
- `avatar`: String, ghi chú: thuộc tính nghiệp vụ
- `chukyso`: String, ghi chú: thuộc tính nghiệp vụ
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ
- `lastSeenAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `lastLoginAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `lastLoginProvider`: String, ghi chú: thuộc tính nghiệp vụ
- `lastLoginIp`: String, ghi chú: thuộc tính nghiệp vụ
- `lastLoginUserAgent`: String, ghi chú: thuộc tính nghiệp vụ

### `accounts` (`Taikhoan`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `nguoidung_id`: ObjectId, ref `users`, required, unique, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `email`: String, required, unique, ghi chú: thông tin liên hệ/định tuyến
- `matkhau`: String, có thể null nếu đăng nhập Google, ghi chú: mã nhận diện/tìm kiếm
- `provider`: String, ghi chú: thuộc tính nghiệp vụ
- `vaitro`: String, ghi chú: thuộc tính nghiệp vụ
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `xacthuc`: Boolean, ghi chú: thuộc tính nghiệp vụ
- `tokenxacthuc`: String, ghi chú: thuộc tính nghiệp vụ
- `tokenquenmatkhau`: String, ghi chú: thuộc tính nghiệp vụ
- `thoigianhethan`: Date, ghi chú: giá trị số phục vụ tính toán
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `carts` (`Giohang`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `nguoidung_id`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `sanpham[]`: subdocument gồm `sanpham_id`, `bienthe_id`, `tensanpham`, `hinhanh`, `mausac`, `kichco`, `gia`, `giagiam`, `thanhtien`, `soluong`, ghi chú: danh sách dữ liệu dạng mảng
- `tongtien`: Number, ghi chú: giá trị số phục vụ tính toán
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

Ghi chú quan hệ:
- Theo nghiệp vụ mong muốn: `users` - `carts` là `1-1`.
- Diễn giải: mỗi giỏ hàng thuộc đúng một người dùng; mỗi người dùng có tối đa một giỏ hàng.
- Nếu muốn enforce chặt ở DB, có thể thêm unique index cho `carts.nguoidung_id`.

### `orders` (`Donhang`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `madonhang`: String, unique, ghi chú: mã nhận diện/tìm kiếm
- `nguoidung_id`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `tennguoinhan`: String, ghi chú: tên hiển thị
- `sodienthoai`: String, ghi chú: thông tin liên hệ/định tuyến
- `email`: String, ghi chú: thông tin liên hệ/định tuyến
- `diachigiao`: String, ghi chú: giá trị số phục vụ tính toán
- `tinh`: String, ghi chú: thuộc tính nghiệp vụ
- `quan`: String, ghi chú: thuộc tính nghiệp vụ
- `phuong`: String, ghi chú: thuộc tính nghiệp vụ
- `ghichu`: String, ghi chú: thông tin mô tả/bổ sung
- `phuongthucthanhtoan`: String, ghi chú: thuộc tính nghiệp vụ
- `dathanhtoan`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaythanhtoan`: Date, ghi chú: mốc thời gian nghiệp vụ
- `vnpayTransId`: String, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `vnpayBankCode`: String, ghi chú: mã nhận diện/tìm kiếm
- `vnpayTxnRef`: String, ghi chú: thuộc tính nghiệp vụ
- `momoTransId`: String, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `momoOrderId`: String, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `momoRequestId`: String, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `momoPayUrl`: String, ghi chú: thuộc tính nghiệp vụ
- `momoRefunded`: Boolean, ghi chú: thuộc tính nghiệp vụ
- `momoRefundAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `phuongthucvanchuyen`: String, ghi chú: thuộc tính nghiệp vụ
- `phivanchuyen`: Number, ghi chú: thuộc tính nghiệp vụ
- `mavanchuyen`: String, ghi chú: mã nhận diện/tìm kiếm
- `tamtinh`: Number, ghi chú: thuộc tính nghiệp vụ
- `giamgia`: Number, ghi chú: giá trị số phục vụ tính toán
- `tongtien`: Number, ghi chú: giá trị số phục vụ tính toán
- `voucher_id`: ObjectId, ref `coupons`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `voucher_code`: String, ghi chú: mã nhận diện/tìm kiếm
- `voucher_type`: String, ghi chú: thuộc tính nghiệp vụ
- `voucher_value`: Number, ghi chú: thuộc tính nghiệp vụ
- `voucher_discount`: Number, ghi chú: thuộc tính nghiệp vụ
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `lydohuy`: String, ghi chú: thuộc tính nghiệp vụ
- `ngaygiaohang`: Date, ghi chú: mốc thời gian nghiệp vụ
- `tonggiamdoanhthu_hoantra`: Number, ghi chú: giá trị số phục vụ tính toán
- `tonggiamloinhuan_hoantra`: Number, ghi chú: giá trị số phục vụ tính toán
- `tongsoluong_hoantra`: Number, ghi chú: giá trị số phục vụ tính toán
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `order_items` (`Chitietdonhang`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `donhang_id`: ObjectId, ref `orders`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `sanpham_id`: ObjectId, ref `products`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `bienthe_id`: ObjectId, tham chiếu logic tới `products.bienthe._id`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `tensanpham`: String, ghi chú: tên hiển thị
- `hinhanh`: String, ghi chú: thuộc tính nghiệp vụ
- `mausac`: String, ghi chú: mã nhận diện/tìm kiếm
- `kichco`: String, ghi chú: thuộc tính nghiệp vụ
- `giagoc`: Number, ghi chú: giá trị số phục vụ tính toán
- `giaban`: Number, ghi chú: giá trị số phục vụ tính toán
- `soluong`: Number, ghi chú: giá trị số phục vụ tính toán
- `thanhtien`: Number, ghi chú: thuộc tính nghiệp vụ
- `fifoAllocations[]`: subdocument gồm `lotId`, `soLuong`, `giaNhap`, `giaBanDeXuat`, ghi chú: danh sách dữ liệu dạng mảng
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `danhgia`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ

### `order_refunds` (`OrderRefund`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `donhang_id`: ObjectId, ref `orders`, required, unique, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `nguoidung_id`: ObjectId, ref `users`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `madonhang`: String, ghi chú: mã nhận diện/tìm kiếm
- `trangthai_donhang`: String, ghi chú: cờ/trạng thái xử lý
- `requestedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `reason`: String, ghi chú: thuộc tính nghiệp vụ
- `reasonLabel`: String, ghi chú: thuộc tính nghiệp vụ
- `detail`: String, ghi chú: thông tin mô tả/bổ sung
- `requestedItems[]`: subdocument gồm `orderItemId`, `qty`, `boughtQty`, `tensanpham`, `hinhanh`, `kichco`, `mausac`, `gianhap`, `giabandexuat`, ghi chú: danh sách dữ liệu dạng mảng
- `receivedItems[]`: subdocument cùng cấu trúc `requestedItems[]`, ghi chú: danh sách dữ liệu dạng mảng
- `proofMedias[]`: String, ghi chú: danh sách dữ liệu dạng mảng
- `proofMedia`: String, ghi chú: thuộc tính nghiệp vụ
- `proofImage`: String, ghi chú: thuộc tính nghiệp vụ
- `refundMethod`: String, ghi chú: thuộc tính nghiệp vụ
- `refundWallet`: String, ghi chú: thuộc tính nghiệp vụ
- `refundBankName`: String, ghi chú: tên hiển thị
- `refundBankAccountName`: String, ghi chú: tên hiển thị
- `refundBankAccountNumber`: String, ghi chú: thuộc tính nghiệp vụ
- `refundAmount`: Number, ghi chú: thuộc tính nghiệp vụ
- `adminNote`: String, ghi chú: thuộc tính nghiệp vụ
- `reviewedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `approvedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `rejectedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `returnedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `refundedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `canceledByUser`: Boolean, ghi chú: thuộc tính nghiệp vụ
- `canceledByUserAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `lastAction`: String, ghi chú: thuộc tính nghiệp vụ
- `lastActorId`: ObjectId, ref `users`, có thể null, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `lastActorRole`: String, ghi chú: thuộc tính nghiệp vụ
- `lastActorName`: String, ghi chú: tên hiển thị
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `order_status_logs` (`OrderStatusLog`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `donhang_id`: ObjectId, ref `orders`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `nguoidung_id`: ObjectId, ref `users`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `madonhang`: String, ghi chú: mã nhận diện/tìm kiếm
- `trangthai_cu`: String, ghi chú: cờ/trạng thái xử lý
- `trangthai_moi`: String, ghi chú: cờ/trạng thái xử lý
- `hanhdong`: String, ghi chú: thuộc tính nghiệp vụ
- `ghichu`: String, ghi chú: thông tin mô tả/bổ sung
- `actorId`: ObjectId, ref `users`, có thể null, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `actorRole`: String, ghi chú: thuộc tính nghiệp vụ
- `actorName`: String, ghi chú: tên hiển thị
- `uniqueKey`: String, ghi chú: thuộc tính nghiệp vụ
- `metadata`: Mixed, ghi chú: thuộc tính nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ

### `pays` (`Thanhtoan`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `donhang_id`: ObjectId, ref `orders`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `nguoidung_id`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `magiaodich`: String, ghi chú: giá trị số phục vụ tính toán
- `phuongthuc`: String, ghi chú: thuộc tính nghiệp vụ
- `sotien`: Number, ghi chú: thuộc tính nghiệp vụ
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `chitiet`: Object gồm `nganhang`, `sotaikhoan`, `tennguoichuyen`, `noidung`, `anhchungtu`, ghi chú: thuộc tính nghiệp vụ
- `response`: Mixed, ghi chú: thuộc tính nghiệp vụ
- `ghichu`: String, ghi chú: thông tin mô tả/bổ sung
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `products` (`Sanpham`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `tensanpham`: String, ghi chú: tên hiển thị
- `mota`: String, ghi chú: thông tin mô tả/bổ sung
- `mota_hinhanh`: String, ghi chú: thông tin mô tả/bổ sung
- `gia`: Number, ghi chú: giá trị số phục vụ tính toán
- `phantramgiamgia`: Number, ghi chú: giá trị số phục vụ tính toán
- `category`: ObjectId, ref `categories`, ghi chú: thuộc tính nghiệp vụ
- `danhmuc_id`: ObjectId, ref `categories`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `sizeguide_id`: ObjectId, ref `size_guides`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `bangsize_id`: ObjectId, ref `size_guides`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `occasions[]`: ObjectId, ref `categories`, ghi chú: danh sách dữ liệu dạng mảng
- `occasion`: ObjectId, ref `categories`, ghi chú: thuộc tính nghiệp vụ
- `dip_sudung_id`: ObjectId, ref `categories`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `ageGroup`: ObjectId, ref `categories`, ghi chú: thuộc tính nghiệp vụ
- `nhomtuoi_id`: ObjectId, ref `categories`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `thuonghieu_id`: ObjectId, ref `brands`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `brand`: ObjectId, ref `brands`, ghi chú: thuộc tính nghiệp vụ
- `thuonghieu`: ObjectId, ref `brands`, ghi chú: thuộc tính nghiệp vụ
- `luotmua`: Number, ghi chú: thuộc tính nghiệp vụ
- `mausac_chinh`: String, ghi chú: mã nhận diện/tìm kiếm
- `sizes[]`: subdocument gồm `size`, `soluong`, ghi chú: danh sách dữ liệu dạng mảng
- `soluong_chinh`: Number, ghi chú: giá trị số phục vụ tính toán
- `soluongton`: Number, ghi chú: giá trị số phục vụ tính toán
- `gioitinh`: String, ghi chú: thuộc tính nghiệp vụ
- `loaisanpham`: String, ghi chú: thuộc tính nghiệp vụ
- `bienthe[]`: subdocument gồm `_id`, `mausac`, `hinhanh`, `gia`, `phantramgiamgia`, `soluong`, `sizes[]`, ghi chú: danh sách dữ liệu dạng mảng
- `hinhanh`: String, ghi chú: thuộc tính nghiệp vụ
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ
- `giaMoi`: virtual, không lưu DB, ghi chú: giá trị số phục vụ tính toán

### `categories` (`Danhmuc`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `name`: String, ghi chú: tên hiển thị
- `tendanhmuc`: String, ghi chú: tên hiển thị
- `slug`: String, unique, ghi chú: mã nhận diện/tìm kiếm
- `mota`: String, ghi chú: thông tin mô tả/bổ sung
- `hinhanh`: String, ghi chú: thuộc tính nghiệp vụ
- `parent_id`: ObjectId, ref `categories`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `danhmuccha`: ObjectId, ref `categories`, ghi chú: cờ/trạng thái xử lý
- `level`: Number, ghi chú: thuộc tính nghiệp vụ
- `ancestors[]`: ObjectId, ref `categories`, ghi chú: danh sách dữ liệu dạng mảng
- `path`: String, ghi chú: thuộc tính nghiệp vụ
- `order`: Number, ghi chú: thuộc tính nghiệp vụ
- `thutu`: Number, ghi chú: thuộc tính nghiệp vụ
- `isActive`: Boolean, ghi chú: cờ/trạng thái xử lý
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `type`: String, ghi chú: thuộc tính nghiệp vụ
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `createdAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `updatedAt`: Date, ghi chú: mốc thời gian nghiệp vụ

### `brands` (`Brand`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `name`: String, ghi chú: tên hiển thị
- `ten`: String, ghi chú: tên hiển thị
- `slug`: String, unique có điều kiện, ghi chú: mã nhận diện/tìm kiếm
- `normalizedName`: String, unique có điều kiện, ghi chú: tên hiển thị
- `logo`: String, ghi chú: thuộc tính nghiệp vụ
- `description`: String, ghi chú: thuộc tính nghiệp vụ
- `moTa`: String, ghi chú: thông tin mô tả/bổ sung
- `isFeatured`: Boolean, ghi chú: cờ/trạng thái xử lý
- `noiBat`: Boolean, ghi chú: mốc thời gian nghiệp vụ
- `isActive`: Boolean, ghi chú: cờ/trạng thái xử lý
- `hienthi`: Boolean, ghi chú: cờ/trạng thái xử lý
- `order`: Number, ghi chú: thuộc tính nghiệp vụ
- `thuTu`: Number, ghi chú: thuộc tính nghiệp vụ
- `daXoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `deletedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `size_guides` (`SizeGuide`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `tenbang`: String, ghi chú: tên hiển thị
- `slug`: String, unique, ghi chú: mã nhận diện/tìm kiếm
- `loaisanpham`: String, ghi chú: thuộc tính nghiệp vụ
- `cot[]`: String, ghi chú: danh sách dữ liệu dạng mảng
- `dong[]`: subdocument gồm `size`, `giatri[]`, ghi chú: danh sách dữ liệu dạng mảng
- `goiy`: String, ghi chú: thuộc tính nghiệp vụ
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `reviews` (`Danhgia`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `sanpham_id`: ObjectId, ref `products`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `nguoidung_id`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `donhang_id`: ObjectId, ref `orders`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `chitietdonhang_id`: ObjectId, ref `order_items`, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `diem`: Number, ghi chú: giá trị số phục vụ tính toán
- `tieude`: String, ghi chú: thuộc tính nghiệp vụ
- `noidung`: String, ghi chú: thông tin mô tả/bổ sung
- `hinhanh[]`: String, ghi chú: danh sách dữ liệu dạng mảng
- `videos[]`: String, ghi chú: danh sách dữ liệu dạng mảng
- `tags[]`: String, ghi chú: danh sách dữ liệu dạng mảng
- `mausac`: String, ghi chú: mã nhận diện/tìm kiếm
- `kichco`: String, ghi chú: thuộc tính nghiệp vụ
- `phanhoi`: subdocument gồm `noidung`, `nguoiphanhoi`, `ngayphanhoi`, ghi chú: thuộc tính nghiệp vụ
- `thich`: Number, ghi chú: thuộc tính nghiệp vụ
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `hienthi`: Boolean, ghi chú: cờ/trạng thái xử lý
- `lydoan`: String, ghi chú: thuộc tính nghiệp vụ
- `anboi`: ObjectId, ref `users`, ghi chú: thuộc tính nghiệp vụ
- `ngayan`: Date, ghi chú: mốc thời gian nghiệp vụ
- `xoaBoi`: ObjectId, ref `users`, ghi chú: thuộc tính nghiệp vụ
- `ngayxoa`: Date, ghi chú: mốc thời gian nghiệp vụ
- `biBaoCao`: Boolean, ghi chú: thuộc tính nghiệp vụ
- `soBaoCao`: Number, ghi chú: thuộc tính nghiệp vụ
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `favorites` (`Yeuthich`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `nguoidung_id`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `sanpham_id`: ObjectId, ref `products`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `ngaythem`: Date, ghi chú: mốc thời gian nghiệp vụ

### `coupons` (`Coupon`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `code`: String, required, unique, ghi chú: mã nhận diện/tìm kiếm
- `ten`: String, ghi chú: tên hiển thị
- `mota`: String, ghi chú: thông tin mô tả/bổ sung
- `banner`: String, ghi chú: thuộc tính nghiệp vụ
- `loai`: String, ghi chú: thuộc tính nghiệp vụ
- `giatri`: Number, ghi chú: giá trị số phục vụ tính toán
- `don_toithieu`: Number, ghi chú: thuộc tính nghiệp vụ
- `giam_toida`: Number, ghi chú: giá trị số phục vụ tính toán
- `ngay_batdau`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngay_ketthuc`: Date, ghi chú: mốc thời gian nghiệp vụ
- `soluong_toida`: Number, ghi chú: giá trị số phục vụ tính toán
- `soluong_dasudung`: Number, ghi chú: giá trị số phục vụ tính toán
- `trangthai`: String, ghi chú: cờ/trạng thái xử lý
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `user_vouchers` (`UserVoucher`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `nguoidung_id`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `voucher_id`: ObjectId, ref `coupons`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `isUsed`: Boolean, ghi chú: cờ/trạng thái xử lý
- `savedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `usedAt`: Date, ghi chú: mốc thời gian nghiệp vụ

### `import_receipts` (`PhieuNhapKho`)
- `_id`: ObjectId, định danh phiếu nhập, ghi chú: khóa định danh bản ghi
- `code`: String, mã hiển thị phụ của phiếu, ghi chú: mã nhận diện/tìm kiếm
- `maphieu`: String, unique, mã phiếu nhập chính, ghi chú: mã nhận diện/tìm kiếm
- `ma_phieu`: String, mã phiếu theo format cũ/legacy, ghi chú: mã nhận diện/tìm kiếm
- `loaiphieu`: String, loại phiếu (`standard` hoặc `return`), ghi chú: thuộc tính nghiệp vụ
- `tenloaiphieu`: String, tên hiển thị loại phiếu, ghi chú: tên hiển thị
- `nguonnhap`: String, người nhập kho, ghi chú: thuộc tính nghiệp vụ
- `donhang_id`: ObjectId, ref `orders`, đơn hàng liên quan (nếu có), ghi chú: khóa tham chiếu/liên kết dữ liệu
- `madonhang`: String, mã đơn hàng liên quan, ghi chú: mã nhận diện/tìm kiếm
- `phieuxuat_id`: ObjectId, ref `export_receipts`, phiếu xuất gốc khi nhập hoàn, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `maphieuxuat`: String, mã phiếu xuất gốc, ghi chú: mốc thời gian nghiệp vụ
- `ngaynhap`: Date, ngày thực hiện nhập kho, ghi chú: mốc thời gian nghiệp vụ
- `nhacungcap`: String, tên nhà cung cấp/nguồn hàng, ghi chú: thuộc tính nghiệp vụ
- `ghichu`: String, ghi chú nghiệp vụ, ghi chú: thông tin mô tả/bổ sung
- `tongtiennhap`: Number, tổng giá trị nhập của phiếu, ghi chú: giá trị số phục vụ tính toán
- `chitiet[]`: subdocument, danh sách dòng hàng nhập gồm `chisoblock`, `sanphamid`, `orderitemid`, `tensanpham`, `masku`, `danhmuc`, `chatlieu`, `hinhanh`, `bientheid`, `kichco`, `mausac`, `soluong`, `gianhap`, `giabandexuat`, ghi chú: danh sách dữ liệu dạng mảng
- `daxuatkho`: Boolean, trạng thái đã xuất kho lại hay chưa, ghi chú: cờ/trạng thái xử lý
- `ngayxuatkho`: Date, thời điểm xuất kho từ phiếu nhập này, ghi chú: mốc thời gian nghiệp vụ
- `nguoixuatkho`: ObjectId, ref `users`, người xác nhận/thực hiện xuất kho, ghi chú: thuộc tính nghiệp vụ
- `nhanvienky`: subdocument, thông tin ký xác nhận gồm `tennhanvien`, `idnhanvien`, `anhchuky`, `thoigianky`, ghi chú: thuộc tính nghiệp vụ
- `nguoitao`: ObjectId, ref `users`, người tạo phiếu, ghi chú: thuộc tính nghiệp vụ
- `ngaytao`: Date, thời điểm tạo phiếu, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, thời điểm cập nhật gần nhất, ghi chú: mốc thời gian nghiệp vụ

### `export_receipts` (`PhieuXuatKho`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `maphieu`: String, required, unique, ghi chú: mã nhận diện/tìm kiếm
- `donhang_id`: ObjectId, ref `orders`, unique sparse, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `madonhang`: String, ghi chú: mã nhận diện/tìm kiếm
- `ngayxuat`: Date, ghi chú: mốc thời gian nghiệp vụ
- `noinhan`: String, ghi chú: thuộc tính nghiệp vụ
- `lydo`: String, ghi chú: thuộc tính nghiệp vụ
- `tongsoluong`: Number, ghi chú: giá trị số phục vụ tính toán
- `tongdoanhthu`: Number, ghi chú: giá trị số phục vụ tính toán
- `tonggiavon`: Number, ghi chú: giá trị số phục vụ tính toán
- `tongloinhuan`: Number, ghi chú: giá trị số phục vụ tính toán
- `tongdoanhthuhoan`: Number, ghi chú: giá trị số phục vụ tính toán
- `tonggiavonhoan`: Number, ghi chú: giá trị số phục vụ tính toán
- `tongloinhuanhoan`: Number, ghi chú: giá trị số phục vụ tính toán
- `tysuatloinhuan`: Number, ghi chú: giá trị số phục vụ tính toán
- `nguoitaophieu`: String, ghi chú: thuộc tính nghiệp vụ
- `chitiet[]`: subdocument gồm `sanphamid`, `tensanpham`, `bientheid`, `kichco`, `mausac`, `soluong`, `gianhap`, `giaban`, `phantramgiam`, `giasaugiam`, `doanhthu`, `giavon`, `loinhuan`, `soluonghoan`, `doanhthuhoan`, `giavonhoan`, `loinhuanhoan`, `allocations[]`, `hinhanh`, `ghichudong`, ghi chú: danh sách dữ liệu dạng mảng
- `allocations[]`: subdocument con của `chitiet[]`, gồm `lotId`, `soLuong`, `soluonghoan`, `giaNhap`, `giaBanDeXuat`, `giaban`, `phantramgiam`, `giasaugiam`, `doanhthu`, `giavon`, `loinhuan`, ghi chú: danh sách dữ liệu dạng mảng
- `nhanvienky`: subdocument gồm `tennhanvien`, `idnhanvien`, `anhchuky`, `thoigianky`, ghi chú: thuộc tính nghiệp vụ
- `nguoitao`: ObjectId, ref `users`, ghi chú: thuộc tính nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `inventory_lots` (`TonKhoLo`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `phieunhap_id`: ObjectId, ref `import_receipts`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `maphieunhap`: String, ghi chú: mã nhận diện/tìm kiếm
- `ngaynhap`: Date, ghi chú: mốc thời gian nghiệp vụ
- `nhacungcap`: String, ghi chú: thuộc tính nghiệp vụ
- `sanphamid`: ObjectId, ref `products`, required, ghi chú: thuộc tính nghiệp vụ
- `bientheid`: ObjectId, tham chiếu logic tới `products.bienthe._id`, ghi chú: thuộc tính nghiệp vụ
- `kichco`: String, ghi chú: thuộc tính nghiệp vụ
- `mausac`: String, ghi chú: mã nhận diện/tìm kiếm
- `gianhap`: Number, ghi chú: giá trị số phục vụ tính toán
- `giabandexuat`: Number, ghi chú: mốc thời gian nghiệp vụ
- `soluongnhap`: Number, ghi chú: giá trị số phục vụ tính toán
- `soluongconlai`: Number, ghi chú: giá trị số phục vụ tính toán
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `inventory_adjustments` (`PhieuDieuChinhKho`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `maphieu`: String, unique, ghi chú: mã nhận diện/tìm kiếm
- `loaiphieu`: String, ghi chú: thuộc tính nghiệp vụ
- `lydo`: String, ghi chú: thuộc tính nghiệp vụ
- `daxacnhan`: Boolean, ghi chú: cờ/trạng thái xử lý
- `ngayxacnhan`: Date, ghi chú: mốc thời gian nghiệp vụ
- `nguoixacnhan`: ObjectId, ref `users`, ghi chú: thuộc tính nghiệp vụ
- `chitiet[]`: subdocument gồm `sanphamid`, `tensanpham`, `bientheid`, `kichco`, `mausac`, `soluongdieuchinh`, `tontruoc`, `tonsau`, ghi chú: danh sách dữ liệu dạng mảng
- `nguoitao`: ObjectId, ref `users`, ghi chú: thuộc tính nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `chat_messages` (`ChatMessage`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `clientId`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `senderId`: ObjectId, ref `users`, required, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `senderRole`: String, ghi chú: thuộc tính nghiệp vụ
- `receiverId`: ObjectId, ref `users`, có thể null, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `receiverRole`: String, ghi chú: thuộc tính nghiệp vụ
- `content`: String, ghi chú: tên hiển thị
- `mediaUrl`: String, ghi chú: thuộc tính nghiệp vụ
- `mediaType`: String, ghi chú: thuộc tính nghiệp vụ
- `mediaMime`: String, ghi chú: thuộc tính nghiệp vụ
- `mediaName`: String, ghi chú: tên hiển thị
- `mediaSize`: Number, ghi chú: thuộc tính nghiệp vụ
- `isRead`: Boolean, ghi chú: cờ/trạng thái xử lý
- `readAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `sentAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `daxoa`: Boolean, ghi chú: cờ/trạng thái xử lý

### `login_logs` (`LoginLog`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `userId`: ObjectId, ref `users`, có thể null, ghi chú: khóa tham chiếu/liên kết dữ liệu
- `email`: String, ghi chú: thông tin liên hệ/định tuyến
- `role`: String, ghi chú: thuộc tính nghiệp vụ
- `provider`: String, ghi chú: thuộc tính nghiệp vụ
- `status`: String, ghi chú: thuộc tính nghiệp vụ
- `ip`: String, ghi chú: thông tin liên hệ/định tuyến
- `userAgent`: String, ghi chú: thuộc tính nghiệp vụ
- `message`: String, ghi chú: thuộc tính nghiệp vụ
- `createdAt`: Date, ghi chú: mốc thời gian nghiệp vụ

### `banners` (`Banner`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `tieude`: String, ghi chú: thuộc tính nghiệp vụ
- `mota`: String, ghi chú: thông tin mô tả/bổ sung
- `hinhanh`: String, required, ghi chú: thuộc tính nghiệp vụ
- `nut_text`: String, ghi chú: thuộc tính nghiệp vụ
- `nut_link`: String, ghi chú: thuộc tính nghiệp vụ
- `loai`: String, ghi chú: thuộc tính nghiệp vụ
- `hienthi`: Boolean, ghi chú: cờ/trạng thái xử lý
- `thuTu`: Number, ghi chú: thuộc tính nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `blog_posts` (`BlogPost`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `tieude`: String, required, ghi chú: thuộc tính nghiệp vụ
- `slug`: String, required, unique, ghi chú: mã nhận diện/tìm kiếm
- `tomtat`: String, ghi chú: mốc thời gian nghiệp vụ
- `noidung`: String, ghi chú: thông tin mô tả/bổ sung
- `hinhanh`: String, ghi chú: thuộc tính nghiệp vụ
- `xuatban`: Boolean, ghi chú: thuộc tính nghiệp vụ
- `ngayxuatban`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `lookbooks` (`Lookbook`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `title`: String, required, ghi chú: tên hiển thị
- `slug`: String, unique, ghi chú: mã nhận diện/tìm kiếm
- `image`: String, required, ghi chú: thuộc tính nghiệp vụ
- `description`: String, ghi chú: thuộc tính nghiệp vụ
- `products[]`: ObjectId, ref `products`, required (ít nhất 1 phần tử), ghi chú: danh sách dữ liệu dạng mảng
- `order`: Number, default `0`, ghi chú: thuộc tính nghiệp vụ
- `isActive`: Boolean, default `true`, ghi chú: cờ/trạng thái xử lý
- `startDate`: Date, default `null`, ghi chú: thuộc tính nghiệp vụ
- `endDate`: Date, default `null`, ghi chú: thuộc tính nghiệp vụ
- `deletedAt`: Date, default `null`, ghi chú: mốc thời gian nghiệp vụ
- `tenmua`: String, ghi chú: tên hiển thị
- `hinhanh`: String, ghi chú: thuộc tính nghiệp vụ
- `mota`: String, ghi chú: thông tin mô tả/bổ sung
- `sanpham_ids[]`: ObjectId, ref `products`, ghi chú: danh sách dữ liệu dạng mảng
- `thuTu`: Number, ghi chú: thuộc tính nghiệp vụ
- `hienthi`: Boolean, ghi chú: cờ/trạng thái xử lý
- `createdAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `updatedAt`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaytao`: virtual từ `createdAt`, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: virtual từ `updatedAt`, ghi chú: mốc thời gian nghiệp vụ

### `flash_sales` (`FlashSale`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `ten`: String, required, ghi chú: tên hiển thị
- `batdau`: Date, required, ghi chú: thuộc tính nghiệp vụ
- `ketthuc`: Date, required, ghi chú: thuộc tính nghiệp vụ
- `hienthi`: Boolean, default `true`, ghi chú: cờ/trạng thái xử lý
- `phantramgiamgia`: Number, required, min `1`, max `90`, ghi chú: giá trị số phục vụ tính toán
- `sanpham[]`: subdocument gồm `sanpham_id`, `giagiam`, `gioihan`, ghi chú: danh sách dữ liệu dạng mảng
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `home_sections` (`HomeSection`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `key`: String, required, unique, ghi chú: thuộc tính nghiệp vụ
- `tieuDe`: String, ghi chú: thuộc tính nghiệp vụ
- `hienthi`: Boolean, default `true`, ghi chú: cờ/trạng thái xử lý
- `thuTu`: Number, default `0`, ghi chú: thuộc tính nghiệp vụ
- `config`: Object, default `{}`, ghi chú: thuộc tính nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

### `settings` (`Setting`)
- `_id`: ObjectId, ghi chú: khóa định danh bản ghi
- `key`: String, required, unique, ghi chú: thuộc tính nghiệp vụ
- `value`: Mixed, ghi chú: thuộc tính nghiệp vụ
- `ngaytao`: Date, ghi chú: mốc thời gian nghiệp vụ
- `ngaycapnhat`: Date, ghi chú: mốc thời gian nghiệp vụ

## 3. Mối quan hệ chính qua `ref`

### Nhóm người dùng
- `accounts.nguoidung_id -> users._id`: `1-1`
- `carts.nguoidung_id -> users._id`: `1-1`
- `orders.nguoidung_id -> users._id`: `1-n`
- `pays.nguoidung_id -> users._id`: `n-1`
- `reviews.nguoidung_id -> users._id`: `1-n`
- `favorites.nguoidung_id -> users._id`: một nửa của quan hệ `n-n`
- `user_vouchers.nguoidung_id -> users._id`: một nửa của quan hệ `n-n`
- `chat_messages.clientId -> users._id`: `n-1`
- `chat_messages.senderId -> users._id`: `n-1`
- `chat_messages.receiverId -> users._id`: `n-1`
- `login_logs.userId -> users._id`: `n-1`

### Nhóm giỏ hàng, đơn hàng, thanh toán
- `carts.nguoidung_id -> users._id`: `1-1`
  - Giả sử nghiệp vụ chuẩn: mỗi giỏ hàng thuộc một người dùng.
  - Viết ngắn gọn: `users (1) <-> (1) carts`
- `order_items.donhang_id -> orders._id`: `1-n`
- `order_items.sanpham_id -> products._id`: `n-1`
- `order_refunds.donhang_id -> orders._id`: `1-1`
- `order_refunds.nguoidung_id -> users._id`: `n-1`
- `order_status_logs.donhang_id -> orders._id`: `1-n`
- `order_status_logs.nguoidung_id -> users._id`: `n-1`
- `pays.donhang_id -> orders._id`: `1-n`
- `orders.voucher_id -> coupons._id`: `n-1`

### Nhóm sản phẩm
- `products.category -> categories._id`: `n-1`
- `products.danhmuc_id -> categories._id`: `n-1`
- `products.sizeguide_id -> size_guides._id`: `n-1`
- `products.bangsize_id -> size_guides._id`: `n-1`
- `products.brand -> brands._id`: `n-1`
- `products.thuonghieu_id -> brands._id`: `n-1`
- `products.thuonghieu -> brands._id`: `n-1`
- `products.occasion -> categories._id`: `n-1`
- `products.occasions[] -> categories._id`: `n-n`
- `products.dip_sudung_id -> categories._id`: `n-1`
- `products.ageGroup -> categories._id`: `n-1`
- `products.nhomtuoi_id -> categories._id`: `n-1`

### Nhóm nội dung và khuyến mãi
- `favorites.nguoidung_id -> users._id` và `favorites.sanpham_id -> products._id`: `n-n`
- `user_vouchers.nguoidung_id -> users._id` và `user_vouchers.voucher_id -> coupons._id`: `n-n`
- `reviews.sanpham_id -> products._id`: `1-n`
- `reviews.donhang_id -> orders._id`: `n-1`
- `reviews.chitietdonhang_id -> order_items._id`: `n-1`

### Nhóm kho
- `export_receipts.donhang_id -> orders._id`: `1-1`
- `export_receipts.nguoitao -> users._id`: `n-1`
- `import_receipts.donhang_id -> orders._id`: `n-1` hoặc `1-1` tùy loại phiếu
- `import_receipts.phieuxuat_id -> export_receipts._id`: `n-1` hoặc `1-1` tùy flow
- `import_receipts.nguoixuatkho -> users._id`: `n-1`
- `import_receipts.nguoitao -> users._id`: `n-1`
- `inventory_lots.phieunhap_id -> import_receipts._id`: `1-n`
- `inventory_lots.sanphamid -> products._id`: `n-1`
- `inventory_adjustments.nguoixacnhan -> users._id`: `n-1`
- `inventory_adjustments.nguoitao -> users._id`: `n-1`

## 4. Quan hệ logic qua embedded document hoặc ID nội bộ

- `carts.sanpham[].sanpham_id -> products._id`
- `carts.sanpham[].bienthe_id -> products.bienthe._id`
- `order_items.bienthe_id -> products.bienthe._id`
- `order_items.fifoAllocations[].lotId -> inventory_lots._id`
- `order_refunds.requestedItems[].orderItemId -> order_items._id`
- `import_receipts.chitiet[].sanphamid -> products._id`
- `import_receipts.chitiet[].orderitemid -> order_items._id`
- `import_receipts.chitiet[].bientheid -> products.bienthe._id`
- `export_receipts.chitiet[].sanphamid -> products._id`
- `export_receipts.chitiet[].bientheid -> products.bienthe._id`
- `export_receipts.chitiet[].allocations[].lotId -> inventory_lots._id`
- `inventory_adjustments.chitiet[].sanphamid -> products._id`
- `inventory_adjustments.chitiet[].bientheid -> products.bienthe._id`

## 5. Tóm tắt quan hệ nghiệp vụ

- `users` -> `accounts`: `1-1`
- `users` -> `carts`: `1-1`
- `users` -> `orders`: `1-n`
- `users` -> `order_refunds`: `1-n` theo góc nhìn người dùng, nhưng mỗi `order_refund` chỉ thuộc một `order`
- `users` -> `order_status_logs`: `1-n`
- `users` -> `pays`: `1-n`
- `users` -> `reviews`: `1-n`
- `users` -> `favorites`: `1-n`
- `users` -> `user_vouchers`: `1-n`
- `users` -> `chat_messages`: `1-n` qua các vai trò `clientId`, `senderId`, `receiverId`
- `users` -> `import_receipts`: `1-n` qua `nguoitao`, `nguoixuatkho`
- `users` -> `export_receipts`: `1-n` qua `nguoitao`
- `users` -> `inventory_adjustments`: `1-n` qua `nguoitao`, `nguoixacnhan`
- `users` -> `login_logs`: `1-n`

- `orders` -> `order_items`: `1-n`
- `orders` -> `order_refunds`: `1-1`
- `orders` -> `order_status_logs`: `1-n`
- `orders` -> `pays`: `1-n`
- `orders` -> `export_receipts`: `1-1`
- `orders` -> `import_receipts`: `1-n` hoặc `1-1` tùy loại phiếu nhập hoàn trả

- `products` -> `order_items`: `1-n`
- `products` -> `reviews`: `1-n`
- `products` -> `favorites`: `1-n`
- `products` -> `inventory_lots`: `1-n`
- `products` -> `lookbooks`: `n-n`
- `products` -> `flash_sales`: `n-n`
- `products` -> `import_receipts.chitiet[]`: `1-n` ở mức chi tiết phiếu nhập
- `products` -> `export_receipts.chitiet[]`: `1-n` ở mức chi tiết phiếu xuất
- `products` -> `inventory_adjustments.chitiet[]`: `1-n` ở mức chi tiết điều chỉnh

- `categories` -> `categories`: quan hệ đệ quy `1-n` qua `parent_id`, `danhmuccha`, và `ancestors[]`
- `categories` -> `products`: `1-n`
- `brands` -> `products`: `1-n`
- `size_guides` -> `products`: `1-n`

- `coupons` -> `orders`: `1-n`
- `coupons` -> `user_vouchers`: `1-n`

- `favorites`: bảng nối `n-n` giữa `users` và `products`
- `user_vouchers`: bảng nối `n-n` giữa `users` và `coupons`

- `export_receipts` -> `import_receipts` hoàn trả: thường `1-1`
- `import_receipts` -> `inventory_lots`: `1-n`

- `banners`: bảng nội dung độc lập, không có `ref` trực tiếp
- `blog_posts`: bảng nội dung độc lập, không có `ref` trực tiếp
- `home_sections`: bảng cấu hình giao diện, không có `ref` trực tiếp
- `settings`: bảng cấu hình hệ thống/giao diện, không có `ref` trực tiếp

- `accounts`, `login_logs`, `chat_messages`, `order_status_logs`: đều là bảng vệ tinh xoay quanh `users` và/hoặc `orders`
- `order_refunds`: bảng vệ tinh `1-1` của `orders`
- `inventory_lots`: bảng vệ tinh sinh ra từ `import_receipts`

## 6. Ví dụ viết quan hệ theo style ngắn gọn

- `users (1) <-> (1) carts`
- `users (1) <-> (n) orders`
- `orders (1) <-> (n) order_items`
- `orders (1) <-> (1) order_refunds`
- `users (n) <-> (n) products` qua `favorites`

Trong đó, ví dụ bạn yêu cầu sẽ được hiểu là:

- `carts.nguoidung_id -> users._id`
- Loại quan hệ: `1-1`
- Diễn giải: mỗi giỏ hàng thuộc một người dùng; mỗi người dùng có một giỏ hàng.
