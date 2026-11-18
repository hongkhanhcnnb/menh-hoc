# MỆNH HỌC – Personal Cosmos (v1.2.0 · Vercel)

**Gói triển khai chính thức cho Vercel.** Đọc [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) trước khi deploy và dùng [VERCEL_SETUP_CHECKLIST.md](VERCEL_SETUP_CHECKLIST.md) để kiểm tra cấu hình.

MỆNH HỌC là ứng dụng đa người dùng về Tử vi – Chiêm tinh, gồm giao diện responsive, FastAPI, tính toán Chiêm tinh phương Tây, Bát tự, Tử Vi Đẩu Số (x-iztro), diễn giải Gemini, nhật ký đồng bộ PostgreSQL và Knowledge Base có RAG.

## Điểm kỹ thuật dành cho Vercel

- FastAPI entrypoint: `main.py` (Vercel tự nhận diện).
- Giao diện tĩnh: `public/index.html`, `public/styles.css`, `public/app.js` (Vercel CDN).
- Python: `3.12` (`.python-version`).
- Database production: PostgreSQL qua `DATABASE_URL` (Neon khuyến nghị). Schema tự tạo khi app khởi động.
- File Knowledge Base: nội dung file và các đoạn trích được lưu trong PostgreSQL, không phụ thuộc filesystem function.
- Cron: Vercel Cron chạy đồng bộ metadata 04:00 sáng Thứ Hai giờ Việt Nam.
- Gemini key: chỉ được đọc ở backend từ `GEMINI_API_KEY`.
- SQLite: chỉ phục vụ local development; không dùng làm persistent store trên Vercel.

## Chức năng hiện tại

- Hồ sơ sinh: ngày, giờ, giới tính, nơi sinh, tọa độ và múi giờ.
- Chiêm tinh phương Tây: Tropical natal chart, 10 thiên thể, cung Mọc/MC, 12 nhà và góc chiếu; giao diện cố định hệ nhà Placidus.
- Bát tự: Tứ trụ, ngày âm, Ngũ hành, Nhật chủ, Đại vận 10 năm và Lưu niên; dữ liệu chữ Hán từ lunar-python được chuyển sang âm Hán-Việt trước khi hiển thị.
- Tử Vi Đẩu Số: x-iztro 0.6.1 (MIT), an 12 cung, Mệnh/Thân, Ngũ hành Cục, 14 chính tinh, phụ tinh, Tứ Hóa, độ sáng sao và các lớp vận; xuất bản lá số tiếng Việt.
- Vedic: vị trí Sidereal Lahiri và Nakshatra ở mức cơ bản; Vimshottari Dasha chưa triển khai.
- Gemini: luận giải sự nghiệp, tài lộc, quan hệ, nếp sống, vận trình ngày và tổng hợp nhật ký.
- Hồ sơ, lá số, nhật ký, metadata cá nhân và lịch sử AI: lưu trên Neon PostgreSQL theo tài khoản; LocalStorage chỉ làm cache giao diện.
- Knowledge Base: upload PDF có text layer, TXT, Markdown; chia đoạn, tìm kiếm và đưa trích đoạn liên quan vào prompt Gemini.
- Metadata discovery: Crossref và Open Library; không tải nội dung sách có bản quyền.
- Bảo vệ: tài khoản email/mật khẩu riêng, PBKDF2-HMAC-SHA256, HttpOnly session cookie, security headers, upload cap 4 MB và best-effort rate limit.

## Những phần chưa có

- Tử Vi đang dùng quy ước mặc định Thiên bàn của iztro/x-iztro, không đại diện cho mọi dị bản Tử Vi Việt Nam. Khác biệt về tháng nhuận, giờ Tý, ranh giới năm, Tứ Hóa và phụ tinh cần được đối chiếu với trường phái mục tiêu trước khi tuyên bố tương thích tuyệt đối.
- Chưa có bộ kiểm thử vàng riêng được đối chiếu với các lá số chuẩn do chuyên gia Tử Vi Việt Nam xác nhận.
- Vedic Vimshottari Dasha chưa triển khai.
- Xác minh email và đặt lại mật khẩu chưa triển khai.
- PDF scan/OCR chưa hỗ trợ.
- Rate limit hiện ở bộ nhớ từng instance, chưa phải distributed rate limiter.

## Tệp quan trọng

```text
main.py                    # FastAPI, calculations, Gemini, PostgreSQL/SQLite adapter
public/index.html           # Frontend HTML
public/styles.css           # Frontend styles
public/app.js               # Frontend JavaScript
vercel.json                 # Function settings + weekly Cron
requirements.txt            # Python dependencies
.python-version             # Python 3.12
.env.example                # Mẫu biến môi trường
VERCEL_DEPLOY.md            # Hướng dẫn triển khai từng bước
VERCEL_SETUP_CHECKLIST.md   # Checklist deploy
LICENSES.md                 # Ghi chú giấy phép
```

## Kiểm thử local

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Điền GEMINI_API_KEY và SESSION_SECRET.
# APP_PASSWORD không còn được sử dụng trong chế độ public multi-user.
# Khi chạy local có thể bỏ trống DATABASE_URL để dùng SQLite.
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Kiểm thử:

```bash
python -m py_compile main.py
node --check app.js
python -m unittest discover -s tests -v
```

## Quy ước Tử Vi và quyền riêng tư AI

- Engine dùng `x-iztro==0.6.1`, MIT, port thuật toán từ `iztro` 2.6.1; lựa chọn mặc định: Thiên bàn, năm đổi tại Tết âm lịch, tháng nhuận hiệu chỉnh ở trung điểm, giờ Tý muộn chuyển sang ngày kế tiếp.
- Cần giờ sinh và giới tính Nam/Nữ để engine hiện tại tính đủ các lớp sao và chiều Đại vận. Khi thiếu dữ liệu, hệ thống báo chưa thể an lá số thay vì tự điền giả định.
- Gemini chỉ nhận dữ liệu lá số đã tính, đã loại các trường định danh và tối đa 20 ghi chép gần đây khi người dùng bật đồng ý. Không gửi mật khẩu, email, tên hoặc tọa độ chính xác.

## Lưu ý pháp lý và sử dụng

Đây là công cụ nghiên cứu/chiêm nghiệm theo các trường phái truyền thống, không có bảo đảm khoa học về khả năng dự báo tương lai. Không dùng kết quả thay thế tư vấn y tế, pháp lý hoặc tài chính. Kerykeion sử dụng AGPL-3.0; xem `LICENSES.md` và rà soát nghĩa vụ giấy phép trước khi cung cấp dịch vụ thương mại.

## Kết nối Neon bằng CLI (local)

Neon CLI tạo `.env.local` nếu dự án chưa có `.env`. Ứng dụng đọc cả `.env.local` và `.env` khi chạy local; cả hai tệp đều được Git ignore.

Với MỆNH HỌC hiện tại, chỉ cần dịch vụ **Postgres**. Gemini được gọi trực tiếp bằng `GEMINI_API_KEY`; ứng dụng chưa sử dụng Neon Auth, Neon AI Gateway, Object Storage, Functions hoặc Realtime. Không cần bật các dịch vụ này chỉ để lấy `DATABASE_URL`.

Từ thư mục chứa `main.py`, chạy `neon link` để liên kết project/branch, sau đó `neon env pull --service postgres` để cập nhật `DATABASE_URL` và `DATABASE_URL_UNPOOLED` vào `.env.local`.

Khi triển khai Vercel, thêm `DATABASE_URL` vào Project → Settings → Environment Variables (Production; thêm Preview/Development nếu cần). Không commit `.env.local`, không chia sẻ connection string qua chat hoặc log.


## Public multi-user (v1.4.0)

- Email/password registration and login; PBKDF2 password hashing and HttpOnly session cookie.
- Per-account profile, chart, journal and personal library metadata persisted in Neon PostgreSQL (`user_state`).
- User-uploaded knowledge documents are scoped by `owner_id`; public reference metadata remains shared.
- Import/export personal JSON backups through authenticated API endpoints.
- `APP_PASSWORD` is no longer used. Configure `DATABASE_URL`, `SESSION_SECRET`, `GEMINI_API_KEY` and `CRON_SECRET`.
- See `VERCEL_DEPLOY.md` for production hardening requirements before public launch.


## Multilingual support (VI / EN / JA)

The interface now supports Vietnamese (default), English, and Japanese. Use the language selector in the top bar. The preference is stored in the browser and in the signed-in account state, so it follows the account across devices.

AI interpretation, daily reflection, and journal-analysis requests use the selected language. Journal entries retain their original text and record the language in which they were written; reference metadata records its source language. Existing Vietnamese/other-language personal text is not silently machine-translated or overwritten. This preserves the original wording and avoids changing personal records.

For deployment, keep your existing environment variables in Vercel. Do not commit `.env` or `.env.local`; use `.env.example` as a key checklist.
