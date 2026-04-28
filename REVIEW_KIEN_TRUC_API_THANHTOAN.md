# Review Codebase: Công Nghệ, API, Thanh Toán

## 1) Phạm vi review

Tài liệu này review nhanh theo snapshot source code hiện tại, tập trung vào:

- Công nghệ đang sử dụng.
- Mô hình triển khai API.
- Luồng thanh toán (COD, MoMo, VNPAY) và hoàn tiền.
- Điểm mạnh, rủi ro, và đề xuất ưu tiên.

Các nhóm file chính đã đối chiếu:

- `index.js`, `package.json`, `config/*`
- `routes/client/*`, `routes/admin/*`
- `controllers/client/api/*`, `controllers/admin/api/*`
- `services/cart/*`, `services/order/*`, `services/payment/*`
- `models/order_model.js`, `models/pay_model.js`

## 2) Công nghệ sử dụng

### Backend & Framework

- Node.js + CommonJS.
- Express `5.2.1` (monolith: web render + API + callback + socket).
- Mongoose `9.1.2` + MongoDB.
- Template engine: Pug.
- Realtime: Socket.IO.

### Auth & Session

- `passport` + `passport-google-oauth20`.
- `express-session` + `connect-mongo` (tách session client và admin).
- Middleware auth riêng cho client/admin.

### Security & Request Protection

- `helmet`, `cors`, `express-rate-limit`.
- `csurf` (đang bật global).
- `express-mongo-sanitize`, middleware XSS sanitize.

### File upload & media

- `multer` cho upload ảnh/video (chat, openclip, return proof...).

### AI/ML tích hợp

- AI chat qua Ollama/Gemini/OpenRouter.
- OpenCLIP dùng Python worker (`spawn` process), phục vụ semantic search ảnh/text.

### Thanh toán

- MoMo: gọi API trực tiếp qua HTTPS + ký HMAC SHA256.
- VNPAY: tạo URL thanh toán + ký/verify SHA512.
- Nhật ký thanh toán: collection `pays` (`models/pay_model.js`).

## 3) Mô hình triển khai API

## 3.1 Kiến trúc triển khai

- 1 tiến trình Node chính chạy:
- HTTP server (Express).
- Socket.IO.
- SSR pages (Pug) + REST-like APIs.
- Payment callback endpoints.

Mô hình thực tế là **modular monolith**, chưa tách microservice.

## 3.2 Tổ chức route

- Client API: prefix `/api/*` (`routes/client/api_route.js`).
- Admin API: prefix `/admin/api/*` (`routes/admin/index_route.js`).
- Web pages client/admin đi song song trong cùng app.

## 3.3 Luồng xử lý

- Route -> Controller -> Service -> Model.
- Service layer khá dày, chứa nghiệp vụ chính (order, voucher, inventory, payment).
- Có helper/hybrid-response để chuẩn hóa JSON response ở admin API.

## 3.4 Auth/API style

- API chủ yếu dựa trên session cookie, không phải JWT stateless.
- Có tách cookie admin (`admin.sid`) và client (`sid`) là điểm tốt.
- CSRF đang bật toàn cục, bao phủ cả web và API.

## 4) Mô hình thanh toán hiện tại

## 4.1 Kênh thanh toán khả dụng

- Checkout chính (`services/cart/checkout.service.js`) hiện hỗ trợ: `cod`, `momo`.
- VNPAY vẫn có tích hợp đầy đủ ở callback + repay order, nhưng không nằm trong tập method checkout mới.

## 4.2 Luồng thanh toán MoMo

1. Checkout tạo order + trừ tồn + giữ voucher.
2. Tạo giao dịch MoMo (`taoThanhToanMoMo`) và lưu `momoOrderId/momoRequestId`.
3. Ghi log thanh toán vào `pays` (trạng thái `choduyet`/`thatbai`).
4. Gateway trả về:
- Return URL: cập nhật trạng thái đơn và giao dịch.
- IPN: xác thực chữ ký, cập nhật paid/fail idempotent theo trạng thái.

## 4.3 Luồng thanh toán VNPAY

- Có hàm tạo URL, verify chữ ký callback/IPN.
- Có xử lý return/ipn ở `services/cart/payment-callback.service.js`.
- Hiện dùng rõ nhất trong luồng **thanh toán lại đơn** (`repayOrder`).

## 4.4 Hoàn tiền

- Hoàn tiền MoMo đã có API refund và cập nhật log giao dịch.
- Admin flow hoàn tiền khá đầy đủ (kiểm tra điều kiện, cập nhật order/payment, email).
- Có cơ chế đánh dấu `pending -> failed/success/refunded` để tránh treo giao dịch.

## 5) Điểm mạnh

- Phân lớp service rõ, nghiệp vụ tập trung.
- Có xác thực chữ ký callback cho MoMo/VNPAY.
- Có lưu vết giao dịch thanh toán tương đối đầy đủ trong `pays`.
- Có rollback thủ công cho nhiều bước (voucher, tồn kho, order item) khi lỗi.
- Có hỗ trợ hoàn tiền và đồng bộ trạng thái đơn hàng phía admin.
- Có rate-limit, sanitize, helmet, session store tách admin/client.

## 6) Rủi ro và khoảng trống

## 6.1 Rủi ro cao (ưu tiên xử lý sớm)

1. **CSRF đang bật global** có thể chặn callback `POST` từ cổng thanh toán (đặc biệt IPN), do gateway không gửi CSRF token.
2. Checkout mới chỉ cho `cod/momo`, trong khi hệ thống vẫn giữ logic VNPAY ở nhiều nơi -> dễ lệch hành vi, khó vận hành.
3. Quy trình checkout nhiều bước nhưng chưa dùng Mongo transaction thật sự; rollback thủ công không bảo vệ tốt khi process crash giữa chừng.

## 6.2 Rủi ro trung bình

1. `SESSION_SECRET`/`ADMIN_SESSION_SECRET` có fallback hard-coded trong code.
2. Khi `CORS_ORIGINS` rỗng, policy đang cho phép origin khá rộng.
3. Session cookie chưa thấy ép `secure: true` theo môi trường production.
4. Thiếu test tự động (script `test` đang là placeholder).

## 7) Đề xuất ưu tiên cải tiến

## P0 (ngay)

1. Tách/bypass CSRF cho các endpoint callback/IPN thanh toán.
2. Bổ sung idempotency key + rule chống ghi trùng callback mạnh hơn ở tầng DB.

## P1 (ngắn hạn)

1. Thống nhất chiến lược VNPAY:
- Hoặc bật lại đầy đủ ở checkout.
- Hoặc loại bỏ code không dùng để giảm nợ kỹ thuật.
2. Bọc checkout quan trọng bằng MongoDB transaction (order + order items + voucher + inventory).

## P2 (trung hạn)

1. Cứng hóa bảo mật config production (`secure cookie`, secrets bắt buộc từ env, CORS whitelist chặt).
2. Thêm test tích hợp cho:
- Checkout success/fail.
- MoMo/VNPAY callback.
- Refund/cancel order.

---

Nếu cần, có thể tách tiếp thành 3 file riêng:

- `REVIEW_TECH_STACK.md`
- `REVIEW_API_ARCHITECTURE.md`
- `REVIEW_PAYMENT_FLOW.md`

để dễ theo dõi theo từng mảng chuyên sâu.
