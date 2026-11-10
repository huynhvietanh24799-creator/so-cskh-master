# Mô hình nhiều chi nhánh (hiện tại – v46)

Một app chủ duy nhất (Firebase project `so-cskh`), nhiều chi nhánh dùng chung, dữ liệu tách theo chi nhánh bằng luật Firestore.

## Vai trò
| Vai trò | Mã | Phạm vi |
|---|---|---|
| Giám đốc Vùng | boss (`config/roles.boss`) | Mọi chi nhánh, quản lý danh sách chi nhánh & nhân sự |
| GĐ Chi nhánh | `cn` | Chi nhánh của mình |
| Trợ lý CN | `tl` (+ `quyenGd` nếu được cấp) | Chi nhánh của mình |
| Nhân viên | `nv` | Ba mẹ của mình + xem trong chi nhánh |

## Dữ liệu (Firestore)
- `branches/{bid}` – chi nhánh (nút **Chi nhánh** trên đầu trang)
- `branches/{bid}/nhatky/{date}` – Sổ nhật ký nghiệp vụ
- `branches/{bid}/msgs/current` – thông báo chi nhánh
- `staff/{uid}` – hồ sơ nhân sự, `chiNhanh`, `chucVu` (nút **Nhân sự**)
- `staff/{uid}/parents|plans|logs|att|notes|chat/...` – dữ liệu ba mẹ của từng người
- `config/roles`, `config/settings`, `config/teams` (`br.{bid}` = danh sách tổ riêng từng chi nhánh)

Luật trong `firestore.rules` bảo đảm: người trong chi nhánh A không đọc/ghi được dữ liệu chi nhánh B; Giám đốc Vùng thấy tất cả.
