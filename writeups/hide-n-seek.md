---
title: Hide and Seek
category: forensic
techniques: disk-forensics, linux-artifact-analysis, nginx-log-analysis, systemd-persistence, elf-reversing, dynamic-library-analysis, network-forensics, xor-decryption
summary: Điều tra image Linux .dd từ dấu vết Nginx, systemd drop-in và ELF được nạp động; lần theo kết nối TCP lặp tới cổng 4444 và giải mã dữ liệu ẩn trong thư viện.
---

## Đề bài

Challenge cung cấp một disk image Linux định dạng `.dd`. Mục tiêu là điều tra các dấu vết còn lại trên máy chủ, tìm cơ chế bất thường liên quan đến Nginx và khôi phục flag theo định dạng `BKISC{...}`.

Trong quá trình điều tra, các khu vực đáng chú ý gồm:

- `/var/log/nginx/`: access log và error log.
- `/etc/nginx/`: cấu hình Nginx.
- `/etc/systemd/system/nginx.service.d/`: cấu hình bổ sung cho service Nginx.
- `/usr/lib/nginx/`: chương trình được gọi sau khi Nginx khởi động.
- `/usr/lib/x86_64-linux-gnu/nginx/cache/`: thư viện liên quan đến cache.
- Các thư mục ẩn dưới `/usr/lib/`, đặc biệt những file ELF không có tên thông thường.
- `/home/ops/` và các log xác thực để dựng lại timeline thao tác.

Flag chưa được ghi trực tiếp trong những access log thông thường. Cần lần theo cơ chế được kích hoạt khi Nginx khởi động, phân tích ELF và giải mã dữ liệu nằm trong thư viện.

## Kỹ thuật sử dụng

- **disk-forensics**: Mở image `.dd` bằng FTK Imager ở chế độ chỉ đọc, duyệt filesystem ext4 và export file cần phân tích.
- **nginx-log-analysis**: Đọc `access.log`, `access.log.1`, `error.log` và đối chiếu thời điểm request với các lần Nginx restart.
- **systemd-persistence**: Kiểm tra drop-in `nginx.service.d/10-cache.conf`, đặc biệt `EnvironmentFile` và `ExecStartPost`.
- **linux-artifact-analysis**: Phân tích `.bash_history`, `auth.log`, `sys.log`, `kern.log` và `deploy.log` để dựng timeline.
- **elf-reversing**: Dùng `file`, `readelf`, `strings` và `objdump` để nhận diện chương trình ELF và các hàm đáng chú ý.
- **dynamic-library-analysis**: Lần theo `dlopen`, `dlsym`, `dlclose` trong `cache-maint` để xác định thư viện và entry point được gọi.
- **network-forensics**: Đối chiếu các TCP SYN đi tới `192.168.137.137:4444` với thời điểm Nginx khởi động.
- **xor-decryption**: Khôi phục chuỗi dữ liệu ẩn bằng XOR với key 4 byte và giá trị phụ thuộc vị trí.

## Cách giải

### Bước 1. Mở disk image bằng FTK Imager

Trong FTK Imager:

1. Chọn **File → Add Evidence Item**.
2. Chọn **Image File**.
3. Chọn file `evidence.dd` rồi nhấn **Finish**.
4. Mở rộng partition và filesystem `rootfs [ext4]`.
5. Duyệt cây thư mục Linux như `/etc`, `/home`, `/usr` và `/var`.

Giữ nguyên file image gốc. Khi cần phân tích bằng công cụ dòng lệnh, export bản sao của file ra thư mục làm việc.

![FTK Imager - Evidence Tree](../assets/writeups/hide_and_seek/01-ftk-evidence-tree.png)

Cấu trúc ban đầu cho thấy các nhánh `/home/ops`, `/usr/lib`, `/var/log` và `/var/www/intranet/releases`. Hai thư mục release `20261012-0830` và `20261017-1745` là các bản triển khai website cần đối chiếu.

### Bước 2. Kiểm tra Nginx access log và error log

Các file được kiểm tra gồm:

```text
/var/log/nginx/access.log
/var/log/nginx/access.log.1
/var/log/nginx/error.log
```

Nội dung `access.log.1` được cung cấp chủ yếu là những request GET thông thường tới:

```text
/
/status.json
/assets/app.js
/assets/site.css
/favicon.ico
```

Các request có mã `200` tương ứng với trang web và tài nguyên tĩnh. Những mã `404` quan sát được trong phần log là request `/favicon.ico`. Chưa thấy request POST, đường dẫn khai thác rõ ràng hoặc chuỗi `BKISC{...}` trong phần log đã kiểm tra.

Trang web là một Operations portal đơn giản. JavaScript gọi `/status.json`, CSS và HTML đều là nội dung tĩnh. Hai bản release có metadata khác nhau:

```json
{"release":"20261012-0830","commit":"c94e42a","application":"intranet"}
{"release":"20261017-1745","commit":"f03b281","application":"intranet"}
```

Trong hai bản public được trích xuất, `status.json` chỉ khác giá trị build (`c94e42a` và `f03b281`); HTML, CSS và JavaScript được cung cấp không cho thấy payload rõ ràng.

Cấu hình Nginx tại `/etc/nginx/sites-available/intranet`:

```nginx
server {
    listen 80 default_server;
    server_name web01.intranet;
    root /var/www/intranet/current/public;
    index index.html;
    location / { try_files $uri $uri/ =404; }
    location = /healthz { access_log off; return 200 'ok'; }
}
```

Cấu hình này cho thấy Nginx phục vụ nội dung từ `/var/www/intranet/current/public`. Vì access log không thể hiện đường dẫn khai thác đáng chú ý, cần chuyển sang kiểm tra các cơ chế khởi động dịch vụ và file thực thi được gọi tự động.

### Bước 3. Dựng timeline từ log hệ thống

Trong `error.log`, Nginx có các lần dừng và khởi động lại vào ngày 19/10/2026:

```text
2026/10/19 01:59:02 [notice] ... using the epoll event method
2026/10/19 02:05:01 [notice] ... signal 3 (SIGQUIT) received, shutting down
2026/10/19 02:05:02 [notice] ... using the epoll event method
2026/10/19 02:12:01 [notice] ... signal 3 (SIGQUIT) received, shutting down
2026/10/19 02:12:02 [notice] ... using the epoll event method
```

`sys.log` cũng ghi nhận Nginx được systemd khởi động lại tại các mốc tương ứng:

```text
Oct 19 01:59:02 web01 systemd[1]: Starting A high performance web server and a reverse proxy server...
Oct 19 01:59:04 web01 systemd[1]: Started A high performance web server and a reverse proxy server.
Oct 19 02:05:01 web01 systemd[1]: Stopped A high performance web server and a reverse proxy server.
Oct 19 02:05:02 web01 systemd[1]: Starting A high performance web server and a reverse proxy server...
Oct 19 02:05:04 web01 systemd[1]: Started A high performance web server and a reverse proxy server.
Oct 19 02:12:01 web01 systemd[1]: Stopped A high performance web server and a reverse proxy server.
Oct 19 02:12:02 web01 systemd[1]: Starting A high performance web server and a reverse proxy server...
Oct 19 02:12:04 web01 systemd[1]: Started A high performance web server and a reverse proxy server.
```

`auth.log` cho thấy các phiên SSH thông thường của user `ops` thường đến từ `192.168.137.10`. Riêng ngày 19/10 có một phiên khác:

```text
Oct 19 01:54:08 web01 sshd[1871]: Accepted publickey for ops from 192.168.137.50 port 49622 ssh2
Oct 19 01:54:11 web01 sudo: ops : TTY=pts/0 ; PWD=/home/ops ; USER=root ; COMMAND=/bin/bash
```

Sau đó có một phiên SSH từ `192.168.137.10` lúc `02:11:04`. Phiên từ `.50` đóng lúc `02:13:32`; root session đóng lúc `02:13:30`. Đến `02:20:10`, user `ops` gọi `sudo poweroff`.

Shell history của `ops` có các lệnh đáng chú ý:

```text
cd /var/www/intranet
ls -l current
sudo nginx -t

hostname
uptime
ss -ntp
sudo systemctl status nginx
sudo journalctl -u nginx --since '2026-10-19 01:00:00'
sudo poweroff
```

Timestamp history `#1792375920` tương ứng mốc 19/10/2026 02:12:00 UTC. Sự trùng khớp với lần Nginx restart thứ ba khiến mốc này đáng chú ý. Tuy nhiên, riêng một phiên đăng nhập từ IP khác hoặc lệnh `poweroff` chưa đủ để kết luận đây là hành vi trái phép; cần ghép với các bằng chứng khác.

### Bước 4. Đối chiếu kết nối mạng bất thường trong kern.log

Trong `kern.log`, phần lớn bản ghi được cung cấp là UDP egress từ máy `192.168.137.20` tới DNS server `192.168.137.1:53`, xuất hiện theo chu kỳ khoảng vài chục giây.

Ngoài luồng DNS này, có ba bản ghi TCP SYN tới cùng một địa chỉ và cổng:

```text
Oct 19 01:59:02 ... SRC=192.168.137.20 DST=192.168.137.137 ... PROTO=TCP SPT=48912 DPT=4444 ... SYN
Oct 19 02:05:02 ... SRC=192.168.137.20 DST=192.168.137.137 ... PROTO=TCP SPT=48914 DPT=4444 ... SYN
Oct 19 02:12:02 ... SRC=192.168.137.20 DST=192.168.137.137 ... PROTO=TCP SPT=48916 DPT=4444 ... SYN
```

Ba gói SYN xuất hiện đúng các thời điểm Nginx bắt đầu khởi động. Chúng cho thấy máy `192.168.137.20` cố gắng thiết lập kết nối TCP tới `192.168.137.137:4444`. Bản ghi SYN một mình không chứng minh handshake đã hoàn tất, nhưng sự lặp lại đúng lúc service khởi động là dấu hiệu cần lần theo trong cấu hình systemd và các chương trình chạy sau khởi động.

### Bước 5. Tìm systemd drop-in của Nginx

Trong FTK Imager, mở:

```text
/etc/systemd/system/nginx.service.d/
```

Tìm thấy file `10-cache.conf` với nội dung:

```ini
[Service]
EnvironmentFile=-/etc/default/nginx-cache
ExecStartPost=-/usr/lib/nginx/cache-maint
```

Hai chỉ thị quan trọng:

- `EnvironmentFile=-/etc/default/nginx-cache`: nạp các biến môi trường từ file cấu hình. Dấu `-` cho phép systemd tiếp tục nếu file này không tồn tại.
- `ExecStartPost=-/usr/lib/nginx/cache-maint`: yêu cầu systemd chạy chương trình `cache-maint` sau lệnh khởi động service. Dấu `-` ở đầu lệnh cho phép systemd không đánh dấu unit thất bại chỉ vì lệnh này trả lỗi.

Điều này tạo được mối liên hệ cần kiểm tra giữa việc Nginx khởi động và chương trình `cache-maint`.

![FTK Imager - nginx.service.d](../assets/writeups/hide_and_seek/02-nginx-systemd-dropin.png)

File `/etc/default/nginx-cache` được trích xuất có nội dung:

```bash
CACHE_MODE=auto
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/nginx/cache/libngx_cache.so
```

Đây là manh mối bổ sung về thư viện được cấu hình cho môi trường service. Cần kiểm tra chính xác file nào được chương trình nạp; không nên mặc định hai file có tên khác nhau là cùng một binary nếu chưa đối chiếu đường dẫn hoặc hash.

### Bước 6. Phân tích chương trình cache-maint

Export `/usr/lib/nginx/cache-maint` từ disk image rồi kiểm tra bản sao trong môi trường phân tích:

```bash
file cache-maint
strings -a cache-maint
readelf -d cache-maint
readelf -Ws cache-maint
```

File có định dạng ELF x86-64. Các chuỗi và symbol được quan sát gồm:

```text
dlopen
dlsym
dlclose
/usr/lib/x86_64-linux-gnu/nginx/cache/libngx_cache.so
cache_sync
```

Những dấu vết này cho thấy `cache-maint` có khả năng nạp một shared library động, tìm symbol `cache_sync`, gọi hàm đó rồi đóng handle. Đây là hướng giải thích hợp lý cho việc vì sao một chương trình được `ExecStartPost` chạy lại có thể tạo kết nối mạng, nhưng nên xác nhận bằng pseudocode/disassembly của chính `cache-maint`.

### Bước 7. Phân tích shared library và hàm cache_sync

Một ELF ẩn tên `.libsys.so` được export để phân tích. Các symbol được liệt kê bằng:

```bash
readelf -Ws .libsys.so
```

Kết quả cho thấy ba hàm:

```text
cache_query
cache_status
cache_sync
```

Có thể xem riêng hàm `cache_sync` bằng:

```bash
objdump -d -M intel --disassemble=cache_sync .libsys.so
```

Trong phần disassembly đã trích xuất, các thao tác đáng chú ý gồm:

1. `socket(AF_INET, SOCK_STREAM, 0)`: tạo socket TCP/IPv4.
2. `setsockopt(...)`: thiết lập các tùy chọn socket.
3. `fcntl(...)`: lấy và điều chỉnh file status flags, trong đó có bật non-blocking mode.
4. `htons(0x115c)`: chuyển port `0x115c` sang network byte order. `0x115c` tương ứng port `4444`.
5. `inet_pton(AF_INET, ...)`: chuyển chuỗi địa chỉ IPv4 nằm trong vùng dữ liệu của ELF thành địa chỉ nhị phân.
6. `connect(...)`: thử kết nối tới endpoint đã thiết lập.
7. Nếu `connect` trả lỗi `EINPROGRESS` (`errno == 115`), hàm dùng `poll` với timeout `2000` ms rồi gọi `getsockopt(SO_ERROR)` để kiểm tra trạng thái kết nối.
8. Sau khi kết nối được xác nhận, hàm khôi phục cờ socket và tiếp tục trao đổi dữ liệu.

Các lệnh assembly tiêu biểu:

```asm
mov edi, 0x2          ; AF_INET
mov esi, 0x1          ; SOCK_STREAM
call socket@plt

mov edi, 0x115c
call htons@plt        ; port 4444

call inet_pton@plt
call connect@plt
```

Trong đoạn đã cung cấp, địa chỉ IPv4 được tham chiếu từ vùng dữ liệu tại VA `0x207e`. Điều này phù hợp với đích `192.168.137.137` xuất hiện trong `kern.log`; cần đối chiếu chuỗi tại địa chỉ này trong file ELF để xác nhận trực tiếp.

![Disassembly cache_sync](../assets/writeups/hide_and_seek/03-cache-sync-disassembly.png)

### Bước 8. Khôi phục dữ liệu XOR trong vùng dữ liệu của ELF

Phần phân tích `cache_query` trước đó xác định một blob mã hóa 33 byte tại địa chỉ ảo ELF `0x2000` và key XOR 4 byte tại `0x2021`.

Công thức giải mã được dùng:

\[
plain[i] = encoded[i] \oplus key[i \bmod 4] \oplus ((13i + 0x37) \bmod 256)
\]

với \(i = 0,1,\ldots,32\). Phép XOR được thực hiện theo từng byte.

Có thể đọc dữ liệu theo địa chỉ ảo ELF bằng cách ánh xạ VA vào section chứa nó. Lưu đoạn sau thành `decode_blob.py` cạnh `.libsys.so`:

```python
#!/usr/bin/env python3
import struct
import sys

path = sys.argv[1] if len(sys.argv) > 1 else ".libsys.so"
data = open(path, "rb").read()

if data[:4] != b"\x7fELF":
    raise SystemExit("File không có ELF magic")
if data[4] != 2 or data[5] != 1:
    raise SystemExit("Cần ELF64 little-endian")

shoff = struct.unpack_from("<Q", data, 0x28)[0]
shentsize, shnum, shstrndx = struct.unpack_from("<HHH", data, 0x3A)

# Đọc section-name string table.
shstr_hdr = shoff + shstrndx * shentsize
shstr_off = struct.unpack_from("<Q", data, shstr_hdr + 24)[0]
shstr_size = struct.unpack_from("<Q", data, shstr_hdr + 32)[0]
shstr = data[shstr_off:shstr_off + shstr_size]

sections = []
for i in range(shnum):
    off = shoff + i * shentsize
    name_off = struct.unpack_from("<I", data, off)[0]
    sh_type = struct.unpack_from("<I", data, off + 4)[0]
    addr = struct.unpack_from("<Q", data, off + 16)[0]
    file_off = struct.unpack_from("<Q", data, off + 24)[0]
    size = struct.unpack_from("<Q", data, off + 32)[0]

    end = shstr.find(b"\0", name_off)
    name = shstr[name_off:end].decode(errors="replace")
    sections.append((name, sh_type, addr, file_off, size))

def read_va(va, length):
    for name, sh_type, addr, off, size in sections:
        # SHT_NOBITS (8) không có dữ liệu tương ứng trong file.
        if sh_type != 8 and addr <= va and va + length <= addr + size:
            start = off + va - addr
            return data[start:start + length]
    raise ValueError(f"Không ánh xạ được ELF VA {va:#x}")

encoded = read_va(0x2000, 33)
key = read_va(0x2021, 4)

decoded = bytes(
    encoded[i] ^ key[i % 4] ^ ((13 * i + 0x37) & 0xff)
    for i in range(33)
)

print("Encoded:", encoded.hex())
print("Key:    ", key.hex())
print("Decoded bytes:", repr(decoded))
print("Decoded text: ", decoded.decode("utf-8", errors="replace"))

if decoded.startswith(b"BKISC{") and decoded.endswith(b"}"):
    print("[+] Dữ liệu có dạng flag BKISC hợp lệ")
else:
    print("[!] Chưa khớp định dạng flag; cần kiểm tra lại địa chỉ và công thức")
```

Chạy:

```bash
python3 decode_blob.py .libsys.so
```

Script chỉ đọc ELF và giải mã dữ liệu; không nạp hoặc thực thi thư viện. Đối chiếu `Encoded`, `Key` và `Decoded text` với disassembly của `cache_query` trước khi kết luận kết quả là flag.

Kết quả chạy thực tế trên file `.libsys.so`:

```text
Encoded: b5a79184e8ab7b746b6c6f3a4c230a43b0e3c0978cbfa8dbf0b23171074759706a
Key:     c0a88989
Decoded bytes: b'BKISC{wo4h_u_kn0w_h0w_t0_f1nd_m3}'
Decoded text:  BKISC{wo4h_u_kn0w_h0w_t0_f1nd_m3}

[+] Co dang flag BKISC hop le!
```

Dữ liệu sau giải mã có đúng 33 byte và khớp cấu trúc `BKISC{...}`. Kết quả này xác nhận được flag nằm trong blob XOR của thư viện, không cần thực thi `.libsys.so`.

### Bước 9. Kết luận từ các bằng chứng

Các bằng chứng đã thu thập tạo thành chuỗi liên kết sau:

```text
systemd drop-in nginx.service.d/10-cache.conf
        |
        +-- ExecStartPost=-/usr/lib/nginx/cache-maint
        |                 |
        |                 +-- ELF có dlopen/dlsym/dlclose
        |                 +-- tìm symbol cache_sync
        |
        +-- EnvironmentFile=/etc/default/nginx-cache
                          |
                          +-- cấu hình thư viện cache

cache_sync
    |
    +-- tạo socket TCP/IPv4
    +-- kết nối tới endpoint hardcode, port 4444
    +-- trao đổi dữ liệu qua socket

kern.log
    |
    +-- TCP SYN 192.168.137.20 -> 192.168.137.137:4444
        tại 01:59:02, 02:05:02 và 02:12:02
```

Điểm quan trọng không phải các request web thông thường, mà là cơ chế được systemd gọi sau khi Nginx khởi động. Những lần kết nối TCP trùng thời điểm service start phù hợp với hành vi socket/connect quan sát được trong `cache_sync`.

Lưu ý về mức độ xác minh: các dòng SYN chứng minh có nỗ lực kết nối, không tự chứng minh toàn bộ phiên TCP thành công. Muốn xác nhận thêm cần PCAP hoặc log phía đích. Ngoài ra, cần xác nhận file thư viện được `cache-maint` nạp thực tế có cùng nội dung với `.libsys.so` đã phân tích (ví dụ đối chiếu đường dẫn, symlink và SHA-256).

## Flag

`BKISC{wo4h_u_kn0w_h0w_t0_f1nd_m3}`

## Ảnh cần bổ sung

Đặt ảnh vào `assets/writeups/hide_and_seek/` theo các tên được tham chiếu trong bài:

```text
assets/writeups/hide_and_seek/
├── 01-ftk-evidence-tree.png
├── 02-nginx-systemd-dropin.png
└── 03-cache-sync-disassembly.png
```
