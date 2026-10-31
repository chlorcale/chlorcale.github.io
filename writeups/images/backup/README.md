# Ảnh cho writeup `backup`

Bốn ảnh dưới đây là mẫu đã chèn sẵn trong `writeups/backup.md`. Chỉ cần chụp đúng tên file và đặt vào thư mục này.

| Tên file | Vị trí trong writeup | Nên chụp gì |
|---|---|---|
| `01-docker-images.png` | Bước 8, sau lệnh `docker load` | Tab **Images** của Docker Desktop, thấy `kangtheconq/backup:latest` và dung lượng image |
| `02-docker-logs.png` | Bước 8, sau danh sách kết quả | Tab **Logs** của container, thấy các dòng `audit.jsonl` (đặc biệt dòng `contractor-temp` tải document 184) |
| `03-run-normal-srv-data.png` | Bước 8, sau khi chạy bình thường | Tab **Files** → `/srv/data`, thấy `documents.db` + `exports/` và **không có** `bootstrap.json`; nếu được thì mở thêm `/opt` để thấy rỗng |
| `04-bypass-bootstrap.png` | Bước 8, sau phần ghi đè entrypoint | Tab **Files** hoặc editor của container `backup-keep`, thấy `/srv/data/bootstrap.json` với `key_hex` |

## Gợi ý khi chụp

- Dùng `Win + Shift + S` (Snipping Tool) để chụp đúng vùng cửa sổ Docker Desktop.
- Ưu tiên ảnh rộng tối thiểu ~1200 px, chữ trong ảnh phải đọc được khi thu nhỏ trên trang.
- Mở rộng đúng nhánh thư mục trước khi chụp; đừng để thanh cuộn che mất tên file.
- Che token, email hoặc tên container không liên quan nếu có.
- Định dạng `.png`, giữ đúng tên file ở bảng trên.

## Sau khi thêm ảnh

```bash
python ctf.py build
git add writeups/backup.md writeups/images/backup
git commit -m "writeup: backup"
git push
```

Ảnh dùng URL GitHub `blob/main/...?raw=true`, nên phải push lên nhánh `main` thì trang mới hiển thị được.
