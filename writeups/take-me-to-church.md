---
title: Take Me to Church
category: reverse
techniques: church-numerals, lambda-calculus, xor, modular-arithmetic, source-code-analysis
summary: Rút gọn các Church numeral thành số nguyên, xác định hằng số 36 và modulo 256, rồi đảo phép XOR để khôi phục flag.
---

## Đề bài

Chương trình yêu cầu nhập một chuỗi `inp`, sau đó kiểm tra từng ký tự với hai mảng `key` và `arr`.

Điểm khiến source khó đọc là các số nguyên không được viết trực tiếp. Thay vào đó, chúng được biểu diễn bằng những biểu thức lambda lồng nhau, còn được gọi là **Church numeral**.

Hàm chuyển Church numeral thành số nguyên trong source là:

```python
def hihi(n):
    return n(lambda x: x + 1)(0)
```

Phần kiểm tra quan trọng có dạng:

```python
for i in range(len(arr)):
    val = ((ord(inp[i] ^ key[i % len(key)]) - C) % MOD)

    if val != arr[i]:
        print('Nope, try again.')
        exit()

print('Correct! You got the flag.')
```

Trong đó `C` và `MOD` cũng được viết dưới dạng Church numeral rồi đưa qua `hihi()`.

Mục tiêu là rút gọn các biểu thức này, sau đó tìm chuỗi `inp` sao cho mọi phép kiểm tra đều đúng.

## Kỹ thuật sử dụng

- **church-numerals**: biểu diễn số tự nhiên bằng hàm lambda thay vì viết trực tiếp số nguyên.
- **lambda-calculus**: nhận diện hai phép biến đổi chính là Successor (cộng 1) và Doubling (nhân 2).
- **source-code-analysis**: thay các biểu thức lambda dài bằng những phép toán đơn giản tương đương.
- **xor**: sử dụng tính chất XOR với cùng một khóa hai lần sẽ khôi phục giá trị ban đầu.
- **modular-arithmetic**: đảo phép trừ trong modulo 256 bằng cách cộng lại hằng số đã bị trừ.

## Cách giải

### Bước 1. Hiểu hàm `hihi()`

Hàm trong đề:

```python
def hihi(n):
    return n(lambda x: x + 1)(0)
```

Church numeral là cách biểu diễn một số `n` bằng một hàm nhận hai đối số `f` và `x`. Hàm đó áp dụng `f` lên `x` đúng `n` lần.

Ví dụ, Church numeral biểu diễn số 3 tương đương với:

```python
three = lambda f: lambda x: f(f(f(x)))
```

Khi gọi:

```python
hihi(three)
```

thì `hihi()` thay `f` bằng hàm `lambda x: x + 1` và bắt đầu từ `0`:

```text
0 -> 1 -> 2 -> 3
```

Vì vậy kết quả là số nguyên `3`.

Nói đơn giản, `hihi()` là bộ chuyển đổi từ Church numeral sang integer Python. Ta không cần tự tính giá trị của từng lớp lambda nếu có thể nhận diện cách chúng được tạo ra.

### Bước 2. Nhận diện Church numeral cơ bản

Trong source có ba cấu trúc cần nhận diện.

**Church numeral 1:**

```python
ONE = lambda f: lambda x: f(x)
```

Hàm `f` được áp dụng đúng một lần, nên giá trị là `1`.

**Doubling — nhân đôi một Church numeral:**

```python
D = lambda n: lambda f: lambda x: n(f)(n(f)(x))
```

Giả sử `n` biểu diễn số 3. Khi gọi `n(f)`, hàm `f` được áp dụng 3 lần. Biểu thức `n(f)(n(f)(x))` áp dụng thêm một lượt 3 lần nữa, tổng cộng 6 lần.

Vì vậy:

```text
D(n) = 2 * n
```

**Successor — cộng thêm 1:**

```python
S = lambda n: lambda f: lambda x: f(n(f)(x))
```

Phần `n(f)(x)` áp dụng `f` đúng `n` lần. Sau đó, `f(...)` bên ngoài áp dụng thêm một lần.

Vì vậy:

```text
S(n) = n + 1
```

Toàn bộ biểu thức dài trong đề chỉ là cách lồng hai thao tác `D` và `S` lên Church numeral ban đầu.

### Bước 3. Rút gọn hằng số `C`

Trong source, biểu thức được dùng làm hằng số bị trừ có cấu trúc tương đương:

```python
C_church = D(D(S(D(D(D(ONE))))))
C = hihi(C_church)
```

Ta tính từ trong ra ngoài. Bắt đầu với `ONE = 1`:

| Thao tác | Giá trị | Giải thích |
|---|---:|---|
| `ONE` | 1 | Church numeral ban đầu |
| `D(1)` | 2 | Nhân đôi 1 |
| `D(2)` | 4 | Nhân đôi 2 |
| `D(4)` | 8 | Nhân đôi 4 |
| `S(8)` | 9 | Cộng thêm 1 |
| `D(9)` | 18 | Nhân đôi 9 |
| `D(18)` | 36 | Nhân đôi 18 |

Do đó:

```python
C = 36
```

Có thể kiểm tra trực tiếp bằng đoạn code rút gọn:

```python
ONE = lambda f: lambda x: f(x)
D = lambda n: lambda f: lambda x: n(f)(n(f)(x))
S = lambda n: lambda f: lambda x: f(n(f)(x))

def hihi(n):
    return n(lambda x: x + 1)(0)

C = hihi(D(D(S(D(D(D(ONE)))))))
print(C)  # 36
```

Điều quan trọng là ta không đoán `C` từ prefix của flag. Biểu thức lambda đầy đủ trong source đã xác định trực tiếp giá trị `36`.

### Bước 4. Rút gọn modulo

Phần sau toán tử `%` cũng là một Church numeral. Cấu trúc của nó là tám lần áp dụng phép nhân đôi lên `ONE`:

```python
MOD_church = D(D(D(D(D(D(D(D(ONE))))))))
MOD = hihi(MOD_church)
```

Mỗi lần `D` nhân giá trị hiện tại với 2. Bắt đầu từ 1 và nhân đôi tám lần:

```text
1 -> 2 -> 4 -> 8 -> 16 -> 32 -> 64 -> 128 -> 256
```

Vì vậy:

```python
MOD = 256
```

Ta có thể hiểu đây là `2**8`. Modulo 256 thường xuất hiện khi làm việc với dữ liệu byte, vì một byte có 256 giá trị từ 0 đến 255.

### Bước 5. Viết lại điều kiện kiểm tra bằng số nguyên thông thường

Sau khi rút gọn hai Church numeral, biểu thức kiểm tra ban đầu trở thành:

```python
val = ((ord(inp[i]) ^ key[i % len(key)]) - 36) % 256
```

Và chương trình yêu cầu:

```python
val == arr[i]
```

Gộp lại:

```python
((ord(inp[i]) ^ key[i % len(key)]) - 36) % 256 == arr[i]
```

Bây giờ ta chỉ còn các phép toán quen thuộc: `ord`, XOR, trừ và modulo.

### Bước 6. Đảo ngược phép trừ modulo 256

Đặt:

```text
x = ord(inp[i]) ^ key[i % len(key)]
```

Điều kiện trở thành:

```text
(x - 36) % 256 = arr[i]
```

Muốn tìm lại `x`, ta cộng 36 vào hai vế rồi lấy modulo 256:

```text
x = (arr[i] + 36) % 256
```

Đây là phép đảo của thao tác trừ 36 modulo 256.

### Bước 7. Đảo phép XOR

Ta đang có:

```text
x = ord(inp[i]) ^ key[i % len(key)]
```

XOR có tính chất tự nghịch đảo:

```text
(a ^ b) ^ b = a
```

Nghĩa là nếu XOR một giá trị với `key`, ta chỉ cần XOR kết quả thêm một lần với chính `key` để lấy lại giá trị ban đầu.

Vì vậy:

```text
ord(inp[i]) = x ^ key[i % len(key)]
```

Thay biểu thức `x` vừa tìm được:

```python
ord(inp[i]) = ((arr[i] + 36) % 256) ^ key[i % len(key)]
```

Cuối cùng, `chr()` chuyển mã số này thành ký tự:

```python
inp[i] = chr(((arr[i] + 36) % 256) ^ key[i % len(key)])
```

Đây là công thức giải ngược hoàn chỉnh.

### Bước 8. Thay các mảng đã giải mã và khôi phục chuỗi

Sau khi đánh giá các Church numeral trong `key` và `arr`, ta có các giá trị số nguyên sau:

```python
key = [
    92, 119, 183, 33, 31, 41, 245, 108,
    21, 83, 58, 60, 244, 145, 29, 117
]

arr = [
    250, 24, 218, 78, 56, 46, 141, 57,
    77, 232, 78, 91, 149, 160, 6, 6,
    4, 31, 158, 34, 83, 57, 134, 220,
    253, 26, 52, 52, 156, 170, 90, 29,
    12, 240, 196, 45, 73, 245, 97, 59,
    67, 27, 31, 223, 153, 170, 69, 249,
    73, 245, 184, 90, 77, 245, 93, 237
]
```

`key` có 16 phần tử, còn `arr` có 56 phần tử. Vì vậy, chương trình dùng `key[i % len(key)]` để lặp lại key sau mỗi 16 ký tự.

Ta có thể viết solver độc lập như sau:

```python
key = [
    92, 119, 183, 33, 31, 41, 245, 108,
    21, 83, 58, 60, 244, 145, 29, 117
]

arr = [
    250, 24, 218, 78, 56, 46, 141, 57,
    77, 232, 78, 91, 149, 160, 6, 6,
    4, 31, 158, 34, 83, 57, 134, 220,
    253, 26, 52, 52, 156, 170, 90, 29,
    12, 240, 196, 45, 73, 245, 97, 59,
    67, 27, 31, 223, 153, 170, 69, 249,
    73, 245, 184, 90, 77, 245, 93, 237
]

C = 36
MOD = 256

inp = ''.join(
    chr(((arr[i] + C) % MOD) ^ key[i % len(key)])
    for i in range(len(arr))
)

print("Recovered input:", inp)
```

Kết quả được khôi phục trực tiếp từ 56 phần tử của `arr`. Không cần tự thêm `BKISC{` hoặc `}` vì hai ký tự này đã nằm trong chuỗi được giải mã.

### Bước 9. Kiểm chứng lại bằng công thức gốc

Sau khi có chuỗi `inp`, nên chạy lại đúng phép kiểm tra của challenge để chắc chắn mọi ký tự đều khớp:

```python
for i in range(len(arr)):
    val = ((ord(inp[i] ^ key[i % len(key)]) - C) % MOD)
    assert val == arr[i]

print("All positions verified!")
```

Nếu không có `AssertionError`, toàn bộ 56 ký tự đều thỏa mãn công thức trong source.

## Flag

`BKISC{D1d_HCMU7_t4ught_l4mbd4_c4lc_pr0p3rly?I_th1nk_n0t}`

## Tài liệu tham khảo

- Church encoding: https://en.wikipedia.org/wiki/Church_encoding
- Lambda calculus: https://en.wikipedia.org/wiki/Lambda_calculus
- Exclusive OR (XOR): https://en.wikipedia.org/wiki/Exclusive_or
- Python `ord()` và `chr()`: https://docs.python.org/3/library/functions.html#ord
