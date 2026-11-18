# MỆNH HỌC – Fixes applied

## 1. Lá số Tử Vi cá nhân – sửa lỗi Markdown

- `public/app.js` và `app.js` không còn hiển thị `chartText` bằng `<pre>`.
- `chartText` của x-iztro được đưa qua renderer Markdown an toàn.
- Renderer mới hỗ trợ heading, unordered/ordered list, blockquote, fenced code và đặc biệt là Markdown table.
- Bảng Tử Vi có vùng cuộn ngang khi cần, tránh phá layout trên màn hình nhỏ.
- `styles.css` và `public/styles.css` được cập nhật tương ứng.

## 2. Luận giải cuộc đời – tăng chiều sâu

- Prompt `/api/analyze` được viết lại để bắt buộc phân tích tất cả hệ thống có dữ liệu: Tây phương Tropical/Placidus, Bát tự/Tứ trụ, Tử Vi Đẩu Số x-iztro và Vedic Sidereal/Lahiri.
- Không chỉ phân tích hệ thống liên quan trực tiếp đến chủ đề được chọn; các chủ đề chuyên biệt vẫn có phần quét nền tảng đa trường phái trước khi đào sâu.
- Tử Vi yêu cầu luận đủ 12 cung theo từng cung riêng, kết hợp chính tinh/phụ tinh/Tứ Hóa/tam phương tứ chính/các lớp vận khi dữ liệu có.
- Tây phương yêu cầu đọc toàn bộ 10 thiên thể, 12 nhà, góc chiếu nổi bật và các cấu trúc như stellium nếu dữ liệu có.
- Bát tự yêu cầu đọc đủ 4 trụ, Nhật chủ, Ngũ hành, quan hệ giữa các trụ và Đại vận/Lưu niên đã được engine tính.
- Vedic chỉ phân tích các trường dữ liệu thực sự được engine trả về; không tự tạo Vimshottari Dasha hay vị trí thiếu.
- Báo cáo có cấu trúc rõ ràng, yêu cầu lập luận theo chuỗi `Dữ kiện → Ý nghĩa truyền thống → Biểu hiện có thể → Thuận lợi → Thách thức → Gợi ý thực tế`.
- Tăng giới hạn output cho báo cáo từ 6.000 lên 10.000 tokens.

## 3. Quyền riêng tư / giới hạn nhật ký

- Frontend gửi tối đa 20 ghi chép gần nhất cho `/api/analyze`, khớp với nội dung thông báo quyền riêng tư.

## Kiểm thử

Đã chạy thành công:

- `python -m py_compile main.py`
- `node --check public/app.js`
- `node --check app.js`
- `python -m unittest discover -s tests -v` → 16/16 tests OK

## Lưu ý triển khai

- `public/` là bộ frontend được Vercel phục vụ; bản root `app.js`/`styles.css` cũng được đồng bộ để local development không lệch với production.
- Bản ZIP sửa lỗi không bao gồm `node_modules/`, `.git/`, cache Python và `.env`; hãy cấu hình các biến môi trường trên Vercel thay vì đưa secrets vào archive.

## 2026-11-10 — Round 2

- Giữ nguyên logic/prompt của phần **Luận giải cuộc đời** đã sửa ở vòng trước.
- **Bản đồ sao:** thêm khối **Luận giải chi tiết bản đồ sao** ngay dưới dữ liệu lá số; dùng cùng pipeline `/api/analyze` để đọc toàn bộ dữ liệu Tây phương, Bát tự, Tử Vi và Vedic, thay vì chỉ liệt kê.
- **Tử Vi Markdown:** parser bảng chấp nhận cả bảng có/không có dấu `|` bao ngoài, giảm lỗi bảng do định dạng `to_text()`.
- **Tử Vi chữ:** chuẩn hóa khoảng trắng trước/sau ngoặc và dấu phẩy trong lớp hiển thị để tránh các chuỗi như `Thiên Phủ(Miếu)` hoặc `Liêm Trinh(Lợi)`.
- **CSS:** bổ sung style riêng, kích thước và overflow ngang cho bảng Tử Vi; khóa typography của heading/list/table để không rơi về kiểu chữ mặc định.
- Đồng bộ `public/app.js` ↔ `app.js` và `public/styles.css` ↔ `styles.css`.
