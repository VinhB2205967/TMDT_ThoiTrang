# Auto-reply Chat AI - Hướng dẫn Sử dụng

## Tổng quan

Tính năng **Tự trả lời** cho phép hệ thống tự động gửi câu trả lời sử dụng AI khi khách hàng gửi câu hỏi trong phần chat. Điều này giúp cải thiện thời gian phản hồi và trải nghiệm khách hàng.

## Cấu trúc Thư mục

### Files mới được thêm:

1. **`services/communication/admin-auto-reply.service.js`**
   - Service chính xử lý logic tự trả lời
   - Quản lý cấu hình, kiểm tra điều kiện, tạo câu trả lời AI

2. **`public/admin/js/auto-reply-manager.js`**
   - Component UI cho quản lý cài đặt tự trả lời
   - Cho phép admin bật/tắt, cấu hình các tham số

### Files được cập nhật:

1. **`models/chat_message_model.js`**
   - Thêm trường `isAutoReply` để đánh dấu tin nhắn tự trả lời

2. **`services/communication/chat.service.js`**
   - Cập nhật hàm `chuanTin` để bao gồm `isAutoReply`

3. **`controllers/admin/api/chats_controller.js`**
   - Thêm 3 endpoint API mới:
     - `GET /admin/api/chats/auto-reply/settings` - Lấy cài đặt hiện tại
     - `POST /admin/api/chats/auto-reply/settings` - Cập nhật cài đặt
     - `GET /admin/api/chats/auto-reply/stats` - Lấy thống kê

4. **`routes/admin/api/chats_route.js`**
   - Đăng ký các route mới cho auto-reply API

5. **`socketio/chat.socket.js`**
   - Tích hợp logic tự trả lời vào event handler `send_message`
   - Kích hoạt auto-reply khi khách hàng gửi tin nhắn

## API Endpoints

### 1. Lấy cài đặt tự trả lời
```
GET /admin/api/chats/auto-reply/settings
```

**Response:**
```json
{
  "success": true,
  "data": {
    "config": {
      "enabled": false,
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "autoResponseDelay": 2000,
      "minMessageLength": 1,
      "maxAutoRepliesPerDay": 100,
      "excludeKeywords": []
    },
    "stats": {
      "enabled": false,
      "todayCount": 0,
      "totalCount": 0,
      "dailyLimit": 100,
      "remainingToday": 100
    }
  }
}
```

### 2. Cập nhật cài đặt tự trả lời
```
POST /admin/api/chats/auto-reply/settings
Content-Type: application/json

{
  "enabled": true,
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "autoResponseDelay": 2000,
  "minMessageLength": 1,
  "maxAutoRepliesPerDay": 100,
  "excludeKeywords": ["hỗ trợ", "tư vấn"]
}
```

**Response:** Như endpoint 1

### 3. Lấy thống kê tự trả lời
```
GET /admin/api/chats/auto-reply/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "todayCount": 5,
    "totalCount": 42,
    "dailyLimit": 100,
    "remainingToday": 95
  }
}
```

## Cài đặt Tự trả lời

### Các tham số cấu hình

| Tham số | Loại | Mặc định | Mô tả |
|--------|------|---------|-------|
| `enabled` | Boolean | false | Bật/tắt tự trả lời |
| `provider` | String | "gemini" | Nhà cung cấp AI (gemini, ollama, openrouter) |
| `model` | String | "gemini-2.5-flash" | Model AI được sử dụng |
| `autoResponseDelay` | Number | 2000 | Độ trễ trước khi trả lời (ms) |
| `minMessageLength` | Number | 1 | Độ dài tối thiểu tin nhắn để kích hoạt tự trả lời |
| `maxAutoRepliesPerDay` | Number | 100 | Số tin nhắn tự trả lời tối đa mỗi ngày |
| `excludeKeywords` | Array | [] | Các từ khóa loại trừ (tin nhắn chứa từ này sẽ không được trả lời tự động) |

### Ví dụ cấu hình

**Bật tự trả lời với cấu hình cơ bản:**
```json
{
  "enabled": true,
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "autoResponseDelay": 2000,
  "maxAutoRepliesPerDay": 100
}
```

**Cấu hình nâng cao với từ khóa loại trừ:**
```json
{
  "enabled": true,
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "autoResponseDelay": 3000,
  "minMessageLength": 10,
  "maxAutoRepliesPerDay": 50,
  "excludeKeywords": [
    "vấn đề kỹ thuật",
    "xử lý đơn hàng đặc biệt",
    "hoàn tiền"
  ]
}
```

## Quy trình Hoạt động

### Luồng Tự trả lời

```
1. Khách hàng gửi tin nhắn
   ↓
2. Kiểm tra tự trả lời được bật
   ↓
3. Kiểm tra điều kiện kích hoạt:
   - Tin nhắn không trống
   - Độ dài ≥ minMessageLength
   - Không chứa từ khóa loại trừ
   - Chưa vượt quá giới hạn ngày
   ↓
4. Tạo câu trả lời AI dựa vào:
   - Tin nhắn hiện tại
   - Lịch sử cuộc trò chuyện (12 tin nhắn gần nhất)
   - Dữ liệu ngữ cảnh (sản phẩm, đơn hàng, etc.)
   ↓
5. Chờ độ trễ autoResponseDelay
   ↓
6. Gửi tin nhắn tự động
   ↓
7. Đánh dấu isAutoReply = true
   ↓
8. Phát sóng cho khách hàng và admin
```

## Tính năng Chi tiết

### 1. Phát hiện Điều kiện
- ✅ Kiểm tra xem tự trả lời có được bật không
- ✅ Kiểm tra độ dài tin nhắn
- ✅ Kiểm tra từ khóa loại trừ (chuẩn hóa tiếng Việt)
- ✅ Kiểm tra giới hạn hàng ngày

### 2. Tạo Câu trả lời AI
- Sử dụng hàm `buildAdminAiSuggestion` từ `admin-ai-chat.service`
- Tạo câu trả lời thân thiện, chuyên nghiệp
- Dựa trên lịch sử hội thoại và dữ liệu sản phẩm

### 3. Độ trễ Có thể Cấu hình
- Tránh phản hồi quá nhanh (có vẻ như bot)
- Cho phép admin tùy chỉnh độ trễ
- Độ trễ mặc định: 2 giây

### 4. Đánh dấu Tin nhắn
- Tất cả tin nhắn tự trả lời có `isAutoReply: true`
- Admin có thể nhận dạng tin nhắn tự động

### 5. Thống kê Hàng ngày
- Theo dõi số tin nhắn tự trả lời hôm nay
- Hiển thị số lượt còn lại
- Giúp giám sát hiệu suất

## Sử dụng UI Component

### Thêm vào Pug template

```pug
// Trong trang cài đặt admin
.card
  .card-body
    #autoReplyContainer

script(src='/admin/js/auto-reply-manager.js')
script
  document.addEventListener('DOMContentLoaded', () => {
    new AutoReplyManager('autoReplyContainer');
  });
```

### Cách hoạt động UI
1. Tải cài đặt hiện tại khi khởi tạo
2. Hiển thị form với các trường cấu hình
3. Hiển thị thống kê hôm nay
4. Cho phép lưu thay đổi
5. Tự động cập nhật UI sau khi lưu

## Lỗi và Xử lý

### Xử lý lỗi tự động
- Nếu auto-reply bị lỗi, không ảnh hưởng đến tin nhắn chính
- Lỗi được ghi vào console
- Tin nhắn từ khách hàng vẫn được gửi bình thường

### Nhật ký
Tất cả lỗi được ghi với tiền tố:
- `admin.chats.api.*` - Lỗi API
- `Auto-reply handling error` - Lỗi xử lý tự trả lời
- `Auto-reply send error` - Lỗi gửi tự trả lời

## Cách kiểm thử

### Test cơ bản
```bash
# 1. Bật tự trả lời
curl -X POST http://localhost:3000/admin/api/chats/auto-reply/settings \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 2. Gửi tin nhắn từ khách hàng (qua socket hoặc UI)

# 3. Kiểm tra thống kê
curl http://localhost:3000/admin/api/chats/auto-reply/stats
```

### Test nâng cao
- Test với từ khóa loại trừ
- Test giới hạn hàng ngày
- Test độ trễ tùy chỉnh
- Test các provider AI khác nhau

## Tối ưu hóa

### Những điều cần lưu ý
1. **Độ trễ**: Tăng độ trễ để tránh quá nhanh
2. **Giới hạn hàng ngày**: Đặt phù hợp để tránh quá tải AI
3. **Từ khóa loại trừ**: Thêm các vấn đề phức tạp cần xử lý thủ công
4. **Model AI**: Chọn model phù hợp với tốc độ và chất lượng

### Khuyến nghị
- Bắt đầu với giới hạn thấp (20-30/ngày) để kiểm thử
- Tăng dần sau khi xác nhận chất lượng
- Sử dụng từ khóa loại trừ cho các trường hợp đặc biệt
- Giám sát thường xuyên và điều chỉnh cài đặt

## Troubleshooting

### Auto-reply không hoạt động
1. Kiểm tra `enabled` trong cài đặt
2. Kiểm tra model AI được cấu hình
3. Kiểm tra API key cho provider
4. Kiểm tra console để xem lỗi

### Quá nhiều auto-reply
- Giảm `maxAutoRepliesPerDay`
- Tăng `minMessageLength`
- Thêm từ khóa loại trừ

### Auto-reply không đủ tốt
- Điều chỉnh model AI
- Kiểm tra cấu hình provider
- Xem xét thêm dữ liệu ngữ cảnh

## Tương lai

### Tính năng có thể thêm
- [ ] Machine learning để cải thiện chất lượng
- [ ] A/B testing cho các prompt khác nhau
- [ ] Phản hồi từ admin để tinh chỉnh
- [ ] Phân tích sentiment của tin nhắn
- [ ] Tự động không gửi nếu admin đang online
- [ ] Template tin nhắn tùy chỉnh
