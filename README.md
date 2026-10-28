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

Trang mang nhãn `BKISC-Recruitment-CTF 2026`, có watermark Chlor dạng chữ C pixel ở nền. Sprite Melanie dùng clip `assets/melanie-hcmut.mp4`, chuyển động ở trang danh sách và tự ẩn khi đọc writeup. Playlist gồm `Thiệp Hồng Sai Tên` (saxophone) cùng `Đớn Đau Vô Cùng` (lofi), ghim gọn ở cạnh dưới màn hình. Nhạc chỉ phát sau khi bấm nút; có nút bài trước/sau, chọn bài, tạm dừng, mute/unmute và tự tạm dừng khi chuyển tab. Tệp audio nằm trong `assets/`.
