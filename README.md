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