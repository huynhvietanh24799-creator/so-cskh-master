# Sổ CSKH Ba Mẹ – GHL (so-cskh-master)

Mã nguồn gốc của ứng dụng **Sổ CSKH** (https://so-cskh.web.app): sổ chăm sóc ba mẹ dùng chung cho Giám đốc Vùng, Giám đốc chi nhánh, trợ lý và nhân viên.

> Kho này là **Private**. Không đưa mật khẩu, khoá service account hay file `.env` lên đây.

## Cấu trúc

```
src/index.html          Toàn bộ app (HTML + CSS + JS) – bản đọc được, SỬA Ở ĐÂY
scripts/build.js        Nén src/index.html → public/index.html
public/                 Thư mục được deploy lên Firebase Hosting
  config.example.js     Mẫu cấu hình Firebase → chép thành config.js
  manifest.json, sw.js, icon-192.png, icon.svg
firestore.rules         Luật phân quyền Firestore (tách dữ liệu theo chi nhánh)
firebase.json           Cấu hình Hosting + Firestore
.env.example            Các biến môi trường cần có
docs/ARCHITECTURE.md    Mô hình dữ liệu & phân quyền nhiều chi nhánh
```

## Chạy / deploy

```bash
npm install
cp public/config.example.js public/config.js   # điền cấu hình Firebase thật
cp .env.example .env                           # điền biến môi trường
npm run build                                  # tạo public/index.html
npm run deploy                                 # chỉ Hosting
npm run deploy:rules                           # chỉ luật Firestore
```

Cần cài Firebase CLI (`npm i -g firebase-tools`) và `firebase login` bằng tài khoản quản trị dự án `so-cskh`.

## Quy trình cập nhật

1. Sửa `src/index.html`, tăng số trong `<meta name="app-v" content="…">`.
2. Làm bản xem trước, duyệt xong mới `npm run deploy`.
3. Commit + push lên nhánh `main` để kho này luôn khớp với bản đang chạy.

## Phiên bản

v46 – Xuất file Word "Báo cáo BMTN", chi tiết bệnh dễ đọc, phiếu PPTN có Tên chi nhánh + Tên ba mẹ và chỉ ghi buổi có Độ nhẹ / Tình trạng sức khoẻ, tìm theo tên ba mẹ không cần dấu, giao diện tối dễ nhìn.
