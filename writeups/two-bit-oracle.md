---
techniques: rsa-malleability, chosen-ciphertext-attack, lsb-parity-oracle, case-analysis-mod-4, binary-search
summary: Oracle chỉ trả về XOR của hai bit thấp nhất. Vì N ≡ 1 (mod 4), nhân ciphertext với 2^e biến nó thành oracle parity, rồi binary search trên m/N để khôi phục toàn bộ plaintext.
---

## Đề bài

Server sinh RSA với hai số nguyên tố 512 bit, ép `N % 4 == 1`, `e = 65537`. Flag được đệm ngẫu nhiên phía trước cho đủ 127 byte rồi mã hoá:

```python
flag = os.urandom(127 - len(flag)) + flag
enc_flag = pow(bytes_to_long(flag), e, N)
```

Server in `enc_flag, N, e`, sau đó cho gửi số nguyên bất kỳ không giới hạn số lần:

```python
dec_user = pow(user, d, N)
LSB0 = dec_user & 1
LSB1 = (dec_user >> 1) & 1
print(f"result: {LSB0 ^ LSB1}")
```

Mỗi lần chỉ nhận về một bit: hai bit thấp nhất của bản giải mã giống nhau (`0`) hay khác nhau (`1`). Cần khôi phục `m` từ `enc_flag`.

## Kỹ thuật sử dụng

- **rsa-malleability**: RSA có tính chất nhân, nên nhân ciphertext với `2^e mod N` thì bản giải mã tương ứng được nhân với 2 mà không cần biết `d`.
- **chosen-ciphertext-attack**: ta tự chọn ciphertext để gửi cho oracle giải mã. RSA không bị phân tích, nhưng oracle làm lộ thông tin về plaintext qua mỗi lần giải mã.
- **case-analysis-mod-4**: kết quả của oracle chỉ phụ thuộc vào `x mod 4`. Xét 4 trường hợp (nhỏ hơn hay lớn hơn `N/2`, chẵn hay lẻ) để chứng minh nó trở thành oracle parity nhờ `N ≡ 1 (mod 4)`.
- **lsb-parity-oracle**: biết parity của `2^k·m mod N` với mọi `k` thì biết từng chữ số nhị phân của phân số `m/N`.
- **binary-search**: mỗi bit thu hẹp khoảng chứa `m` đi một nửa, sau khoảng `bit_length(N)` bit thì còn đúng một số nguyên.

## Cách giải

### Bước 1. Hiểu oracle: kết quả chỉ phụ thuộc `x mod 4`

Oracle lấy hai bit cuối của `x` rồi XOR. Kết quả bằng 1 khi hai bit **khác nhau**:

| `x mod 4` | hai bit cuối | kết quả |
|---|---|---|
| 0 | 00 | 0 |
| 1 | 01 | 1 |
| 2 | 10 | 1 |
| 3 | 11 | 0 |

> **Ngộ nhận đã mắc:** ban đầu mình hiểu `1` là hai bit giống nhau. Đúng ra XOR cho `0` khi giống và `1` khi khác.

### Bước 2. Biến oracle thành oracle parity bằng cách nhân với `2^e`

Muốn hỏi parity của `y` (chẵn hay lẻ), ta gửi ciphertext của `2y`. Khi đó server giải mã ra `2y mod N` và oracle trả về:

```
oracle(2y mod N) = y mod 2        (với N ≡ 1 mod 4)
```

Chứng minh bằng bốn trường hợp, với `0 ≤ y < N`:

| trường hợp | `2y mod N` | `(2y mod N) mod 4` | kết quả | `y mod 2` |
|---|---|---|---|---|
| `2y < N`, `y` chẵn | `2y` | 0 | 0 | 0 |
| `2y < N`, `y` lẻ | `2y` | 2 | 1 | 1 |
| `2y > N`, `y` chẵn | `2y − N` | 3 | 0 | 0 |
| `2y > N`, `y` lẻ | `2y − N` | 1 | 1 | 1 |

Hai dòng cuối dùng `N ≡ 1 (mod 4)`: `y` chẵn thì `2y ≡ 0`, nên `2y − N ≡ −1 ≡ 3`. `y` lẻ thì `2y ≡ 2`, nên `2y − N ≡ 1`. Đây là lý do đề cố tình ép `N % 4 == 1`.

> **Ngộ nhận đã mắc:** nghĩ rằng dịch bit của `c` sang phải thì plaintext cũng bị dịch. Không đúng, RSA không có tính chất đó. Chỉ có tính chất nhân: `Dec(c1 · c2 mod N) = Dec(c1) · Dec(c2) mod N`, nên phải nhân với `2^e mod N`.

### Bước 3. Mỗi truy vấn cho một chữ số nhị phân của `m/N`

Đặt `mul = 2^e mod N` và `C_k = C_0 · mul^k mod N` với `C_0 = enc_flag`. Khi đó `Dec(C_k) = 2^k·m mod N`. Gửi `C_{k+1}` thì oracle trả về parity của `Dec(C_k)`:

```
bit_k = (2^k · m mod N) mod 2
```

Vì `N` lẻ và `2^k·m` chẵn nên `bit_k` chính là chữ số nhị phân thứ `k` sau dấu phẩy của phân số `m/N`:

```
m/N = 0.b1 b2 b3 b4 ...   (nhị phân)
```

> **Lưu ý:** gửi `C_1` chỉ cho parity của `m`, chưa phải chữ số nhị phân đầu tiên. Muốn lấy `b_k` phải gửi `C_{k+1}`.

### Bước 4. Binary search: thu hẹp khoảng chứa `m`

Gọi `prefix` là số nguyên tạo bởi `k` bit đầu `b1..bk`. Khi đó:

```
prefix / 2^k  ≤  m / N  <  (prefix + 1) / 2^k
```

Nhân với `N` ta được khoảng chứa `m`, mỗi bit mới chia đôi khoảng:

```
lo = ceil( prefix · N / 2^k )
hi = ceil( (prefix + 1) · N / 2^k ) − 1
```

Khi `lo == hi` thì `m = lo`. Với `N` khoảng 1023 bit, điều đó xảy ra sau khoảng 1022 truy vấn. Không cần thử hai tổ hợp bit như ý tưởng ban đầu, vì mỗi bit từ oracle đã cho đáp án chính xác.

### Bước 5. Code

Phần tấn công cốt lõi nhận một hàm `oracle` (gửi số lên server, trả về bit `0` hoặc `1`):

```python
def attack(oracle, c0, N, e):
    mul = pow(2, e, N)
    c = c0
    prefix = 0
    for k in range(1, N.bit_length() + 1):
        c = c * mul % N                  # C_k = C_0 * (2^e)^k
        bit = oracle(c * mul % N)        # gửi C_{k+1}, nhận parity của 2^k * m mod N
        prefix = (prefix << 1) | bit
        lo = (prefix * N + (1 << k) - 1) >> k
        hi = (((prefix + 1) * N + (1 << k) - 1) >> k) - 1
        if lo > hi:
            raise RuntimeError(f"oracle trả lời mâu thuẫn ở vòng {k}")
        if lo == hi:
            return lo
    raise RuntimeError("không xác định được duy nhất plaintext")
```

Phần kết nối tới server (không cần pwntools):

```python
import ast, re, socket

HOST, PORT = "your.host", 12345          # điền thông tin kết nối của đề

def recv_until(sock, marker=b"> "):
    data = b""
    while marker not in data:
        chunk = sock.recv(4096)
        if not chunk:
            raise ConnectionError("server đóng kết nối")
        data += chunk
    return data

with socket.create_connection((HOST, PORT), timeout=15) as sock:
    banner = recv_until(sock)
    params = ast.literal_eval(re.search(rb"\{.*\}", banner, re.S).group(0).decode())
    c0, N, e = params["enc_flag"], params["N"], params["e"]

    def oracle(query):
        sock.sendall(str(query).encode() + b"\n")
        reply = recv_until(sock)
        return int(re.search(rb"result:\s*([01])", reply).group(1))

    m = attack(oracle, c0, N, e)

plaintext = m.to_bytes(127, "big")
print(re.search(rb"BKISC\{[^}]*\}", plaintext).group(0).decode())
```

Plaintext là 127 byte: phần đầu là byte ngẫu nhiên, phần cuối là flag nên dùng regex `BKISC\{[^}]*\}` để tách.

## Flag

`BKISC{n07_7h47_much_d1ff3r3n7_fr0m_r54_l5b_0r4cl3_6c72b8155660}`
