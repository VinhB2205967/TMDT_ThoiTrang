# Code Review - 2026-04-02

## Pham vi review

Review nay tap trung vao cac luong backend co rui ro cao cua project:

- Thanh toan MoMo / VNPAY
- Huy don, hoan hang, hoan tien, dong bo ton kho
- Session, hardening bao mat co ban
- Upload file va mot so route debug con lo ra ngoai

Khong di sau toan bo `views/`, `public/`, `AI/` va `node_modules/`. Vi codebase kha lon, minh uu tien cac phan co kha nang gay loi production, mat tien, sai du lieu hoac lo bao mat.

## Tom tat nhanh

- `Critical`: 1 finding
- `High`: 6 findings
- `Medium`: 3 findings
- `Testing / maintainability`: 1 finding

## Findings

### CRITICAL-01: Callback/IPN MoMo chua xac thuc chu ky, co the bi gia mao trang thai thanh toan

- Muc do: `Critical`
- Bang chung:
  - `services/cart/payment-callback.service.js:23-125`
  - `routes/client/cart_route.js:16-20`
  - `services/payment/momo.service.js:127-162`
- Nhan xet:
  - `handleMoMoReturn()` va `handleMoMoIpn()` dang tin truc tiep vao `resultCode`, `orderId`, `transId` tu `query/body`.
  - Trong repo khong co ham kieu `kiemTraChuKyMoMo(...)` hoac buoc verify HMAC cho callback tu MoMo.
  - Trong khi do `services/payment/momo.service.js` chi co phan ky request di ra ngoai, chua co phan verify response/callback di vao.
  - Route `/cart/momo/ipn` la public endpoint, dung voi ban chat IPN, nhung vi khong verify chu ky nen bat ky request nao co payload hop le ve mat cu phap deu co the tac dong toi trang thai don.
- Tac dong:
  - Don hang co the bi danh dau `dathanhtoan=true` ma khong co giao dich that.
  - Log giao dich noi bo cung co the bi danh dau thanh cong sai.
  - Day la loi truc tiep anh huong doanh thu va doi soat.
- Khuyen nghi:
  1. Bo sung ham verify chu ky callback/IPN cua MoMo bang `MOMO_SECRET_KEY`.
  2. Tu choi request ngay neu chu ky khong hop le.
  3. Doi chieu them `momoOrderId`, `momoRequestId`, so tien va trang thai don truoc khi update.
  4. Lam cho thao tac cap nhat idempotent: neu don da thanh toan thi chi log, khong ghi de mu.

### HIGH-01: MoMo dang hard-code host sandbox, rat de goi nham moi truong test khi chay production

- Muc do: `High`
- Bang chung:
  - `services/payment/momo.service.js:22-36`
  - `services/payment/momo.service.js:57-71`
  - `services/payment/momo.service.js:92-106`
- Nhan xet:
  - Ca 3 API create, refund, query deu dung `hostname: 'test-payment.momo.vn'`.
  - Dieu nay khoa cung toan bo tich hop vao moi truong test.
  - Neu trien khai production ma quen sua code, he thong van phat sinh thanh toan/hoan tien/query vao sandbox.
- Tac dong:
  - Thanh toan production khong hoat dong dung.
  - Log trong he thong co the ghi nhan nhung gateway thuc te khong khop.
  - Rat kho debug vi loi khong den tu business flow ma den tu cau hinh bi hard-code.
- Khuyen nghi:
  1. Dua base URL/hostname MoMo vao bien moi truong.
  2. Tach ro cau hinh `sandbox` va `production`.
  3. Fail fast khi thieu cau hinh production thay vi silently dung sandbox.

### HIGH-02: URL callback thanh toan duoc build tu `req.get('host')`, co rui ro Host header injection

- Muc do: `High`
- Bang chung:
  - `controllers/client/cart_controller.js:108-118`
  - `services/cart/checkout.service.js:277-324`
  - `services/order/client-orders.service.js:1041-1086`
- Nhan xet:
  - Khi tao URL cho MoMo/VNPAY, code lay `protocol` va `host` truc tiep tu request hien tai.
  - `host` co the bi anh huong boi `Host` header neu ung dung khong duoc khoa chat o layer reverse proxy.
  - Nhu vay callback/return URL gui sang cong thanh toan co the bi lech domain so voi domain that cua he thong.
- Tac dong:
  - Nguoi dung co the bi redirect ve domain sai.
  - Cong thanh toan co the gui callback/IPN toi endpoint khong mong muon.
  - Day la loi cau hinh nguy hiem trong moi truong public internet.
- Khuyen nghi:
  1. Dung `APP_URL` co dinh tu config/env de build `returnUrl` va `ipnUrl`.
  2. Chi fallback sang request host trong moi truong local/dev.
  3. Neu chay sau proxy, cau hinh `trust proxy` va whitelist host hop le o reverse proxy.

### HIGH-03: `vnpayTxnRef` qua ngan va de dung nhau, callback co the map nham don

- Muc do: `High`
- Bang chung:
  - `services/cart/checkout.service.js:319-330`
  - `services/order/client-orders.service.js:1081-1092`
  - `services/cart/payment-callback.service.js:143-148`
  - `services/cart/payment-callback.service.js:212-217`
  - `models/order_model.js:41-43`
- Nhan xet:
  - `txnRef` hien tai chi gom `DDHHmmss`, tuc chi 8 ky tu va phu thuoc thoi gian theo giay.
  - Hai giao dich tao cung giay hoan toan co the sinh cung `txnRef`.
  - Callback VNPAY dang resolve order bang `findOne({ vnpayTxnRef: txnRef })`, nen collision se dan toi map sai don.
  - Truong `vnpayTxnRef` trong model cung chua co unique index.
- Tac dong:
  - Thanh toan cua don A co the duoc ghi nhan cho don B.
  - Doi soat giao dich, cham soc khach hang va hoan tien se bi sai day chuyen.
- Khuyen nghi:
  1. Dung ma tham chieu du manh: vi du `orderId + timestamp + random suffix`.
  2. Dat unique index cho `vnpayTxnRef` neu business flow yeu cau 1 ref duy nhat.
  3. Khong fallback kieu `txnRef.split('-')[0]` neu format ref khong duoc kiem soat chat.

### HIGH-04: Luong huy don va hoan hang ghi nhieu collection nhung khong co transaction

- Muc do: `High`
- Bang chung:
  - `services/order/client-orders.service.js:870-900`
  - `services/order/order-return.service.js:627-728`
- Nhan xet:
  - O `cancelOrderByUser()`, order bi doi sang `dahuy` truoc, sau do moi hoan ton kho tung item.
  - Neu mot buoc hoan ton fail, ham tra loi cho nguoi dung nhung order da bi huy roi.
  - O `dongBoNhapKhoHoanTra()`, code lan luot:
    - tao phieu nhap
    - insert lo ton kho
    - update san pham
    - update phieu xuat
    - update order
  - Tat ca deu chay tuan tu, khong dung Mongo session/transaction.
- Tac dong:
  - Co the sinh trang thai "don da huy nhung ton kho chua hoan du".
  - Co the co phieu nhap kho da tao nhung order/export receipt chua cap nhat tuong ung.
  - Day la loai loi du lieu rat kho sua tay sau khi production chay lau.
- Khuyen nghi:
  1. Dung MongoDB transaction cho cac luong nhieu buoc thay doi du lieu.
  2. Neu chua dung transaction duoc, can co co che compensation/retry ro rang.
  3. Ghi log audit chi tiet cho tung buoc de ho tro rollback thu cong.

### HIGH-05: Session/security defaults con yeu: fallback secret cung, cookie chua `secure`, CSP bi tat

- Muc do: `High`
- Bang chung:
  - `index.js:44-47`
  - `index.js:99-118`
- Nhan xet:
  - Neu thieu bien moi truong, app se dung secret mac dinh:
    - `fashion-secret-key`
    - `fashion-admin-secret-key`
  - Cookie session hien khong set `secure: true`.
  - `helmet` dang tat `contentSecurityPolicy`.
- Tac dong:
  - Neu deploy thieu env, session secret se doan duoc.
  - Khi chay qua HTTPS nhung cau hinh chua chat, cookie co the van khong duoc bao ve tot nhu mong muon.
  - CSP bi tat lam giam mot lop phong thu quan trong truoc XSS.
- Khuyen nghi:
  1. Bat buoc `SESSION_SECRET` va `ADMIN_SESSION_SECRET` phai ton tai khi boot app.
  2. Bat `cookie.secure` o production.
  3. Khoi phuc CSP voi whitelist phu hop cho script/style/image.
  4. Tach cau hinh dev/prod thay vi noi long mac dinh cho moi moi truong.

### HIGH-06: Sinh ma don hang qua yeu, namespace chi 1000 gia tri moi ngay

- Muc do: `High`
- Bang chung:
  - `models/order_model.js:4-6`
  - `models/order_model.js:155-162`
- Nhan xet:
  - `madonhang` la unique, nhung generator chi dung:
    - ngay `YYYYMMDD`
    - random 3 chu so
  - Tuc moi ngay toi da chi co 1000 ma khac nhau theo ly thuyet.
  - Voi traffic that hoac job seed/import, va cham la rat de xay ra.
- Tac dong:
  - Loi duplicate key khi luu order.
  - Nguoi dung checkout co the gap loi ngau nhien rat kho tai hien.
- Khuyen nghi:
  1. Chuyen sang generator co entropy cao hon: timestamp mili-giay + random dai hon, hoac sequence.
  2. Neu giu unique index, can retry generator khi gap duplicate key.

### MEDIUM-01: Route debug/test dang mo trong app chinh

- Muc do: `Medium`
- Bang chung:
  - `index.js:207-213`
- Nhan xet:
  - `/search` render truc tiep gia tri query ra HTML.
  - `/check-proto` la route test bao mat, khong nen xuat hien trong production app.
  - Du middleware sanitize dang giam bot rui ro XSS, day van la code debug khong nen de public.
- Tac dong:
  - Tang attack surface khong can thiet.
  - Gay nhieu cho he thong routing va review bao mat sau nay.
- Khuyen nghi:
  1. Xoa han cac route debug khoi app chinh.
  2. Neu can giu, chi enable bang env flag o local/dev.

### MEDIUM-02: Upload chi tin vao `mimetype`/extension tu client, trong khi file duoc luu duoi `public/`

- Muc do: `Medium`
- Bang chung:
  - `routes/admin/_upload.js:13-25`
  - `routes/admin/_upload.js:38-52`
  - `index.js:40`
- Nhan xet:
  - Validation hien tai dua chu yeu vao `file.mimetype` va extension.
  - Ca hai gia tri nay deu chiu anh huong tu phia client.
  - File sau do duoc luu truc tiep duoi `public/uploads/...`, tuc co the truy cap cong khai.
- Tac dong:
  - De tro thanh noi host file khong mong muon.
  - Tang rui ro luu nham file gia danh anh/video.
- Khuyen nghi:
  1. Kiem tra magic bytes thuc te bang thu vien nhu `file-type`.
  2. Luu file ngoai `public/`, chi serve qua route kiem soat neu can.
  3. Voi anh, nen can nhac re-encode/transcode truoc khi public.

### MEDIUM-03: Return URL phu thuoc session dang nhap, de gay UX loi khi cong thanh toan redirect ve

- Muc do: `Medium`
- Bang chung:
  - `routes/client/cart_route.js:16`
  - `routes/client/cart_route.js:18`
- Nhan xet:
  - `GET /cart/momo/return` va `GET /cart/vnpay/return` deu yeu cau `requireAuth`.
  - Neu session het han, nguoi dung doi trinh duyet, hoac trinh duyet chan cookie trong luong redirect, nguoi dung se khong xem duoc ket qua thanh toan ngay ca khi gateway da tra ve.
- Tac dong:
  - UX thanh toan de gay hieu nham "da tra tien nhung bi da ve login".
  - Tang kha nang nguoi dung thanh toan lai vi tuong giao dich that bai.
- Khuyen nghi:
  1. Cho phep return route hoat dong ma khong bat buoc session, roi tu resolve order theo du lieu callback da verify.
  2. Neu can auth cho man hinh chi tiet don, redirect mem sau khi da xu ly callback.

### TEST-01: Chua co test tu dong cho cac luong rui ro cao

- Muc do: `Testing gap`
- Bang chung:
  - `package.json:20`
- Nhan xet:
  - `npm test` hien chi tra ve `"Error: no test specified"`.
  - Day la khoang trong lon vi project co nhieu flow nhay cam:
    - checkout
    - callback payment
    - huy don
    - hoan hang / hoan kho / hoan tien
- Tac dong:
  - Nhung bug kieu regression rat de lot vao production.
  - Cac refactor o `services/order/*` va `services/cart/*` co rui ro cao.
- Khuyen nghi:
  1. Viet test integration cho payment callback va order return flow truoc.
  2. It nhat can cover:
     - payment success/fail callback
     - collision/duplicate reference
     - cancel order with stock restore
     - partial return / full return

## Uu tien sua truoc

1. Khoa chat callback/IPN MoMo bang verify chu ky.
2. Bo hard-code sandbox MoMo va co dinh `APP_URL` cho payment return/IPN.
3. Doi cach sinh `vnpayTxnRef` va `madonhang`.
4. Boc transaction cho cac flow doi nhieu collection.
5. Don route debug, bat lai hardening bao mat co ban.
6. Bo sung test integration cho payment va return flow.

## Ghi chu cuoi

Codebase co nhieu effort tot ve business flow, dac biet phan hoan hang/sidecar log da kha chi tiet. Tuy nhien cac khu vuc lien quan tien, ton kho va callback thanh toan van con mot so loi kien truc quan trong. Neu sua dung 4 nhom dau tien o tren, do an toan production cua he thong se tang len dang ke.
