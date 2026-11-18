# Checklist triển khai nhanh Vercel

- [ ] Import repo vào Vercel; Root Directory trỏ đúng nơi có `main.py`.
- [ ] Tạo/kết nối Neon PostgreSQL và đặt `DATABASE_URL` (ưu tiên pooled URL).
- [ ] Đặt `GEMINI_API_KEY` và `GEMINI_MODEL`.
- [ ] Đặt `SESSION_SECRET` (không cần `APP_PASSWORD`; người dùng đăng ký bằng email).
- [ ] Đặt `CRON_SECRET` để weekly metadata discovery hoạt động.
- [ ] Đặt `MAX_UPLOAD_MB=4`.
- [ ] Deploy Production.
- [ ] Kiểm tra `/api/health`: `databaseConfigured=true`, `persistentStorage=true`, `authRequired=true`.
- [ ] Đăng nhập, kiểm tra Gemini, upload TXT nhỏ, tìm kiếm, backup, xóa.
- [ ] Xác nhận Cron Job trong Vercel Dashboard.
- [ ] Đăng ký tài khoản thử nghiệm, nhập backup JSON qua Cài đặt & sao lưu.
- [ ] Kiểm tra dữ liệu không hiển thị chéo giữa hai tài khoản.


## Neon CLI đã tạo `.env.local`?

- [ ] Chỉ bật Postgres cho ứng dụng hiện tại.
- [ ] Chạy `neon env pull --service postgres` từ thư mục chứa `main.py`.
- [ ] Xác nhận `.env.local` không bị Git theo dõi (`git status --short`).
- [ ] Thêm `DATABASE_URL` vào Vercel Environment Variables; `.env.local` không tự đồng bộ lên Vercel.
- [ ] Redeploy sau khi thêm biến môi trường.
