---
title: Slow Flag
category: reverse
techniques: static-analysis, elf64, prng-reconstruction, permutation-cycle-decomposition, modular-exponentiation, xor
summary: Phân tích ELF tĩnh, tái tạo phép hoán vị byte từ PRNG có seed cố định và đảo hàng tỷ lần biến đổi bằng phân rã chu kỳ.
---

## Đề bài

Challenge cung cấp một binary ELF tên `slow_flag`. Chương trình yêu cầu nhập password. Mỗi byte password bị biến đổi rất nhiều lần trước khi so sánh với một bảng có sẵn. Nếu kiểm tra đúng, chương trình xuất dữ liệu bằng cách XOR password với một bảng khác.

Bài toán không yêu cầu brute-force password. Mục tiêu của reverse engineering là tìm ra **phép biến đổi một byte**, hiểu cách binary tạo phép biến đổi đó, lấy các giá trị đích từ ELF và đảo phép biến đổi bằng toán học.

Thông tin binary được ghi nhận:

- Định dạng: ELF64 PIE, kiến trúc x86-64, liên kết động với `libc.so.6`.
- SHA-256: `6AB9D25C098DF939A29CBB6BEBA20120C0730D1CB38640DE30B23CB24F9EADA7`.
- Hai bảng `toequal` và `toxor` có 40 phần tử `int32` little-endian.
- Solver chỉ đọc binary; không sửa và không chạy chương trình gốc để chờ vòng lặp chậm.

## Kỹ thuật sử dụng

- **static-analysis**: phân tích `main`, `transform`, `shuffle`, symbol, section và disassembly.
- **ELF-address-to-file-offset**: đọc dữ liệu tĩnh từ hai mảng trong `.data`.
- **deterministic-PRNG**: tái tạo chuỗi số giả ngẫu nhiên dựa trên seed cố định.
- **Fisher-Yates-shuffle**: tái tạo bảng ánh xạ 256 byte.
- **permutation-cycle-decomposition**: đảo phép hoán vị bằng chu kỳ, không lặp hàng tỷ lần.
- **modular-exponentiation**: tính `9^i mod L` nhanh bằng `pow()`.
- **XOR**: kết hợp password đã khôi phục với bảng `toxor` để lấy output.

## Cách giải

### Bước 1. Xem `main()` trước: cần tìm thông tin gì?

Khi mở ELF trong Ghidra, bắt đầu từ `main()` thay vì đọc toàn bộ chương trình. Có ba câu hỏi cần trả lời:

1. Password byte được lấy ở đâu và duyệt theo chỉ số nào?
2. Mỗi byte bị đưa qua hàm nào, bao nhiêu lần?
3. Kết quả biến đổi được so sánh với bảng nào; nếu đúng thì chương trình xuất gì?

Pseudocode quan trọng:

```c
local_f8 = 1;

for (local_f0 = 0; local_f0 < password_length; local_f0++) {
    local_104 = (int)password[local_f0];

    for (local_100 = 0; local_100 < local_f8; local_100++) {
        for (local_fc = 0; local_fc < local_f8; local_fc++) {
            local_104 = transform(local_104, 1);
        }
    }

    if (local_104 != toequal[local_f0]) {
        /* Password sai */
    }

    /* Khi hợp lệ: xuất toxor[local_f0] XOR password[local_f0]. */
    local_f8 = local_f8 * 3;
}
```

Từ đây ta suy ra số lần gọi `transform()`:

- Ban đầu `local_f8 = 1`.
- Sau mỗi ký tự, `local_f8` được nhân 3.
- Vì ký tự đầu có chỉ số `i = 0`, tại ký tự thứ `i`, `local_f8 = 3^i`.
- Có hai vòng lặp, cả hai đều chạy `local_f8` lần.
- Tổng số lần gọi là `(3^i) * (3^i) = 9^i`.

Gọi `P(x)` là kết quả của đúng một lần `transform(x, 1)`. Điều kiện chương trình kiểm tra là:

```text
P^(9^i)(password[i]) = toequal[i]
```

Đây là mục tiêu toán học của bài: tìm `password[i]` khi đã biết `toequal[i]` và biết phép hoán vị `P`.

**Cần tìm trong Ghidra:** giá trị khởi tạo `local_f8`, hai vòng lặp gọi `transform`, chỗ so sánh với `toequal` và phép nhân `local_f8 *= 3`. Không cần chụp cả màn hình; hãy phóng to để bốn phần này đọc được.

<!-- TODO-IMAGE: 01-main-control-flow.png — Ghidra Decompiler của main(), thấy local_f8=1, hai vòng lặp lồng nhau, transform(), phép so sánh toequal và local_f8*=3. -->
![Ghidra - main(): số lần biến đổi theo vị trí](../assets/writeups/slow-flag/01-main-control-flow.png)

### Bước 2. Mở `transform()`: xác định phép biến đổi một byte

Sau khi biết cần đảo `P^(9^i)`, ta phải tìm `P` là gì. Mở hàm `transform()` và lần lượt tìm:

- Bảng được tạo có bao nhiêu phần tử?
- Bảng ban đầu chứa giá trị nào?
- Seed PRNG được đặt bằng bao nhiêu?
- Hàm shuffle nào được gọi?
- Giá trị đầu vào được biến đổi bằng cách nào?

Pseudocode đã khôi phục:

```c
for (i = 0; i < 0x100; i++) {
    table[i] = i;
}

srand(0xdeadface);
shuffle(table, 0x100);

value = input;
for (i = 0; i < count; i++) {
    value = table[value];
}

return value;
```

`0x100 = 256`, nên bảng ban đầu là `[0, 1, 2, ..., 255]`. Sau shuffle, mỗi phần tử vẫn chỉ xuất hiện đúng một lần vì shuffle chỉ hoán đổi vị trí. Đặt:

```text
P(x) = table[x]
```

Khi `count = 1`, `transform(x, 1)` chính là `P(x)`. Vì `P` là ánh xạ một-một trên 256 byte, nó là một **phép hoán vị** và có thể đảo ngược.

Một chi tiết quan trọng: `srand(0xdeadface)` được gọi lại trước khi shuffle. Nếu cùng implementation PRNG và cùng thuật toán shuffle, mỗi lần gọi `transform()` sẽ tạo lại cùng một bảng `P`. Ta chỉ cần dựng bảng đó một lần trong solver.

**Cần tìm trong Ghidra:** vòng khởi tạo `table[i] = i`, lời gọi `srand(0xdeadface)`, lời gọi `shuffle()` và vòng tra `table[value]`.

<!-- TODO-IMAGE: 02-transform-setup.png — đầu hàm transform(), hiển thị khởi tạo 256 phần tử, srand(0xdeadface) và shuffle(table, 0x100). -->
![Ghidra - transform(): khởi tạo bảng và seed](../assets/writeups/slow-flag/02-transform-setup.png)

<!-- TODO-IMAGE: 03-transform-lookup.png — phần transform() lặp table[value] theo count và return kết quả. -->
![Ghidra - transform(): áp dụng phép hoán vị](../assets/writeups/slow-flag/03-transform-lookup.png)

### Bước 3. Xem `shuffle()`: tái tạo đúng cách xáo trộn

Không thể chỉ tạo một permutation bất kỳ. Solver phải tạo ra chính xác bảng `P` mà binary sử dụng. Vì vậy, mở `shuffle()` và ghi lại công thức chọn chỉ số swap.

Theo disassembly, thuật toán có dạng:

```c
if (n <= 1)
    return;

for (i = 0; i < n - 1; i++) {
    unsigned r = rand();
    unsigned m = n - i;
    unsigned d = (0x7fffffff / m) + 1;
    unsigned j = i + (r / d);
    swap(array[i], array[j]);
}
```

Với `n = 256`, vòng lặp chạy 255 lần. Mỗi lượt lấy một giá trị `r` từ `rand()`, tính `d`, tính `j`, rồi đổi chỗ `a[i]` và `a[j]`. Đây là biến thể Fisher-Yates shuffle.

Công thức chính xác cần đưa vào solver:

```text
m = 256 - i
d = floor(0x7fffffff / m) + 1
j = i + floor(r / d)
swap(a[i], a[j])
```

**Vì sao phải xác định đúng PRNG?** `rand()` là hàm của thư viện C; dãy số sinh ra phụ thuộc implementation của libc. Cùng gọi `srand(0xdeadface)` không có nghĩa mọi libc sẽ sinh cùng 255 số. Theo dữ liệu điều tra của challenge, chuỗi `RAND_VALS` được ghi nhận từ glibc ở môi trường đích và được nhúng vào solver. Công thức LCG phổ thông không được tự ý thay thế nếu chưa chứng minh khớp với target.

**Cần tìm trong Ghidra:** lời gọi `rand()`, biểu thức chia để tính `d`, công thức tạo `j`, và hai phép ghi/đổi chỗ. Chụp thêm cross-reference `rand`/`srand` để chứng minh vị trí gọi.

<!-- TODO-IMAGE: 04-shuffle-loop.png — Decompiler/Listing của shuffle(), thấy rand(), phép tính d, j và swap. -->
![Ghidra - shuffle(): cách chọn vị trí và swap](../assets/writeups/slow-flag/04-shuffle-loop.png)

<!-- TODO-IMAGE: 05-prng-references.png — Symbol Tree/External Functions có rand và srand, kèm cross-reference từ transform hoặc shuffle nếu có. -->
![Ghidra - tham chiếu đến rand() và srand()](../assets/writeups/slow-flag/05-prng-references.png)

### Bước 4. Tìm hai bảng dữ liệu `toequal` và `toxor`

Quay lại `main()`, ta đã thấy hai bảng tham gia trực tiếp vào kiểm tra và xuất dữ liệu:

- `toequal[i]` là kết quả mà `P^(9^i)(password[i])` phải bằng.
- `toxor[i]` là byte mask được XOR với password byte để tạo output.

Địa chỉ và kích thước được ghi nhận từ ELF:

```text
toequal: VA 0x4020, 40 phần tử int32 (160 byte)
toxor:   VA 0x40c0, 40 phần tử int32 (160 byte)
```

Với mapping `.data` của binary này, VA `0x4000` tương ứng file offset `0x3000`. Do đó:

```text
file_offset(toequal) = 0x4020 - 0x1000 = 0x3020
file_offset(toxor)   = 0x40c0 - 0x1000 = 0x30c0
```

Đây là mapping riêng của binary này. Với ELF khác, cần kiểm tra section header/program header; không được mặc định mọi ELF đều dùng `VA - 0x1000`.

Mỗi phần tử là `int32` little-endian, nên Python đọc bằng `struct.unpack_from("<40i", ...)`. Vì `transform()` cho ra byte, các giá trị thô trong `toequal` phải nằm trong 0–255. Với `toxor`, chương trình đưa kết quả vào `putchar()`, nên byte thực sự xuất ra là byte thấp của giá trị XOR; solver lấy `& 0xff`.

**Cần tìm trong Ghidra:** địa chỉ bắt đầu, label và các phần tử của từng mảng. Ảnh nên hiển thị được địa chỉ ảo, kiểu dữ liệu và kích thước phần tử.

<!-- TODO-IMAGE: 06-toequal-array.png — Listing tại VA 0x4020, hiển thị label toequal và các phần tử 4 byte. -->
![Ghidra - mảng toequal tại 0x4020](../assets/writeups/slow-flag/06-toequal-array.png)

<!-- TODO-IMAGE: 07-toxor-array.png — Listing tại VA 0x40c0, hiển thị label toxor và các phần tử 4 byte. -->
![Ghidra - mảng toxor tại 0x40c0](../assets/writeups/slow-flag/07-toxor-array.png)

<!-- TODO-IMAGE: 08-elf-data-mapping.png — Memory Map/section .data và mapping VA/file offset. Nếu Ghidra không hiện file offset, dùng readelf -S/-l làm bằng chứng kèm theo. -->
![Ghidra - section .data và mapping địa chỉ](../assets/writeups/slow-flag/08-elf-data-mapping.png)

### Bước 5. Dựng bảng P một lần

Tới đây ta đã biết toàn bộ thông tin cần cho shuffle:

1. Mảng ban đầu có 256 giá trị tăng dần từ 0 đến 255.
2. Thuật toán thực hiện 255 lượt swap.
3. Mỗi lượt tính chỉ số `j` theo công thức đã lấy từ disassembly.
4. Mỗi lượt dùng một số trong `RAND_VALS`.

Vì vậy, tái tạo `P` chỉ cần tạo `list(range(256))`, chạy lại 255 lần swap và giữ kết quả. Ta không gọi `transform()` của binary; ta mô phỏng đúng phần toán học của nó trong Python.

### Bước 6. Đảo lũy thừa hoán vị bằng phân rã chu kỳ

Bây giờ phương trình cần giải là:

```text
P^(9^i)(password[i]) = toequal[i]
```

Không thể chạy `P` `9^i` lần. Ví dụ ở `i = 10`, số lần gọi là `9^10 = 3,486,784,401` cho một byte.

Nhưng `P` chỉ hoán vị 256 giá trị. Mọi phép hoán vị hữu hạn đều phân rã thành các chu kỳ rời nhau. Ví dụ:

```text
4 -> 9 -> 2 -> 4
```

Chu kỳ này có độ dài `L = 3`. Đi 3 bước sẽ trở về điểm ban đầu, nên đi `k` bước tương đương đi `k mod L` bước.

Nếu chu kỳ được lưu theo thứ tự:

```text
cycle = [x0, x1, ..., x(L-1)]
```

và `x` ở vị trí `p`, thì:

```text
P^k(x)  = cycle[(p + k) mod L]
P^(-k)(x) = cycle[(p - k) mod L]
```

Ta đã biết `toequal[i]`, tức điểm đến sau `9^i` bước. Muốn tìm password ban đầu, chỉ cần lùi `9^i` vị trí trong cùng chu kỳ:

```python
k = pow(9, i, L)
password_byte = cycle[(position(toequal[i]) - k) % L]
```

`pow(9, i, L)` tính trực tiếp `9^i mod L`, không cần tạo số `9^i` lớn và cũng không cần lặp từng bước. Đây là kỹ thuật chính giúp biến hàng tỷ phép biến đổi thành vài phép toán nhỏ.

### Bước 7. Khôi phục output bằng XOR

Khi đã có password, xem lại lệnh xuất dữ liệu trong `main()`:

```c
putchar(toxor[i] ^ password[i]);
```

XOR tự đảo ngược vì `(a XOR b) XOR b = a`. Vì thế, với mỗi vị trí `i`, ta lấy byte thấp của `toxor[i]`, XOR với `password[i]` để khôi phục byte output:

```python
output_byte = (toxor[i] ^ password[i]) & 0xff
```

Lặp đủ 40 phần tử sẽ có 40 byte output.

### Bước 8. Kiểm tra kết quả: không được bỏ byte không in được

Kết quả chạy solver:

```text
Password (40 bytes): b"why_do_I_feel_like_I'm_moving_in_circl\\xb0\\x87"
Password hex: 7768795f646f5f495f6665656c5f6c696b655f49276d5f6d6f76696e675f696e5f636972636cb087

Output (40 bytes): b'BKISC{1m_gl4d_u_g0t_0ut_of_th47_m4z3!!\\xf4\\xc5'
Output hex: 424b4953437b316d5f676c34645f755f6730745f3075745f6f665f746834375f6d347a332121f4c5

Validation (all bytes): PASS
```

`Validation: PASS` cho biết 40 byte password tìm được thỏa phương trình kiểm tra khi dùng bảng `P` và `toequal` mà solver đã dựng/đọc. Nó là kiểm tra nội bộ quan trọng, nhưng chưa tự nó chứng minh độc lập rằng mapping ELF, thuật toán PRNG và chuỗi `RAND_VALS` đều trùng binary gốc.

Hai byte cuối password là `b0 87`; hai byte cuối output là `f4 c5`. Chúng không phải ASCII in được. Không dùng cách lọc như `bytes(b for b in flag if 32 <= b < 127)`, vì nó xóa byte và có thể che giấu sai lệch vị trí.

Code mới sẽ in đủ dữ liệu theo bốn dạng:

- `repr`: giữ byte không in được dưới dạng `\\xb0`, `\\x87`, `\\xf4`, `\\xc5`.
- `ASCII-safe`: hiển thị ký tự ASCII và escape byte ngoài ASCII.
- `Latin-1`: ánh xạ mỗi byte thành đúng một ký tự.
- `hex`: biểu diễn chính xác từng byte, không phụ thuộc font hay terminal.

**Kết luận cần ghi trung thực:** hiện có 40 byte output. 38 byte đầu đọc được là `BKISC{1m_gl4d_u_g0t_0ut_of_th47_m4z3!!`; hai byte cuối là `f4 c5`. Dữ liệu hiện tại chưa có dấu `}` ở cuối. Không tự thêm dấu ngoặc hoặc xóa hai byte cuối để gọi đó là flag hoàn chỉnh. Muốn kết luận nguyên nhân cần đối chiếu độc lập hai phần tử cuối của `toequal`/`toxor`, file offset và PRNG với binary gốc.

<!-- TODO-IMAGE: 09-solver-full-output.png — Chụp terminal sau khi chạy solver đã sửa: phải thấy repr, ASCII-safe, Latin-1, hex đầy đủ 40 byte và Validation. Không cắt mất phần đuôi. -->
![Terminal - output đủ 40 byte, kể cả byte ngoài ASCII](../assets/writeups/slow-flag/09-solver-full-output.png)

### Bước 9. Vì sao không đặt `local_f8 = 0` để bỏ qua độ trễ?

Nếu sửa `local_f8 = 0`, điều kiện hai vòng lặp đều sai ngay từ đầu (`0 < 0` là false), nên `transform()` không được gọi. Chương trình sẽ so sánh byte password nguyên bản với `toequal[0]`, trong khi điều kiện thật ở ký tự đầu là `P(password[0]) = toequal[0]` vì `9^0 = 1`.

Sau mỗi ký tự, `local_f8 *= 3`; bắt đầu từ 0 thì nó luôn bằng 0. Vì vậy sửa biến này làm thay đổi điều kiện xác thực, không phải cách tăng tốc mà vẫn giữ logic gốc.

Cách giải bằng chu kỳ giữ nguyên phép kiểm tra ban đầu nhưng tính kết quả tương đương nhanh hơn rất nhiều.

## Solver hoàn chỉnh

Lưu đoạn code dưới đây thành `solver.py`, đặt cạnh file `slow_flag`, rồi chạy:

```bash
python3 solver.py
```

Hoặc truyền đường dẫn binary:

```bash
python3 solver.py /path/to/slow_flag
```

Solver chỉ đọc binary ở chế độ `rb`; không sửa và không thực thi chương trình challenge.

```python
#!/usr/bin/env python3
# =============================================================================
# slow_flag CTF - standalone Python solver
# =============================================================================
# Recovers the password and output from the `slow_flag` ELF64 binary using
# static analysis. The original binary is only read, never modified/executed.
#
# Usage: python3 solver.py [path/to/slow_flag]
# =============================================================================

import struct
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 1. Locate and read the challenge binary
# ---------------------------------------------------------------------------

DEFAULT_BIN = Path(__file__).resolve().with_name("slow_flag")
BIN_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BIN

if not BIN_PATH.exists():
    sys.exit(f"error: binary not found: {BIN_PATH}")

with open(BIN_PATH, "rb") as f:
    data = f.read()

# ---------------------------------------------------------------------------
# 2. Extract toequal and toxor
# ---------------------------------------------------------------------------

# For this binary:
# VA 0x4000 -> file offset 0x3000
# file_offset = VA - 0x1000

def va2off(va):
    return va - 0x1000


TOEQUAL_VA = 0x4020
TOXOR_VA = 0x40c0
N = 40

toequal_raw = list(
    struct.unpack_from(
        f"<{N}i",
        data,
        va2off(TOEQUAL_VA)
    )
)

toxor_raw = list(
    struct.unpack_from(
        f"<{N}i",
        data,
        va2off(TOXOR_VA)
    )
)

# Check raw values BEFORE masking.
if not all(0 <= v <= 0xFF for v in toequal_raw):
    raise ValueError(
        f"toequal contains values outside byte range: {toequal_raw}"
    )

toequal = toequal_raw

# putchar() emits the low byte of the integer argument.
toxor = [v & 0xFF for v in toxor_raw]

assert len(toxor) == N

# ---------------------------------------------------------------------------
# 3. Reconstruct the PRNG output and shuffle
# ---------------------------------------------------------------------------

# The target calls:
# srand(0xdeadface)
# shuffle(table, 256)
#
# The following 255 values are the rand() outputs recorded for the target
# glibc implementation. A generic LCG must not be substituted without
# proving that it matches the target.

RAND_VALS = [
    105117016, 1375465877, 893382572, 75443725, 2098268485, 134323897,
    894914935, 937478623, 634898298, 1469339112, 202866715, 549429123,
    529042164, 886216651, 1075057083, 534356675, 2139062070, 1503786891,
    1443812792, 850153532, 1732057358, 1195122676, 1129975793, 1309103575,
    127565772, 314323066, 1796919441, 1487965978, 769884140, 1817558896,
    336824757, 875001157, 1045541126, 1230207329, 950444882, 996325963,
    1364531226, 1845359817, 1933804586, 1999429524, 1167215282, 2136671301,
    401374999, 1696257446, 875404305, 1476432083, 83130473, 866982727,
    832735326, 1526943265, 1717136260, 417309036, 574582293, 699628405,
    1726412611, 702148066, 1013951472, 1375848404, 42630396, 1783835612,
    1045923653, 379455154, 511353121, 2091464779, 1609662483, 1461798004,
    940307094, 826710062, 1159674173, 726628032, 678655938, 179405807,
    715815686, 1080030938, 1875663253, 1591219991, 408979373, 1958793727,
    310719070, 1241714699, 1338253344, 2027855330, 1659023735, 1912835638,
    580000088, 1237952699, 467500056, 1593951560, 466317455, 510130452,
    1230303524, 1512241108, 889585606, 1741656646, 1456222239, 351764442,
    1055971002, 249045685, 1178474504, 68161527, 975673718, 1857130442,
    247567335, 1691489404, 789677732, 2123230588, 1135225747, 1198657105,
    1934540667, 1445944817, 292888156, 1125310364, 1326316500, 1951911892,
    890662354, 1906316588, 1042380943, 1358162410, 1352784500, 1508698398,
    1868292862, 435604376, 873455859, 610394821, 29777374, 182194450,
    962159263, 1085748376, 431240136, 2140633767, 1153909904, 1406913854,
    1850280561, 1401477239, 950919610, 492474646, 1377224179, 2086145357,
    1691131751, 1164281199, 1384606526, 1984019908, 142107915, 563439378,
    1788448152, 1032770269, 322272318, 683345447, 243449031, 1675056818,
    44560197, 2111741893, 2110661195, 918016056, 574653066, 2140438569,
    1100210507, 1536812329, 1078703298, 1531450643, 1529962448, 85129554,
    790880849, 1232759362, 1486606793, 1741800459, 1725234008, 716347324,
    1680462168, 1268882111, 1880628523, 917585046, 1105418371, 2022736438,
    1481024425, 746382875, 908023059, 1803296743, 1429728322, 1151472090,
    1330869914, 1474288520, 1115730336, 1294047461, 244820928, 1690383402,
    1287002382, 1345031435, 1079712084, 218222032, 728998430, 462190884,
    303351586, 1519879279, 1694950246, 1789958379, 1114196090, 1272700606,
    358822056, 647174610, 394099070, 91966931, 1564759657, 1499517441,
    2114703370, 898300434, 98416669, 875242781, 554113529, 1528144991,
    2026714872, 1884983443, 854949863, 994961560, 1031547256, 1099770792,
    537861314, 171065991, 297318579, 1617573398, 389288023, 1026317010,
    2079764283, 692639610, 398712641, 1627230881, 335114341, 1512908732,
    752447840, 693936397, 12599694, 1146546910, 785903329, 1577359351,
    498580703, 753123051, 328176137, 596997372, 1628365832, 882289667,
    2125142364, 1507597056, 619789462, 832608579, 355074968, 1651336719,
    1932379371, 892936283, 1822402710, 82214303, 363026033, 64207085,
    1108531313, 295306668, 756846695,
]

assert len(RAND_VALS) == 255


def build_permutation(rand_vals, n=256):
    """Reproduce the target's Fisher-Yates-style shuffle."""
    a = list(range(n))

    for i in range(n - 1):
        r = rand_vals[i]
        m = n - i
        d = (0x7FFFFFFF // m) + 1
        j = i + (r // d)

        if not i <= j < n:
            raise ValueError(
                f"Invalid shuffle index: i={i}, j={j}"
            )

        a[i], a[j] = a[j], a[i]

    return a


P = build_permutation(RAND_VALS)

is_identity = all(P[x] == x for x in range(256))
print(
    f"[info] permutation P: "
    f"{'IDENTITY' if is_identity else 'non-trivial'}"
)

# ---------------------------------------------------------------------------
# 4. Decompose P into cycles
# ---------------------------------------------------------------------------

seen = [False] * 256
cycle_id = [0] * 256
cycle_pos = [0] * 256
cycles = []

for start in range(256):
    if seen[start]:
        continue

    cyc = []
    x = start

    while not seen[x]:
        seen[x] = True
        cyc.append(x)
        x = P[x]

    cid = len(cycles)
    cycles.append(cyc)

    for pos, value in enumerate(cyc):
        cycle_id[value] = cid
        cycle_pos[value] = pos


def apply_pow(x, k):
    """Return P^k(x) using the cycle containing x."""
    cyc = cycles[cycle_id[x]]
    L = len(cyc)

    return cyc[(cycle_pos[x] + k) % L]


# ---------------------------------------------------------------------------
# 5. Recover the password
# ---------------------------------------------------------------------------

password_bytes = []

for i in range(N):
    target = toequal[i]

    cid = cycle_id[target]
    cyc = cycles[cid]
    L = len(cyc)

    pos = cycle_pos[target]

    # Calculate 9^i mod L without constructing the huge exponent.
    k = pow(9, i, L)

    # Move backwards through the cycle to recover the original byte.
    original_byte = cyc[(pos - k) % L]

    password_bytes.append(original_byte)


password = bytes(password_bytes)


# ---------------------------------------------------------------------------
# 6. Validate every password byte
# ---------------------------------------------------------------------------

validation_ok = True

for i, original_byte in enumerate(password):
    k = pow(9, i, len(cycles[cycle_id[original_byte]]))

    result = apply_pow(original_byte, k)

    if result != toequal[i]:
        validation_ok = False
        print(f"[validate] FAIL at index {i}")

# ---------------------------------------------------------------------------
# 7. Recover all output bytes using XOR
# ---------------------------------------------------------------------------

flag_output = bytes(
    (toxor[i] ^ password[i]) & 0xFF
    for i in range(N)
)


# ---------------------------------------------------------------------------
# 8. Display all bytes without discarding non-printable values
# ---------------------------------------------------------------------------

def show_all_bytes(label, value):
    print(f"\n{label} ({len(value)} bytes)")
    print("  repr       :", repr(value))
    print(
        "  ASCII-safe :",
        value.decode("ascii", errors="backslashreplace")
    )
    print("  Latin-1    :", value.decode("latin-1"))
    print("  hex        :", value.hex(" "))


print("\n=== RESULTS ===")
print(
    f"Validation (all {N} password bytes): "
    f"{'PASS' if validation_ok else 'FAIL'}"
)

show_all_bytes("Password", password)
show_all_bytes("Output", flag_output)

if not validation_ok:
    sys.exit(1)

if len(flag_output) >= 2 and any(
    b < 32 or b >= 127 for b in flag_output[-2:]
):
    print("\n[!] The final two bytes are not printable ASCII.")
    print("[!] They are preserved above. No replacement was guessed.")
```

## Flag / kết quả hiện tại

Output candidate thu được từ dữ liệu hiện có:

```text
BKISC{1m_gl4d_u_g0t_0ut_of_th47_m4z3!!\xf4\xc5
```

Hai byte cuối vẫn là `F4 C5`, chưa xác định được nguyên nhân và chưa đủ cơ sở để khẳng định flag hoàn chỉnh.

<!-- TODO-WRITEUP -->

## Checklist ảnh Ghidra cần bổ sung

Lưu ảnh trong `assets/writeups/slow-flag/` với đúng tên file bên dưới.

| Tên ảnh | Nội dung cần chụp |
|---|---|
| `01-main-control-flow.png` | Decompiler `main()`: `local_f8 = 1`, hai vòng lặp, `transform()`, so sánh `toequal`, `local_f8 *= 3`. |
| `02-transform-setup.png` | `transform()`: khởi tạo bảng 256 phần tử, `srand(0xdeadface)`, `shuffle()`. |
| `03-transform-lookup.png` | Vòng lặp tra `table[value]` và lệnh return. |
| `04-shuffle-loop.png` | `shuffle()`: `rand()`, tính `d`, `j`, thao tác swap. |
| `05-prng-references.png` | Symbol Tree và cross-reference của `rand()`/`srand()`. |
| `06-toequal-array.png` | Listing tại VA `0x4020`, mảng `toequal`. |
| `07-toxor-array.png` | Listing tại VA `0x40c0`, mảng `toxor`. |
| `08-elf-data-mapping.png` | Memory Map hoặc section `.data`, mapping VA và file offset. |
| `09-solver-full-output.png` | Terminal hiển thị toàn bộ 40 byte, hex và kết quả validation. |

### Tài liệu tham khảo

- Ghidra: https://ghidra-sre.org/
- ELF và `readelf`: https://man7.org/linux/man-pages/man1/readelf.1.html
- GNU Binutils `objdump`: https://sourceware.org/binutils/docs/binutils/objdump.html
- Python `struct`: https://docs.python.org/3/library/struct.html
- Python `pow()`: https://docs.python.org/3/library/functions.html#pow
- Python `bytes`: https://docs.python.org/3/library/stdtypes.html#bytes
