---
title: NTA
category: forensics
techniques: powershell-deobfuscation, c2-traffic-analysis, pcap-analysis, aes-256-cbc, hmac-sha256, dns-exfiltration
summary: Giải tĩnh loader PowerShell để lấy master key, giải mã HTTP C2, sau đó ghép và giải mã các DNS query dùng để exfiltrate flag.txt.
---

## Đề bài

Challenge cung cấp hai tệp:

- `agent.ps1`: một PowerShell script được obfuscate. Phần mã nhìn thấy ban đầu chủ yếu là loader, có nhiệm vụ ghép các mảnh Base64, XOR, giải nén GZIP rồi thực thi script bên trong.
- `traffic.pcap`: bản ghi lưu lượng mạng của máy nạn nhân. Trong capture có các request HTTP tới máy chủ C2 và các truy vấn DNS được dùng để truyền dữ liệu ra ngoài.

Mục tiêu là phân tích hai tệp mà không thực thi agent, khôi phục nội dung trao đổi giữa agent và C2, sau đó lấy lại tệp bị đánh cắp và tìm flag.

## Kỹ thuật sử dụng

- **powershell-deobfuscation**: giải lớp loader bằng cách sắp xếp lại các mảnh Base64, giải mã Base64, XOR từng byte và giải nén GZIP. Chỉ trích xuất nội dung để phân tích, không gọi `ScriptBlock` để thực thi.
- **pcap-analysis**: đọc PCAP/PCAPNG, phân tích IPv4, TCP, UDP và dựng lại các phiên HTTP cần thiết.
- **c2-traffic-analysis**: nhận diện mô hình polling qua các endpoint `/api/tasks` và `/api/result`; giải mã task và kết quả trao đổi giữa agent với máy chủ C2.
- **aes-256-cbc**: giải mã payload sau khi trích xuất IV và ciphertext từ frame.
- **hmac-sha256**: xác thực frame trước khi giải mã, bảo đảm dữ liệu được ghép đúng và không bị sai lệch.
- **dns-exfiltration**: lấy các chunk dữ liệu được mã hóa trong DNS query, sắp xếp theo index rồi ghép lại để khôi phục file.

## Cách giải

### Bước 1. Nhận diện luồng giao tiếp trong PCAP

Mở `traffic.pcap` bằng Wireshark và lọc HTTP:

```text
http
```

Trong capture, máy nạn nhân `10.44.8.14` giao tiếp với máy chủ `10.44.8.80` qua HTTP port 80. Host identifier được gửi trong request là `ACCT-WS07`.

Các endpoint đáng chú ý:

| Endpoint | Vai trò |
|---|---|
| `GET /api/tasks?node=ACCT-WS07&n=0` | Agent hỏi C2 task cần thực thi |
| `POST /api/result` | Agent gửi kết quả thực thi về C2 |

Đây là mô hình C2 polling: agent chủ động hỏi máy chủ để nhận task, thực hiện task rồi gửi kết quả trở lại. Nội dung HTTP chưa đọc được trực tiếp vì body được đóng gói và mã hóa.


![Wireshark - tổng quan traffic HTTP](../assets/writeups/nta/01-wireshark-overview.png)

### Bước 2. Giải lớp loader của agent.ps1

Phần loader của `agent.ps1` có cấu trúc chính:

```powershell
$q = @(...)                  # Các mảnh Base64 bị chia nhỏ
$j = @(...)                  # Thứ tự ghép các mảnh
$b = [Convert]::FromBase64String((($j | ForEach-Object { $q[$_] }) -join ""))
for ($n = 0; $n -lt $b.Length; $n++) {
    $b[$n] = $b[$n] -bxor 125
}
$m = [IO.MemoryStream]::new($b)
$z = [IO.Compression.GZipStream]::new(
    $m, [IO.Compression.CompressionMode]::Decompress
)
$r = [IO.StreamReader]::new($z)
$s = $r.ReadToEnd()
$r.Dispose()
$m.Dispose()
& ([scriptblock]::Create($s))
```

Không chạy trực tiếp script này. Thay vì gọi:

```powershell
& ([scriptblock]::Create($s))
```

chỉ cần lấy chuỗi `$s` để đọc nội dung script bên trong. Quy trình giải mã là:

1. Đọc danh sách các mảnh từ `$q`.
2. Ghép các mảnh theo thứ tự được chỉ định trong `$j`.
3. Base64-decode chuỗi đã ghép.
4. XOR từng byte với `125` (`0x7d`).
5. GZIP-decompress để thu được PowerShell script thật.

Solver thực hiện toàn bộ thao tác này trong hàm `unwrap_loader()` và chỉ trả về nội dung văn bản, không thực thi script.

### Bước 3. Trích xuất master key

Trong script sau khi giải lớp loader, master key được lưu dưới dạng một mảng byte đã XOR với một hằng số khác. Hàm `get_master_key()` dùng regex để lấy mảng byte và khóa XOR, sau đó khôi phục từng byte:

```python
def get_master_key(inner: str) -> bytes:
    m = re.search(
        r"\$master\s*=\s*\[byte\[\]\]\(([^\]]+)\|\s*ForEach-Object\s*\{\s*\$_\s*-bxor\s*(\d+)",
        inner,
    )
    data = [int(x) for x in m.group(1).split(",")]
    xor_key = int(m.group(2))
    return bytes(x ^ xor_key for x in data)
```

Kết quả mà solver trích xuất từ `agent.ps1`:

```text
[+] Master key: 2650d6be765e2d63ae067459e9359fdbfd0673069fbfe58eb45cf0e5711d8377
```

Đây là khóa AES-256 được dùng để bảo vệ các frame trao đổi qua HTTP giữa agent và C2.

### Bước 4. Phân tích định dạng frame và giải mã HTTP

Mỗi frame được Base64-encode và có cấu trúc:

```text
base64(
    "NTA1"              ||  # Magic/version: 4 byte
    IV                  ||  # IV của AES-CBC: 16 byte
    ciphertext          ||  # AES-256-CBC, có PKCS#7 padding
    HMAC-SHA256         ||  # MAC: 32 byte
)
```

Quy trình giải mã:

1. Base64-decode body.
2. Tách 32 byte cuối làm HMAC; phần còn lại là dữ liệu cần xác thực.
3. Tính lại HMAC-SHA256 bằng master key và so sánh bằng `hmac.compare_digest()`.
4. Kiểm tra 4 byte magic là `NTA1`.
5. Lấy IV tại offset `4..19`, giải mã ciphertext bằng AES-256-CBC.
6. Bỏ PKCS#7 padding để lấy plaintext.

Hàm cốt lõi trong solver:

```python
def unprotect_raw(raw: bytes, key: bytes) -> bytes:
    body, mac = raw[:-32], raw[-32:]
    expected = hmac.new(key, body, hashlib.sha256).digest()

    if not hmac.compare_digest(expected, mac):
        raise ValueError("HMAC sai")
    if body[:4] != b"NTA1":
        raise ValueError("magic sai")

    decryptor = Cipher(
        algorithms.AES(key),
        modes.CBC(body[4:20])
    ).decryptor()
    plaintext = decryptor.update(body[20:]) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    return unpadder.update(plaintext) + unpadder.finalize()
```

HMAC được xác thực trước khi giải mã. Khi HMAC không khớp hoặc magic không đúng, solver dừng xử lý frame đó.

### Bước 5. Dựng lại HTTP C2 và đọc các task

Solver đọc các packet trong PCAP/PCAPNG, nhận diện IPv4, sau đó gom payload TCP theo từng kết nối HTTP. Với mỗi luồng, nó ghép dữ liệu hai chiều để lấy request và response tương ứng, rồi giải mã body bằng master key.

Kết quả chạy solver:

```text
[+] HTTP C2:
  TASK   /api/tasks?node=ACCT-WS07&n=0 -> {'id': 100, 'op': 'inventory'}
  RESULT {"files":["flag.txt","quarterly-notes.txt"],"id":100,"runtime":"7.6.7","host":"ACCT-WS07"}

  TASK   /api/tasks?node=ACCT-WS07&n=1 -> {
      'id': 101,
      'op': 'collect',
      'path': 'flag.txt',
      'key': 'YJFNJcM5ofkjBG2fFAZXCa5yRFY/GdCRpgL3jRVLsXA=',
      'transfer': 'ff0bcfbf',
      'suffix': 'cdn.office-sync.test'
  }
  RESULT {"bytes":42,"id":101,"chunks":5,"status":"delivered"}

  TASK   /api/tasks?node=ACCT-WS07&n=2 -> {'id': 102, 'op': 'exit'}
  RESULT {"id":102,"status":"stopped"}
```

Ta rút ra được trình tự hoạt động:

- Task `100` (`inventory`) yêu cầu agent liệt kê file. Kết quả cho thấy máy có `flag.txt` và `quarterly-notes.txt`.
- Task `101` (`collect`) yêu cầu lấy file `flag.txt`. Task cung cấp khóa riêng, transfer ID và suffix DNS dùng để truyền file.
- Task `102` (`exit`) yêu cầu agent dừng hoạt động.

Thông tin quan trọng để xử lý DNS nằm trong task `101`:

| Trường | Giá trị |
|---|---|
| `path` | `flag.txt` |
| `key` | `YJFNJcM5ofkjBG2fFAZXCa5yRFY/GdCRpgL3jRVLsXA=` |
| `transfer` | `ff0bcfbf` |
| `suffix` | `cdn.office-sync.test` |

### Bước 6. Phân tích DNS exfiltration

Sau khi nhận task `collect`, agent gửi nội dung file qua các DNS query. Tên miền có cấu trúc:

```text
<transfer>.<index>.<total>.<hex-data>.<suffix>
```

Trong đó:

- `transfer`: mã nhận diện một lần truyền dữ liệu.
- `index`: chỉ số của chunk.
- `total`: tổng số chunk.
- `hex-data`: dữ liệu nhị phân đã chuyển sang dạng hex.
- `suffix`: domain được chỉ định trong task.

Với task hiện tại, solver chỉ lấy các query khớp:

```text
transfer = ff0bcfbf
suffix   = cdn.office-sync.test
```

Các chunk được lưu theo `index`, không phụ thuộc thứ tự packet xuất hiện trong capture. Sau khi nhận đủ chunk, solver ghép chuỗi hex theo thứ tự tăng dần, chuyển về bytes rồi giải frame bằng khóa riêng của task (`key`), không dùng master key HTTP.

Các bước xử lý:

1. Lọc DNS query theo transfer ID và suffix của task `collect`.
2. Lấy index, tổng số chunk và phần dữ liệu hex.
3. Kiểm tra có nhận đủ mọi index hay không.
4. Ghép các phần hex theo index.
5. Chuyển chuỗi hex thành bytes.
6. Kiểm tra HMAC và giải mã frame bằng task key.

### Bước 7. Khôi phục flag

Output cuối của solver:

```text
[+] collect flag.txt: transfer=ff0bcfbf, nhận 5/5 khúc
  Nội dung (42 byte): 'BKISC{p0w3rsh3ll_c2_d3crypt10n_dn5_3xf1l}\n'

[FLAG] BKISC{p0w3rsh3ll_c2_d3crypt10n_dn5_3xf1l}
```

Solver đã nhận đủ `5/5` chunk, xác thực HMAC thành công và giải mã được nội dung `flag.txt` dài 42 byte.

### Bước 8. Chạy lại solver

Đặt `solver.py`, `agent.ps1` và `traffic.pcap` trong cùng thư mục, cài thư viện cần thiết rồi chạy:

```bash
pip install cryptography
python3 solver.py agent.ps1 traffic.pcap
```

Có thể thay đổi HTTP port nếu challenge không sử dụng port 80:

```bash
python3 solver.py agent.ps1 traffic.pcap --http-port 80
```

Solver xử lý tĩnh `agent.ps1`, đọc PCAP/PCAPNG, giải mã HTTP C2, lấy task `collect`, ghép DNS chunk và giải mã nội dung file. Không cần thực thi PowerShell agent.

## Flag

`BKISC{p0w3rsh3ll_c2_d3crypt10n_dn5_3xf1l}`

## Solver

Lưu đoạn code dưới đây thành `solver.py`:

```python
#!/usr/bin/env python3
"""Solver cho bài NTA: agent.ps1 + traffic.pcap.

Cách dùng:
    pip install cryptography
    python3 solver.py agent.ps1 traffic.pcap

Tất cả các bước đều là giải mã tĩnh; không thực thi agent.ps1.
"""

import argparse
import base64
import gzip
import hashlib
import hmac
import json
import re
import struct
import sys

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


# ---------------------------------------------------------------------------
# 1. PowerShell loader
# ---------------------------------------------------------------------------
def unwrap_loader(text: str) -> str:
    match_q = re.search(r"\$q\s*=\s*@\((.*?)\)\s*;", text, re.S)
    match_j = re.search(r"\$j\s*=\s*@\(([\d,\s]+)\)", text)
    match_xor = re.search(r"-bxor\s*(\d+)", text)

    if not (match_q and match_j and match_xor):
        raise ValueError("Không tìm thấy dữ liệu loader trong agent.ps1")

    q = re.findall(r"'([^']*)'", match_q.group(1))
    order = [int(x) for x in match_j.group(1).split(",")]
    xor_key = int(match_xor.group(1))

    blob = base64.b64decode("".join(q[i] for i in order))
    blob = bytes(byte ^ xor_key for byte in blob)
    return gzip.decompress(blob).decode("utf-8")


def get_master_key(inner: str) -> bytes:
    match = re.search(
        r"\$master\s*=\s*\[byte\[\]\]\((.*?)\|\s*ForEach-Object\s*\{\s*\$_\s*-bxor\s*(\d+)",
        inner,
        re.S,
    )
    if not match:
        raise ValueError("Không tìm thấy master key trong script đã giải loader")

    values = [int(x) for x in match.group(1).split(",") if x.strip()]
    xor_key = int(match.group(2))
    return bytes(value ^ xor_key for value in values)


# ---------------------------------------------------------------------------
# 2. Frame: Base64("NTA1" + IV + AES-CBC(PKCS7) + HMAC-SHA256)
# ---------------------------------------------------------------------------
def unprotect_raw(raw: bytes, key: bytes) -> bytes:
    if len(raw) < 4 + 16 + 16 + 32:
        raise ValueError("Frame quá ngắn")

    body, mac = raw[:-32], raw[-32:]
    expected = hmac.new(key, body, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, mac):
        raise ValueError("HMAC sai")
    if body[:4] != b"NTA1":
        raise ValueError("Magic sai")

    decryptor = Cipher(
        algorithms.AES(key),
        modes.CBC(body[4:20]),
    ).decryptor()
    plaintext = decryptor.update(body[20:]) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    return unpadder.update(plaintext) + unpadder.finalize()


def unprotect_b64(frame: str, key: bytes) -> bytes:
    return unprotect_raw(base64.b64decode(frame), key)


# ---------------------------------------------------------------------------
# 3. Đọc PCAP / PCAPNG
# ---------------------------------------------------------------------------
def read_packets(path):
    """Trả về danh sách (linktype, packet_bytes)."""
    with open(path, "rb") as file:
        data = file.read()

    packets = []
    magic = data[:4]

    # PCAP
    if magic in (b"\xd4\xc3\xb2\xa1", b"\xa1\xb2\xc3\xd4",
                 b"\x4d\x3c\xb2\xa1", b"\xa1\xb2\x3c\x4d"):
        endian = "<" if magic in (b"\xd4\xc3\xb2\xa1", b"\x4d\x3c\xb2\xa1") else ">"
        linktype = struct.unpack(endian + "I", data[20:24])[0]
        offset = 24

        while offset + 16 <= len(data):
            _, _, included_len, _ = struct.unpack(
                endian + "IIII", data[offset:offset + 16]
            )
            offset += 16
            packets.append((linktype, data[offset:offset + included_len]))
            offset += included_len

    # PCAPNG
    elif magic == b"\x0a\x0d\x0d\x0a":
        endian = "<" if data[8:12] == b"\x4d\x3c\x2b\x1a" else ">"
        offset = 0
        linktypes = []

        while offset + 12 <= len(data):
            block_type, block_len = struct.unpack(
                endian + "II", data[offset:offset + 8]
            )
            body = data[offset + 8:offset + block_len - 4]

            if block_type == 1:  # Interface Description Block
                linktypes.append(struct.unpack(endian + "H", body[:2])[0])
            elif block_type == 6:  # Enhanced Packet Block
                interface_id, _, _, captured_len, _ = struct.unpack(
                    endian + "IIIII", body[:20]
                )
                linktype = linktypes[interface_id] if interface_id < len(linktypes) else 1
                packets.append((linktype, body[20:20 + captured_len]))

            offset += block_len

    else:
        raise ValueError("File không phải PCAP/PCAPNG")

    return packets


def parse_ipv4(linktype, packet):
    """Trả về (protocol, source, destination, layer4_bytes) hoặc None."""
    if linktype == 1:  # Ethernet
        if len(packet) < 14:
            return None
        ether_type = struct.unpack(">H", packet[12:14])[0]
        offset = 14

        while ether_type in (0x8100, 0x88A8):  # VLAN tags
            if len(packet) < offset + 4:
                return None
            ether_type = struct.unpack(">H", packet[offset + 2:offset + 4])[0]
            offset += 4

        if ether_type != 0x0800:
            return None
        ip = packet[offset:]

    elif linktype == 113:  # Linux cooked capture
        ip = packet[16:]
    elif linktype in (101, 12):  # Raw IP
        ip = packet
    else:
        return None

    if len(ip) < 20 or ip[0] >> 4 != 4:
        return None

    ihl = (ip[0] & 0x0F) * 4
    total_length = struct.unpack(">H", ip[2:4])[0]
    protocol = ip[9]
    source = ".".join(map(str, ip[12:16]))
    destination = ".".join(map(str, ip[16:20]))
    return protocol, source, destination, ip[ihl:total_length]


def parse_dns_qname(payload):
    if len(payload) < 13:
        return None
    flags = struct.unpack(">H", payload[2:4])[0]
    if flags & 0x8000:  # Bỏ DNS response, chỉ lấy query
        return None

    labels = []
    offset = 12
    while offset < len(payload) and payload[offset] != 0:
        length = payload[offset]
        labels.append(
            payload[offset + 1:offset + 1 + length].decode("ascii", "replace")
        )
        offset += 1 + length

    return ".".join(labels)


# ---------------------------------------------------------------------------
# 4. Dựng HTTP và giải DNS exfiltration
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("agent", help="agent.ps1")
    parser.add_argument("pcap", help="traffic.pcap")
    parser.add_argument("--http-port", type=int, default=80)
    args = parser.parse_args()

    with open(args.agent, "r", encoding="utf-8-sig") as file:
        loader_text = file.read()

    inner_script = unwrap_loader(loader_text)
    master_key = get_master_key(inner_script)
    print(f"[+] Master key: {master_key.hex()}")

    http_flows = {}
    dns_names = []

    for packet_index, (linktype, packet) in enumerate(read_packets(args.pcap)):
        parsed = parse_ipv4(linktype, packet)
        if not parsed:
            continue

        protocol, source, destination, layer4 = parsed

        if protocol == 17 and len(layer4) >= 8:  # UDP
            source_port, destination_port = struct.unpack(">HH", layer4[:4])
            if destination_port == 53:
                qname = parse_dns_qname(layer4[8:])
                if qname:
                    dns_names.append(qname)

        elif protocol == 6 and len(layer4) >= 20:  # TCP
            source_port, destination_port, sequence = struct.unpack(">HHI", layer4[:8])
            header_length = (layer4[12] >> 4) * 4
            payload = layer4[header_length:]
            if not payload:
                continue

            if destination_port == args.http_port:
                flow_key, side = (source, source_port), "client"
            elif source_port == args.http_port:
                flow_key, side = (destination, destination_port), "server"
            else:
                continue

            flow = http_flows.setdefault(
                flow_key,
                {"client": {}, "server": {}, "order": packet_index},
            )
            flow[side][sequence] = payload

    def join_segments(segments):
        return b"".join(segments[key] for key in sorted(segments))

    tasks = []
    print("\n[+] HTTP C2:")

    for _, flow in sorted(http_flows.items(), key=lambda item: item[1]["order"]):
        request = join_segments(flow["client"])
        response = join_segments(flow["server"])
        request_line = request.split(b"\r\n", 1)[0].decode("ascii", "replace")
        request_body = request.split(b"\r\n\r\n", 1)[-1].strip()
        response_body = response.split(b"\r\n\r\n", 1)[-1].strip()

        try:
            if request_line.startswith("GET /api/tasks"):
                task = json.loads(
                    unprotect_raw(base64.b64decode(response_body), master_key)
                )
                tasks.append(task)
                print(f"  TASK   {request_line.split()[1]} -> {task}")

            elif request_line.startswith("POST /api/result"):
                result = unprotect_raw(
                    base64.b64decode(request_body), master_key
                ).decode()
                print(f"  RESULT {result}")

        except Exception as error:
            print(f"  [!] Không giải được {request_line}: {error}")

    # DNS exfiltration: transfer.index.total.hexdata.suffix
    pattern = re.compile(r"^([0-9a-f]+)\.(\d{3})\.(\d{3})\.([0-9a-f]+)\.(.+)$")
    recovered = False

    for task in tasks:
        if task.get("op") != "collect":
            continue

        transfer_id = task["transfer"]
        suffix = task["suffix"]
        task_key = base64.b64decode(task["key"])
        chunks = {}
        total = None

        for query_name in dns_names:
            match = pattern.match(query_name)
            if match and match.group(1) == transfer_id and match.group(5) == suffix:
                chunks[int(match.group(2))] = match.group(4)
                total = int(match.group(3))

        print(
            f"\n[+] collect {task['path']}: transfer={transfer_id}, "
            f"nhận {len(chunks)}/{total} khúc"
        )

        missing = [index for index in range(total or 0) if index not in chunks]
        if missing:
            print(f"  [!] Thiếu khúc: {missing}")
            continue

        encrypted_frame = bytes.fromhex(
            "".join(chunks[index] for index in range(total))
        )

        try:
            content = unprotect_raw(encrypted_frame, task_key)
        except Exception as error:
            print(f"  [!] Giải mã lỗi: {error}")
            continue

        recovered = True
        print(
            f"  Nội dung ({len(content)} byte): "
            f"{content.decode(errors='replace')!r}"
        )

        for flag in re.findall(rb"[A-Za-z0-9_]+\{[^}]+\}", content):
            print(f"\n[FLAG] {flag.decode()}")

    if not recovered:
        print("\n[!] Chưa tìm thấy dữ liệu exfil nào để giải.")


if __name__ == "__main__":
    main()
```
