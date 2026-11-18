# Deploy MỆNH HỌC lên Vercel

Gói này đã được điều chỉnh cho mô hình Vercel Functions. FastAPI ở `main.py` là entrypoint; các tệp giao diện trong `public/` được Vercel phân phối qua CDN. Database production dùng PostgreSQL (khuyến nghị Neon qua Vercel Marketplace), không dùng SQLite trên filesystem serverless.

## 1. Tạo PostgreSQL

1. Trong Vercel, mở project sau khi import repository.
2. Vào **Storage** hoặc **Marketplace**, tạo/kết nối một Neon PostgreSQL database.
3. Lấy connection string dạng PostgreSQL từ phần Connect của Neon. Ưu tiên connection string có pooled host (thường có `-pooler` trong hostname) để giảm số kết nối khi Functions scale.
4. Thêm connection string đó vào Vercel Environment Variables với tên chính xác `DATABASE_URL`.
5. Dùng cùng một database cho Production. Không dùng SQLite hoặc file trong `/tmp` làm nơi lưu dữ liệu production.

Schema được tạo tự động khi FastAPI khởi động lần đầu. PostgreSQL giữ metadata tài liệu, nội dung tệp upload (BYTEA), các đoạn văn bản dùng RAG và các mục metadata tìm được.

### Nếu bạn đã tạo Neon project bằng Neon CLI

Từ thư mục dự án (cùng cấp `main.py`), có thể liên kết project hiện có và chỉ lấy thông tin Postgres:

```bash
npm i -g neon@latest
neon auth
neon link --org-id org-young-mountain-50031639 --project-id long-feather-35918121 --branch production
neon env pull --service postgres
```

Neon CLI sẽ ghi `DATABASE_URL` và `DATABASE_URL_UNPOOLED` vào `.env.local` (nếu không tồn tại `.env`). MỆNH HỌC đọc được `.env.local` khi chạy local. Chỉ cần Postgres: Gemini được gọi trực tiếp bằng `GEMINI_API_KEY`; ứng dụng chưa dùng Neon Auth, AI Gateway, Object Storage, Functions hoặc Realtime. Vì vậy không cần khai báo/deploy các dịch vụ đó. Với cấu hình chỉ Postgres, `neon deploy` không cần thiết để lấy connection string; `neon env pull` là bước cần thiết.

Đối với Vercel, `.env.local` không tự động trở thành environment variable của production. Thêm `DATABASE_URL` tại Project → Settings → Environment Variables, chọn Production (và Preview/Development nếu cần), sau đó redeploy. Không commit `.env.local` lên GitHub.

## 2. Import repository và deploy

1. Giải nén toàn bộ ZIP.
2. Đưa nội dung thư mục `menh-hoc-vercel` lên một repository GitHub riêng tư.
3. Vào <https://vercel.com/new>, import repository.
4. Vercel sẽ nhận diện FastAPI từ `main.py`; giữ Root Directory là thư mục chứa `main.py`.
5. Không cần Build Command hoặc Output Directory riêng. Runtime Python được ghim ở `3.12` trong `.python-version`.
6. Thêm các biến môi trường bên dưới cho **Production, Preview và Development** theo nhu cầu, sau đó deploy.

## 3. Environment Variables bắt buộc

| Key | Bắt buộc | Giá trị |
|---|---:|---|
| `DATABASE_URL` | Có | Neon PostgreSQL pooled connection string, có `sslmode=require` |
| `SESSION_SECRET` | Có | Chuỗi ngẫu nhiên dài tối thiểu 64 ký tự |
| `GEMINI_API_KEY` | Có, nếu dùng AI | Gemini API key lấy từ Google AI Studio |
| `GEMINI_MODEL` | Nên có | Model text đang được Google AI Studio bật cho project/key |
| `CRON_SECRET` | Có, nếu chạy đồng bộ tuần | Chuỗi bí mật riêng, tối thiểu 32 ký tự |
| `MAX_UPLOAD_MB` | Nên có | `4` |
| `AI_HOURLY_LIMIT` | Tùy chọn | `20` lượt/IP/giờ (giới hạn best-effort theo instance) |

**Không còn dùng `APP_PASSWORD`.** v1.3.0 có đăng ký/đăng nhập theo email và mật khẩu riêng từng tài khoản. Mật khẩu được băm PBKDF2-HMAC-SHA256; session cookie HttpOnly, Secure khi HTTPS và SameSite=Lax.

Tạo secret ngẫu nhiên trên máy:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Chạy lệnh hai lần để tạo `SESSION_SECRET` và `CRON_SECRET` khác nhau. Không commit `.env`, không đưa Gemini API key vào `public/`, `index.html` hoặc `app.js`. Chỉ bật phân tích Gemini sau khi đọc thông báo quyền riêng tư trong ứng dụng. Ứng dụng gửi lá số đã tính và tối đa 20 ghi chép gần đây khi người dùng chủ động đồng ý; không gửi tên, email, mật khẩu hoặc tọa độ chính xác.

## 4. Weekly Cron

`vercel.json` đã khai báo Cron:

```json
{
  "path": "/api/cron/weekly-discovery",
  "schedule": "0 21 * * 0"
}
```

Cron của Vercel sử dụng UTC. `21:00 UTC Chủ Nhật` tương đương `04:00 sáng Thứ Hai` tại Việt Nam (UTC+7). Vercel gửi `Authorization: Bearer <CRON_SECRET>`; route kiểm tra token trước khi chạy. Cron chỉ chạy trên production deployment. Có thể chạy đồng bộ thủ công từ màn hình Thư viện tri thức sau khi đăng nhập.

## 5. Upload giới hạn 4 MB

Vercel Functions có giới hạn payload request/response 4.5 MB. Ứng dụng giới hạn file upload ở 4 MB để chừa dung lượng multipart overhead. Đối với tệp lớn hơn, cần nâng cấp sang luồng direct-to-object-storage (ví dụ Vercel Blob) thay vì gửi qua FastAPI Function.

## 6. Kiểm tra sau deploy

Mở các URL sau:

- `/` — website.
- `/api/health` — cần thấy `databaseConfigured: true`, `persistentStorage: true`, `authRequired: true`.
- `/api/auth/status` — trước đăng nhập phải thấy `authenticated: false`; sau đăng nhập `true`.
- `/api/me/state` — cần đăng nhập; trả dữ liệu của riêng tài khoản hiện tại.
- `/docs` — FastAPI Swagger UI; không chia sẻ công khai nếu không cần.

Sau đó:

1. Tạo tài khoản bằng email và mật khẩu (tối thiểu 10 ký tự).
2. Vào Cài đặt và sao lưu, kiểm tra Gemini.
3. Tạo lá số với hồ sơ mẫu có đầy đủ ngày/giờ/nơi sinh.
4. Upload một tệp TXT nhỏ, thử tìm kiếm Knowledge Base, backup và xóa tài liệu.
5. Mở Vercel → Settings → Cron Jobs để xác nhận job đã được nhận diện; chạy route thủ công chỉ với Bearer secret nếu cần kiểm thử.

## 7. Những giới hạn cần biết

- **Không có SQLite persistence trên Vercel.** Nếu `DATABASE_URL` thiếu, các API lưu trữ trả 503 thay vì lưu dữ liệu vào filesystem tạm. Schema `app_users` và `user_state` được khởi tạo tự động.
- **Tài khoản, hồ sơ, lá số, nhật ký và metadata thư viện cá nhân** được lưu trong bảng `user_state` tại Neon PostgreSQL, phân tách theo `user_id`. LocalStorage chỉ là cache giao diện. File Knowledge Base upload có `owner_id`; người dùng chỉ thấy tài liệu do chính tài khoản đó tải lên. Các file legacy chưa có owner được giữ trong database nhưng không hiển thị/tìm kiếm với bất kỳ tài khoản mới nào để tránh rò rỉ dữ liệu. Metadata được phát hiện tự động là danh mục tham khảo dùng chung.
- **Giới hạn gọi AI và giới hạn đăng ký/đăng nhập hiện là best-effort theo instance/IP**, không phải bộ đếm tập trung chống lạm dụng. Trước khi mở đăng ký đại trà, nên bổ sung rate limit tập trung (Redis/Upstash), xác minh email, quy trình đặt lại mật khẩu, CAPTCHA/anti-bot, điều khoản sử dụng và chính sách quyền riêng tư.
- **Cron discovery thu thập metadata thư mục, không tải toàn văn sách có bản quyền.**
- **Backup Knowledge Base** trả ZIP từ Function; với kho tài liệu rất lớn nên chuyển sang tác vụ export/object storage để tránh giới hạn response.
- **Tử Vi Đẩu Số** dùng x-iztro 0.6.1 theo quy ước Thiên bàn mặc định (năm đổi tại Tết âm lịch, hiệu chỉnh tháng nhuận ở trung điểm, giờ Tý muộn chuyển ngày). Đây không phải cam kết tương thích với mọi trường phái Tử Vi Việt Nam; cần đối chiếu lá số chuẩn của trường phái mục tiêu. Cần giờ sinh và giới tính Nam/Nữ để engine hiện tại tính đủ các lớp vận. `x-iztro` được cài tự động từ `requirements.txt` trong lúc build Function.
- Kerykeion sử dụng AGPL-3.0; xem `LICENSES.md` và rà soát nghĩa vụ giấy phép trước khi phát hành thương mại.

## 8. Chạy local theo môi trường tương tự

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Điền DATABASE_URL (Neon), SESSION_SECRET, GEMINI_API_KEY
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Hoặc cài Vercel CLI rồi chạy:

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```

## 9. Tài khoản công khai và nhập bản sao lưu

- Người dùng mới chọn **Đăng ký**, nhập email và mật khẩu tối thiểu 10 ký tự.
- Mỗi tài khoản có `app_users.id`; dữ liệu cá nhân nằm trong `user_state` với khóa ngoại `user_id`.
- Các API dữ liệu cá nhân yêu cầu session hợp lệ; client không thể chỉ định `user_id` trong payload để đọc/ghi tài khoản khác.
- Tại **Cài đặt & sao lưu → Nhập dữ liệu**, chọn JSON backup cũ. Backend chỉ nhập `data.profile`, `data.journals`, `data.library`, `data.chart` vào tài khoản đang đăng nhập. File MenhHoc v1.1.0 được hỗ trợ.
- Xuất dữ liệu gọi backend `/api/me/export`, không xuất từ cache trình duyệt.
- Dữ liệu backup người dùng cung cấp phải được nhập sau khi đăng ký/đăng nhập. Không đưa file backup có thông tin cá nhân lên GitHub.

## 10. Kiểm thử

```bash
python -m py_compile main.py
node --check app.js
python -m unittest discover -s tests -v
```

Kiểm thử unit chạy với SQLite local. Để xác minh PostgreSQL production, deploy và kiểm tra các luồng tạo/xóa tài liệu và truy xuất Knowledge Base sau khi đã cấu hình `DATABASE_URL`.
