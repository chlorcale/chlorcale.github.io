---
title: Carry Me
category: crypto
techniques: popcount-carry-identity, run-length-leak, attempt-count-leak, known-bit-padding, adaptive-queries, retry-on-bad-budget
summary: Oracle popcount(M + secret) thực chất tiết lộ số lần nhớ khi cộng. Chọn M phù hợp để mỗi truy vấn đọc được độ dài một dãy bit của secret, đồng thời khai thác số lượt được cấp để suy ra các bit biên.
---

## Đề bài

Server tạo một `secret` ngẫu nhiên có độ dài đúng 256 bit, với bit cao nhất bằng 1. Server đồng thời chọn ngẫu nhiên `B` trong khoảng `[32, 63]`.

Mỗi lượt, người chơi nhập một số nguyên `M`. Input hợp lệ phải thỏa mãn:

- `M` có ít nhất `B` bit 1 và ít nhất `B` bit 0 trong biểu diễn 256 bit, tương đương:

  ```python
  B <= M.bit_count() <= 256 - B
  ```

- `M` không được dài hơn 256 bit.

Server trả về:

```python
(M + secret).bit_count()
```

Số lượt được cấp được tính bằng:

```python
attempts = (256 + B - 50) - (secret + (2**B - 1)).bit_count()
```

Khi hết lượt, hoặc khi gửi `-1`, người chơi phải nhập dự đoán cho `secret`. Chỉ khi dự đoán chính xác mới nhận được flag.

Khó khăn của bài là mỗi truy vấn chỉ trả về một số đếm bit 1, trong khi secret có 256 bit nhưng số lượt hỏi chỉ khoảng hơn một trăm. Ngoài ra, điều kiện giới hạn `M.bit_count()` ngăn việc dùng các mask thưa như `M = 2**j`.

## Kỹ thuật sử dụng

- **`popcount-carry-identity`**: Dùng đẳng thức `popcount(a + b) = popcount(a) + popcount(b) - số_lần_nhớ`. Oracle `popcount(M + secret)` vì vậy có thể được xem như một bộ đếm carry.
- **`run-length-leak`**: Thiết kế `M` để carry hoặc borrow chạy qua một dãy bit liên tiếp. Một truy vấn có thể tiết lộ độ dài của cả dãy bit 0 hoặc bit 1.
- **`attempt-count-leak`**: Khai thác chính số lượt `attempts` được in ra để suy ra `popcount(secret + 2**B - 1)`, từ đó liên hệ với số bit 0 ở cuối secret.
- **`known-bit-padding`**: Khi mask tự nhiên vi phạm giới hạn popcount ở hai vùng biên, thêm hoặc bớt các bit tại vị trí đã biết chắc để mask hợp lệ; sau đó hiệu chỉnh kết quả theo số bit đệm.
- **`adaptive-queries`**: Chọn truy vấn đọc dãy bit 0 hay dãy bit 1 tùy loại bit còn nhiều hơn trong phần chưa biết, nhằm thu được nhiều thông tin hơn mỗi lượt.
- **`retry-on-bad-budget`**: Số lượt phụ thuộc vào `B` và secret. Nếu ngân sách dự kiến không đủ, bỏ phiên hiện tại và kết nối lại để lấy instance mới.

## Cách giải

### Ký hiệu

Gọi:

- `S`: secret 256 bit cần khôi phục.
- `c = popcount(S)`: tổng số bit 1 của secret.
- `tz`: số bit 0 liên tiếp ở cuối secret. Các bit từ vị trí `0` đến `tz - 1` bằng 0, bit `tz` bằng 1.
- `z_j`: độ dài dãy bit 0 liên tiếp bắt đầu tại bit `j`.
- `r_j`: độ dài dãy bit 1 liên tiếp bắt đầu tại bit `j`.

Bit được đánh số từ phải sang trái; bit 0 là bit thấp nhất.

### Bước 1. Nhận ra oracle là bộ đếm số lần nhớ

Khi cộng hai số nhị phân, mỗi lần carry làm tổng số bit 1 giảm đi một: hai bit 1 ở cùng hàng được thay bằng một bit 1 ở hàng cao hơn.

Vì vậy:

```text
popcount(a + b) = popcount(a) + popcount(b) - số lần carry
```

Đây là dạng cơ số 2 của định lý Kummer. Trong challenge, `M` do ta chọn nên `popcount(M)` đã biết; `c = popcount(S)` là một giá trị cố định trong suốt phiên. Do đó, kết quả `popcount(M + S)` cho biết thông tin về số lần carry khi cộng `M` với `S`.

Mục tiêu là chọn `M` sao cho các carry/borrow phản ánh độ dài những dãy bit liên tiếp của `S`.

### Bước 2. Dùng `M = 2^256 - 2^j` để đọc dãy bit 0

Xét mask:

```python
M = (1 << 256) - (1 << j)
```

Trong 256 bit, `M` có các bit từ `j` đến `255` bằng 1, các bit thấp hơn bằng 0. Vì vậy:

```text
popcount(M) = 256 - j
```

Cộng `M` với `S` có thể viết lại thành:

```text
M + S = 2^256 + (S - 2^j)
```

Phép trừ `S - 2^j` phải mượn qua dãy bit 0 bắt đầu từ vị trí `j` cho đến bit 1 đầu tiên. Nếu dãy đó có độ dài `z_j` thì:

- `z_j` bit 0 được đổi thành bit 1: số bit 1 tăng `z_j`.
- Bit 1 đầu tiên sau dãy bị đổi thành 0: số bit 1 giảm 1.
- Bit `2^256` xuất hiện ở đầu kết quả: số bit 1 tăng 1.

Hai thay đổi `-1` và `+1` triệt tiêu nhau, nên:

```text
popcount(M + S) = c + z_j
```

Ví dụ thu nhỏ xuống 8 bit, lấy `S = 1011 0000`, `c = 3`, `j = 2`. Các bit 2 và 3 bằng 0 nên `z_2 = 2`:

```text
S           =   1011 0000
M = 2^8-2^2 =   1111 1100
S + M       = 1 1010 1100
```

Kết quả có 5 bit 1, đúng bằng `c + z_2 = 3 + 2`.

Mask này hợp lệ khi:

```text
B <= 256 - j <= 256 - B
```

hay tương đương `B <= j <= 256 - B`.

### Bước 3. Tìm `c` và các bit đầu tiên đã biết

Đặt:

```text
g_j = popcount((2^256 - 2^j) + S) = c + z_j
```

Hỏi lần lượt với `j = B, B + 1, ...`.

- Nếu bit `S[j]` bằng 0, dãy zero bắt đầu tại `j` dài hơn dãy bắt đầu tại `j + 1` đúng một bit. Vì vậy `g_(j+1) = g_j - 1`.
- Khi gặp bit `S[j] = 1`, ta có `z_j = 0`, do đó `g_j = c`. Ở bước tiếp theo giá trị không còn giảm: `g_(j+1) >= c`.

Vì vậy, vị trí đầu tiên mà giá trị không giảm cho biết bit 1 đầu tiên trong vùng đang quét; giá trị trước đó chính là `c`. Các giá trị tiếp theo còn cho biết độ dài dãy bit 0 ngay sau bit 1 này.

### Bước 4. Khai thác số lượt `attempts` để suy ra `tz`

Từ công thức của đề bài, tính được:

```text
p0 = 256 + B - 50 - attempts
   = popcount(S + 2^B - 1)
```

Viết lại:

```text
S + 2^B - 1 = (S - 1) + 2^B
```

Phép `S - 1` biến `tz` bit 0 thấp nhất thành bit 1, đồng thời biến bit 1 đầu tiên phía trên chúng thành 0. Do đó:

```text
popcount(S - 1) = c + tz - 1
```

Tiếp theo, cộng `2^B` làm carry chạy qua `r_B` bit 1 liên tiếp bắt đầu tại vị trí `B`. Số bit 1 thay đổi `-r_B + 1`. Kết hợp hai phép biến đổi:

```text
p0 = c + tz - r_B
```

Suy ra:

```text
tz = p0 - c + r_B
```

Công thức này giả sử `tz < B`. Với `B >= 32`, trường hợp 32 bit thấp nhất của secret đều bằng 0 có xác suất rất nhỏ, xấp xỉ `2^-32`. Khi tìm được `tz`, ta biết các bit từ `0` đến `tz`.

### Bước 5. Dùng `M = 2^j - 1` để đọc dãy bit 1

Xét mask:

```python
M = (1 << j) - 1
```

Mask này có `j` bit 1 thấp nhất. Ta có:

```text
S + M = S + 2^j - 1 = (S - 1) + 2^j
```

Tương tự bước trước, sau phép `S - 1`, phép cộng `2^j` làm carry chạy qua dãy bit 1 bắt đầu tại `j`. Nếu dãy đó có độ dài `r_j`, ta thu được:

```text
popcount(M + S) = c + tz - r_j
```

Do đó:

```text
r_j = c + tz - popcount(M + S)
```

Ví dụ với `S = 1110 0110`, `c = 5`, `tz = 1`, `j = 5`. Các bit 5, 6, 7 đều bằng 1 nên `r_5 = 3`:

```text
S         =   1110 0110
M = 2^5-1 =   0001 1111
S + M     = 1 0000 0101
```

Tổng có 3 bit 1, đúng bằng `c + tz - r_5 = 5 + 1 - 3`.

Mask này hợp lệ khi `B <= j <= 256 - B`, vì `popcount(M) = j`.

### Bước 6. Quét các bit theo hướng thích nghi

Bắt đầu từ bit chưa biết thấp nhất. Mỗi truy vấn có thể cho biết độ dài một dãy bit 0 (dùng công thức ở Bước 2) hoặc một dãy bit 1 (dùng công thức ở Bước 5), đồng thời xác định bit đối diện ngay sau dãy đó.

Vì đã biết tổng số bit 1 `c`, ta cũng biết số bit 1 còn lại trong các vị trí chưa được khôi phục. Do đó:

- Nếu phần chưa biết còn nhiều bit 0 hơn, ưu tiên truy vấn dãy bit 0.
- Nếu còn nhiều bit 1 hơn và đã biết `tz`, ưu tiên truy vấn dãy bit 1.
- Nếu số bit 1 còn lại bằng 0, điền tất cả vị trí chưa biết bằng 0.
- Nếu số bit 1 còn lại bằng đúng số vị trí chưa biết, điền tất cả chúng bằng 1.

Chọn loại dãy có khả năng dài hơn giúp mỗi truy vấn thường tiết lộ nhiều bit hơn.

### Bước 7. Bù bit đã biết để xử lý vùng biên

Hai công thức mask tự nhiên chỉ hợp lệ khi `B <= j <= 256 - B`. Với `j < B` hoặc `j > 256 - B`, số bit 1 trong mask có thể vượt giới hạn và server trả về `Cheater`.

Ta khắc phục bằng cách thêm hoặc bớt bit tại những vị trí mà giá trị của `S` đã biết chắc và nằm ngoài vùng carry/borrow cần đo. Mỗi bit đệm làm thay đổi `popcount(M + S)` đúng 1, nên có thể hiệu chỉnh lại kết quả.

Các trường hợp được xử lý trong solver:

- **Dãy bit 0, `j < B`**: mask cơ sở có quá nhiều bit 1. Bỏ bớt `need` bit 1 tại các vị trí cao đã biết `S` có bit 1; cộng bù `need` vào kết quả.
- **Dãy bit 0, `j > 256 - B`**: mask cơ sở có quá ít bit 1. Thêm `need` bit 1 tại các vị trí thấp hơn `j` đã biết `S` có bit 0; trừ bù `need` khỏi kết quả.
- **Dãy bit 1, `j < B`**: mask cơ sở có quá ít bit 1. Thêm `B - 1` bit 1 tại các vị trí cao đã biết `S` có bit 0, rồi hiệu chỉnh kết quả theo số bit đệm.
- **Dãy bit 1, `j > 256 - B`**: thay `M = 2^j - 1` bằng `M = 2^j - 2^a`, trong đó `a` là vị trí đã biết có `S[a] = 1`. Khi đó công thức dùng là `r_j = c - popcount(M + S)` và không cần `tz`.

Đây cũng là lý do solver ưu tiên khôi phục vùng bit từ `B` trở lên trước. Khi đã biết đủ bit ở vùng này, chúng có thể được dùng làm bit đệm để xử lý các vị trí thấp hơn `B`.

### Bước 8. Ước lượng ngân sách và kết nối lại khi cần

Số lượt cần thiết xấp xỉ số bit thuộc loại ít hơn trong secret, tức khoảng `min(số_bit_0, số_bit_1)`. Trong khi đó, ngân sách `attempts` phụ thuộc vào `B` và chính secret, nên một số instance không có đủ lượt để hoàn tất.

Ngay khi đọc banner, có thể ước lượng số bit 0:

```python
z = attempts - B + 50
```

Nếu:

```python
attempts < min(z, 256 - z)
```

thì bỏ phiên đó và kết nối lại. Mỗi kết nối mới tạo `B` và `secret` mới, vì vậy cần chạy toàn bộ quá trình khôi phục trên instance mới.

Theo kết quả mô phỏng được ghi nhận trong lời giải: khoảng 62% kết nối vượt qua bộ lọc; trong 371 kết nối qua lọc có 370 lần khôi phục đúng. Nếu không lọc trước, tỷ lệ giải được khoảng 72%. Số lượt dùng trung bình khoảng 117, trong khi ngân sách trung bình khoảng 133.

### Bước 9. Cài đặt solver và exploit

Tách lời giải thành hai phần:

- `solver.py`: chứa thuật toán khôi phục `S`, chỉ cần một hàm `oracle(M)` trả về `popcount(M + S)`.
- `exploit.py`: quản lý kết nối tới server, đọc `B` và `attempts`, áp dụng bộ lọc ngân sách, chuyển truy vấn của solver tới server và gửi secret đã khôi phục.

#### `solver.py`

```python
class Fail(Exception):
    pass


def solve(oracle, B, attempts):
    """oracle(M) -> popcount(M + S).

    Trả về (S, số lượt dùng, log truy vấn, c).
    """
    p0 = 256 + B - 50 - attempts  # popcount(S + 2**B - 1)
    known = [None] * 256
    known[255] = 1
    log = []

    def Q(M):
        pc = M.bit_count()
        assert B <= pc <= 256 - B and 0 <= M < (1 << 256), "bad M"
        result = oracle(M)
        log.append((M, result))
        return result

    # Tìm c = popcount(S), với g_j = c + z_j.
    j = B
    prev = Q((1 << 256) - (1 << j))

    while True:
        cur = Q((1 << 256) - (1 << (j + 1)))
        if cur >= prev:
            break

        known[j] = 0
        j += 1
        prev = cur

    c = prev
    known[j] = 1
    z = cur - c

    for i in range(j + 1, j + 1 + z):
        known[i] = 0

    if j + 1 + z < 256:
        known[j + 1 + z] = 1

    tz = None

    def try_tz():
        nonlocal tz

        if tz is not None:
            return

        r = 0
        i = B
        while i < 256 and known[i] == 1:
            r += 1
            i += 1

        if i < 256 and known[i] is None:
            return

        tz = p0 - c + r

        for k in range(tz):
            known[k] = 0
        known[tz] = 1

    def run_G(j):
        """Đọc độ dài dãy bit 0 bắt đầu tại j."""
        pc0 = 256 - j

        if B <= pc0 <= 256 - B:
            return Q((1 << 256) - (1 << j)) - c

        if pc0 > 256 - B:  # j < B: bớt bit 1 tại vị trí đã biết
            need = pc0 - (256 - B)
            q1 = min(p for p in range(B, 256) if known[p] == 1)
            cand = [p for p in range(255, q1, -1) if known[p] == 1][:need]

            if len(cand) < need:
                raise Fail("pads")

            M = (1 << 256) - (1 << j) - sum(1 << p for p in cand)
            return Q(M) - c + need

        # j > 256-B: thêm bit 1 vào vị trí đã biết là 0
        need = B - pc0
        cand = [p for p in range(j - 1, -1, -1) if known[p] == 0][:need]

        if len(cand) < need:
            raise Fail("pads")

        M = (1 << 256) - (1 << j) + sum(1 << p for p in cand)
        return Q(M) - c - need

    def run_H(j):
        """Đọc độ dài dãy bit 1 bắt đầu tại j."""
        if B <= j <= 256 - B:
            return c + tz - Q((1 << j) - 1)

        if j > 256 - B:
            lo = max(0, j - 256 + B)
            hi = j - B
            a = next(
                (a for a in range(hi, lo - 1, -1) if known[a] == 1),
                None,
            )

            if a is None:
                raise Fail("no known one")

            return c - Q((1 << j) - (1 << a))

        # j < B: thêm B-1 bit 1 tại các vị trí đã biết là 0
        q0 = min(p for p in range(B, 256) if known[p] == 0)
        need = B - 1
        cand = [p for p in range(255, q0, -1) if known[p] == 0][:need]

        if len(cand) < need:
            raise Fail("pads")

        M = (1 << j) + sum(1 << p for p in cand)
        return c + need + 1 - Q(M)

    try_tz()

    while True:
        unk = [i for i in range(256) if known[i] is None]
        if not unk:
            break

        R1 = c - sum(1 for b in known if b == 1)
        U = len(unk)

        if R1 == 0:
            for i in unk:
                known[i] = 0
            break

        if R1 == U:
            for i in unk:
                known[i] = 1
            break

        hi_unk = [i for i in unk if i >= B]
        j = hi_unk[0] if hi_unk else unk[0]

        R0 = U - R1
        useH = (R1 > R0) and (tz is not None)

        if useH:
            r = run_H(j)
            for i in range(j, j + r):
                known[i] = 1
            if j + r < 256:
                known[j + r] = 0
        else:
            z = run_G(j)
            for i in range(j, j + z):
                known[i] = 0
            if j + z < 256:
                known[j + z] = 1

        try_tz()

    S = sum(1 << i for i in range(256) if known[i] == 1)
    return S, len(log), log, c
```

#### `exploit.py`

Cài pwntools:

```bash
python3 -m pip install pwntools
```

Chương trình dưới đây hỗ trợ chạy với file `server.py` cục bộ hoặc kết nối tới server remote:

```python
from pwn import *
import re
import sys

sys.path.insert(0, ".")
from solver import solve, Fail

context.log_level = "error"


def attempt(make_io, prefilter=True):
    io = make_io()

    try:
        banner = io.recvuntil(b"attempts.").decode()
        B = int(re.search(r"at least (\d+) bit 1s", banner).group(1))
        attempts = int(re.search(r"You have: (\d+) attempts", banner).group(1))

        if prefilter:
            z = attempts - B + 50  # Ước lượng số bit 0 của secret
            if attempts < min(z, 256 - z):
                return None

        used = [0]

        def oracle(M):
            if used[0] >= attempts:
                raise Fail("het luot")

            io.sendlineafter(b"Input M: ", str(M).encode())
            used[0] += 1
            return int(io.recvline().decode().strip())

        S, n, log, c = solve(oracle, B, attempts)

        if used[0] < attempts:
            # Còn lượt thì gửi -1 để chuyển sang bước đoán secret.
            io.sendlineafter(b"Input M: ", b"-1")

        io.sendlineafter(b"Now guess the secret!: ", str(S).encode())
        return io.recvall(timeout=5).decode()

    except (Fail, EOFError, AssertionError):
        return None
    finally:
        io.close()


if __name__ == "__main__":
    mode = sys.argv[1]

    if mode == "local":
        make_io = lambda: process(["python3", "server.py"])
    else:
        host, port = sys.argv[2], int(sys.argv[3])
        make_io = lambda: remote(host, port)

    for t in range(1, 200):
        result = attempt(make_io)
        print(
            f"[try {t}]",
            "skip/fail" if result is None else result.strip(),
            flush=True,
        )

        if result and "BKISC{" in result:
            break
```

Cách chạy local (đặt `server.py`, `solver.py` và `exploit.py` trong cùng thư mục):

```bash
python3 exploit.py local
```

Cách chạy remote:

```bash
python3 exploit.py remote HOST PORT
```

Exploit đọc `B` và `attempts` từ banner, áp dụng bộ lọc ngân sách, rồi lặp kết nối tối đa 199 lần. Khi một phiên đủ ngân sách và khôi phục được secret, chương trình gửi secret ở prompt `Now guess the secret!` và dừng khi output có chứa `BKISC{`.

## Flag

```text
BKISC{H0w_m4ny_t1m35_h4v3_y0u_tr13d?_b00122f50b2c}
```

## Tài liệu tham khảo

- [Kummer's theorem (Wikipedia)](https://en.wikipedia.org/wiki/Kummer%27s_theorem) — dạng tổng chữ số của định lý; với cơ số 2 liên hệ `popcount(a + b)` với số lần carry.
- [Kummer's Theorem (ProofWiki)](https://proofwiki.org/wiki/Kummer%27s_Theorem)
- [Hamming weight / population count (Wikipedia)](https://en.wikipedia.org/wiki/Hamming_weight)
- [Carry (arithmetic) (Wikipedia)](https://en.wikipedia.org/wiki/Carry_(arithmetic))
- Dorel Mihet, [“Legendre's and Kummer's Theorems Again”](https://www.ias.ac.in/article/fulltext/reso/015/12/1111-1121)
- [Python `int.bit_count()` documentation](https://docs.python.org/3/library/stdtypes.html#int.bit_count) — `int.bit_count()` có từ Python 3.10.
- [Python `int.bit_count()` examples](https://note.nkmk.me/en/python-int-bit-count/)
