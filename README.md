# chlorcale.github.io

Trang writeup CTF tĩnh, không dùng framework. Nội dung Markdown nằm trong `writeups/`; trình duyệt đọc `writeups/index.json` để dựng danh sách và routing bằng hash (`#/`, `#/w/<slug>`, `#/about`).

## Đưa lên GitHub Pages

1. Tạo repo công khai tên `chlorcale.github.io`.
2. Đưa các tệp trong repo lên nhánh `main` (giữ `.nojekyll`).
3. Trong Settings → Pages chọn *Deploy from a branch* → `main` / `/ (root)`.
4. Mở trang sau khi GitHub Pages hoàn tất triển khai.

## Viết writeup

Tạo `writeups/<slug>.md` theo front matter và thứ tự mục trong `ANALYZE_PROMPT.md`, rồi chạy:

```bash
python ctf.py build
```

Các mục gồm `## Đề bài`, `## Kỹ thuật sử dụng`, `## Cách giải` và `## Flag`. Dòng `<!-- TODO-WRITEUP -->` đánh dấu nội dung còn dang dở. Bài có tệp Markdown mà chưa có trong `challenges.json` vẫn được thêm vào chỉ mục; `title` và `category` đọc từ front matter, category mặc định là `misc`.

## Thêm bài

```bash
python ctf.py add "Tên bài" --category crypto
```

Bài mới được chèn lên đầu `challenges.json` và tệp `writeups/<slug>.md` được tạo từ mẫu. Sau khi viết xong, chạy `python ctf.py build` để cập nhật `writeups/index.json`.

## Xem thử

```bash
python -m http.server 8000
```

Mở `http://localhost:8000`. Trang tải thư viện nhẹ và font từ CDN được cho phép trong `index.html`; không có bước build ngoài lệnh Python trên.

Trang mang nhãn `BKISC-Recruitment-CTF 2026`, có watermark Chlor dạng chữ C pixel ở nền. Sprite Melanie được xuất từ `Melanie_HCMUT.aseprite` thành PNG/WebP RGBA trong suốt; animation dùng ở trang danh sách và PNG tĩnh dùng khi writeup đang mở hoặc bật giảm chuyển động. Giao diện dùng font Poxiao Pixel tự lưu trong `assets/`, với fallback mono. Hiệu ứng Random BullSheet dùng sprite trong suốt DIO/The World từ `assets/dio_and_theworld/`, chuyển thành animation WebP để chạy trong cảnh timestop. Playlist nằm trong dock ghim dưới màn hình, trồi lên khi rê chuột hoặc lấy focus; nhạc tiếp tục chạy khi tab nền. Có nút bài trước/sau, chọn bài, tạm dừng và mute/unmute.

Font Poxiao Pixel được lấy từ [FontPixel](https://fontpixel.com/en/fonts/poxiao-pixel/) và ghi nhận theo SIL Open Font License 1.1; trang nguồn mô tả font ghép từ Fairfax, ZLabs Bitmap và Galmuri.

