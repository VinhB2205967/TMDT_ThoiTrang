-- SQL DDL de reverse-engineer trong PowerDesigner
-- Nguon chuyen doi: docs/pdm.mmd
-- Dinh huong:
-- 1. Map Mongo ObjectId -> CHAR(24)
-- 2. Map String -> NVARCHAR, Number -> DECIMAL/INT, Date -> DATETIME2, Boolean -> BIT
-- 3. Cac truong Array[]/Object/Mixed duoc uu tien chuan hoa thanh bang con; mot so cau truc dong duoc luu NVARCHAR(MAX)
-- 4. Bo sung UNIQUE/NOT NULL de PowerDesigner suy ra cardinality sat hon cho cac reference

/* =========================================================
   CUSTOMER & AUTH
   ========================================================= */

CREATE TABLE users (
    _id CHAR(24) NOT NULL,
    hoten NVARCHAR(255) NULL,
    email NVARCHAR(255) NOT NULL,
    sodienthoai NVARCHAR(50) NULL,
    diachi NVARCHAR(500) NULL,
    gioitinh NVARCHAR(50) NULL,
    ngaysinh DATETIME2 NULL,
    avatar NVARCHAR(500) NULL,
    chukyso NVARCHAR(1000) NULL,
    lastSeenAt DATETIME2 NULL,
    lastLoginAt DATETIME2 NULL,
    lastLoginProvider NVARCHAR(100) NULL,
    lastLoginIp NVARCHAR(100) NULL,
    lastLoginUserAgent NVARCHAR(1000) NULL,
    daxoa BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_users PRIMARY KEY (_id),
    CONSTRAINT UQ_users_email UNIQUE (email)
);

CREATE TABLE user_addresses (
    nguoidung_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    nhan NVARCHAR(100) NULL,
    tennguoinhan NVARCHAR(255) NULL,
    sodienthoai NVARCHAR(50) NULL,
    diachi NVARCHAR(500) NULL,
    CONSTRAINT PK_user_addresses PRIMARY KEY (nguoidung_id, thu_tu),
    CONSTRAINT FK_user_addresses_users FOREIGN KEY (nguoidung_id) REFERENCES users(_id)
);

CREATE TABLE accounts (
    _id CHAR(24) NOT NULL,
    nguoidung_id CHAR(24) NOT NULL,
    email NVARCHAR(255) NULL,
    matkhau NVARCHAR(255) NULL,
    provider NVARCHAR(100) NULL,
    vaitro NVARCHAR(100) NULL,
    trangthai NVARCHAR(100) NULL,
    xacthuc BIT NOT NULL DEFAULT 0,
    tokenxacthuc NVARCHAR(500) NULL,
    tokenquenmatkhau NVARCHAR(500) NULL,
    thoigianhethan DATETIME2 NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_accounts PRIMARY KEY (_id),
    CONSTRAINT UQ_accounts_nguoidung_id UNIQUE (nguoidung_id),
    CONSTRAINT FK_accounts_users FOREIGN KEY (nguoidung_id) REFERENCES users(_id)
);

CREATE TABLE login_logs (
    _id CHAR(24) NOT NULL,
    userId CHAR(24) NOT NULL,
    email NVARCHAR(255) NULL,
    role NVARCHAR(100) NULL,
    provider NVARCHAR(100) NULL,
    status NVARCHAR(100) NULL,
    ip NVARCHAR(100) NULL,
    userAgent NVARCHAR(1000) NULL,
    message NVARCHAR(2000) NULL,
    createdAt DATETIME2 NULL,
    CONSTRAINT PK_login_logs PRIMARY KEY (_id),
    CONSTRAINT FK_login_logs_users FOREIGN KEY (userId) REFERENCES users(_id)
);

CREATE TABLE chat_messages (
    _id CHAR(24) NOT NULL,
    khachhangId CHAR(24) NOT NULL,
    nguoiguiId CHAR(24) NOT NULL,
    vaitro_nguoigui NVARCHAR(100) NULL,
    nguoinhanId CHAR(24) NOT NULL,
    vaitronguoinhan NVARCHAR(100) NULL,
    noidung NVARCHAR(MAX) NULL,
    mediaUrl NVARCHAR(1000) NULL,
    mediaType NVARCHAR(100) NULL,
    mediaMime NVARCHAR(255) NULL,
    mediaName NVARCHAR(255) NULL,
    mediaSize BIGINT NULL,
    dadoc BIT NOT NULL DEFAULT 0,
    thoigiandoc DATETIME2 NULL,
    ngaygui DATETIME2 NULL,
    CONSTRAINT PK_chat_messages PRIMARY KEY (_id),
    CONSTRAINT FK_chat_messages_customer FOREIGN KEY (khachhangId) REFERENCES users(_id),
    CONSTRAINT FK_chat_messages_sender FOREIGN KEY (nguoiguiId) REFERENCES users(_id),
    CONSTRAINT FK_chat_messages_receiver FOREIGN KEY (nguoinhanId) REFERENCES users(_id)
);

/* =========================================================
   CATALOG & PRODUCT EXPERIENCE
   ========================================================= */

CREATE TABLE categories (
    _id CHAR(24) NOT NULL,
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) NULL,
    mota NVARCHAR(2000) NULL,
    hinhanh NVARCHAR(1000) NULL,
    parent_id CHAR(24) NULL,
    level INT NULL,
    path NVARCHAR(1000) NULL,
    [order] INT NULL,
    isActive BIT NOT NULL DEFAULT 1,
    [type] NVARCHAR(100) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_categories PRIMARY KEY (_id),
    CONSTRAINT UQ_categories_slug UNIQUE (slug),
    CONSTRAINT FK_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(_id)
);

CREATE TABLE category_ancestors (
    category_id CHAR(24) NOT NULL,
    ancestor_id CHAR(24) NOT NULL,
    thu_tu INT NULL,
    CONSTRAINT PK_category_ancestors PRIMARY KEY (category_id, ancestor_id),
    CONSTRAINT FK_category_ancestors_category FOREIGN KEY (category_id) REFERENCES categories(_id),
    CONSTRAINT FK_category_ancestors_ancestor FOREIGN KEY (ancestor_id) REFERENCES categories(_id)
);

CREATE TABLE brands (
    _id CHAR(24) NOT NULL,
    ten NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) NULL,
    normalizedName NVARCHAR(255) NULL,
    logo NVARCHAR(1000) NULL,
    moTa NVARCHAR(2000) NULL,
    noiBat BIT NOT NULL DEFAULT 0,
    hienthi BIT NOT NULL DEFAULT 1,
    thuTu INT NULL,
    daXoa BIT NOT NULL DEFAULT 0,
    deletedAt DATETIME2 NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_brands PRIMARY KEY (_id),
    CONSTRAINT UQ_brands_slug UNIQUE (slug)
);

CREATE TABLE size_guides (
    _id CHAR(24) NOT NULL,
    tenbang NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) NULL,
    loaisanpham NVARCHAR(100) NULL,
    cot NVARCHAR(MAX) NULL,
    dong NVARCHAR(MAX) NULL,
    goiy NVARCHAR(2000) NULL,
    daxoa BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_size_guides PRIMARY KEY (_id),
    CONSTRAINT UQ_size_guides_slug UNIQUE (slug)
);

CREATE TABLE products (
    _id CHAR(24) NOT NULL,
    tensanpham NVARCHAR(255) NOT NULL,
    mota NVARCHAR(MAX) NULL,
    mota_hinhanh NVARCHAR(MAX) NULL,
    gia DECIMAL(18,2) NULL,
    phantramgiamgia DECIMAL(5,2) NULL,
    category CHAR(24) NOT NULL,
    ageGroup CHAR(24) NULL,
    sizeguide_id CHAR(24) NULL,
    brand CHAR(24) NOT NULL,
    luotmua INT NULL,
    mausac_chinh NVARCHAR(100) NULL,
    soluong_chinh INT NULL,
    soluongton INT NULL,
    gioitinh NVARCHAR(50) NULL,
    loaisanpham NVARCHAR(100) NULL,
    hinhanh NVARCHAR(1000) NULL,
    trangthai NVARCHAR(100) NULL,
    daxoa BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_products PRIMARY KEY (_id),
    CONSTRAINT FK_products_category FOREIGN KEY (category) REFERENCES categories(_id),
    CONSTRAINT FK_products_agegroup FOREIGN KEY (ageGroup) REFERENCES categories(_id),
    CONSTRAINT FK_products_sizeguide FOREIGN KEY (sizeguide_id) REFERENCES size_guides(_id),
    CONSTRAINT FK_products_brand FOREIGN KEY (brand) REFERENCES brands(_id)
);

CREATE TABLE product_occasions (
    product_id CHAR(24) NOT NULL,
    category_id CHAR(24) NOT NULL,
    CONSTRAINT PK_product_occasions PRIMARY KEY (product_id, category_id),
    CONSTRAINT FK_product_occasions_product FOREIGN KEY (product_id) REFERENCES products(_id),
    CONSTRAINT FK_product_occasions_category FOREIGN KEY (category_id) REFERENCES categories(_id)
);

CREATE TABLE product_sizes (
    product_id CHAR(24) NOT NULL,
    size_name NVARCHAR(50) NOT NULL,
    soluong INT NULL,
    CONSTRAINT PK_product_sizes PRIMARY KEY (product_id, size_name),
    CONSTRAINT FK_product_sizes_product FOREIGN KEY (product_id) REFERENCES products(_id)
);

CREATE TABLE product_variants (
    bienthe_id CHAR(24) NOT NULL,
    product_id CHAR(24) NOT NULL,
    mausac NVARCHAR(100) NULL,
    hinhanh NVARCHAR(1000) NULL,
    gia DECIMAL(18,2) NULL,
    phantramgiamgia DECIMAL(5,2) NULL,
    soluong INT NULL,
    CONSTRAINT PK_product_variants PRIMARY KEY (bienthe_id),
    CONSTRAINT FK_product_variants_product FOREIGN KEY (product_id) REFERENCES products(_id)
);

CREATE TABLE product_variant_sizes (
    bienthe_id CHAR(24) NOT NULL,
    size_name NVARCHAR(50) NOT NULL,
    soluong INT NULL,
    CONSTRAINT PK_product_variant_sizes PRIMARY KEY (bienthe_id, size_name),
    CONSTRAINT FK_product_variant_sizes_variant FOREIGN KEY (bienthe_id) REFERENCES product_variants(bienthe_id)
);

/* =========================================================
   CONTENT & PRESENTATION
   ========================================================= */

CREATE TABLE banners (
    _id CHAR(24) NOT NULL,
    tieude NVARCHAR(255) NULL,
    mota NVARCHAR(2000) NULL,
    hinhanh NVARCHAR(1000) NULL,
    nut_text NVARCHAR(255) NULL,
    nut_link NVARCHAR(1000) NULL,
    loai NVARCHAR(100) NULL,
    hienthi BIT NOT NULL DEFAULT 1,
    thuTu INT NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_banners PRIMARY KEY (_id)
);

CREATE TABLE blog_posts (
    _id CHAR(24) NOT NULL,
    tieude NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) NULL,
    tomtat NVARCHAR(2000) NULL,
    noidung NVARCHAR(MAX) NULL,
    hinhanh NVARCHAR(1000) NULL,
    xuatban BIT NOT NULL DEFAULT 0,
    ngayxuatban DATETIME2 NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_blog_posts PRIMARY KEY (_id),
    CONSTRAINT UQ_blog_posts_slug UNIQUE (slug)
);

CREATE TABLE lookbooks (
    _id CHAR(24) NOT NULL,
    title NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) NULL,
    hinhanh NVARCHAR(1000) NULL,
    mota NVARCHAR(2000) NULL,
    thutu INT NULL,
    hienthi BIT NOT NULL DEFAULT 1,
    ngabatdau DATETIME2 NULL,
    ngayketthuc DATETIME2 NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_lookbooks PRIMARY KEY (_id),
    CONSTRAINT UQ_lookbooks_slug UNIQUE (slug)
);

CREATE TABLE lookbook_products (
    lookbook_id CHAR(24) NOT NULL,
    sanpham_id CHAR(24) NOT NULL,
    thu_tu INT NULL,
    CONSTRAINT PK_lookbook_products PRIMARY KEY (lookbook_id, sanpham_id),
    CONSTRAINT FK_lookbook_products_lookbook FOREIGN KEY (lookbook_id) REFERENCES lookbooks(_id),
    CONSTRAINT FK_lookbook_products_product FOREIGN KEY (sanpham_id) REFERENCES products(_id)
);

CREATE TABLE flash_sales (
    _id CHAR(24) NOT NULL,
    ten NVARCHAR(255) NOT NULL,
    batdau DATETIME2 NOT NULL,
    ketthuc DATETIME2 NOT NULL,
    hienthi BIT NOT NULL DEFAULT 1,
    phantramgiamgia DECIMAL(5,2) NOT NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_flash_sales PRIMARY KEY (_id)
);

CREATE TABLE flash_sale_products (
    flash_sale_id CHAR(24) NOT NULL,
    sanpham_id CHAR(24) NOT NULL,
    giagiam DECIMAL(18,2) NULL,
    gioihan INT NULL,
    CONSTRAINT PK_flash_sale_products PRIMARY KEY (flash_sale_id, sanpham_id),
    CONSTRAINT FK_flash_sale_products_sale FOREIGN KEY (flash_sale_id) REFERENCES flash_sales(_id),
    CONSTRAINT FK_flash_sale_products_product FOREIGN KEY (sanpham_id) REFERENCES products(_id)
);

CREATE TABLE home_sections (
    _id CHAR(24) NOT NULL,
    [key] NVARCHAR(255) NOT NULL,
    tieuDe NVARCHAR(255) NULL,
    hienthi BIT NOT NULL DEFAULT 1,
    thuTu INT NULL,
    config NVARCHAR(MAX) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_home_sections PRIMARY KEY (_id),
    CONSTRAINT UQ_home_sections_key UNIQUE ([key])
);

CREATE TABLE settings (
    _id CHAR(24) NOT NULL,
    [key] NVARCHAR(255) NOT NULL,
    value NVARCHAR(MAX) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_settings PRIMARY KEY (_id),
    CONSTRAINT UQ_settings_key UNIQUE ([key])
);

/* =========================================================
   ORDERS, PAYMENTS, CARTS, REVIEWS
   ========================================================= */

CREATE TABLE carts (
    _id CHAR(24) NOT NULL,
    nguoidung_id CHAR(24) NOT NULL,
    tongtien DECIMAL(18,2) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_carts PRIMARY KEY (_id),
    CONSTRAINT UQ_carts_nguoidung_id UNIQUE (nguoidung_id),
    CONSTRAINT FK_carts_users FOREIGN KEY (nguoidung_id) REFERENCES users(_id)
);

CREATE TABLE cart_items (
    cart_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    sanpham_id CHAR(24) NOT NULL,
    bienthe_id CHAR(24) NULL,
    tensanpham NVARCHAR(255) NULL,
    hinhanh NVARCHAR(1000) NULL,
    mausac NVARCHAR(100) NULL,
    kichco NVARCHAR(50) NULL,
    gia DECIMAL(18,2) NULL,
    giagiam DECIMAL(18,2) NULL,
    thanhtien DECIMAL(18,2) NULL,
    soluong INT NOT NULL DEFAULT 1,
    CONSTRAINT PK_cart_items PRIMARY KEY (cart_id, thu_tu),
    CONSTRAINT FK_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(_id),
    CONSTRAINT FK_cart_items_product FOREIGN KEY (sanpham_id) REFERENCES products(_id),
    CONSTRAINT FK_cart_items_variant FOREIGN KEY (bienthe_id) REFERENCES product_variants(bienthe_id)
);

CREATE TABLE coupons (
    _id CHAR(24) NOT NULL,
    code NVARCHAR(100) NOT NULL,
    ten NVARCHAR(255) NOT NULL,
    mota NVARCHAR(2000) NULL,
    banner NVARCHAR(1000) NULL,
    loai NVARCHAR(100) NULL,
    giatri DECIMAL(18,2) NULL,
    don_toithieu DECIMAL(18,2) NULL,
    giam_toida DECIMAL(18,2) NULL,
    ngay_batdau DATETIME2 NULL,
    ngay_ketthuc DATETIME2 NULL,
    soluong_toida INT NULL,
    soluong_dasudung INT NULL,
    trangthai NVARCHAR(100) NULL,
    daxoa BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_coupons PRIMARY KEY (_id),
    CONSTRAINT UQ_coupons_code UNIQUE (code)
);

CREATE TABLE user_vouchers (
    nguoidung_id CHAR(24) NOT NULL,
    voucher_id CHAR(24) NOT NULL,
    isUsed BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_user_vouchers PRIMARY KEY (nguoidung_id, voucher_id),
    CONSTRAINT FK_user_vouchers_user FOREIGN KEY (nguoidung_id) REFERENCES users(_id),
    CONSTRAINT FK_user_vouchers_coupon FOREIGN KEY (voucher_id) REFERENCES coupons(_id)
);

CREATE TABLE favorites (
    nguoidung_id CHAR(24) NOT NULL,
    sanpham_id CHAR(24) NOT NULL,
    ngaythem DATETIME2 NULL,
    CONSTRAINT PK_favorites PRIMARY KEY (nguoidung_id, sanpham_id),
    CONSTRAINT FK_favorites_user FOREIGN KEY (nguoidung_id) REFERENCES users(_id),
    CONSTRAINT FK_favorites_product FOREIGN KEY (sanpham_id) REFERENCES products(_id)
);

CREATE TABLE orders (
    _id CHAR(24) NOT NULL,
    madonhang NVARCHAR(100) NOT NULL,
    nguoidung_id CHAR(24) NOT NULL,
    tennguoinhan NVARCHAR(255) NULL,
    sodienthoai NVARCHAR(50) NULL,
    email NVARCHAR(255) NULL,
    diachigiao NVARCHAR(500) NULL,
    tinh NVARCHAR(100) NULL,
    quan NVARCHAR(100) NULL,
    phuong NVARCHAR(100) NULL,
    ghichu NVARCHAR(2000) NULL,
    phuongthucthanhtoan NVARCHAR(100) NULL,
    dathanhtoan BIT NOT NULL DEFAULT 0,
    ngaythanhtoan DATETIME2 NULL,
    momoTransId NVARCHAR(100) NULL,
    momoOrderId NVARCHAR(100) NULL,
    momoRequestId NVARCHAR(100) NULL,
    momoPayUrl NVARCHAR(1000) NULL,
    momoRefunded BIT NOT NULL DEFAULT 0,
    momoRefundAt DATETIME2 NULL,
    phuongthucvanchuyen NVARCHAR(100) NULL,
    phivanchuyen DECIMAL(18,2) NULL,
    mavanchuyen NVARCHAR(100) NULL,
    voucher_id CHAR(24) NULL,
    voucher_code NVARCHAR(100) NULL,
    voucher_type NVARCHAR(100) NULL,
    voucher_value DECIMAL(18,2) NULL,
    voucher_discount DECIMAL(18,2) NULL,
    giamgia DECIMAL(18,2) NULL,
    trangthai NVARCHAR(100) NULL,
    lydohuy NVARCHAR(1000) NULL,
    ngaygiaohang DATETIME2 NULL,
    tamtinh DECIMAL(18,2) NULL,
    tongtien DECIMAL(18,2) NULL,
    tonggiamdoanhthu_hoantra DECIMAL(18,2) NULL,
    tonggiamloinhuan_hoantra DECIMAL(18,2) NULL,
    tongsoluong_hoantra INT NULL,
    daxoa BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_orders PRIMARY KEY (_id),
    CONSTRAINT UQ_orders_madonhang UNIQUE (madonhang),
    CONSTRAINT FK_orders_user FOREIGN KEY (nguoidung_id) REFERENCES users(_id),
    CONSTRAINT FK_orders_coupon FOREIGN KEY (voucher_id) REFERENCES coupons(_id)
);

CREATE TABLE order_items (
    _id CHAR(24) NOT NULL,
    donhang_id CHAR(24) NOT NULL,
    sanpham_id CHAR(24) NOT NULL,
    bienthe_id CHAR(24) NULL,
    tensanpham NVARCHAR(255) NULL,
    hinhanh NVARCHAR(1000) NULL,
    mausac NVARCHAR(100) NULL,
    kichco NVARCHAR(50) NULL,
    giagoc DECIMAL(18,2) NULL,
    giaban DECIMAL(18,2) NULL,
    soluong INT NULL,
    thanhtien DECIMAL(18,2) NULL,
    trangthai NVARCHAR(100) NULL,
    danhgia BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    CONSTRAINT PK_order_items PRIMARY KEY (_id),
    CONSTRAINT FK_order_items_order FOREIGN KEY (donhang_id) REFERENCES orders(_id),
    CONSTRAINT FK_order_items_product FOREIGN KEY (sanpham_id) REFERENCES products(_id),
    CONSTRAINT FK_order_items_variant FOREIGN KEY (bienthe_id) REFERENCES product_variants(bienthe_id)
);

CREATE TABLE order_item_fifo_allocations (
    order_item_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    lot_id CHAR(24) NULL,
    soLuong INT NULL,
    giaNhap DECIMAL(18,2) NULL,
    giaBanDeXuat DECIMAL(18,2) NULL,
    giaban DECIMAL(18,2) NULL,
    giasaugiam DECIMAL(18,2) NULL,
    doanhthu DECIMAL(18,2) NULL,
    giavon DECIMAL(18,2) NULL,
    loinhuan DECIMAL(18,2) NULL,
    CONSTRAINT PK_order_item_fifo_allocations PRIMARY KEY (order_item_id, thu_tu),
    CONSTRAINT FK_order_item_fifo_allocations_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(_id)
);

CREATE TABLE order_refunds (
    _id CHAR(24) NOT NULL,
    donhang_id CHAR(24) NOT NULL,
    nguoidung_id CHAR(24) NOT NULL,
    madonhang NVARCHAR(100) NULL,
    trangthai_donhang NVARCHAR(100) NULL,
    thoigianguiyeucau DATETIME2 NULL,
    lydo NVARCHAR(1000) NULL,
    nhanlydo NVARCHAR(255) NULL,
    motachitiet NVARCHAR(MAX) NULL,
    minhchung NVARCHAR(1000) NULL,
    hinhanhminhchung NVARCHAR(1000) NULL,
    phuongthuchoantien NVARCHAR(100) NULL,
    vihoantien NVARCHAR(255) NULL,
    tennganhanghoantien NVARCHAR(255) NULL,
    tenchutaikhoanhoantien NVARCHAR(255) NULL,
    sotaikhoanhoantien NVARCHAR(100) NULL,
    sotienhoan DECIMAL(18,2) NULL,
    ghichuadmin NVARCHAR(2000) NULL,
    thoigianduyet DATETIME2 NULL,
    thoigianduyetchapnhan DATETIME2 NULL,
    thoigiantuchoi DATETIME2 NULL,
    thoigiannhanhanghoan DATETIME2 NULL,
    thoigianhoantien DATETIME2 NULL,
    dahuyboibannguoidung BIT NOT NULL DEFAULT 0,
    thoigianhuyboibannguoidung DATETIME2 NULL,
    hanhdongcuoi NVARCHAR(255) NULL,
    nguoithuchiencuoi_id CHAR(24) NULL,
    vaitronguoithuchiencuoi NVARCHAR(100) NULL,
    tennguoithuchiencuoi NVARCHAR(255) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_order_refunds PRIMARY KEY (_id),
    CONSTRAINT UQ_order_refunds_donhang UNIQUE (donhang_id),
    CONSTRAINT FK_order_refunds_order FOREIGN KEY (donhang_id) REFERENCES orders(_id),
    CONSTRAINT FK_order_refunds_user FOREIGN KEY (nguoidung_id) REFERENCES users(_id),
    CONSTRAINT FK_order_refunds_last_actor FOREIGN KEY (nguoithuchiencuoi_id) REFERENCES users(_id)
);

CREATE TABLE order_refund_requested_items (
    order_refund_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    madongdonhang CHAR(24) NULL,
    soluongyeucauhoan INT NULL,
    soluongdamua INT NULL,
    tensanpham NVARCHAR(255) NULL,
    hinhanh NVARCHAR(1000) NULL,
    kichco NVARCHAR(50) NULL,
    mausac NVARCHAR(100) NULL,
    gianhap DECIMAL(18,2) NULL,
    giabandexuat DECIMAL(18,2) NULL,
    CONSTRAINT PK_order_refund_requested_items PRIMARY KEY (order_refund_id, thu_tu),
    CONSTRAINT FK_order_refund_requested_items_refund FOREIGN KEY (order_refund_id) REFERENCES order_refunds(_id),
    CONSTRAINT FK_order_refund_requested_items_order_item FOREIGN KEY (madongdonhang) REFERENCES order_items(_id)
);

CREATE TABLE order_refund_received_items (
    order_refund_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    madongdonhang CHAR(24) NULL,
    soluongyeucauhoan INT NULL,
    soluongdamua INT NULL,
    tensanpham NVARCHAR(255) NULL,
    hinhanh NVARCHAR(1000) NULL,
    kichco NVARCHAR(50) NULL,
    mausac NVARCHAR(100) NULL,
    gianhap DECIMAL(18,2) NULL,
    giabandexuat DECIMAL(18,2) NULL,
    CONSTRAINT PK_order_refund_received_items PRIMARY KEY (order_refund_id, thu_tu),
    CONSTRAINT FK_order_refund_received_items_refund FOREIGN KEY (order_refund_id) REFERENCES order_refunds(_id),
    CONSTRAINT FK_order_refund_received_items_order_item FOREIGN KEY (madongdonhang) REFERENCES order_items(_id)
);

CREATE TABLE order_refund_evidences (
    order_refund_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    media_url NVARCHAR(1000) NOT NULL,
    CONSTRAINT PK_order_refund_evidences PRIMARY KEY (order_refund_id, thu_tu),
    CONSTRAINT FK_order_refund_evidences_refund FOREIGN KEY (order_refund_id) REFERENCES order_refunds(_id)
);

CREATE TABLE order_status_logs (
    _id CHAR(24) NOT NULL,
    donhang_id CHAR(24) NOT NULL,
    nguoidung_id CHAR(24) NULL,
    madonhang NVARCHAR(100) NULL,
    trangthai_cu NVARCHAR(100) NULL,
    trangthai_moi NVARCHAR(100) NULL,
    hanhdong NVARCHAR(255) NULL,
    ghichu NVARCHAR(2000) NULL,
    actorId CHAR(24) NULL,
    actorRole NVARCHAR(100) NULL,
    actorName NVARCHAR(255) NULL,
    uniqueKey NVARCHAR(255) NULL,
    metadata NVARCHAR(MAX) NULL,
    ngaytao DATETIME2 NULL,
    CONSTRAINT PK_order_status_logs PRIMARY KEY (_id),
    CONSTRAINT FK_order_status_logs_order FOREIGN KEY (donhang_id) REFERENCES orders(_id),
    CONSTRAINT FK_order_status_logs_user FOREIGN KEY (nguoidung_id) REFERENCES users(_id),
    CONSTRAINT FK_order_status_logs_actor FOREIGN KEY (actorId) REFERENCES users(_id)
);

CREATE TABLE pays (
    _id CHAR(24) NOT NULL,
    donhang_id CHAR(24) NOT NULL,
    nguoidung_id CHAR(24) NOT NULL,
    magiaodich NVARCHAR(100) NULL,
    phuongthuc NVARCHAR(100) NULL,
    sotien DECIMAL(18,2) NULL,
    trangthai NVARCHAR(100) NULL,
    chitiet NVARCHAR(MAX) NULL,
    response NVARCHAR(MAX) NULL,
    ghichu NVARCHAR(2000) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_pays PRIMARY KEY (_id),
    CONSTRAINT FK_pays_order FOREIGN KEY (donhang_id) REFERENCES orders(_id),
    CONSTRAINT FK_pays_user FOREIGN KEY (nguoidung_id) REFERENCES users(_id)
);

CREATE TABLE reviews (
    _id CHAR(24) NOT NULL,
    sanpham_id CHAR(24) NOT NULL,
    nguoidung_id CHAR(24) NOT NULL,
    donhang_id CHAR(24) NOT NULL,
    chitietdonhang_id CHAR(24) NOT NULL,
    diem INT NULL,
    tieude NVARCHAR(255) NULL,
    noidung NVARCHAR(MAX) NULL,
    mausac NVARCHAR(100) NULL,
    kichco NVARCHAR(50) NULL,
    phanhoi NVARCHAR(MAX) NULL,
    thich INT NULL,
    trangthai NVARCHAR(100) NULL,
    hienthi BIT NOT NULL DEFAULT 1,
    lydoan NVARCHAR(1000) NULL,
    anboi CHAR(24) NULL,
    ngayan DATETIME2 NULL,
    xoaBoi CHAR(24) NULL,
    ngayxoa DATETIME2 NULL,
    biBaoCao BIT NOT NULL DEFAULT 0,
    soBaoCao INT NULL,
    daxoa BIT NOT NULL DEFAULT 0,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_reviews PRIMARY KEY (_id),
    CONSTRAINT FK_reviews_product FOREIGN KEY (sanpham_id) REFERENCES products(_id),
    CONSTRAINT FK_reviews_user FOREIGN KEY (nguoidung_id) REFERENCES users(_id),
    CONSTRAINT FK_reviews_order FOREIGN KEY (donhang_id) REFERENCES orders(_id),
    CONSTRAINT FK_reviews_order_item FOREIGN KEY (chitietdonhang_id) REFERENCES order_items(_id),
    CONSTRAINT FK_reviews_hidden_by FOREIGN KEY (anboi) REFERENCES users(_id),
    CONSTRAINT FK_reviews_deleted_by FOREIGN KEY (xoaBoi) REFERENCES users(_id)
);

CREATE TABLE review_images (
    review_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    image_url NVARCHAR(1000) NOT NULL,
    CONSTRAINT PK_review_images PRIMARY KEY (review_id, thu_tu),
    CONSTRAINT FK_review_images_review FOREIGN KEY (review_id) REFERENCES reviews(_id)
);

CREATE TABLE review_videos (
    review_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    video_url NVARCHAR(1000) NOT NULL,
    CONSTRAINT PK_review_videos PRIMARY KEY (review_id, thu_tu),
    CONSTRAINT FK_review_videos_review FOREIGN KEY (review_id) REFERENCES reviews(_id)
);

CREATE TABLE review_tags (
    review_id CHAR(24) NOT NULL,
    tag_value NVARCHAR(255) NOT NULL,
    CONSTRAINT PK_review_tags PRIMARY KEY (review_id, tag_value),
    CONSTRAINT FK_review_tags_review FOREIGN KEY (review_id) REFERENCES reviews(_id)
);

/* =========================================================
   WAREHOUSE & INVENTORY
   ========================================================= */

CREATE TABLE export_receipts (
    _id CHAR(24) NOT NULL,
    maphieu NVARCHAR(100) NOT NULL,
    donhang_id CHAR(24) NOT NULL,
    madonhang NVARCHAR(100) NULL,
    ngayxuat DATETIME2 NULL,
    noinhan NVARCHAR(255) NULL,
    lydo NVARCHAR(1000) NULL,
    tongsoluong INT NULL,
    tongdoanhthu DECIMAL(18,2) NULL,
    tonggiavon DECIMAL(18,2) NULL,
    tongloinhuan DECIMAL(18,2) NULL,
    tongdoanhthuhoan DECIMAL(18,2) NULL,
    tonggiavonhoan DECIMAL(18,2) NULL,
    tongloinhuanhoan DECIMAL(18,2) NULL,
    tysuatloinhuan DECIMAL(9,2) NULL,
    nguoitaophieu NVARCHAR(100) NULL,
    nhanvienky NVARCHAR(MAX) NULL,
    nguoitao CHAR(24) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_export_receipts PRIMARY KEY (_id),
    CONSTRAINT UQ_export_receipts_maphieu UNIQUE (maphieu),
    CONSTRAINT UQ_export_receipts_donhang UNIQUE (donhang_id),
    CONSTRAINT FK_export_receipts_order FOREIGN KEY (donhang_id) REFERENCES orders(_id),
    CONSTRAINT FK_export_receipts_creator FOREIGN KEY (nguoitao) REFERENCES users(_id)
);

CREATE TABLE export_receipt_items (
    export_receipt_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    sanphamid CHAR(24) NOT NULL,
    tensanpham NVARCHAR(255) NULL,
    bientheid CHAR(24) NULL,
    kichco NVARCHAR(50) NULL,
    mausac NVARCHAR(100) NULL,
    soluong INT NULL,
    gianhap DECIMAL(18,2) NULL,
    giaban DECIMAL(18,2) NULL,
    phantramgiam DECIMAL(5,2) NULL,
    giasaugiam DECIMAL(18,2) NULL,
    doanhthu DECIMAL(18,2) NULL,
    giavon DECIMAL(18,2) NULL,
    loinhuan DECIMAL(18,2) NULL,
    soluonghoan INT NULL,
    doanhthuhoan DECIMAL(18,2) NULL,
    giavonhoan DECIMAL(18,2) NULL,
    loinhuanhoan DECIMAL(18,2) NULL,
    hinhanh NVARCHAR(1000) NULL,
    ghichudong NVARCHAR(1000) NULL,
    CONSTRAINT PK_export_receipt_items PRIMARY KEY (export_receipt_id, thu_tu),
    CONSTRAINT FK_export_receipt_items_receipt FOREIGN KEY (export_receipt_id) REFERENCES export_receipts(_id),
    CONSTRAINT FK_export_receipt_items_product FOREIGN KEY (sanphamid) REFERENCES products(_id),
    CONSTRAINT FK_export_receipt_items_variant FOREIGN KEY (bientheid) REFERENCES product_variants(bienthe_id)
);

CREATE TABLE export_receipt_item_allocations (
    export_receipt_id CHAR(24) NOT NULL,
    export_item_thu_tu INT NOT NULL,
    thu_tu INT NOT NULL,
    lotId CHAR(24) NULL,
    soLuong INT NULL,
    soluonghoan INT NULL,
    giaNhap DECIMAL(18,2) NULL,
    giaBanDeXuat DECIMAL(18,2) NULL,
    giaban DECIMAL(18,2) NULL,
    phantramgiam DECIMAL(5,2) NULL,
    giasaugiam DECIMAL(18,2) NULL,
    doanhthu DECIMAL(18,2) NULL,
    giavon DECIMAL(18,2) NULL,
    loinhuan DECIMAL(18,2) NULL,
    CONSTRAINT PK_export_receipt_item_allocations PRIMARY KEY (export_receipt_id, export_item_thu_tu, thu_tu),
    CONSTRAINT FK_export_receipt_item_allocations_item FOREIGN KEY (export_receipt_id, export_item_thu_tu) REFERENCES export_receipt_items(export_receipt_id, thu_tu)
);

CREATE TABLE import_receipts (
    _id CHAR(24) NOT NULL,
    maphieu NVARCHAR(100) NOT NULL,
    loaiphieu NVARCHAR(100) NULL,
    tenloaiphieu NVARCHAR(255) NULL,
    nguonnhap NVARCHAR(255) NULL,
    donhang_id CHAR(24) NULL,
    madonhang NVARCHAR(100) NULL,
    phieuxuat_id CHAR(24) NULL,
    maphieuxuat NVARCHAR(100) NULL,
    ngaynhap DATETIME2 NULL,
    nhacungcap NVARCHAR(255) NULL,
    ghichu NVARCHAR(2000) NULL,
    tongtiennhap DECIMAL(18,2) NULL,
    daxuatkho BIT NOT NULL DEFAULT 0,
    ngayxuatkho DATETIME2 NULL,
    nguoixuatkho CHAR(24) NULL,
    nhanvienky NVARCHAR(MAX) NULL,
    nguoitao CHAR(24) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_import_receipts PRIMARY KEY (_id),
    CONSTRAINT UQ_import_receipts_maphieu UNIQUE (maphieu),
    CONSTRAINT FK_import_receipts_order FOREIGN KEY (donhang_id) REFERENCES orders(_id),
    CONSTRAINT FK_import_receipts_export FOREIGN KEY (phieuxuat_id) REFERENCES export_receipts(_id),
    CONSTRAINT FK_import_receipts_export_user FOREIGN KEY (nguoixuatkho) REFERENCES users(_id),
    CONSTRAINT FK_import_receipts_creator FOREIGN KEY (nguoitao) REFERENCES users(_id)
);

CREATE TABLE import_receipt_items (
    import_receipt_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    chisoblock INT NULL,
    sanphamid CHAR(24) NOT NULL,
    orderitemid CHAR(24) NULL,
    tensanpham NVARCHAR(255) NULL,
    masku NVARCHAR(100) NULL,
    danhmuc NVARCHAR(255) NULL,
    chatlieu NVARCHAR(255) NULL,
    hinhanh NVARCHAR(1000) NULL,
    bientheid CHAR(24) NULL,
    kichco NVARCHAR(50) NULL,
    mausac NVARCHAR(100) NULL,
    soluong INT NULL,
    gianhap DECIMAL(18,2) NULL,
    giabandexuat DECIMAL(18,2) NULL,
    CONSTRAINT PK_import_receipt_items PRIMARY KEY (import_receipt_id, thu_tu),
    CONSTRAINT FK_import_receipt_items_receipt FOREIGN KEY (import_receipt_id) REFERENCES import_receipts(_id),
    CONSTRAINT FK_import_receipt_items_product FOREIGN KEY (sanphamid) REFERENCES products(_id),
    CONSTRAINT FK_import_receipt_items_order_item FOREIGN KEY (orderitemid) REFERENCES order_items(_id),
    CONSTRAINT FK_import_receipt_items_variant FOREIGN KEY (bientheid) REFERENCES product_variants(bienthe_id)
);

CREATE TABLE inventory_lots (
    _id CHAR(24) NOT NULL,
    phieunhap_id CHAR(24) NOT NULL,
    maphieunhap NVARCHAR(100) NULL,
    ngaynhap DATETIME2 NULL,
    nhacungcap NVARCHAR(255) NULL,
    sanphamid CHAR(24) NOT NULL,
    bientheid CHAR(24) NULL,
    kichco NVARCHAR(50) NULL,
    mausac NVARCHAR(100) NULL,
    gianhap DECIMAL(18,2) NULL,
    giabandexuat DECIMAL(18,2) NULL,
    soluongnhap INT NULL,
    soluongconlai INT NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_inventory_lots PRIMARY KEY (_id),
    CONSTRAINT FK_inventory_lots_import_receipt FOREIGN KEY (phieunhap_id) REFERENCES import_receipts(_id),
    CONSTRAINT FK_inventory_lots_product FOREIGN KEY (sanphamid) REFERENCES products(_id),
    CONSTRAINT FK_inventory_lots_variant FOREIGN KEY (bientheid) REFERENCES product_variants(bienthe_id)
);

CREATE TABLE inventory_adjustments (
    _id CHAR(24) NOT NULL,
    maphieu NVARCHAR(100) NOT NULL,
    loaiphieu NVARCHAR(100) NULL,
    lydo NVARCHAR(1000) NULL,
    daxacnhan BIT NOT NULL DEFAULT 0,
    ngayxacnhan DATETIME2 NULL,
    nguoixacnhan CHAR(24) NULL,
    nguoitao CHAR(24) NULL,
    ngaytao DATETIME2 NULL,
    ngaycapnhat DATETIME2 NULL,
    CONSTRAINT PK_inventory_adjustments PRIMARY KEY (_id),
    CONSTRAINT UQ_inventory_adjustments_maphieu UNIQUE (maphieu),
    CONSTRAINT FK_inventory_adjustments_approver FOREIGN KEY (nguoixacnhan) REFERENCES users(_id),
    CONSTRAINT FK_inventory_adjustments_creator FOREIGN KEY (nguoitao) REFERENCES users(_id)
);

CREATE TABLE inventory_adjustment_items (
    inventory_adjustment_id CHAR(24) NOT NULL,
    thu_tu INT NOT NULL,
    sanphamid CHAR(24) NOT NULL,
    tensanpham NVARCHAR(255) NULL,
    bientheid CHAR(24) NULL,
    kichco NVARCHAR(50) NULL,
    mausac NVARCHAR(100) NULL,
    soluongdieuchinh INT NULL,
    tontruoc INT NULL,
    tonsau INT NULL,
    CONSTRAINT PK_inventory_adjustment_items PRIMARY KEY (inventory_adjustment_id, thu_tu),
    CONSTRAINT FK_inventory_adjustment_items_adjustment FOREIGN KEY (inventory_adjustment_id) REFERENCES inventory_adjustments(_id),
    CONSTRAINT FK_inventory_adjustment_items_product FOREIGN KEY (sanphamid) REFERENCES products(_id),
    CONSTRAINT FK_inventory_adjustment_items_variant FOREIGN KEY (bientheid) REFERENCES product_variants(bienthe_id)
);

/* =========================================================
   RECOMMENDED INDEXES FOR POWERDESIGNER / RDBMS
   ========================================================= */

CREATE INDEX IX_accounts_nguoidung_id ON accounts(nguoidung_id);
CREATE INDEX IX_carts_nguoidung_id ON carts(nguoidung_id);
CREATE INDEX IX_cart_items_sanpham_id ON cart_items(sanpham_id);
CREATE INDEX IX_user_vouchers_user_coupon ON user_vouchers(nguoidung_id, voucher_id);
CREATE INDEX IX_favorites_user_product ON favorites(nguoidung_id, sanpham_id);
CREATE INDEX IX_products_category ON products(category);
CREATE INDEX IX_products_brand ON products(brand);
CREATE INDEX IX_product_occasions_product ON product_occasions(product_id);
CREATE INDEX IX_product_sizes_product ON product_sizes(product_id);
CREATE INDEX IX_product_variants_product ON product_variants(product_id);
CREATE INDEX IX_product_variant_sizes_variant ON product_variant_sizes(bienthe_id);
CREATE INDEX IX_lookbook_products_lookbook ON lookbook_products(lookbook_id);
CREATE INDEX IX_lookbook_products_product ON lookbook_products(sanpham_id);
CREATE INDEX IX_flash_sale_products_sale ON flash_sale_products(flash_sale_id);
CREATE INDEX IX_flash_sale_products_product ON flash_sale_products(sanpham_id);
CREATE INDEX IX_orders_nguoidung_id ON orders(nguoidung_id);
CREATE INDEX IX_orders_voucher_id ON orders(voucher_id);
CREATE INDEX IX_order_items_donhang_id ON order_items(donhang_id);
CREATE INDEX IX_order_items_sanpham_id ON order_items(sanpham_id);
CREATE INDEX IX_order_refunds_donhang_id ON order_refunds(donhang_id);
CREATE INDEX IX_order_refunds_nguoidung_id ON order_refunds(nguoidung_id);
CREATE INDEX IX_order_refund_requested_items_refund ON order_refund_requested_items(order_refund_id);
CREATE INDEX IX_order_refund_received_items_refund ON order_refund_received_items(order_refund_id);
CREATE INDEX IX_order_refund_evidences_refund ON order_refund_evidences(order_refund_id);
CREATE INDEX IX_reviews_sanpham_id ON reviews(sanpham_id);
CREATE INDEX IX_reviews_nguoidung_id ON reviews(nguoidung_id);
CREATE INDEX IX_review_images_review_id ON review_images(review_id);
CREATE INDEX IX_review_videos_review_id ON review_videos(review_id);
CREATE INDEX IX_review_tags_review_id ON review_tags(review_id);
CREATE INDEX IX_pays_donhang_id ON pays(donhang_id);
CREATE INDEX IX_order_status_logs_donhang_id ON order_status_logs(donhang_id);
CREATE INDEX IX_export_receipts_donhang_id ON export_receipts(donhang_id);
CREATE INDEX IX_export_receipt_items_receipt_id ON export_receipt_items(export_receipt_id);
CREATE INDEX IX_export_receipt_items_product_id ON export_receipt_items(sanphamid);
CREATE INDEX IX_import_receipts_donhang_id ON import_receipts(donhang_id);
CREATE INDEX IX_import_receipts_phieuxuat_id ON import_receipts(phieuxuat_id);
CREATE INDEX IX_import_receipt_items_receipt_id ON import_receipt_items(import_receipt_id);
CREATE INDEX IX_import_receipt_items_product_id ON import_receipt_items(sanphamid);
CREATE INDEX IX_inventory_lots_phieunhap_id ON inventory_lots(phieunhap_id);
CREATE INDEX IX_inventory_lots_sanphamid ON inventory_lots(sanphamid);
CREATE INDEX IX_inventory_adjustment_items_adjustment_id ON inventory_adjustment_items(inventory_adjustment_id);
CREATE INDEX IX_inventory_adjustment_items_product_id ON inventory_adjustment_items(sanphamid);
