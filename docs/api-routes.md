# Danh sách API

Tài liệu này liệt kê các API namespace hiện có trong dự án, dựa trên:

- `routes/client/api_route.js`
- `routes/client/index_route.js`
- `routes/admin/index_route.js`
- `routes/admin/api/*.js`

Phạm vi:

- Bao gồm `client API` dưới prefix `/api`
- Bao gồm `admin API` dưới prefix `/admin/api`
- Không bao gồm các route render trang HTML hoặc các route nghiệp vụ không nằm trong namespace API

## Ghi chú chung

- Các API admin đều đi qua middleware `requireAdmin` do được mount trong `routes/admin/index_route.js`.
- Một số API client yêu cầu đăng nhập qua middleware `requireAuth`.
- Một số API có upload file bằng `multer`; cột `Ghi chú` có nêu rõ.

## Client API

Base prefix: `/api`

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/api/home` | Không | Lấy dữ liệu trang chủ | `routes/client/api_route.js` |
| POST | `/api/ai-chat/message` | Không | Chat AI, có rate limit | `routes/client/api_route.js` |
| POST | `/api/openclip/search` | Không | Tìm sản phẩm bằng mô tả | `routes/client/api_route.js` |
| POST | `/api/openclip/search-by-image` | Không | Upload 1 ảnh để tìm bằng OpenCLIP | `routes/client/api_route.js` |
| GET | `/api/favorites/ids` | Có | Lấy danh sách ID yêu thích | `routes/client/api_route.js` |
| POST | `/api/favorites/add/:id` | Có | Thêm sản phẩm yêu thích | `routes/client/api_route.js` |
| POST | `/api/favorites/remove/:id` | Có | Xóa sản phẩm yêu thích | `routes/client/api_route.js` |
| POST | `/api/favorites/toggle/:id` | Có | Bật/tắt yêu thích | `routes/client/api_route.js` |
| GET | `/api/vouchers/available` | Có | Lấy voucher khả dụng | `routes/client/api_route.js` |
| POST | `/api/vouchers/apply` | Có | Áp dụng voucher | `routes/client/api_route.js` |
| POST | `/api/vouchers/save` | Có | Lưu voucher cho user | `routes/client/api_route.js` |
| GET | `/api/chat/messages` | Có | Lấy lịch sử chat khách hàng | `routes/client/api_route.js` |
| GET | `/api/chat/unread-count` | Có | Lấy số tin chưa đọc | `routes/client/api_route.js` |
| POST | `/api/chat/read` | Có | Đánh dấu đã đọc | `routes/client/api_route.js` |
| POST | `/api/chat/upload` | Có | Upload ảnh/video chat, field `file` | `routes/client/api_route.js` |
| GET | `/api/products/suggest` | Không | Gợi ý sản phẩm | `routes/client/api_route.js` |
| GET | `/api/products/:id/options` | Không | Lấy tùy chọn/biến thể sản phẩm | `routes/client/api_route.js` |
| POST | `/api/cart/add` | Có | Thêm vào giỏ | `routes/client/api_route.js` |
| POST | `/api/cart/buy-now` | Có | Mua ngay | `routes/client/api_route.js` |
| POST | `/api/cart/update` | Có | Cập nhật số lượng giỏ hàng | `routes/client/api_route.js` |
| POST | `/api/cart/update-options` | Có | Cập nhật biến thể/tùy chọn giỏ hàng | `routes/client/api_route.js` |
| POST | `/api/cart/remove` | Có | Xóa item khỏi giỏ | `routes/client/api_route.js` |
| POST | `/api/cart/clear` | Có | Xóa toàn bộ giỏ hàng | `routes/client/api_route.js` |
| GET | `/api/orders/:id/payment-status` | Có | Kiểm tra trạng thái thanh toán | `routes/client/api_route.js` |

## Admin API

Base prefix: `/admin/api`

### Dashboard

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| POST | `/admin/api/dashboard/ai-assistant` | Admin | Hỏi trợ lý AI cho dashboard | `routes/admin/api/dashboard_route.js` |

### Orders

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/orders` | Admin | Danh sách đơn hàng | `routes/admin/api/orders_route.js` |
| GET | `/admin/api/orders/new-summary` | Admin | Tổng quan đơn mới | `routes/admin/api/orders_route.js` |
| GET | `/admin/api/orders/export/excel` | Admin | Xuất Excel đơn hàng | `routes/admin/api/orders_route.js` |
| PATCH | `/admin/api/orders/bulk/status` | Admin | Cập nhật trạng thái hàng loạt | `routes/admin/api/orders_route.js` |
| GET | `/admin/api/orders/:id` | Admin | Chi tiết đơn hàng | `routes/admin/api/orders_route.js` |
| PATCH | `/admin/api/orders/:id/status` | Admin | Cập nhật trạng thái đơn | `routes/admin/api/orders_route.js` |
| POST | `/admin/api/orders/:id/return/approve` | Admin | Duyệt hoàn hàng | `routes/admin/api/orders_route.js` |
| POST | `/admin/api/orders/:id/return/reject` | Admin | Từ chối hoàn hàng | `routes/admin/api/orders_route.js` |
| POST | `/admin/api/orders/:id/return/received` | Admin | Xác nhận đã nhận hàng hoàn | `routes/admin/api/orders_route.js` |
| POST | `/admin/api/orders/:id/refund` | Admin | Hoàn tiền đơn | `routes/admin/api/orders_route.js` |
| POST | `/admin/api/orders/:id/cancel` | Admin | Hủy đơn | `routes/admin/api/orders_route.js` |

### Users

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/users/online` | Admin | Ảnh chụp user online | `routes/admin/api/users_route.js` |

### Reports

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/reports/data` | Admin | Dữ liệu báo cáo | `routes/admin/api/reports_route.js` |

### Settings

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/settings/home` | Admin | Lấy cấu hình home | `routes/admin/api/settings_route.js` |
| PUT | `/admin/api/settings/home` | Admin | Cập nhật cấu hình home | `routes/admin/api/settings_route.js` |
| GET | `/admin/api/settings/client-header` | Admin | Lấy cấu hình header client | `routes/admin/api/settings_route.js` |
| PUT | `/admin/api/settings/client-header` | Admin | Upload logo header ở field `client_header_logo` | `routes/admin/api/settings_route.js` |

### Banners

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/banners` | Admin | Danh sách banner | `routes/admin/api/banners_route.js` |
| POST | `/admin/api/banners` | Admin | Tạo banner, upload ảnh field `image` | `routes/admin/api/banners_route.js` |
| PUT | `/admin/api/banners/:id` | Admin | Cập nhật banner, upload ảnh field `image` | `routes/admin/api/banners_route.js` |
| DELETE | `/admin/api/banners/:id` | Admin | Xóa banner | `routes/admin/api/banners_route.js` |
| PATCH | `/admin/api/banners/:id/toggle` | Admin | Bật/tắt banner | `routes/admin/api/banners_route.js` |

### Brands

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/brands` | Admin | Danh sách thương hiệu | `routes/admin/api/brands_route.js` |
| POST | `/admin/api/brands` | Admin | Tạo thương hiệu, upload logo field `logo` | `routes/admin/api/brands_route.js` |
| PUT | `/admin/api/brands/:id` | Admin | Cập nhật thương hiệu, upload logo field `logo` | `routes/admin/api/brands_route.js` |
| DELETE | `/admin/api/brands/:id` | Admin | Xóa thương hiệu | `routes/admin/api/brands_route.js` |
| PATCH | `/admin/api/brands/order` | Admin | Sắp xếp thứ tự thương hiệu | `routes/admin/api/brands_route.js` |
| PATCH | `/admin/api/brands/:id/featured` | Admin | Cập nhật nổi bật | `routes/admin/api/brands_route.js` |
| PATCH | `/admin/api/brands/:id/active` | Admin | Cập nhật hiển thị/active | `routes/admin/api/brands_route.js` |

### Home Sections

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/home-sections` | Admin | Danh sách section trang chủ | `routes/admin/api/home_sections_route.js` |
| PATCH | `/admin/api/home-sections/order` | Admin | Sắp xếp section | `routes/admin/api/home_sections_route.js` |
| PATCH | `/admin/api/home-sections/:key/toggle` | Admin | Bật/tắt section | `routes/admin/api/home_sections_route.js` |
| PUT | `/admin/api/home-sections/:key` | Admin | Cập nhật section theo key | `routes/admin/api/home_sections_route.js` |

### Flash Sales

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/flash-sales` | Admin | Danh sách flash sale | `routes/admin/api/flash_sales_route.js` |
| POST | `/admin/api/flash-sales` | Admin | Tạo flash sale | `routes/admin/api/flash_sales_route.js` |
| PUT | `/admin/api/flash-sales/:id` | Admin | Cập nhật flash sale | `routes/admin/api/flash_sales_route.js` |
| DELETE | `/admin/api/flash-sales/:id` | Admin | Xóa flash sale | `routes/admin/api/flash_sales_route.js` |
| PATCH | `/admin/api/flash-sales/:id/toggle` | Admin | Bật/tắt flash sale | `routes/admin/api/flash_sales_route.js` |

### Lookbooks

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/lookbooks` | Admin | Danh sách lookbook | `routes/admin/api/lookbooks_route.js` |
| POST | `/admin/api/lookbooks` | Admin | Tạo lookbook, upload ảnh field `image` | `routes/admin/api/lookbooks_route.js` |
| PUT | `/admin/api/lookbooks/:id` | Admin | Cập nhật lookbook, upload ảnh field `image` | `routes/admin/api/lookbooks_route.js` |
| DELETE | `/admin/api/lookbooks/:id` | Admin | Xóa lookbook | `routes/admin/api/lookbooks_route.js` |
| PATCH | `/admin/api/lookbooks/:id/toggle` | Admin | Bật/tắt lookbook | `routes/admin/api/lookbooks_route.js` |

### Blog

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/blog` | Admin | Danh sách bài viết | `routes/admin/api/blog_route.js` |
| POST | `/admin/api/blog` | Admin | Tạo bài viết, upload field `image`, `content_media_uploads` | `routes/admin/api/blog_route.js` |
| PUT | `/admin/api/blog/:id` | Admin | Cập nhật bài viết, upload field `image`, `content_media_uploads` | `routes/admin/api/blog_route.js` |
| DELETE | `/admin/api/blog/:id` | Admin | Xóa bài viết | `routes/admin/api/blog_route.js` |
| PATCH | `/admin/api/blog/:id/publish` | Admin | Cập nhật trạng thái xuất bản | `routes/admin/api/blog_route.js` |

### Chats

| Method | Endpoint | Auth | Ghi chú | Route file |
| --- | --- | --- | --- | --- |
| GET | `/admin/api/chats/conversations` | Admin | Danh sách hội thoại | `routes/admin/api/chats_route.js` |
| GET | `/admin/api/chats/unread-total` | Admin | Tổng số tin chưa đọc | `routes/admin/api/chats_route.js` |
| GET | `/admin/api/chats/messages/:userId` | Admin | Lịch sử chat theo user | `routes/admin/api/chats_route.js` |
| POST | `/admin/api/chats/read/:userId` | Admin | Đánh dấu đã đọc theo user | `routes/admin/api/chats_route.js` |
| POST | `/admin/api/chats/upload` | Admin | Upload ảnh/video chat, field `file` | `routes/admin/api/chats_route.js` |

## File nguồn tham chiếu

- `routes/client/api_route.js`
- `routes/client/index_route.js`
- `routes/admin/index_route.js`
- `routes/admin/api/dashboard_route.js`
- `routes/admin/api/orders_route.js`
- `routes/admin/api/users_route.js`
- `routes/admin/api/reports_route.js`
- `routes/admin/api/settings_route.js`
- `routes/admin/api/banners_route.js`
- `routes/admin/api/brands_route.js`
- `routes/admin/api/home_sections_route.js`
- `routes/admin/api/flash_sales_route.js`
- `routes/admin/api/lookbooks_route.js`
- `routes/admin/api/blog_route.js`
- `routes/admin/api/chats_route.js`
