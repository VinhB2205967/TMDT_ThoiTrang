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
```

3) Chạy:

`npm start`

## Đăng nhập / Đăng ký

- Trang auth dùng chung: `/auth` (tab Đăng nhập/Đăng ký trên cùng 1 trang).
- Đăng nhập admin đúng role sẽ tự chuyển sang `/admin`, user thường sẽ về `/`.
- Google Login: truy cập `/auth/google` (cần cấu hình biến môi trường Google ở trên).

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