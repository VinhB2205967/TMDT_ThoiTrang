# TMDT_THOITRANG

## Chạy dự án

1) Cài dependency:

`npm install`

2) Tạo file `.env` (ví dụ):

```
PORT=3000
MONGODB_URL=mongodb://127.0.0.1:27017/tmdt_thoitrang
SESSION_SECRET=fashion-secret-key

# Seed admin (tự tạo nếu chưa tồn tại)
ADMIN_EMAIL=admin@fashion.local
ADMIN_PASSWORD=Admin@123

# VNPAY (test)
VNPAY_TMN_CODE=QE1VDWEU
VNPAY_HASH_SECRET=XCXWH57VAFRMA84XBQ9WDF38NXROVLEG
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/cart/vnpay/return
VNPAY_IPN_URL=http://localhost:3000/cart/vnpay/ipn


# MoMo (test)
MOMO_PARTNER_CODE=MOMO
MOMO_ACCESS_KEY=YOUR_ACCESS_KEY
MOMO_SECRET_KEY=YOUR_SECRET_KEY
MOMO_REDIRECT_URL=http://localhost:3000/cart/momo/return
MOMO_IPN_URL=http://localhost:3000/cart/momo/ipn
MOMO_REQUEST_TYPE=captureWallet
MOMO_LANG=vi

# Google Login (tùy chọn)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# App URL + SMTP (quên mật khẩu)
APP_BASE_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_NAME=Fashion Store
SMTP_FROM_EMAIL=your_email@gmail.com

# Ollama AI Chat
OLLAMA_API_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
OLLAMA_TIMEOUT_MS=30000
```

3) Chạy:

`npm start`

4) Chạy Ollama cho AI chatbox:

`ollama serve`

Roi pull model (neu chua co):

`ollama pull gemma3:4b`

Co the doi model bang bien `OLLAMA_MODEL` trong `.env`.

## Backfill Lo FIFO

- Dùng khi đã có dữ liệu phiếu nhập/xuất cũ nhưng chưa có bảng lô tồn (`inventory_lots`).
- Lệnh chạy:

`npm run backfill:inventory:lots`

- Script sẽ:
	- Xóa dữ liệu cũ trong `inventory_lots`.
	- Tạo lại toàn bộ lô từ `import_receipts`.
	- Trừ lô theo lịch sử `export_receipts` theo FIFO để ra `soluongconlai` hiện tại.

## Đăng nhập / Đăng ký

- Trang auth dùng chung: `/auth` (tab Đăng nhập/Đăng ký trên cùng 1 trang).
- Đăng nhập admin đúng role sẽ tự chuyển sang `/admin`, user thường sẽ về `/`.
- Google Login: truy cập `/auth/google` (cần cấu hình biến môi trường Google ở trên).

## Quên mật khẩu

- Trang nhập email: `/forgot-password`
- Gửi email reset: `POST /forgot-password`
- Trang đặt lại mật khẩu: `/reset-password?token=...`
- Xử lý đặt lại mật khẩu: `POST /reset-password`

Token reset được tạo ngẫu nhiên bằng `crypto`, lưu dạng hash SHA-256 trong `accounts.tokenquenmatkhau`, hết hạn sau 15 phút (`accounts.thoigianhethan`) và bị xóa sau khi đặt lại mật khẩu thành công.

## Email đơn hàng tự động

- Khi admin đổi trạng thái đơn sang `daxacnhan` (`POST /admin/orders/:id/status`) hệ thống gửi email xác nhận đơn.
- Khi admin đổi trạng thái đơn sang `dagiao` hệ thống gửi email hoàn thành đơn (kèm nút đánh giá).
- Hệ thống chỉ gửi khi trạng thái thực sự thay đổi (kiểm tra `modifiedCount`).
- Tránh gửi trùng bằng cờ trong DB:
	- `orders.emailxacnhan_dagui`
	- `orders.emaildagiao_dagui`
- Nếu gửi thất bại, hệ thống ghi `orders.emailloi_cuoi` và trả thông báo lỗi để admin biết.

## Cấu trúc dự án

```
.
├─ index.js
├─ nodemon.json
├─ package.json
├─ README.md
├─ config/
│  ├─ constants.js
│  ├─ database.js
│  ├─ passport.js
│  └─ system.js
├─ controllers/
│  ├─ admin/
│  │  ├─ auth_controller.js
│  │  ├─ dashboard_controller.js
│  │  ├─ products_controller.js
│  │  └─ users_controller.js
│  └─ client/
│     ├─ account_controller.js
│     ├─ auth_controller.js
│     ├─ cart_controller.js
│     ├─ favorites_controller.js
│     ├─ home_controller.js
│     ├─ orders_controller.js
│     └─ product_controller.js
├─ helpers/
│  ├─ filterStatus.js
│  ├─ orderStatus.js
│  ├─ pagination.js
│  ├─ product.helper.js
│  ├─ product.js
│  ├─ productView.js
│  ├─ search.js
│  └─ validators.js
├─ middlewares/
│  ├─ auth.js
│  ├─ cart.js
│  └─ mongoSanitize.js
├─ models/
│  ├─ cart_model.js
│  ├─ category_model.js
│  ├─ coupon_model.js
│  ├─ favorite_model.js
│  ├─ index.js
│  ├─ login_log_model.js
│  ├─ order_item_model.js
│  ├─ order_model.js
│  ├─ pay_model.js
│  ├─ product_model.js
│  ├─ review_model.js
│  └─ user_model.js
├─ public/
│  ├─ admin/
│  │  ├─ css/
│  │  │  └─ admin.css
│  │  └─ js/
│  │     ├─ admin.js
│  │     ├─ filterAutoSubmit.js
│  │     └─ products.js
│  ├─ css/
│  │  ├─ auth.css
│  │  ├─ filter-bar.css
│  │  ├─ product-card.css
│  │  ├─ product-detail.css
│  │  ├─ products.css
│  │  ├─ style.css
│  │  └─ ui-enhancements.css
│  ├─ images/
│  ├─ js/
│  │  ├─ auth.js
│  │  ├─ favorites.js
│  │  ├─ product-detail.js
│  │  ├─ products.js
│  │  ├─ script.js
│  │  ├─ up.js
│  │  └─ shared/
│  │     ├─ flash.js
│  │     └─ utils.js
│  └─ uploads/
│     ├─ avatars/
│     └─ products/
├─ routes/
│  ├─ admin/
│  │  ├─ auth_route.js
│  │  ├─ dashboard_route.js
│  │  ├─ index_route.js
│  │  ├─ products_route.js
│  │  └─ users_route.js
│  └─ client/
│     ├─ account_route.js
│     ├─ auth_route.js
│     ├─ cart_route.js
│     ├─ favorites_route.js
│     ├─ home_route.js
│     ├─ index_route.js
│     ├─ orders_route.js
│     └─ products_route.js
├─ services/
│  ├─ cart.service.js
│  ├─ loginLog.js
│  ├─ product.service.js
│  └─ seedAdmin.js
└─ views/
	├─ admin/
	│  ├─ layouts/
	│  │  ├─ auth.pug
	│  │  └─ default.pug
	│  ├─ mixins/
	│  │  ├─ box_head.pug
	│  │  ├─ filter_status.pug
	│  │  ├─ page.pug
	│  │  └─ search.pug
	│  ├─ pages/
	│  │  ├─ auth/
	│  │  ├─ dashboard/
	│  │  ├─ products/
	│  │  └─ users/
	│  └─ partials/
	│     ├─ header.pug
	│     └─ sider.pug
	├─ client/
	│  ├─ layouts/
	│  │  └─ default.pug
	│  ├─ mixins/
	│  │  └─ box_head.pug
	│  ├─ pages/
	│  │  ├─ account/
	│  │  ├─ auth/
	│  │  ├─ cart/
	│  │  ├─ favorites/
	│  │  ├─ home/
	│  │  ├─ orders/
	│  │  └─ products/
	│  └─ partials/
	│     ├─ footer.pug
	│     ├─ header.pug
	│     ├─ product.validate.js
	│     └─ quick_add_modal.pug
	└─ partials/
		└─ flash.pug
```