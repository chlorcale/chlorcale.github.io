---
title: Please Do Reverse
category: reverse
techniques: source-code-analysis, hardcoded-credentials, repeating-key-xor
summary: Đọc source để lấy username và password được hardcode, sau đó chạy lại phép XOR với khóa lặp để khôi phục flag.
---

## Đề bài

Challenge cung cấp source Python yêu cầu người dùng nhập username và password. Nếu thông tin đăng nhập hợp lệ, chương trình sử dụng một mảng số nguyên `key` kết hợp với password để tạo và in ra flag.

Các điều kiện đăng nhập được ghi trực tiếp trong source:

```python
if username == "admin":
    ...

if password == 'very_secured_pass':
    ...
```

Vì vậy, trước tiên cần đọc luồng xử lý của chương trình để xác định thông tin đăng nhập. Sau đó phân tích cách biến `key` thành chuỗi flag.

## Kỹ thuật sử dụng

- **source-code-analysis**: đọc source để xác định điều kiện đăng nhập và đoạn code tạo flag.
- **hardcoded-credentials**: username và password được lưu trực tiếp trong chương trình, không cần brute-force.
- **repeating-key-xor**: mỗi phần tử trong mảng `key` được XOR với mã ASCII của một ký tự password; password được lặp lại nếu cần thêm ký tự.

## Cách giải

### Bước 1. Đọc điều kiện đăng nhập

Chương trình yêu cầu username trước:

```python
username = input("Give me your username: ")

if username == "admin":
    print("Welcome, admin!")
else:
    print(f"Hello, {username}!, you are not an admin.")
    sys.exit(1)
```

Username hợp lệ đã được hardcode là:

```text
admin
```

Tiếp theo, chương trình kiểm tra password:

```python
if password == 'very_secured_pass':
    print("Access granted!")
```

Do đó password cần nhập là:

```text
very_secured_pass
```

Không cần đoán hay brute-force thông tin đăng nhập vì cả hai giá trị đều xuất hiện trực tiếp trong source.

### Bước 2. Phân tích phép tạo flag

Khi đăng nhập thành công, chương trình khai báo:

```python
key = [52, 46, 59, 42, 28, 8, 23, 80, 42, 27, 80,
       59, 58, 42, 62, 1, 26, 17, 13, 6, 70, 34]
flag = ''

for i in range(max(len(key), len(password))):
    flag += chr(key[i % len(key)] ^ ord(password[i % len(password)]))
```

Ta tách biểu thức trong vòng lặp thành ba phần:

1. `key[i % len(key)]`: lấy phần tử trong `key`. Phép `%` giúp quay lại đầu mảng nếu chỉ số vượt quá độ dài của nó.
2. `ord(password[i % len(password)])`: lấy mã ASCII của ký tự password tương ứng. Password cũng được lặp lại theo chu kỳ.
3. `^`: XOR hai số nguyên, sau đó `chr(...)` chuyển kết quả thành ký tự.

Vòng lặp chạy số lần bằng độ dài lớn hơn trong hai giá trị: `max(len(key), len(password))`.

Trong challenge này, `len(key) = 22` và `len(password) = 17`, nên:

```text
max(22, 17) = 22 lần
```

Vì `key` có 22 phần tử nên mỗi phần tử được dùng đúng một lần; password dài 17 ký tự nên 5 ký tự đầu của password được dùng lại ở các vị trí cuối.

Công thức tại vị trí `i` là:

```python
flag[i] = chr(key[i % 22] ^ ord(password[i % 17]))
```

### Bước 3. Hiểu phép XOR

XOR trả về `1` khi hai bit khác nhau và `0` khi hai bit giống nhau. Một tính chất quan trọng là XOR với cùng một giá trị hai lần sẽ khôi phục giá trị ban đầu:

```text
(a ^ b) ^ b = a
```

Trong challenge này, ta không cần đảo ngược phép XOR để tìm password vì password đã biết. Chỉ cần thực hiện lại đúng phép XOR giữa từng phần tử `key` và mã ASCII của ký tự password tương ứng.

Ví dụ, hai ký tự đầu tiên:

```python
52 ^ ord('v')  # 52 ^ 118 = 66 = 'B'
46 ^ ord('e')  # 46 ^ 101 = 75 = 'K'
```

Hai kết quả đầu là `BK`, khớp với prefix của flag.

### Bước 4. Viết script khôi phục flag


```python
key = [
    52, 46, 59, 42, 28, 8, 23, 80, 42, 27, 80,
    59, 58, 42, 62, 1, 26, 17, 13, 6, 70, 34
]

password = "very_secured_pass"

flag = ''.join(
    chr(key[i] ^ ord(password[i % len(password)]))
    for i in range(len(key))
)

print(flag)
```

Chạy bằng Python:

```bash
python3 solve.py
```

Kết quả là chuỗi payload nằm giữa `BKISC{` và `}`. Ghép lại với prefix và suffix của flag sẽ thu được flag hoàn chỉnh.

### Bước 5. Cách lấy flag trực tiếp từ chương trình

Ngoài cách chạy script riêng, có thể chạy chương trình challenge và nhập hai giá trị đã tìm được:

```text
Give me your username: admin
Give me your password: very_secured_pass
```

Khi cả hai điều kiện đều đúng, chương trình tự thực hiện phép XOR và in flag.

## Flag

`BKISC{r3_i5_eZ_right?}`
