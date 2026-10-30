---
techniques: lcg-state-recovery, difference-of-squares, algebraic-elimination, modular-sqrt, sign-ambiguity, modular-inverse, sha256-key-derivation, aes-ecb
summary: Từ 5 leak s² + c, khử c bằng hiệu hai leak, giải phương trình bậc hai tìm a, suy ra b, c và state đầu, lùi LCG về seed rồi dùng seed làm khoá AES.
---

## Đề bài

`p` là số nguyên tố 1024 bit với `p % 4 == 3`. Một LCG `state = a*state + b mod p` sinh 5 state từ `seed` (số nguyên tố 512 bit). Đề không cho `a`, `b`, `c`, chỉ cho:

```python
states = [G.next() for _ in range(5)]
leaks = [(s**2 + c) % p for s in states]
key = sha256(long_to_bytes(seed)).digest()
ciphertext = AES.new(key, AES.MODE_ECB).encrypt(pad(flag, 16))
```

In ra `p`, `leaks` (5 số) và `ciphertext`. Cần khôi phục `seed` để có key AES.

## Kỹ thuật sử dụng

- **difference-of-squares**: trừ hai leak liên tiếp thì `c` biến mất và còn hằng đẳng thức `s² − t² = (s − t)(s + t)`.
- **algebraic-elimination**: các hiệu `s_{i+1} − s_i` chỉ khác nhau một thừa số `a`, nên lập được hai phương trình chỉ chứa `a`. Khử số hạng bậc ba thì còn một phương trình bậc hai.
- **modular-sqrt**: giải phương trình bậc hai và tìm `±` của một hiệu state đều cần căn bậc hai mod `p`. Vì `p % 4 == 3` nên `căn(x) = x^((p+1)/4) mod p`, không cần thư viện.
- **sign-ambiguity**: leak chứa `s²` nên không phân biệt được dãy `(s, b)` và `(−s, −b)`. Hai ứng viên đều khớp leak, chỉ một cái cho `seed` đúng.
- **lcg-state-recovery** và **modular-inverse**: biết `a`, `b` và một state thì lùi được về `seed` bằng `a⁻¹ mod p`.
- **sha256-key-derivation** và **aes-ecb**: seed đúng thì key đúng và giải mã được flag. Dùng luôn làm bước kiểm chứng.

## Cách giải

Ký hiệu: `s0..s4` là `states[0..4]`, `y0..y4` là `leaks[0..4]`, nên `y_i = s_i² + c`. Mọi phép tính đều mod `p`, phép chia hiểu là nhân với nghịch đảo mod `p`.

### Bước 1. Nhận ra `states[0]` chưa phải `seed`

`G.next()` chạy trước khi lưu, nên `s0 = a*seed + b`. Phải lùi thêm một bước để ra `seed`.

### Bước 2. Khử `c` bằng hiệu hai leak liên tiếp

Đặt `D_i = y_i − y_{i−1}` với `i = 1..4`. Các `y` có cùng `c` nên `c` biến mất:

```
D_i = s_i² − s_{i-1}² = (s_i − s_{i-1}) · (s_i + s_{i-1})
```

Gọi `d_i = s_i − s_{i-1}` và `t_i = s_i + s_{i-1}`, tức `D_i = d_i · t_i`. Hai tính chất của LCG:

```
d_{i+1} = a · d_i              (b triệt tiêu khi lấy hiệu hai state liên tiếp)
t_{i+1} = a · t_i + 2b
```

### Bước 3. Lập phương trình chỉ chứa `a`

Từ hai tính chất trên:

```
D_{i+1} = d_{i+1} · t_{i+1} = a·d_i · (a·t_i + 2b) = a²·D_i + 2ab·d_i
```

Đặt `K = 2ab·d_1`. Vì `d_i = d_1 · a^(i−1)` nên:

```
D2 − a²·D1 = K
D3 − a²·D2 = a·K
D4 − a²·D3 = a²·K
```

Thay dòng đầu vào dòng thứ hai, rồi dòng thứ hai vào dòng thứ ba, ta được hai phương trình bậc ba chỉ chứa `a`:

```
(E1)  D1·a³ − D2·a² − D2·a + D3 = 0
(E2)  D2·a³ − D3·a² − D3·a + D4 = 0
```

Lấy `D2·(E1) − D1·(E2)` thì số hạng `a³` mất, còn:

```
(D2² − D1·D3) · (a² + a) = D2·D3 − D1·D4
```

Đặt `M = (D2·D3 − D1·D4) / (D2² − D1·D3)`, ta có phương trình bậc hai:

```
a² + a − M = 0      →      a = ( −1 ± căn(1 + 4M) ) / 2
```

Được tối đa 2 ứng viên cho `a`.

### Bước 4. Từ `a` suy ra `s0`, `b`, `c`

Lấy `D2 − a·D1`, ta rút gọn được `a · d_1² · (a + 1)`, nên:

```
d_1² = (D2 − a·D1) / ( a·(a + 1) )        d_1 = s1 − s0 = ± căn(d_1²)
```

Có `d_1` thì dùng `D1 = d_1 · t_1` với `t_1 = s1 + s0`:

```
t_1 = D1 / d_1
s0 = (t_1 − d_1) / 2        s1 = (t_1 + d_1) / 2
b = s1 − a·s0               c = y0 − s0²
```

Hai dấu của `d_1` cho hai ứng viên: `(s0, b)` và `(−s0, −b)`. Đây chính là sign-ambiguity, và cả hai đều khớp 5 leak.

### Bước 5. Lùi LCG về `seed` và chọn đúng dấu

```
seed = (s0 − b) · a⁻¹ mod p
```

Tổng cộng có tối đa 4 ứng viên `(a, d_1)`. Lọc theo hai điều kiện:

1. Dựng lại 5 state từ `(a, b, s0)` và kiểm tra `s² + c` khớp đủ 5 leak.
2. `seed` phải là số nguyên tố, `bit_length ≤ 512`. Ứng viên sai dấu cho số 1024 bit nên bị loại. Ngoài ra, bước unpad AES hợp lệ cũng là kiểm chứng cuối.

### Bước 6. Script hoàn chỉnh

Điền `p`, `leaks`, `ciphertext` từ output của đề:

```python
from hashlib import sha256
from Crypto.Util.number import long_to_bytes, isPrime
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad

p = ...            # điền p
leaks = [...]      # 5 số leak
ciphertext = b'...'

inv = lambda x: pow(x, -1, p)

def sqrt_mod(x):                              # p % 4 == 3 nên căn bậc hai mod p rất gọn
    r = pow(x, (p + 1) // 4, p)
    return [r, p - r] if r * r % p == x % p else []

y0, y1, y2, y3, y4 = leaks
D1, D2, D3, D4 = (y1 - y0) % p, (y2 - y1) % p, (y3 - y2) % p, (y4 - y3) % p

# a^2 + a = M
M = (D2 * D3 - D1 * D4) * inv(D2 * D2 - D1 * D3) % p
a_list = [(r - 1) * inv(2) % p for r in sqrt_mod(1 + 4 * M)]

for a in a_list:
    d1_sq = (D2 - a * D1) * inv(a * (a + 1)) % p          # (s1 - s0)^2
    for d1 in sqrt_mod(d1_sq):
        t1 = D1 * inv(d1) % p                             # s1 + s0
        s0 = (t1 - d1) * inv(2) % p
        s1 = (t1 + d1) * inv(2) % p
        b = (s1 - a * s0) % p
        c = (y0 - s0 * s0) % p

        s, ok = s0, True                                  # kiểm tra lại đủ 5 leak
        for y in leaks:
            ok &= (s * s + c) % p == y
            s = (a * s + b) % p
        if not ok:
            continue

        seed = (s0 - b) * inv(a) % p                      # lùi 1 bước: s0 = a*seed + b
        if seed.bit_length() > 512 or not isPrime(seed):
            continue                                      # loại ứng viên sai dấu
        key = sha256(long_to_bytes(seed)).digest()
        try:
            print(unpad(AES.new(key, AES.MODE_ECB).decrypt(ciphertext), 16))
        except ValueError:
            pass
```

> **Lưu ý khi dùng thư viện:** `from sympy.ntheory.modular import invert` báo lỗi import. Dùng `pow(x, -1, p)` có sẵn của Python 3.8 trở lên, và vì `p % 4 == 3` nên không cần `sympy.sqrt_mod`. Script trên không cần thư viện ngoài `pycryptodome`.

> **Lỗi đã mắc:** `a`, `b`, `s1` từ lần chạy đầu không dùng được ngay vì chúng thuộc dãy đổi dấu. Dùng `p − s1` mà vẫn giữ `b` cũ thì ra số sai. Khi đổi dấu `s` thì `b` cũng phải đổi thành `p − b`. Script trên tránh lỗi này vì thử cả hai dấu của `d_1` rồi lọc bằng điều kiện `seed` là số nguyên tố.

> **Lưu ý đánh số:** một số lời giải đánh số state từ `s1`, nên `s1` trong đó chính là `states[0]` của đề. Cần chú ý để không lùi thiếu hoặc thừa một bước khi tìm `seed`.

## Flag

`BKISC{crypto_n33ds_just_pap3r_and_p3nc1l}`
