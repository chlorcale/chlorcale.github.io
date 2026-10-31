---
title: A Veil of Mist
category: reverse
techniques: custom-vm-reversing, bytecode-disassembly, stack-machine-lifo, inverse-arithmetic, per-byte-bruteforce, byte-register-emulation
summary: Binary chal là trình thông dịch của VM tự chế, còn code là bytecode. Từ bảng opcode, viết parser/disassembler và solver thử 256 giá trị cho mỗi nhóm kiểm tra độc lập; đảo thứ tự các byte tìm được do stack LIFO để khôi phục flag.
---

## Đề bài

Đề cho hai file: `chal` (ELF64 x86-64) và `code`. Chạy `./chal code` thì chương trình in `Flag:` rồi chờ nhập. Nhập đúng thì in `Correct!!!`, sai thì in `Nope!`. Nhiệm vụ là tìm chuỗi đầu vào hợp lệ; chuỗi đó chính là flag.

Điểm khó là `code` không phải mã máy x86-64 mà là bytecode của một máy ảo tự chế. Ghidra hay IDA có thể phân tích binary `chal`, nhưng không có sẵn language/disassembler phù hợp để hiểu trực tiếp bytecode trong `code`.

## Kỹ thuật sử dụng

- **custom-vm-reversing**: Xác định `chal` là trình thông dịch còn `code` là chương trình mà VM thực thi. Phân tích trình thông dịch trước để biết ý nghĩa của từng opcode.
- **bytecode-disassembly**: Dựa trên opcode và độ dài instruction được khôi phục từ pseudocode, viết disassembler Python riêng cho file `code`.
- **stack-machine-lifo**: Đầu vào được push lên stack rồi pop ra để kiểm tra. Vì stack hoạt động theo LIFO, ký tự nhập cuối cùng được kiểm tra đầu tiên.
- **inverse-arithmetic**: Đảo ngược các phép cộng, trừ và XOR trong từng nhóm lệnh để tìm byte đầu vào.
- **per-byte-bruteforce**: Tự động thử tối đa 256 giá trị cho từng byte, thay vì brute force toàn bộ chuỗi 30 byte.
- **vm-emulation**: Mô phỏng các opcode trong Python để kiểm tra ứng viên trước khi chạy binary gốc.

## Cách giải

### Bước 1. Xem hai file và xác định vai trò của từng file

Chạy các lệnh sau để kiểm tra định dạng và nội dung ban đầu:

```bash
file chal code
readelf -h chal
wc -c code
xxd -g1 -c16 code | head -30
```

Kết quả cần chú ý:

- `chal` là ELF64 x86-64 (`Advanced Micro Devices X86-64` trong `readelf -h`), vì vậy có thể mở bình thường trong Ghidra hoặc IDA.
- `code` dài 881 byte. Mười byte đầu là `3e 46 3e 6c 3e 61 3e 67 3e 3a`.
- Các cặp byte này lần lượt được hiểu là lệnh in `F`, `l`, `a`, `g`, `:`. Điều đó khớp với chuỗi `Flag:` mà chương trình hiển thị.

Kết luận sơ bộ: `chal` đọc `code` rồi thực thi từng lệnh trong file đó.


![Terminal - hexdump file code](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/mist/04-code-hexdump.png?raw=true)

### Bước 2. Mở `chal` và chọn Language trong Ghidra

Trong Ghidra, `Language` là kiến trúc tập lệnh của CPU, không phải ngôn ngữ lập trình. Chỉ import file `chal` vào Ghidra. Để Format ở chế độ Auto-Detect; chọn Language `x86:LE:64:default` và compiler specification `gcc` nếu Ghidra yêu cầu, sau đó chạy Auto Analyze.

Không import `code` như một chương trình x86-64. Đây là bytecode cho VM riêng; nếu ép chọn x86-64 thì Ghidra sẽ giải mã các byte thành những instruction CPU không liên quan đến ngữ nghĩa thật của VM.

Ảnh dưới là `chal` mở trong IDA. Hàm `start` có dòng `lea rdi, main` ngay trước `call __libc_start_main`. Bấm đôi vào `main`, sau đó nhấn `F5` để xem pseudocode. Các cảnh báo `positive sp value has been found` xuất hiện tại đoạn `start` trong cửa sổ Output; chúng không làm thay đổi luồng phân tích `main` trong trường hợp này.

![IDA - hàm start trỏ tới main](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/mist/01-ida-start.png?raw=true)

Địa chỉ trong Ghidra thường có tiền tố `0x001...` (ví dụ `FUN_001013dc`), còn IDA có thể hiển thị địa chỉ rút gọn như `sub_13DC`. Các tên hàm trong writeup này dùng theo Ghidra.

### Bước 3. Đọc `main`: xác định luồng thực thi

Hàm `main` (`FUN_001016c7`) điều phối chương trình. Có thể tóm tắt pseudocode như sau:

```c
if (argc == 2) {
    int result = load_file(argv[1]);  // FUN_00101289

    if (result != 1) {
        result = interpret();         // FUN_001013dc

        if (result == 0)
            puts("Correct!!!");
        else
            puts("Nope!");
    }
} else {
    puts("Usage: ./chal command_file");
}
```

Hai hàm cần phân tích tiếp theo thứ tự là hàm nạp file `FUN_00101289()` và hàm thông dịch `FUN_001013dc()`. Hàm thông dịch trả về `0` thì chương trình in `Correct!!!`.


![Ghidra - main() và hàm nạp file](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/mist/02-main-and-loader.png?raw=true)

### Bước 4. Đọc hàm nạp file: xác định dữ liệu khởi tạo của VM

Hàm `FUN_00101289(char *param_1)` thực hiện các thao tác chính:

```c
__stream = fopen(param_1, "rb");
if (__stream == NULL) {
    printf("No file named %s\n", param_1);
    return 1;
}

fseek(__stream, 0, SEEK_END);
__n = ftell(__stream);
fseek(__stream, 0, SEEK_SET);

if ((long)__n < 0xbb9) {
    fread(&DAT_00104040, 1, __n, __stream);
    fclose(__stream);
    return 0;
}

puts("Code too large!");
fclose(__stream);
return 1;
```

Ý nghĩa:

- `fopen(param_1, "rb")` mở file được truyền qua dòng lệnh ở chế độ đọc nhị phân.
- `fseek` và `ftell` lấy kích thước file; chương trình từ chối file có kích thước `>= 0xbb9` (3001 byte), tức chấp nhận tối đa 3000 byte.
- `fread(&DAT_00104040, 1, __n, __stream)` chép nội dung file vào bộ đệm bắt đầu tại `DAT_00104040`.
- File `code` dài 881 byte nên thỏa điều kiện kích thước.

Khi chạy `./chal code`, cần phân biệt ba thành phần:

1. `argv[1] = "code"` là đường dẫn file bytecode. Đây không phải password hay seed.
2. `DAT_00104040` là vùng nhớ chứa nội dung bytecode.
3. `DAT_00104bf8` là instruction pointer (IP), còn `DAT_00104d2c` được dùng làm con trỏ stack theo phân tích hiện tại. Hàm nạp file không gán hai biến này.

Nếu hai biến con trỏ thuộc `.bss` và không bị gán lại trước khi VM chạy, chúng được khởi tạo bằng 0. Khi đó IP bắt đầu đọc từ offset `0` của `code`. Để xác nhận trong Ghidra, nhấn `G`, lần lượt nhập `00104bf8` và `00104d2c`, xem chúng thuộc memory block/section nào và kiểm tra các tham chiếu ghi vào chúng. Không nên kết luận chỉ từ riêng hàm loader.

Dữ liệu nhập từ bàn phím là đầu vào thứ hai; VM chỉ đọc dữ liệu này khi gặp opcode `?`.

### Bước 5. Đọc hàm thông dịch và lập bảng opcode

Hàm `FUN_001013dc()` là vòng lặp thông dịch. Về cơ bản, nó lấy byte tại địa chỉ IP, tăng IP, nhận diện opcode rồi thực thi. Khi gặp byte `0x0d`, hàm kết thúc và trả về `0`.

Hai hàm phụ trong binary:

- `FUN_0010137d()`: PUSH — tăng stack pointer và lưu byte lên stack.
- `FUN_001013b0()`: POP — lấy byte ở đỉnh stack rồi giảm stack pointer.

Đọc từng nhánh `switch` trong `FUN_001013dc()` để ghi nhận opcode, số byte toán hạng theo sau và tác dụng của instruction. Bảng opcode khôi phục được từ pseudocode:

| Opcode | Ký tự | Toán hạng | Độ dài | Ý nghĩa |
|---|---|---|---:|---|
| `3e` | `>` | `c` | 2 | In ký tự `c`. |
| `3f` | `?` | Không | 1 | Đọc một byte từ `stdin`, sau đó push lên stack. |
| `24` | `$` | Không | 1 | Pop một byte khỏi stack, gán vào `r0`. |
| `2c` | `,` | `r v` | 3 | Gán hằng số: `r[r] = v`. |
| `21` | `!` | `d a b` | 4 | Cộng: `r[d] = r[a] + r[b]`. |
| `7c` | `|` | `d a b` | 4 | Trừ: `r[d] = r[a] - r[b]`. |
| `40` | `@` | `d a b` | 4 | XOR: `r[d] = r[a] ^ r[b]`. |
| `3d` | `=` | `v` | 2 | Kiểm tra `r7 == v`; sai thì thoát với kết quả khác 0. |
| `0d` | — | Không | 1 | Kết thúc chương trình VM, trả về `0`. |

Trong mô hình solver bên dưới, các phép toán được thử với thanh ghi 8-bit, tức cộng/trừ theo modulo 256. Cần đối chiếu kích thước thanh ghi với pseudocode/assembly của binary; nếu giả định 8-bit không khớp, thử mô hình 32-bit như tùy chọn của script.


![Ghidra - vòng lặp thông dịch và các opcode](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/mist/03-interpreter-switch.png?raw=true)

### Bước 6. Dùng kích thước file để kiểm tra độ dài instruction

Dùng bảng độ dài ở Bước 5 để chia file `code` thành các đoạn:

| Offset | Nội dung | Số byte |
|---|---|---:|
| `0x00` | 5 lệnh `>` in `Flag:` | `5 × 2 = 10` |
| `0x0a` | 30 lệnh `?` đọc đầu vào | `30 × 1 = 30` |
| `0x28` | 30 nhóm kiểm tra | `30 × 28 = 840` |
| `0x370` | Byte kết thúc `0x0d` | 1 |

Tổng cộng `10 + 30 + 840 + 1 = 881` byte, khớp đúng kích thước file `code`. Đây là một cách kiểm tra chéo bảng độ dài instruction: nếu phân tích sai kích thước của một lệnh thì các offset và tổng kích thước sẽ không còn khớp.

Từ đó suy ra VM đọc 30 byte đầu vào. Khi kiểm tra bằng `./chal code`, cần nhập đủ 30 ký tự rồi nhấn Enter.

### Bước 7. Giải nhóm kiểm tra đầu tiên bằng tay

Nhóm đầu tiên bắt đầu tại offset `0x28` và dài 28 byte. Có thể đọc nhóm lệnh như sau:

```text
0x0028  24             $   r0 = pop()
0x0029  2c 01 27       ,   r1 = 0x27
0x002c  2c 02 17       ,   r2 = 0x17
0x002f  2c 03 21       ,   r3 = 0x21
0x0032  7c 04 00 01    |   r4 = r0 - r1
0x0036  21 05 04 02    !   r5 = r4 + r2
0x003a  40 06 05 03    @   r6 = r5 ^ r3
0x003e  40 07 06 01    @   r7 = r6 ^ r1
0x0042  3d 6b          =   if r7 != 0x6b: fail
```

Gọi byte được pop vào `r0` là `x`. Theo mô hình thanh ghi 8-bit:

```text
r4 = (x - 0x27) mod 256
r5 = (r4 + 0x17) mod 256
r6 = r5 ^ 0x21
r7 = r6 ^ 0x27
điều kiện: r7 == 0x6b
```

Đảo ngược từ điều kiện cuối:

```text
r6 = 0x6b ^ 0x27 = 0x4c
r5 = 0x4c ^ 0x21 = 0x6d
r4 = (0x6d - 0x17) mod 256 = 0x56
x  = (0x56 + 0x27) mod 256 = 0x7d
```

Byte `0x7d` là ký tự `}`. Đây là byte đầu tiên được kiểm tra, nhưng do đầu vào được push lần lượt và pop theo LIFO nên nó tương ứng với ký tự cuối cùng mà người dùng nhập. Kết quả này phù hợp với cấu trúc flag thường có ký tự đóng `}`.

### Bước 8. Tổng quát hóa để giải 30 nhóm

Mỗi nhóm bắt đầu bằng `$`, lấy một byte từ stack vào `r0`, thực hiện một chuỗi phép toán trên các thanh ghi rồi kết thúc bằng `=` để so sánh `r7` với một hằng số.

Có thể đảo ngược từng phép toán bằng tay như Bước 7, nhưng thực hiện 30 lần rất dễ nhầm. Cách tự động hóa là thử từng giá trị byte `x` trong khoảng `0x00` đến `0xff`, mô phỏng các instruction của nhóm và giữ lại giá trị khiến phép so sánh cuối cùng thành công.

Mỗi nhóm có tối đa 256 ứng viên. Với 30 nhóm, số lần thử tối đa là `30 × 256 = 7680`, nhỏ hơn rất nhiều so với `256^30` khả năng nếu brute force toàn bộ chuỗi.

Các nhóm được xử lý theo thứ tự pop, tức ký tự cuối trước. Vì vậy cần đảo ngược danh sách byte tìm được để thu lại thứ tự nhập ban đầu. Script cuối cùng bên dưới khởi tạo tám thanh ghi về 0 khi kiểm tra từng nhóm (`regs = [0] * 8`), nên nó dựa trên giả định mỗi nhóm kiểm tra độc lập và không cần kế thừa trạng thái thanh ghi từ nhóm trước. Khi áp dụng cách này cho VM khác, cần kiểm tra giả định đó từ bytecode/pseudocode; nếu các nhóm dùng chung trạng thái thanh ghi thì phải mô phỏng trạng thái xuyên suốt thay vì reset.

Script yêu cầu mỗi nhóm có đúng một nghiệm trong miền byte `0x00`–`0xff`. Nếu không có nghiệm hoặc có nhiều nghiệm, nó dừng và báo nhóm tương ứng để tránh tự chọn một kết quả không chắc chắn.

### Bước 9. Viết parser và solver cho từng byte

Lưu script dưới đây thành `solve.py`, đặt cùng thư mục với file `code`, rồi chạy:

```bash
python3 solve.py
```

Có thể truyền đường dẫn bytecode khác làm đối số đầu tiên:

```bash
python3 solve.py path/to/code
```

Parser chuyển bytecode thành các instruction đơn giản. Những opcode đã biết được giải mã theo độ dài tương ứng; byte không nhận diện được được ghi thành `SKIP` và bỏ qua một byte, theo nhận xét trong pseudocode rằng interpreter bỏ qua opcode không được nhận diện. Parser dừng khi gặp `0x0d`.

Sau đó script tìm lệnh `POP` đầu tiên, đếm số lệnh `READ` đứng trước nó và chia phần bytecode kiểm tra thành các nhóm kết thúc bằng `CHECK`. Mỗi nhóm được thử với 256 giá trị có thể có của một byte. Nếu một nhóm không có đúng một nghiệm, script dừng thay vì âm thầm chọn ứng viên. Cuối cùng, các byte được đảo ngược vì VM pop theo thứ tự LIFO.

```python
#!/usr/bin/env python3

from pathlib import Path
import sys

CODE_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("code")
data = CODE_PATH.read_bytes()


def decode(data):
    """Decode the challenge's bytecode without running the challenge."""
    ins = []
    pc = 0

    while pc < len(data):
        op = data[pc]

        # The VM stops when it encounters CR as an opcode.
        if op == 0x0D:
            break

        if op == ord(">"):
            ins.append(("OUT", data[pc + 1]))
            pc += 2

        elif op == ord("?"):
            ins.append(("READ",))
            pc += 1

        elif op == ord("$"):
            ins.append(("POP",))
            pc += 1

        elif op == ord(","):
            ins.append(("IMM", data[pc + 1], data[pc + 2]))
            pc += 3

        elif op in (ord("!"), ord("|"), ord("@")):
            names = {
                ord("!"): "ADD",
                ord("|"): "SUB",
                ord("@"): "XOR",
            }
            ins.append((
                names[op],
                data[pc + 1],  # destination register
                data[pc + 2],  # source register A
                data[pc + 3],  # source register B
            ))
            pc += 4

        elif op == ord("="):
            ins.append(("CHECK", data[pc + 1]))
            pc += 2

        else:
            # The interpreter ignores unrecognized opcode bytes.
            ins.append(("SKIP", op))
            pc += 1

    return ins


instructions = decode(data)

# Find the first POP: all input bytes have been read before this point.
first_pop = next(
    i for i, ins in enumerate(instructions)
    if ins[0] == "POP"
)

read_count = sum(
    ins[0] == "READ"
    for ins in instructions[:first_pop]
)

# Split the program into groups ending at each equality check.
groups = []
current = []

for ins in instructions[first_pop:]:
    current.append(ins)

    if ins[0] == "CHECK":
        groups.append(current)
        current = []

if current:
    raise RuntimeError("Unexpected instructions after the final check")

print(f"[+] Input bytes: {read_count}")
print(f"[+] Check groups: {len(groups)}")

if read_count != len(groups):
    raise RuntimeError(
        "Input/check count mismatch: inspect the VM parser."
    )


def check_group(group, candidate):
    """
    Test one possible input byte against one VM check.

    The VM's stack is LIFO. Each group starts by popping its
    corresponding input byte into register 0.
    """
    regs = [0] * 8
    pop_count = 0

    for ins in group:
        op = ins[0]

        if op == "POP":
            regs[0] = candidate
            pop_count += 1

        elif op == "IMM":
            _, dst, value = ins
            if dst >= len(regs):
                raise RuntimeError(f"Invalid register: {dst}")
            regs[dst] = value

        elif op == "ADD":
            _, dst, a, b = ins
            regs[dst] = (regs[a] + regs[b]) & 0xFF

        elif op == "SUB":
            _, dst, a, b = ins
            regs[dst] = (regs[a] - regs[b]) & 0xFF

        elif op == "XOR":
            _, dst, a, b = ins
            regs[dst] = (regs[a] ^ regs[b]) & 0xFF

        elif op == "CHECK":
            _, expected = ins
            if pop_count != 1:
                raise RuntimeError(
                    f"Expected one POP per group, got {pop_count}"
                )
            return regs[7] == expected

    return False


# Each check depends on one input byte. Enumerate its 256 possible values.
# This is per-byte constraint solving, not brute-forcing the full flag.
execution_order = []

for index, group in enumerate(groups):
    matches = [
        value for value in range(256)
        if check_group(group, value)
    ]

    if len(matches) != 1:
        print(
            f"[!] Check {index}: {len(matches)} candidates: "
            f"{[hex(x) for x in matches]}"
        )
        raise RuntimeError(
            "A check did not produce exactly one candidate."
        )

    execution_order.append(matches[0])

# All '?' instructions push input in forward order.
# '$' pops it in reverse order, so reverse the solved bytes.
answer = bytes(reversed(execution_order))

print("\n=== RECOVERED INPUT ===")
print("Bytes repr:", repr(answer))
print("Bytes hex: ", answer.hex())

try:
    text = answer.decode("ascii")
    print("ASCII:     ", text)
    print("Starts BKISC{:", text.startswith("BKISC{"))
    print("Ends with }:", text.endswith("}"))
except UnicodeDecodeError:
    print("The recovered bytes are not entirely ASCII.")
```

Kết quả chạy thực tế được cung cấp:

```text
(venv) chlorcale@LAPTOP-AACLUUPG:~/ctf/2026/mist$ python3 solve.py
[+] Input bytes: 30
[+] Check groups: 30

=== RECOVERED INPUT ===
Bytes repr: b'BKISC{VM_is_not_that_hard_lol}'
Bytes hex:  424b4953437b564d5f69735f6e6f745f746861745f686172645f6c6f6c7d
ASCII:      BKISC{VM_is_not_that_hard_lol}
Starts BKISC{: True
Ends with }:   True
```

Solver đã tìm được 30 byte đầu vào và chia được 30 nhóm kiểm tra. Kết quả ASCII có tiền tố `BKISC{` và hậu tố `}`, khớp cấu trúc flag của challenge.

### Bước 10. Kiểm chứng kết quả

Output ở Bước 9 xác nhận solver đã khôi phục được 30 byte, gồm:

- Số lệnh đọc đầu vào: `30`.
- Số nhóm kiểm tra: `30`.
- Chuỗi ASCII: `BKISC{VM_is_not_that_hard_lol}`.
- Byte đầu và cuối lần lượt phù hợp với tiền tố `BKISC{` và ký tự đóng `}`.

Để kiểm chứng độc lập với mô hình Python, chạy binary gốc:

```bash
./chal code
```

Khi chương trình hiện `Flag:`, nhập:

```text
BKISC{VM_is_not_that_hard_lol}
```

Kết quả mong đợi là `Correct!!!`. Transcript được cung cấp ở đây ghi lại kết quả chạy `python3 solve.py`; chưa kèm ảnh hoặc log riêng của lần chạy `./chal code`, vì vậy nên bổ sung ảnh kiểm chứng binary gốc nếu muốn writeup thể hiện đầy đủ bước xác nhận cuối cùng.

> **Vì sao không brute force cả chuỗi?** Với 30 byte, brute force toàn bộ có `256^30` khả năng. Solver chỉ thử 256 giá trị cho mỗi nhóm kiểm tra độc lập, tổng cộng `30 × 256 = 7680` lượt thử tối đa.


![Terminal - kết quả solver](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/mist/05-solver-output.png?raw=true)

## Flag

`BKISC{VM_is_not_that_hard_lol}`

## Tài liệu tham khảo

- Stack machine (Wikipedia): https://en.wikipedia.org/wiki/Stack_machine
- Bytecode (Wikiwand): https://www.wikiwand.com/en/Bytecode
- Bài giảng về bytecode interpreter, vòng lặp fetch, tăng IP và thực thi (Linköping University): https://www.ida.liu.se/~TDDE55/activities/10_imperative_programming_implementation.pdf
