---
techniques: binomial-expansion, gcd-factor-recovery, rsa-decryption, book-cipher
summary: Lấy p, q từ (2p±3q)^e mod N bằng khai triển nhị thức và gcd, giải RSA, rồi giải book cipher (cột, dòng) trên docstring của đề.
---

## Đề bài

Đề cho source sinh dữ liệu với hai số nguyên tố 1111 bit `p`, `q`:

```python
p = getPrime(1111)
q = getPrime(1111)
N = p * q
e = 65537

m = bytes_to_long(SECRET)
c = pow(m, e, N)
h1 = pow(2 * p + 3 * q, e, N)
h2 = pow(2 * p - 3 * q, e, N)
```

`output.txt` công khai `N, e, c, h1, h2`. Đầu file source có một docstring mô tả RSA (10 dòng), và dòng cuối của nó nhắc `Never leak auxiliary powers (a*p + b*q)^e mod N`. Cần khôi phục `SECRET`.

## Kỹ thuật sử dụng

- **binomial-expansion**: khai triển `(2p ± 3q)^e` rồi cộng hoặc trừ `h1`, `h2`. Vì `e` lẻ nên một nửa số hạng triệt tiêu, các số hạng chứa cả `p` lẫn `q` đều bằng 0 mod N, chỉ còn số hạng "thuần p" hoặc "thuần q".
- **gcd-factor-recovery**: một số là bội của `p` nhưng không phải bội của `q` thì `gcd(số đó, N) = p`. Dùng cho cả `q`.
- **rsa-decryption**: có `p`, `q` thì tính `phi`, `d = e⁻¹ mod phi`, rồi `m = c^d mod N`.
- **book-cipher**: bản giải mã ra chuỗi cặp `(x, y)` là chỉ số vào chính docstring của đề, với `x` là cột và `y` là dòng.

## Cách giải

### Bước 1. Nhận ra h1, h2 làm lộ p và q

Mọi phép tính đều làm modulo `N = p·q`. Số hạng nào chứa cả `p` lẫn `q` thì chia hết cho `N`, nên bằng 0 mod N.

Xem với `e = 3`, khai triển như học cấp 2:

```
h1 = (2p + 3q)³ = 8p³ + 36p²q + 54pq² + 27q³
h2 = (2p − 3q)³ = 8p³ − 36p²q + 54pq² − 27q³
```

Hai dòng chỉ khác dấu ở các số hạng có `q` mũ lẻ. Cộng và trừ:

```
h1 + h2 = 16p³ + 108pq²   ≡ 16p³   (mod N)   vì 108pq² = 108q · N
h1 − h2 = 72p²q + 54q³    ≡ 54q³   (mod N)   vì 72p²q  = 72p · N
```

`16p³` là bội của `p` nhưng không phải bội của `q`, nên `gcd(h1 + h2, N) = p`. Tương tự `gcd(h1 − h2, N) = q`.

Với `e = 65537` ý tưởng y hệt, chỉ có nhiều số hạng hơn. Mọi số hạng ở giữa đều chứa cả `p` lẫn `q` nên biến mất. Chỉ còn hai số hạng đầu cuối, và vì `e` lẻ nên:

```
h1 + h2 ≡ 2 · (2p)^e   (mod N)    →  gcd(h1 + h2, N) = p
h1 − h2 ≡ 2 · (3q)^e   (mod N)    →  gcd(h1 − h2, N) = q
```

Kiểm tra bằng số nhỏ: `p = 5`, `q = 7`, `N = 35`, `e = 3` cho `h1 = 6`, `h2 = 34`. Khi đó `h1 + h2 = 40 ≡ 5` và `gcd(5, 35) = 5 = p`, còn `h1 − h2 = −28 ≡ 7` và `gcd(7, 35) = 7 = q`.

### Bước 2. Lấy p, q bằng gcd

```python
import re
from math import gcd

vals = dict(re.findall(r"(\w+) = (\d+)", open("output.txt").read()))
N, e, c, h1, h2 = (int(vals[k]) for k in ("N", "e", "c", "h1", "h2"))

p = gcd((h1 + h2) % N, N)
q = gcd((h1 - h2) % N, N)
assert p * q == N          # kiểm tra chéo: đúng thì p, q chắc chắn đúng
```

### Bước 3. Giải mã RSA

```python
from Crypto.Util.number import long_to_bytes

phi = (p - 1) * (q - 1)
d = pow(e, -1, phi)        # nghịch đảo của e modulo phi
M = pow(c, d, N)           # dùng d
data = long_to_bytes(M)
print(data)
```

> **Lỗi đã mắc:** lần đầu mình viết `M = pow(c, phi, N)` và nhận về `1`. Theo định lý Euler, `m^phi ≡ 1 (mod N)`, nên `c^phi = (m^e)^phi = (m^phi)^e = 1`, kết quả luôn là 1 và không còn chứa `m`. Phải dùng `d` với `e·d ≡ 1 (mod phi)` thì `c^d = m`.

> **Lưu ý nhỏ:** đừng đặt tên biến là `sum` vì trùng hàm có sẵn của Python. Nếu `long_to_bytes` báo lỗi thì cài `pip install pycryptodome`.

### Bước 4. Kết quả là book cipher

`data` chưa phải flag mà là chuỗi các cặp:

```
b'(36,9) (3,1) (45,1) (52,0) (19,1) (59,4) ... (43,3) (45,3)'
```

Có 39 cặp. Số lớn nhất ở vị trí đầu là 64 và ở vị trí sau là 9. Docstring của đề có đúng 10 dòng (đánh số 0 đến 9) và dòng dài nhất khoảng 70 ký tự. Vậy mỗi cặp là **(cột, dòng)** trong docstring.

> **Lỗi đã mắc:** ban đầu mình đoán `x` là chỉ số từ và `y` là chỉ số chữ cái trong từ, rồi thử nhiều cách tách từ nhưng không ra `BKISC{`. Cách làm đúng là thử nhiều cách đọc và lọc theo tiền tố `BKISC{`. Tiền tố cố định của flag là bộ kiểm tra rất mạnh. Kết quả chỉ khớp khi tách theo **dòng** và hoán đổi vai trò hai số.

```python
text = """RSA (Rivest-Shamir-Adleman) Public-Key Cryptosystem Specification
1. Key Generation: Choose two distinct 1024-BIT primes p and q.
2. Modulus & Totient: Compute N = p * q and phi_N = (p - 1)(q - 1).
3. Public Exponent: Select e in {3, 17, 65537} with gcd(e, phi_N) = 1.
4. Bijective Trapdoor: Solve d = e^-1 mod phi_N over Z_N = {0..N-1}.
5. Fast CRT Decryption: Using Fermat's Little Theorem, precompute
   d_p = d mod (p - 1), d_q = d mod (q - 1), and q_inv = q^-1 mod p.
   For any ciphertext C, recover plaintext M = C^d mod N quickly!
6. Factorization Note: Never leak auxiliary powers (a*p + b*q)^e mod N,
   as algebraic relations over 2048-BIT or 4096-BIT moduli break RSA."""

lines = text.splitlines()          # lines[0] .. lines[9]

flag = ""
for col, row in re.findall(r"\((\d+),(\d+)\)", data.decode()):
    flag += lines[int(row)][int(col)]     # dòng thứ row, ký tự thứ col
print(flag)
```

> **Lưu ý:** phải giữ nguyên khoảng trắng đầu dòng (dòng 5, 6, 8 thụt vào 3 khoảng trắng) vì chỉ số cột đã tính cả chúng. Chỉ số bắt đầu từ 0.

## Flag

`BKISC{h1dd3n_fl4g_f0und_1n_th3_p4ss4g3}`
