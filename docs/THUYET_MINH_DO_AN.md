# Thuyết minh đồ án TMDT_ThoiTrang

## 1. Tổng quan
Đồ án xây dựng website thương mại điện tử thời trang theo mô hình **SSR (Server-Side Rendering)** với **Express + Pug**. Hệ thống gồm 2 phần giao diện:
- **Client**: trang mua sắm cho người dùng.
- **Admin**: trang quản trị.

Backend chịu trách nhiệm xử lý nghiệp vụ, truy vấn MongoDB và render giao diện Pug; frontend dùng HTML/Pug + CSS/JS, đồng thời gọi một số API bằng `fetch` để cập nhật nhanh trên giao diện.

## 2. Kiến trúc tổng thể (MVC + SSR)

**Luồng xử lý trang (SSR):**
1. Trình duyệt gửi request (ví dụ `/products`).
2. Express nhận request → **Router** chọn đúng controller.
3. **Controller** gọi **Service/Model** để lấy dữ liệu từ MongoDB.
4. Controller trả về `res.render()` với dữ liệu.
5. **Pug view** render HTML → trả về cho trình duyệt.

**Luồng xử lý API/AJAX:**
1. Frontend JS gọi API (ví dụ `/favorites/toggle/:id`).
2. Router → Controller xử lý nghiệp vụ.
3. Controller trả về JSON (`success`, `message`, `data`...).
4. JS cập nhật giao diện ngay trên client.

## 3. Kết nối Backend – Frontend (chi tiết)

### 3.1. Cấu hình ứng dụng
- [index.js](index.js) khởi tạo Express, Pug, middleware, session và mount routes.
- Static assets (CSS/JS/Images) nằm trong thư mục [public/](public/).
- Views Pug nằm trong [views/](views/), chia theo **admin** và **client**.

### 3.2. Session & Authentication
- Session client và admin được tách riêng bằng 2 cookie khác nhau.
- Passport dùng để quản lý đăng nhập.
- Middleware **auth**:
  - `requireAuth`: bảo vệ các trang cần đăng nhập (cart, orders, account, favorites...).
  - `requireAdmin`: bảo vệ trang `/admin`.
  - `attachUserToLocals`: đưa `user`, `isAuthenticated`, `isAdmin` vào Pug.

### 3.3. Gắn dữ liệu chung cho giao diện
- Middleware `attachCartCount` tự động đếm số sản phẩm trong giỏ và đưa vào `res.locals.cartCount`.
- Nhờ đó, layout Pug có thể hiển thị badge giỏ hàng ở mọi trang.

### 3.4. Kết nối frontend bằng API JS
- [public/js/shared/utils.js](public/js/shared/utils.js) cung cấp `App.apiFetch()` để gọi API và xử lý JSON an toàn.
- Ví dụ thực tế:
  - [public/js/favorites.js](public/js/favorites.js) gọi `/favorites/remove/:id` bằng `fetch`.
  - Các form cart/checkout gửi POST về `/cart/*`.

### 3.5. Thanh toán
- **MoMo**: tạo request thanh toán ở [services/momo.service.js](services/momo.service.js).
- **VNPAY**: tạo URL và kiểm tra chữ ký ở [services/vnpay.service.js](services/vnpay.service.js).
- Các endpoint liên quan nằm trong [routes/client/cart_route.js](routes/client/cart_route.js):
  - `/cart/momo/return`, `/cart/momo/ipn`
  - `/cart/vnpay/return`, `/cart/vnpay/ipn`

## 4. Các API/Route chính

### 4.1. Client routes
- **Home**: `GET /`
- **Products**:
  - `GET /products`
  - `GET /products/:id`
  - `GET /products/:id/options`
- **Auth**:
  - `GET /auth` (đăng nhập/đăng ký chung)
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/google`, `GET /auth/google/callback`
- **Favorites**:
  - `GET /favorites`
  - `GET /favorites/ids`
  - `POST /favorites/add/:id`
  - `POST /favorites/remove/:id`
  - `POST /favorites/toggle/:id`
- **Cart**:
  - `GET /cart`
  - `POST /cart/add`
  - `POST /cart/buy-now`
  - `POST /cart/update`
  - `POST /cart/update-options`
  - `POST /cart/remove`
  - `POST /cart/clear`
  - `GET /cart/checkout`
  - `POST /cart/checkout`
  - `GET /cart/momo/return`
  - `POST /cart/momo/ipn`
  - `GET /cart/vnpay/return`
  - `GET /cart/vnpay/ipn`
- **Orders**:
  - `GET /orders`
  - `GET /orders/:id`
  - `POST /orders/:id/cancel`
  - `POST /orders/:id/reorder`
  - `POST /orders/:id/pay`
  - `POST /orders/:id/change-payment`
- **Account**:
  - `GET /account`
  - `POST /account/profile` (upload avatar)
  - `POST /account/password`
  - `POST /account/delete`

### 4.2. Admin routes (prefix `/admin`)
- **Auth**:
  - `GET /admin/login`
  - `POST /admin/login`
  - `POST /admin/logout`
- **Dashboard**:
  - `GET /admin/` hoặc `/admin/dashboard`
- **Products**:
  - `GET /admin/products`
  - `GET /admin/products/create`
  - `POST /admin/products/create`
  - `GET /admin/products/:id/edit`
  - `POST /admin/products/:id/edit`
  - `GET /admin/products/:id/delete`
  - `POST /admin/products/:id/restore`
  - `POST /admin/products/:id/hard-delete`
  - `PATCH /admin/products/:id/change-status`
- **Users**:
  - `GET /admin/users`
  - `GET /admin/users/online`
  - `GET /admin/users/:id`
  - `POST /admin/users/:id/update`
  - `POST /admin/users/:id/password`
  - `POST /admin/users/:id/restore`
  - `POST /admin/users/:id/hard-delete`
  - `POST /admin/users/:id/role`
  - `POST /admin/users/:id/status`
  - `POST /admin/users/:id/delete`

> Lưu ý: prefix admin được cấu hình tại [config/system.js](config/system.js).

## 5. Giải thích thư mục chính

- **config/**: cấu hình hệ thống, database, passport.
- **controllers/**: điều phối request, gọi model/service và render view.
- **helpers/**: tiện ích (lọc trạng thái, phân trang, validate...).
- **middlewares/**: xác thực, bảo vệ route, sanitize dữ liệu.
- **models/**: schema MongoDB (User, Product, Order, Cart, Favorite...).
- **routes/**: định nghĩa các endpoint cho client và admin.
- **services/**: xử lý nghiệp vụ tách riêng (cart, payment, seed admin...).
- **views/**: giao diện Pug, chia admin/client.
- **public/**: static assets (CSS/JS/Images/Uploads).

## 6. Mô hình dữ liệu chính (MongoDB)
- **user_model**: tài khoản, vai trò, trạng thái.
- **product_model**: sản phẩm, biến thể, size, ảnh, giá.
- **category_model**: phân loại sản phẩm.
- **cart_model**: giỏ hàng theo user.
- **order_model** + **order_item_model**: đơn hàng và chi tiết.
- **favorite_model**: sản phẩm yêu thích.
- **coupon_model**: mã giảm giá.
- **review_model**: đánh giá sản phẩm.
- **pay_model**: lưu thông tin thanh toán.
- **login_log_model**: log đăng nhập.

## 7. Quy trình nghiệp vụ tiêu biểu

### 7.1. Xem sản phẩm
`GET /products/:id` → `product_controller.chiTiet` → lấy thông tin sản phẩm + biến thể → render trang chi tiết.

### 7.2. Thêm vào giỏ
`POST /cart/add` → `cart_controller.them` → kiểm tra tồn kho, biến thể, size → cập nhật `cart_model` → trả JSON hoặc redirect `/cart`.

### 7.3. Thanh toán
- `GET /cart/checkout` hiển thị trang thanh toán.
- `POST /cart/checkout` tạo đơn hàng.
- Nếu chọn MoMo/VNPAY → tạo URL thanh toán và redirect.
- Sau khi thanh toán, MoMo/VNPAY gọi callback (`return`/`ipn`) → cập nhật trạng thái đơn.

### 7.4. Quản trị sản phẩm
Admin truy cập `/admin/products` → `products_controller` → CRUD sản phẩm, upload ảnh bằng **multer**.

## 8. Hướng dẫn mở rộng
- Thêm tính năng mới: tạo **route → controller → view/service/model** tương ứng.
- Có thể tách API riêng (REST) bằng cách trả JSON trong controller, frontend gọi bằng `fetch`.

---
Tài liệu này mô tả luồng hoạt động và cấu trúc đồ án giúp dễ bảo trì, triển khai và phát triển tính năng mới.
