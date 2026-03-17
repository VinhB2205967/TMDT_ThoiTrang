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

# Gemini AI Chat (tùy chọn)
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=gemma-3-12b-it
GEMINI_FALLBACK_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=30000
GEMINI_MAX_OUTPUT_TOKENS=512

# OpenRouter/Requesty AI Chat (tùy chọn)
OPENROUTER_API_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
OPENROUTER_MODEL=google/gemma-3-12b-it:free
OPENROUTER_FALLBACK_MODEL=google/gemini-2.5-flash
OPENROUTER_TIMEOUT_MS=30000
OPENROUTER_MAX_TOKENS=512
OPENROUTER_REFERER=http://localhost:3000
OPENROUTER_APP_NAME=FashionStore AI Chat

# OpenCLIP semantic product search (tùy chọn)
OPENCLIP_ENABLED=1
OPENCLIP_PYTHON_BIN=python
OPENCLIP_SCRIPT_PATH=./scripts/openclip_rank_products.py
OPENCLIP_MODEL_NAME=ViT-B-32
OPENCLIP_PRETRAINED=laion2b_s34b_b79k
OPENCLIP_TIMEOUT_MS=40000
OPENCLIP_CANDIDATE_LIMIT=48
OPENCLIP_TOP_K=6
```

3) Chạy:

`npm start`

4) Chạy Ollama cho AI chatbox:

`ollama serve`

Roi pull model (neu chua co):

`ollama pull gemma3:4b`

Co the doi model bang bien `OLLAMA_MODEL` trong `.env`.

## AI Assistant (Client + Admin)

### 1) AI chat phía client

- Widget AI ở góc dưới bên trái trang client.
- Hỗ trợ chọn provider:
	- Ollama
	- Gemini
	- OpenRouter
   - OpenCLIP (text -> image retrieval)
- Hỗ trợ bật/ẩn khung chọn model Gemini.
- Có render danh sách trả lời theo dạng mục, icon và link nội bộ.
- Khi user hỏi mã đơn cụ thể dạng `DH...`, hệ thống ưu tiên trả dữ liệu xác thực từ DB (không qua suy diễn model).

API chính:

- `POST /api/ai-chat/message`

Payload mẫu:

```json
{
	"message": "Kiểm tra đơn DH20260129411",
	"history": [],
	"provider": "gemini",
	"model": "gemma-3-27b-it"
}
```

### 2) AI Assistant phía admin

- Trang riêng cho admin: `/admin/ai-assistant`
- Có chọn provider/model tương tự client.
- Context phân tích sâu cho quản trị: doanh thu, đơn hàng, tồn kho, khách hàng, thanh toán.
- Hỗ trợ hiểu câu hỏi theo kỳ thời gian (ví dụ: tháng 2, tháng 2 năm 2026).

Route admin AI:

- `GET /admin/ai-assistant` (render trang riêng)
- `POST /admin/ai-assistant` (gửi câu hỏi AI)

### 3) Lưu ý khi chạy AI

- Nếu dùng Ollama:
	- chạy `ollama serve`
	- pull model trước (ví dụ `ollama pull gemma3:4b`)
- Nếu dùng Gemini/OpenRouter nhưng chưa cấu hình key, hệ thống sẽ trả lỗi cấu hình tương ứng.
- Nếu model quá tải hoặc timeout, hệ thống có fallback model theo biến môi trường.
- Nếu dùng OpenCLIP:
   - Cần Python + `torch` + `Pillow`.
   - Có thể dùng source đã clone tại `AI/open_clip/src` (script tự thêm vào `sys.path`).
   - Cài nhanh tham khảo:
      - `pip install torch pillow`
      - hoặc `pip install -e AI/open_clip`
   - Tải model trước (warmup): `npm run openclip:warmup`
   - Trang frontend tìm kiếm trực tiếp: `/ai/openclip`
   - Hỗ trợ 2 chế độ: tìm theo mô tả text và tìm theo ảnh upload (jpg/png/webp..., tối đa 10MB)

### 4) Xử lý lỗi link sản phẩm từ câu trả lời AI

- Frontend đã chuẩn hóa các biến thể link sai về dạng `/products/{id}` khi có đủ dữ liệu id.
- Nếu câu trả lời có cụm “tại đây”, hệ thống cố gắng map đúng theo sản phẩm được nhắc tới trong từng mục.
- Nếu dữ liệu không đủ để map chi tiết sản phẩm, hệ thống sẽ không tạo link giả định.

### 5) Ẩn ID sản phẩm trong câu trả lời AI

- Hệ thống đã thêm lớp sanitize output để không hiển thị `productId`/`ID` dạng Mongo ObjectId trong phản hồi cho user/admin.
- Các pattern được loại bỏ gồm:
   - `productId: <24-hex>`
   - `(ID: <24-hex>)`
   - ObjectId 24 ký tự đứng độc lập trong câu.
- Mục tiêu: nội dung AI dễ đọc cho người dùng, chỉ hiển thị tên sản phẩm thay vì ID kỹ thuật.

## Review System (nâng cấp)

### 1) Trạng thái đánh giá ở đơn hàng

- Đơn chưa đánh giá: hiển thị nút `Đánh giá`.
- Đơn đã đánh giá: hiển thị badge `Đã đánh giá` + nút `Chỉnh sửa đánh giá`.

### 2) Tạo/Sửa đánh giá

- Hỗ trợ rating 1-5 sao + nội dung đánh giá.
- Khi sửa, hệ thống update review hiện có (không tạo mới).
- Tải lại dữ liệu cũ khi mở form sửa: sao, nội dung, media.

### 3) Upload media (ảnh + video)

- Ảnh: tối đa 5 ảnh/review.
- Video: tối đa 1 video/review.
- Cho phép giữ media cũ, xóa media cũ hoặc upload thêm media mới khi sửa.
- Validate dung lượng:
   - Ảnh tối đa 20MB/file.
   - Video tối đa 100MB/file.

### 4) Preview media trước khi gửi

- Preview realtime ảnh dạng grid.
- Preview video bằng HTML5 player (`controls=true`, không autoplay).
- Có thể bỏ video đã chọn trước khi submit.

### 5) Danh sách đánh giá ở trang chi tiết sản phẩm

- Hiển thị avatar + tên user + rating + nội dung.
- Ảnh hiển thị dạng grid.
- Video hiển thị inline player, phát trực tiếp không cần modal.

### 6) Bộ lọc đánh giá

- Lọc theo số sao (1-5).
- Sắp xếp: mới nhất, cũ nhất, sao cao, sao thấp, hữu ích.
- Lọc media:
   - `all`: tất cả
   - `image`: có ảnh
   - `video`: có video
   - `both`: có cả ảnh và video

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
├─ package-lock.json
├─ README.md
├─ AI/
│  ├─ huggingface_cache/
│  └─ open_clip/
├─ config/
│  ├─ constants.js
│  ├─ database.js
│  ├─ passport.js
│  ├─ shipping.js
│  └─ system.js
├─ controllers/
│  ├─ admin/
│  │  ├─ auth_controller.js
│  │  ├─ banners_controller.js
│  │  ├─ blog_controller.js
│  │  ├─ brands_controller.js
│  │  ├─ categories_controller.js
│  │  ├─ chat_controller.js
│  │  ├─ dashboard_controller.js
│  │  ├─ exports_controller.js
│  │  ├─ flash_sales_controller.js
│  │  ├─ home_sections_controller.js
│  │  ├─ imports_controller.js
│  │  ├─ lookbooks_controller.js
│  │  ├─ orders_controller.js
│  │  ├─ products_controller.js
│  │  ├─ reports_controller.js
│  │  ├─ reviews_controller.js
│  │  ├─ settings_controller.js
│  │  ├─ size_guides_controller.js
│  │  ├─ users_controller.js
│  │  └─ vouchers_controller.js
│  └─ client/
│     ├─ account_controller.js
│     ├─ api/
│     │  ├─ ai_chat_api_controller.js
│     │  ├─ content_api_controller.js
│     │  └─ home_api_controller.js
│     ├─ auth_controller.js
│     ├─ cart_controller.js
│     ├─ chat_controller.js
│     ├─ content/
│     ├─ favorites_controller.js
│     ├─ home_controller.js
│     ├─ openclip_controller.js
│     ├─ orders_controller.js
│     ├─ product_controller.js
│     ├─ reviews_controller.js
│     └─ voucher_controller.js
├─ helpers/
│  ├─ filterStatus.js
│  ├─ http.js
│  ├─ importReceipt.js
│  ├─ orderStatus.js
│  ├─ pagination.js
│  ├─ product.helper.js
│  ├─ product.js
│  ├─ productStats.js
│  ├─ productView.js
│  ├─ search.js
│  └─ validators.js
├─ middlewares/
│  ├─ auth.js
│  ├─ cart.js
│  ├─ categories.js
│  ├─ chatUpload.js
│  ├─ favorites.js
│  ├─ mongoSanitize.js
│  ├─ openclipUpload.js
│  ├─ validate.js
│  └─ xssSanitize.js
├─ models/
│  ├─ accounts_model.js
│  ├─ banner_model.js
│  ├─ blog_model.js
│  ├─ brand_model.js
│  ├─ cart_model.js
│  ├─ category_model.js
│  ├─ chat_message_model.js
│  ├─ coupon_model.js
│  ├─ export_receipt_model.js
│  ├─ favorite_model.js
│  ├─ flash_sale_model.js
│  ├─ home_section_model.js
│  ├─ import_receipt_model.js
│  ├─ index.js
│  ├─ inventory_lot_model.js
│  ├─ login_log_model.js
│  ├─ lookbook_model.js
│  ├─ order_item_model.js
│  ├─ order_model.js
│  ├─ pay_model.js
│  ├─ product_model.js
│  ├─ review_model.js
│  ├─ setting_model.js
│  ├─ size_guide_model.js
│  ├─ user_model.js
│  └─ user_voucher_model.js
├─ patches/
│  └─ connect-flash+0.1.1.patch
├─ public/
│  ├─ admin/
│  │  ├─ css/
│  │  └─ js/
│  ├─ css/
│  ├─ images/
│  ├─ js/
│  │  ├─ auth.js
│  │  ├─ chat-ai.js
│  │  ├─ chat-client.js
│  │  ├─ checkout-voucher.js
│  │  ├─ favorites.js
│  │  ├─ home.js
│  │  ├─ openclip-search.js
│  │  ├─ orders.js
│  │  ├─ product-detail.js
│  │  ├─ products.js
│  │  ├─ script.js
│  │  ├─ up.js
│  │  ├─ vouchers.js
│  │  └─ shared/
│  └─ uploads/
│     ├─ avatars/
│     ├─ chat/
│     ├─ openclip-query/
│     └─ products/
├─ routes/
│  ├─ admin/
│  │  ├─ auth_route.js
│  │  ├─ banners_route.js
│  │  ├─ blog_route.js
│  │  ├─ brands_route.js
│  │  ├─ categories_route.js
│  │  ├─ chat_route.js
│  │  ├─ dashboard_route.js
│  │  ├─ exports_route.js
│  │  ├─ flash_sales_route.js
│  │  ├─ home_sections_route.js
│  │  ├─ imports_route.js
│  │  ├─ index_route.js
│  │  ├─ lookbooks_route.js
│  │  ├─ orders_route.js
│  │  ├─ products_route.js
│  │  ├─ reports_route.js
│  │  ├─ reviews_route.js
│  │  ├─ settings_route.js
│  │  ├─ size_guides_route.js
│  │  ├─ users_route.js
│  │  ├─ vouchers_route.js
│  │  └─ _upload.js
│  └─ client/
│     ├─ account_route.js
│     ├─ api_route.js
│     ├─ auth_route.js
│     ├─ blog_route.js
│     ├─ brands_route.js
│     ├─ cart_route.js
│     ├─ chat_route.js
│     ├─ favorites_route.js
│     ├─ home_route.js
│     ├─ index_route.js
│     ├─ lookbook_route.js
│     ├─ openclip_route.js
│     ├─ orders_route.js
│     ├─ products_route.js
│     ├─ reviews_route.js
│     └─ voucher_route.js
├─ scripts/
│  ├─ backfill-inventory-lots.js
│  ├─ backfill-product-vietnamese-fields.js
│  ├─ check-pug-compile.js
│  ├─ import-products-from-images.js
│  ├─ migrate-import-receipts-vn.js
│  ├─ migrate-order-item-status.js
│  ├─ migrate-pay-status.js
│  ├─ openclip_rank_products.py
│  ├─ openclip_warmup.py
│  ├─ seed-home.js
│  ├─ seed-users-30.js
│  ├─ sync-product-stock.js
│  └─ _lib/
├─ services/
│  ├─ account.service.js
│  ├─ aiChat.service.js
│  ├─ cart.service.js
│  ├─ category.service.js
│  ├─ chat.service.js
│  ├─ chat.socket.js
│  ├─ exportReceipt.service.js
│  ├─ flashSale.service.js
│  ├─ home.service.js
│  ├─ loginLog.js
│  ├─ mailer.service.js
│  ├─ momo.service.js
│  ├─ openClip.service.js
│  ├─ orderEmail.service.js
│  ├─ payment.service.js
│  ├─ product.service.js
│  ├─ productStock.service.js
│  ├─ seedAdmin.js
│  ├─ sizeGuide.service.js
│  ├─ vnpay.service.js
│  └─ voucher.service.js
├─ socketio/
│  └─ chat.socket.js
└─ views/
   ├─ admin/
   │  ├─ layouts/
   │  ├─ mixins/
   │  ├─ pages/
   │  └─ partials/
   ├─ client/
   │  ├─ layouts/
   │  ├─ mixins/
   │  ├─ pages/
   │  │  ├─ account/
   │  │  ├─ auth/
   │  │  ├─ blog/
   │  │  ├─ brands/
   │  │  ├─ cart/
   │  │  ├─ chat/
   │  │  ├─ errors/
   │  │  ├─ favorites/
   │  │  ├─ home/
   │  │  ├─ lookbook/
   │  │  ├─ openclip/
   │  │  ├─ orders/
   │  │  ├─ products/
   │  │  ├─ reviews/
   │  │  └─ vouchers/
   │  └─ partials/
   └─ partials/
      └─ flash.pug
```

> Ghi chú: Cấu trúc trên đã rút gọn một số thư mục lớn bằng `...` để README dễ đọc.

Danh sách đầy đủ file/thư mục hiện tại của dự án được xuất tại:

- `STRUCTURE_FULL.md` (đã loại trừ thư mục phụ thuộc/cache: `.git`, `.venv`, `node_modules`, `AI/huggingface_cache`, `AI/open_clip`)