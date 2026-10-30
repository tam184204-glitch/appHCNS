# CTG-HCNS — Quản trị Hành chính Nhân sự Cát Tường

Chạy: `node server/server.js` → http://localhost:3600 (hoặc bấm «Mở App HCNS.bat»).
CSDL: PostgreSQL `ctg_hcns`, cấu trúc tự tạo từ `server/meta.js` khi khởi động.

- `node server/seed.js` nạp dữ liệu thật + đối soát; `--demo` thêm dữ liệu mẫu; `--clear-demo` xóa mẫu.
- `npm test` chạy luồng nghiệp vụ (cần server đang chạy, NO_LOGIN=1).
- Dữ liệu cá nhân nằm trong `data/` và DB: không đưa lên git. Vận hành thật: xóa NO_LOGIN trong `.env`.

Cấu trúc: meta.js (biểu mẫu, quyền) · core.js (lõi ghi/đọc/duyệt) · biz.js (tự động theo sự kiện, công thức lương) · jobs.js (việc định kỳ) · reports.js (báo cáo, cảnh báo, dashboard) · print.js (bản in).
