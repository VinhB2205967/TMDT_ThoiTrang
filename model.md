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
- `_id`: ObjectId
- `hoten`: String
- `email`: String, required, unique
- `sodienthoai`: String
- `diachi`: String
- `diachiList[]`: subdocument gồm `label`, `tennguoinhan`, `sodienthoai`, `diachi`
- `gioitinh`: String
- `ngaysinh`: Date
- `avatar`: String
- `chukyso`: String
- `daxoa`: Boolean
- `ngaytao`: Date
- `ngaycapnhat`: Date
- `lastSeenAt`: Date
- `lastLoginAt`: Date
- `lastLoginProvider`: String
- `lastLoginIp`: String
- `lastLoginUserAgent`: String

### `accounts` (`Taikhoan`)
- `_id`: ObjectId
- `nguoidung_id`: ObjectId, ref `users`, required, unique
- `email`: String, required, unique
- `matkhau`: String, có thể null nếu đăng nhập Google
- `provider`: String
- `vaitro`: String
- `trangthai`: String
- `xacthuc`: Boolean
- `tokenxacthuc`: String
- `tokenquenmatkhau`: String
- `thoigianhethan`: Date
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `carts` (`Giohang`)
- `_id`: ObjectId
- `nguoidung_id`: ObjectId, ref `users`, required
- `sanpham[]`: subdocument gồm `sanpham_id`, `bienthe_id`, `tensanpham`, `hinhanh`, `mausac`, `kichco`, `gia`, `giagiam`, `thanhtien`, `soluong`
- `tongtien`: Number
- `ngaytao`: Date
- `ngaycapnhat`: Date

Ghi chú quan hệ:
- Theo nghiệp vụ mong muốn: `users` - `carts` là `1-1`.
- Diễn giải: mỗi giỏ hàng thuộc đúng một người dùng; mỗi người dùng có tối đa một giỏ hàng.
- Nếu muốn enforce chặt ở DB, có thể thêm unique index cho `carts.nguoidung_id`.

### `orders` (`Donhang`)
- `_id`: ObjectId
- `madonhang`: String, unique
- `nguoidung_id`: ObjectId, ref `users`, required
- `tennguoinhan`: String
- `sodienthoai`: String
- `email`: String
- `diachigiao`: String
- `tinh`: String
- `quan`: String
- `phuong`: String
- `ghichu`: String
- `phuongthucthanhtoan`: String
- `dathanhtoan`: Boolean
- `ngaythanhtoan`: Date
- `vnpayTransId`: String
- `vnpayBankCode`: String
- `vnpayTxnRef`: String
- `momoTransId`: String
- `momoOrderId`: String
- `momoRequestId`: String
- `momoPayUrl`: String
- `momoRefunded`: Boolean
- `momoRefundAt`: Date
- `phuongthucvanchuyen`: String
- `phivanchuyen`: Number
- `mavanchuyen`: String
- `tamtinh`: Number
- `giamgia`: Number
- `tongtien`: Number
- `voucher_id`: ObjectId, ref `coupons`
- `voucher_code`: String
- `voucher_type`: String
- `voucher_value`: Number
- `voucher_discount`: Number
- `trangthai`: String
- `lydohuy`: String
- `ngaygiaohang`: Date
- `tonggiamdoanhthu_hoantra`: Number
- `tonggiamloinhuan_hoantra`: Number
- `tongsoluong_hoantra`: Number
- `daxoa`: Boolean
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `order_items` (`Chitietdonhang`)
- `_id`: ObjectId
- `donhang_id`: ObjectId, ref `orders`, required
- `sanpham_id`: ObjectId, ref `products`, required
- `bienthe_id`: ObjectId, tham chiếu logic tới `products.bienthe._id`
- `tensanpham`: String
- `hinhanh`: String
- `mausac`: String
- `kichco`: String
- `giagoc`: Number
- `giaban`: Number
- `soluong`: Number
- `thanhtien`: Number
- `fifoAllocations[]`: subdocument gồm `lotId`, `soLuong`, `giaNhap`, `giaBanDeXuat`
- `trangthai`: String
- `danhgia`: Boolean
- `ngaytao`: Date

### `order_refunds` (`OrderRefund`)
- `_id`: ObjectId
- `donhang_id`: ObjectId, ref `orders`, required, unique
- `nguoidung_id`: ObjectId, ref `users`
- `madonhang`: String
- `trangthai_donhang`: String
- `requestedAt`: Date
- `reason`: String
- `reasonLabel`: String
- `detail`: String
- `requestedItems[]`: subdocument gồm `orderItemId`, `qty`, `boughtQty`, `tensanpham`, `hinhanh`, `kichco`, `mausac`, `gianhap`, `giabandexuat`
- `receivedItems[]`: subdocument cùng cấu trúc `requestedItems[]`
- `proofMedias[]`: String
- `proofMedia`: String
- `proofImage`: String
- `refundMethod`: String
- `refundWallet`: String
- `refundBankName`: String
- `refundBankAccountName`: String
- `refundBankAccountNumber`: String
- `refundAmount`: Number
- `adminNote`: String
- `reviewedAt`: Date
- `approvedAt`: Date
- `rejectedAt`: Date
- `returnedAt`: Date
- `refundedAt`: Date
- `canceledByUser`: Boolean
- `canceledByUserAt`: Date
- `lastAction`: String
- `lastActorId`: ObjectId, ref `users`, có thể null
- `lastActorRole`: String
- `lastActorName`: String
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `order_status_logs` (`OrderStatusLog`)
- `_id`: ObjectId
- `donhang_id`: ObjectId, ref `orders`, required
- `nguoidung_id`: ObjectId, ref `users`
- `madonhang`: String
- `trangthai_cu`: String
- `trangthai_moi`: String
- `hanhdong`: String
- `ghichu`: String
- `actorId`: ObjectId, ref `users`, có thể null
- `actorRole`: String
- `actorName`: String
- `uniqueKey`: String
- `metadata`: Mixed
- `ngaytao`: Date

### `pays` (`Thanhtoan`)
- `_id`: ObjectId
- `donhang_id`: ObjectId, ref `orders`, required
- `nguoidung_id`: ObjectId, ref `users`, required
- `magiaodich`: String
- `phuongthuc`: String
- `sotien`: Number
- `trangthai`: String
- `chitiet`: Object gồm `nganhang`, `sotaikhoan`, `tennguoichuyen`, `noidung`, `anhchungtu`
- `response`: Mixed
- `ghichu`: String
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `products` (`Sanpham`)
- `_id`: ObjectId
- `tensanpham`: String
- `mota`: String
- `mota_hinhanh`: String
- `gia`: Number
- `phantramgiamgia`: Number
- `category`: ObjectId, ref `categories`
- `danhmuc_id`: ObjectId, ref `categories`
- `sizeguide_id`: ObjectId, ref `size_guides`
- `bangsize_id`: ObjectId, ref `size_guides`
- `occasions[]`: ObjectId, ref `categories`
- `occasion`: ObjectId, ref `categories`
- `dip_sudung_id`: ObjectId, ref `categories`
- `ageGroup`: ObjectId, ref `categories`
- `nhomtuoi_id`: ObjectId, ref `categories`
- `thuonghieu_id`: ObjectId, ref `brands`
- `brand`: ObjectId, ref `brands`
- `thuonghieu`: ObjectId, ref `brands`
- `luotmua`: Number
- `mausac_chinh`: String
- `sizes[]`: subdocument gồm `size`, `soluong`
- `soluong_chinh`: Number
- `soluongton`: Number
- `gioitinh`: String
- `loaisanpham`: String
- `bienthe[]`: subdocument gồm `_id`, `mausac`, `hinhanh`, `gia`, `phantramgiamgia`, `soluong`, `sizes[]`
- `hinhanh`: String
- `trangthai`: String
- `daxoa`: Boolean
- `ngaytao`: Date
- `ngaycapnhat`: Date
- `giaMoi`: virtual, không lưu DB

### `categories` (`Danhmuc`)
- `_id`: ObjectId
- `name`: String
- `tendanhmuc`: String
- `slug`: String, unique
- `mota`: String
- `hinhanh`: String
- `parent_id`: ObjectId, ref `categories`
- `danhmuccha`: ObjectId, ref `categories`
- `level`: Number
- `ancestors[]`: ObjectId, ref `categories`
- `path`: String
- `order`: Number
- `thutu`: Number
- `isActive`: Boolean
- `trangthai`: String
- `type`: String
- `daxoa`: Boolean
- `ngaytao`: Date
- `createdAt`: Date
- `updatedAt`: Date

### `brands` (`Brand`)
- `_id`: ObjectId
- `name`: String
- `ten`: String
- `slug`: String, unique có điều kiện
- `normalizedName`: String, unique có điều kiện
- `logo`: String
- `description`: String
- `moTa`: String
- `isFeatured`: Boolean
- `noiBat`: Boolean
- `isActive`: Boolean
- `hienthi`: Boolean
- `order`: Number
- `thuTu`: Number
- `daXoa`: Boolean
- `deletedAt`: Date
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `size_guides` (`SizeGuide`)
- `_id`: ObjectId
- `tenbang`: String
- `slug`: String, unique
- `loaisanpham`: String
- `cot[]`: String
- `dong[]`: subdocument gồm `size`, `giatri[]`
- `goiy`: String
- `daxoa`: Boolean
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `reviews` (`Danhgia`)
- `_id`: ObjectId
- `sanpham_id`: ObjectId, ref `products`, required
- `nguoidung_id`: ObjectId, ref `users`, required
- `donhang_id`: ObjectId, ref `orders`
- `chitietdonhang_id`: ObjectId, ref `order_items`
- `diem`: Number
- `tieude`: String
- `noidung`: String
- `hinhanh[]`: String
- `videos[]`: String
- `tags[]`: String
- `mausac`: String
- `kichco`: String
- `phanhoi`: subdocument gồm `noidung`, `nguoiphanhoi`, `ngayphanhoi`
- `thich`: Number
- `trangthai`: String
- `hienthi`: Boolean
- `lydoan`: String
- `anboi`: ObjectId, ref `users`
- `ngayan`: Date
- `xoaBoi`: ObjectId, ref `users`
- `ngayxoa`: Date
- `biBaoCao`: Boolean
- `soBaoCao`: Number
- `daxoa`: Boolean
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `favorites` (`Yeuthich`)
- `_id`: ObjectId
- `nguoidung_id`: ObjectId, ref `users`, required
- `sanpham_id`: ObjectId, ref `products`, required
- `ngaythem`: Date

### `coupons` (`Coupon`)
- `_id`: ObjectId
- `code`: String, required, unique
- `ten`: String
- `mota`: String
- `banner`: String
- `loai`: String
- `giatri`: Number
- `don_toithieu`: Number
- `giam_toida`: Number
- `ngay_batdau`: Date
- `ngay_ketthuc`: Date
- `soluong_toida`: Number
- `soluong_dasudung`: Number
- `trangthai`: String
- `daxoa`: Boolean
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `user_vouchers` (`UserVoucher`)
- `_id`: ObjectId
- `nguoidung_id`: ObjectId, ref `users`, required
- `voucher_id`: ObjectId, ref `coupons`, required
- `isUsed`: Boolean
- `savedAt`: Date
- `usedAt`: Date

### `import_receipts` (`PhieuNhapKho`)
- `_id`: ObjectId
- `code`: String
- `maphieu`: String, unique
- `ma_phieu`: String
- `loaiphieu`: String
- `tenloaiphieu`: String
- `nguonnhap`: String
- `donhang_id`: ObjectId, ref `orders`
- `madonhang`: String
- `phieuxuat_id`: ObjectId, ref `export_receipts`
- `maphieuxuat`: String
- `ngaynhap`: Date
- `nhacungcap`: String
- `ghichu`: String
- `tongtiennhap`: Number
- `chitiet[]`: subdocument gồm `chisoblock`, `sanphamid`, `orderitemid`, `tensanpham`, `masku`, `danhmuc`, `chatlieu`, `hinhanh`, `bientheid`, `kichco`, `mausac`, `soluong`, `gianhap`, `giabandexuat`
- `daxuatkho`: Boolean
- `ngayxuatkho`: Date
- `nguoixuatkho`: ObjectId, ref `users`
- `nhanvienky`: subdocument gồm `tennhanvien`, `idnhanvien`, `anhchuky`, `thoigianky`
- `nguoitao`: ObjectId, ref `users`
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `export_receipts` (`PhieuXuatKho`)
- `_id`: ObjectId
- `maphieu`: String, required, unique
- `donhang_id`: ObjectId, ref `orders`, unique sparse
- `madonhang`: String
- `ngayxuat`: Date
- `noinhan`: String
- `lydo`: String
- `tongsoluong`: Number
- `tongdoanhthu`: Number
- `tonggiavon`: Number
- `tongloinhuan`: Number
- `tongdoanhthuhoan`: Number
- `tonggiavonhoan`: Number
- `tongloinhuanhoan`: Number
- `tysuatloinhuan`: Number
- `nguoitaophieu`: String
- `chitiet[]`: subdocument gồm `sanphamid`, `tensanpham`, `bientheid`, `kichco`, `mausac`, `soluong`, `gianhap`, `giaban`, `phantramgiam`, `giasaugiam`, `doanhthu`, `giavon`, `loinhuan`, `soluonghoan`, `doanhthuhoan`, `giavonhoan`, `loinhuanhoan`, `allocations[]`, `hinhanh`, `ghichudong`
- `allocations[]`: subdocument con của `chitiet[]`, gồm `lotId`, `soLuong`, `soluonghoan`, `giaNhap`, `giaBanDeXuat`, `giaban`, `phantramgiam`, `giasaugiam`, `doanhthu`, `giavon`, `loinhuan`
- `nhanvienky`: subdocument gồm `tennhanvien`, `idnhanvien`, `anhchuky`, `thoigianky`
- `nguoitao`: ObjectId, ref `users`
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `inventory_lots` (`TonKhoLo`)
- `_id`: ObjectId
- `phieunhap_id`: ObjectId, ref `import_receipts`, required
- `maphieunhap`: String
- `ngaynhap`: Date
- `nhacungcap`: String
- `sanphamid`: ObjectId, ref `products`, required
- `bientheid`: ObjectId, tham chiếu logic tới `products.bienthe._id`
- `kichco`: String
- `mausac`: String
- `gianhap`: Number
- `giabandexuat`: Number
- `soluongnhap`: Number
- `soluongconlai`: Number
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `inventory_adjustments` (`PhieuDieuChinhKho`)
- `_id`: ObjectId
- `maphieu`: String, unique
- `loaiphieu`: String
- `lydo`: String
- `daxacnhan`: Boolean
- `ngayxacnhan`: Date
- `nguoixacnhan`: ObjectId, ref `users`
- `chitiet[]`: subdocument gồm `sanphamid`, `tensanpham`, `bientheid`, `kichco`, `mausac`, `soluongdieuchinh`, `tontruoc`, `tonsau`
- `nguoitao`: ObjectId, ref `users`
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `chat_messages` (`ChatMessage`)
- `_id`: ObjectId
- `clientId`: ObjectId, ref `users`, required
- `senderId`: ObjectId, ref `users`, required
- `senderRole`: String
- `receiverId`: ObjectId, ref `users`, có thể null
- `receiverRole`: String
- `content`: String
- `mediaUrl`: String
- `mediaType`: String
- `mediaMime`: String
- `mediaName`: String
- `mediaSize`: Number
- `isRead`: Boolean
- `readAt`: Date
- `sentAt`: Date
- `daxoa`: Boolean

### `login_logs` (`LoginLog`)
- `_id`: ObjectId
- `userId`: ObjectId, ref `users`, có thể null
- `email`: String
- `role`: String
- `provider`: String
- `status`: String
- `ip`: String
- `userAgent`: String
- `message`: String
- `createdAt`: Date

### `banners` (`Banner`)
- `_id`: ObjectId
- `tieude`: String
- `mota`: String
- `hinhanh`: String, required
- `nut_text`: String
- `nut_link`: String
- `loai`: String
- `hienthi`: Boolean
- `thuTu`: Number
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `blog_posts` (`BlogPost`)
- `_id`: ObjectId
- `tieude`: String, required
- `slug`: String, required, unique
- `tomtat`: String
- `noidung`: String
- `hinhanh`: String
- `xuatban`: Boolean
- `ngayxuatban`: Date
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `lookbooks` (`Lookbook`)
- `_id`: ObjectId
- `title`: String
- `slug`: String, unique
- `image`: String
- `description`: String
- `products[]`: ObjectId, ref `products`
- `order`: Number
- `isActive`: Boolean
- `startDate`: Date
- `endDate`: Date
- `deletedAt`: Date
- `tenmua`: String
- `hinhanh`: String
- `mota`: String
- `sanpham_ids[]`: ObjectId, ref `products`
- `thuTu`: Number
- `hienthi`: Boolean
- `createdAt`: Date
- `updatedAt`: Date
- `ngaytao`: virtual từ `createdAt`
- `ngaycapnhat`: virtual từ `updatedAt`

### `flash_sales` (`FlashSale`)
- `_id`: ObjectId
- `ten`: String
- `batdau`: Date
- `ketthuc`: Date
- `hienthi`: Boolean
- `phantramgiamgia`: Number
- `sanpham[]`: subdocument gồm `sanpham_id`, `giagiam`, `gioihan`
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `home_sections` (`HomeSection`)
- `_id`: ObjectId
- `key`: String, required, unique
- `tieuDe`: String
- `hienthi`: Boolean
- `thuTu`: Number
- `config`: Object
- `ngaytao`: Date
- `ngaycapnhat`: Date

### `settings` (`Setting`)
- `_id`: ObjectId
- `key`: String, required, unique
- `value`: Mixed
- `ngaytao`: Date
- `ngaycapnhat`: Date

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
