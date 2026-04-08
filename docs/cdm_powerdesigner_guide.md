# Huong dan ve CDM/LDM trong PowerDesigner

Tai lieu nay giup ve lai mo hinh trong PowerDesigner theo kieu crow's foot.

## Nen dung model nao

- Neu muon so do khai niem, de nhin, de chup bao cao: dung `Conceptual Data Model`
- Neu muon so do logic, gan hon voi PDM: dung `Logical Data Model`
- Khong dung `Physical Data Model` neu muc tieu la hien quan he chan qua

## File tham chieu

- CDM: [cdm.mmd](d:\luanvan\TMDT_ThoiTrang\docs\cdm.mmd)
- LDM: [ldm.mmd](d:\luanvan\TMDT_ThoiTrang\docs\ldm.mmd)
- PDM: [pdm.mmd](d:\luanvan\TMDT_ThoiTrang\docs\pdm.mmd)

## Cach tao trong PowerDesigner

1. `File -> New Model`
2. Chon `Information`
3. Chon mot trong hai:
   - `Conceptual Data Model`
   - `Logical Data Model`
4. Chon notation co crow's foot neu chuong trinh hoi
5. Tao entity va relationship theo danh sach duoi

## CDM de xuat

### Danh sach entity

- `USER`
- `ACCOUNT`
- `CART`
- `PRODUCT`
- `CATEGORY`
- `BRAND`
- `SIZE_GUIDE`
- `VOUCHER`
- `ORDER`
- `ORDER_ITEM`
- `PAYMENT`
- `REVIEW`
- `FAVORITE`
- `USER_VOUCHER`
- `REFUND`
- `LOOKBOOK`
- `FLASH_SALE`
- `EXPORT_RECEIPT`
- `IMPORT_RECEIPT`
- `INVENTORY_LOT`
- `INVENTORY_ADJUSTMENT`
- `BANNER`
- `BLOG_POST`
- `HOME_SECTION`
- `SETTING`
- `CHAT_MESSAGE`

### Thuoc tinh goi y cho tung entity

`USER`
- `hoTen`
- `email`
- `soDienThoai`
- `diaChi`
- `gioiTinh`
- `ngaySinh`
- `avatar`
- `chuKySo`
- `trangThai`

`ACCOUNT`
- `emailDangNhap`
- `matKhau`
- `nhaCungCap`
- `vaiTro`
- `trangThai`
- `xacThuc`

`CART`
- `tongTien`
- `ngayCapNhat`

`PRODUCT`
- `tenSanPham`
- `moTa`
- `moTaHinhAnh`
- `gia`
- `phanTramGiamGia`
- `mauSacChinh`
- `soLuongTon`
- `gioiTinh`
- `loaiSanPham`
- `trangThai`

`CATEGORY`
- `tenDanhMuc`
- `slug`
- `moTa`
- `hinhAnh`
- `capDanhMuc`
- `loaiDanhMuc`
- `thuTu`
- `kichHoat`

`BRAND`
- `tenThuongHieu`
- `slug`
- `logo`
- `moTa`
- `noiBat`
- `hienThi`

`SIZE_GUIDE`
- `tenBang`
- `loaiSanPham`
- `cotDo`
- `dongDo`
- `goiY`

`VOUCHER`
- `maVoucher`
- `tenVoucher`
- `loaiGiamGia`
- `giaTri`
- `donToiThieu`
- `giamToiDa`
- `ngayBatDau`
- `ngayKetThuc`
- `trangThai`

`ORDER`
- `maDonHang`
- `tenNguoiNhan`
- `soDienThoai`
- `email`
- `diaChiGiao`
- `phuongThucThanhToan`
- `phuongThucVanChuyen`
- `phiVanChuyen`
- `giamGia`
- `trangThai`
- `tamTinh`
- `tongTien`

`ORDER_ITEM`
- `tenSanPham`
- `mauSac`
- `kichCo`
- `giaGoc`
- `giaBan`
- `soLuong`
- `thanhTien`
- `trangThai`

`PAYMENT`
- `maGiaoDich`
- `phuongThuc`
- `soTien`
- `trangThai`
- `ghiChu`

`REVIEW`
- `diem`
- `tieuDe`
- `noiDung`
- `hinhAnh`
- `video`
- `theNoiDung`
- `mauSac`
- `kichCo`
- `luotThich`
- `trangThai`

`FAVORITE`
- `ngayThem`

`USER_VOUCHER`
- `daSuDung`
- `ngayCapNhat`

`REFUND`
- `lyDo`
- `moTaChiTiet`
- `phuongThucHoanTien`
- `soTienHoan`
- `trangThai`
- `hanhDongCuoi`

`LOOKBOOK`
- `tieuDe`
- `moTa`
- `hinhAnh`
- `thuTu`
- `hienThi`
- `ngayBatDau`
- `ngayKetThuc`

`FLASH_SALE`
- `tenChuongTrinh`
- `batDau`
- `ketThuc`
- `phanTramGiamGia`
- `hienThi`

`EXPORT_RECEIPT`
- `maPhieuXuat`
- `ngayXuat`
- `noiNhan`
- `lyDo`
- `tongSoLuong`
- `tongDoanhThu`
- `tongGiaVon`
- `tongLoiNhuan`

`IMPORT_RECEIPT`
- `maPhieuNhap`
- `loaiPhieu`
- `nguonNhap`
- `ngayNhap`
- `nhaCungCap`
- `tongTienNhap`
- `daXuatKho`

`INVENTORY_LOT`
- `maPhieuNhap`
- `ngayNhap`
- `kichCo`
- `mauSac`
- `giaNhap`
- `giaBanDeXuat`
- `soLuongNhap`
- `soLuongConLai`

`INVENTORY_ADJUSTMENT`
- `maPhieuDieuChinh`
- `loaiPhieu`
- `lyDo`
- `daXacNhan`
- `ngayXacNhan`

`BANNER`
- `tieuDe`
- `moTa`
- `hinhAnh`
- `nutText`
- `nutLink`
- `loai`
- `hienThi`

`BLOG_POST`
- `tieuDe`
- `slug`
- `tomTat`
- `noiDung`
- `hinhAnh`
- `xuatBan`

`HOME_SECTION`
- `maMuc`
- `tieuDe`
- `hienThi`
- `thuTu`

`SETTING`
- `khoa`
- `giaTri`

`CHAT_MESSAGE`
- `vaiTroNguoiGui`
- `vaiTroNguoiNhan`
- `noiDung`
- `tepDinhKem`
- `daDoc`
- `ngayGui`

### Relationship va cardinality

- `USER ||--o| ACCOUNT : so_huu`
- `USER ||--o| CART : co`
- `USER ||--o{ ORDER : dat`
- `USER ||--o{ PAYMENT : thanh_toan`
- `USER ||--o{ REVIEW : viet`
- `USER ||--o{ FAVORITE : danh_dau`
- `USER ||--o{ USER_VOUCHER : nhan`
- `USER ||--o{ REFUND : yeu_cau`
- `USER ||--o{ CHAT_MESSAGE : gui_nhan`

- `CATEGORY o|--o{ CATEGORY : phan_cap`
- `CATEGORY ||--o{ PRODUCT : phan_loai`
- `BRAND ||--o{ PRODUCT : gan_nhan`
- `SIZE_GUIDE ||--o{ PRODUCT : huong_dan_size`
- `PRODUCT ||--o{ ORDER_ITEM : duoc_mua`
- `PRODUCT ||--o{ REVIEW : duoc_danh_gia`
- `PRODUCT ||--o{ FAVORITE : duoc_yeu_thich`
- `PRODUCT }o--o{ LOOKBOOK : trung_bay`
- `PRODUCT }o--o{ FLASH_SALE : khuyen_mai`
- `PRODUCT ||--o{ INVENTORY_LOT : ton_kho`
- `PRODUCT ||--o{ INVENTORY_ADJUSTMENT : dieu_chinh`

- `VOUCHER ||--o{ USER_VOUCHER : cap_cho`
- `VOUCHER o|--o{ ORDER : ap_dung`

- `ORDER ||--|{ ORDER_ITEM : bao_gom`
- `ORDER o|--o{ PAYMENT : phat_sinh`
- `ORDER o|--o| REFUND : hoan_tra`
- `ORDER ||--o{ REVIEW : xac_thuc_mua`
- `ORDER o|--o| EXPORT_RECEIPT : xuat_kho`
- `ORDER o|--o{ IMPORT_RECEIPT : nhap_lai`

- `EXPORT_RECEIPT ||--o{ IMPORT_RECEIPT : doi_ung`
- `IMPORT_RECEIPT ||--o{ INVENTORY_LOT : tao_lo`

- `HOME_SECTION ||--o{ BANNER : sap_xep`
- `SETTING ||--o{ HOME_SECTION : cau_hinh`

## LDM de xuat

Neu ban muon ve muc logic gan PDM hon, them cac entity trung gian sau:

- `CART_ITEM`
- `ORDER_STATUS_LOG`
- `LOGIN_LOG`
- `LOOKBOOK_PRODUCT`
- `FLASH_SALE_PRODUCT`
- `ORDER_ITEM_ALLOCATION`
- `ORDER_REFUND_REQUEST_ITEM`
- `ORDER_REFUND_RECEIVED_ITEM`
- `ORDER_REFUND_EVIDENCE`
- `REVIEW_IMAGE`
- `REVIEW_VIDEO`
- `REVIEW_TAG`
- `EXPORT_RECEIPT_ITEM`
- `EXPORT_RECEIPT_ALLOCATION`
- `IMPORT_RECEIPT_ITEM`
- `INVENTORY_ADJUSTMENT_ITEM`

Tham chieu quan he logic o file [ldm.mmd](d:\luanvan\TMDT_ThoiTrang\docs\ldm.mmd).

## Goi y bo cuc de ve dep

- Dat `USER`, `ACCOUNT`, `CART`, `ORDER`, `PAYMENT`, `REVIEW` o trung tam
- Dat `PRODUCT`, `CATEGORY`, `BRAND`, `SIZE_GUIDE`, `LOOKBOOK`, `FLASH_SALE` ben trai hoac phia tren
- Dat `EXPORT_RECEIPT`, `IMPORT_RECEIPT`, `INVENTORY_LOT`, `INVENTORY_ADJUSTMENT` ben phai
- Dat `BANNER`, `HOME_SECTION`, `SETTING`, `BLOG_POST` thanh mot cum rieng

## Thu tu nen ve

1. Ve cac entity chinh trong CDM
2. Noi relationship chinh
3. Kiem tra cardinality
4. Neu can xuong muc chi tiet, mo them LDM
5. Cuoi cung moi xuong PDM
