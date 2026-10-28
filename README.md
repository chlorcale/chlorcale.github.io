# chlorcale.github.io

Trang writeup CTF tĩnh. Trang chính là danh sách challenge (chia theo mảng, có điểm và thời gian giải). Mở một bài ra sẽ thấy các kỹ thuật dùng trong bài rồi tới cách giải.

## Đưa lên GitHub Pages
1. Tạo repo công khai tên đúng `chlorcale.github.io`.
2. Upload toàn bộ file (nhớ cả `.nojekyll`) lên nhánh `main`.
3. Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.
4. Mở https://chlorcale.github.io sau 1–2 phút.

## Viết writeup cho một bài đã có trong danh sách
1. Dán `ANALYZE_PROMPT.md` + lời giải vào AI.
2. Lưu kết quả vào `writeups/<slug>.md` (slug lấy từ `challenges.json`).
3. `python ctf.py build`, rồi `git add . && git commit -m "writeup" && git push`.

## Thêm một challenge mới
```bash
python ctf.py add "Tên bài" --category crypto --points 500 --solved "2026-10-28 10:00:00"
```
Lệnh này thêm vào `challenges.json` và tạo sẵn `writeups/<slug>.md` từ mẫu.

## Xem thử trên máy
```bash
python -m http.server 8000   # mở http://localhost:8000
```
