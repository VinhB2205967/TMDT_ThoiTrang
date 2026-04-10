# TMDT_THOITRANG
explorer decorations badges

## Tai lieu nhanh

- Cong nghe su dung: `docs/cong-nghe-su-dung.md`
- Quy uoc viet API: `docs/quy-uoc-viet-api.md`
- Danh sach API hien tai: `docs/api-routes.md`

## Chạy dự án

1) Cài dependency:

`npm install`

2) Tạo file `.env` (ví dụ):

```
PORT=3000
MONGODB_URL=mongodb://127.0.0.1:27017/tmdt_thoitrang
SESSION_SECRET=fashion-secret-key
ADMIN_SESSION_SECRET=fashion-admin-secret-key
CORS_ORIGINS=http://localhost:3000

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
OPENCLIP_STARTUP_TIMEOUT_MS=300000
HF_TOKEN=hf_xxx_optional
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

## Bảo mật

Các lớp bảo mật hiện có trong ứng dụng:

- `helmet` đã bật với `contentSecurityPolicy` (CSP) trong `app/create-app.js`.
- `csurf` bật toàn cục, token được gắn vào `res.locals.csrfToken`.
- Chặn NoSQL injection/prototype pollution qua middleware `mongoSanitize` (strict mode).
- Làm sạch dữ liệu đầu vào chống XSS qua middleware `xssSanitize` cho `body/query/params`.
- `express-rate-limit` cho toàn bộ app + route auth/login.
- `cors` có whitelist theo biến `CORS_ORIGINS`.

Lưu ý CSP hiện tại:

- Đang cho phép `unsafe-inline` cho `script`/`style` để tương thích code Pug hiện có (nhiều inline handler).
- Khi refactor hết inline script/event/style sang file tĩnh, có thể siết CSP mạnh hơn bằng cách bỏ `unsafe-inline`.

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
├─ app/                       # Tách bootstrap Express từ index.js
│  ├─ create-app.js           # Khởi tạo app + middleware
│  ├─ session.js              # Session client/admin theo path
│  ├─ rate-limit.js           # Global limiter + auth limiter
│  ├─ routes.js               # Đăng ký route client/admin
│  └─ errors.js               # Handler CSRF error + 404 + 500
├─ AI/
│  ├─ huggingface_cache/
│  └─ open_clip/
├─ config/
│  ├─ database.js
│  ├─ passport.js
│  ├─ shipping.js
│  └─ system.js
├─ controllers/               # Điều phối request (admin/client/api)
├─ helpers/
│  ├─ http.js
│  └─ ...
├─ middlewares/               # Auth, validate, sanitize, upload...
├─ models/                    # Mongoose models
├─ public/
│  ├─ admin/
│  │  └─ js/
│  ├─ css/
│  ├─ images/
│  ├─ js/
│  ├─ uploads/
│  └─ vendor/
├─ routes/                    # Khai báo endpoint
├─ scripts/                   # Seed/migrate/backfill/check
├─ services/
│  ├─ account/
│  ├─ auth/
│  ├─ cart/
│  ├─ catalog/
│  ├─ communication/
│  ├─ content/
│  ├─ inventory/
│  ├─ order/
│  ├─ payment/
│  ├─ review/
│  ├─ seedAdmin.js
│  └─ chat.socket.js
├─ socketio/
│  └─ chat.socket.js          # Setup socket layer
└─ views/
   ├─ admin/
   ├─ client/
   └─ partials/
```

Gợi ý đọc luồng backend nhanh:

- `index.js` chỉ còn bootstrap HTTP/Socket + warm OpenCLIP.
- `app/create-app.js` là nơi tập trung middleware bảo mật, session, route và error handler.
