---
techniques: vba-macro-analysis, olevba, base64-decoding, single-byte-xor, known-plaintext-key-recovery, ioc-extraction
summary: Trích macro VBA tự chạy từ file Word bằng olevba, thấy flag bị giấu bằng Base64 rồi XOR với 55 và bị xoá khỏi đĩa ngay khi macro chạy, nên giải mã tĩnh chuỗi trong mã nguồn.
---

## Đề bài

![Macro VBA tự chạy khi mở file](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/exam-leaked.png?raw=true)

## Kỹ thuật sử dụng

- **vba-macro-analysis**: macro VBA nằm bên trong file Office và có thể trích ra thành văn bản để đọc mà không cần chạy nó. Thủ tục `AutoOpen` chạy tự động khi mở file, là dấu hiệu đầu tiên của macro độc hại.
- **olevba**: công cụ trong bộ `oletools`, tự trích mã VBA, đánh dấu macro tự chạy và chuỗi Base64, nên chọn nó thay cho mở file bằng Word.
- **base64-decoding**: chuỗi flag được mã hoá Base64. Macro giải mã bằng `MSXML2.DOMDocument` với `DataType = "bin.base64"`, Python làm được việc tương đương bằng `base64.b64decode`.
- **single-byte-xor** và **known-plaintext-key-recovery**: sau Base64, mỗi byte bị XOR với một khoá 1 byte. Biết flag bắt đầu bằng `BKISC{` thì suy ra khoá, hoặc thử cả 256 khoá rồi lọc theo tiền tố.
- **ioc-extraction**: phần còn lại của macro cho biết mẫu làm gì (thu thập Wi-Fi, gửi ra ngoài, xoá dấu vết). Ghi lại thành chỉ dấu để báo cáo.

## Cách giải

### Bước 1. Trích macro mà không mở file bằng Word

Mở file bằng Word thật có thể kích hoạt macro. Hãy làm trong máy ảo cô lập và chỉ dùng `olevba`:

```bash
pip install oletools
olevba file.doc --reveal
```

Cột cờ (flags) ở đầu kết quả cho biết nhanh đặc điểm của file: `M` có macro, `A` macro tự chạy (ở đây là `AutoOpen`), `S` có từ khoá đáng ngờ (`Shell`, `Exec`, ...), `I` có thể chứa IOC như URL, `B` có chuỗi Base64. Mẫu này gần như bật đủ các cờ đó.

### Bước 2. Đọc macro theo trình tự: tìm gì ở mỗi chỗ

Không cần hiểu từng dòng. Đọc theo bốn câu hỏi:

| Câu hỏi | Dòng cần tìm | Thấy gì |
|---|---|---|
| Macro chạy lúc nào? | tên thủ tục | `Sub AutoOpen()`: chạy ngay khi mở file |
| Flag được tạo ở đâu? | biến tên `flag` | một chuỗi Base64, rồi vòng `For` biến đổi từng byte |
| Flag đi đâu? | `Open ... For Output`, `Print #1`, `Kill` | ghi ra `%TEMP%\flag.txt` rồi `Kill` (xoá) ngay |
| Dữ liệu nào gửi ra ngoài? | `ServerXMLHTTP`, `.Send` | chỉ dữ liệu Wi-Fi gửi đi, không phải flag |

Điểm đáng chú ý nhất là dòng thứ ba. Macro tạo flag trên đĩa rồi xoá, nên phân tích động (chạy macro rồi tìm file) sẽ không thấy gì. Muốn lấy flag phải đọc cách nó được tạo ra và tự làm lại.

### Bước 3. Xác định hai lớp mã hoá của biến `flag`

Đoạn tạo flag:

```vb
flag = "dXx+ZHRMRQRaBFpVBEVoXAZTAhtoWQRPAGhDBloEaFMHWRBDaEICBGgZUwdUaFEGewQCFko="
Set b64 = CreateObject("MSXML2.DOMDocument").createElement("b64")
b64.DataType = "bin.base64"
b64.Text = flag
raw = b64.nodeTypedValue
flag = ""
For i = 0 To UBound(raw)
    flag = flag & Chr(raw(i) Xor 55)
Next i
```

Đọc từng bước:

1. `DataType = "bin.base64"` rồi `nodeTypedValue` là cách của MSXML để giải mã Base64 thành mảng byte `raw`.
2. Vòng `For` lấy từng byte `raw(i)`, XOR với hằng số `55`, đổi thành ký tự bằng `Chr`.

Cho nên lớp ngoài là Base64, lớp trong là XOR một byte với khoá `55`.

### Bước 4. Giải mã bằng Python

```python
import base64

s = 'dXx+ZHRMRQRaBFpVBEVoXAZTAhtoWQRPAGhDBloEaFMHWRBDaEICBGgZUwdUaFEGewQCFko='
b = base64.b64decode(s)
print(''.join(chr(x ^ 55) for x in b))
```

Kết quả là flag ở cuối bài. Muốn kiểm tra mà không phụ thuộc vào việc đọc đúng khoá `55`, dùng tiền tố đã biết của flag:

```python
print(b[0] ^ ord('B'), b[1] ^ ord('K'))                           # cùng ra 55
print([k for k in range(256) if bytes(x ^ k for x in b).startswith(b"BKISC{")])   # chỉ có [55]
```

Cách này hữu ích khi gặp macro khác mà khoá bị che hoặc tính ra từ biểu thức: biết plaintext bắt đầu bằng `BKISC{` là đủ để tìm khoá XOR một byte.

### Bước 5. Phần còn lại của macro: hành vi của mẫu

Phần này không liên quan đến flag nhưng nên ghi lại vì đó là hành vi thật của loại mẫu này:

- Chạy lệnh `netsh wlan show networks mode=bssid` qua PowerShell để liệt kê Wi-Fi xung quanh (SSID, tín hiệu, kênh), ghi tạm ra `wifidat.txt`.
- Mã hoá dữ liệu Wi-Fi bằng Base64 và gửi bằng HTTP POST lên một endpoint dịch vụ webhook (chỉ dấu, đã vô hiệu hoá liên kết): `hxxps://eoh98su6p2pfl6c[.]m[.]pipedream[.]net/`.
- Xoá `flag.txt` và `wifidat.txt`, tự xoá module macro (`DeleteThisModule`) rồi đóng Word (`Application.Quit`) để che dấu vết.

> **Bài học của đề:** đừng dùng định dạng `.doc` hoặc bất kỳ file Office có macro để chuyển tài liệu nhạy cảm. Macro chạy ngay khi mở file và có thể làm nhiều việc phía sau mà người dùng không thấy.

> **Lưu ý an toàn khi gặp mẫu thật:** không mở bằng Word thật, chỉ trích mã bằng `olevba` trong máy ảo không nối mạng. Không truy cập endpoint trong macro.

## Flag

`BKISC{r3m3mb3r_k1d5,_n3x7_t1m3_d0n't_u53_.d0c_f1L35!}`

## Tài liệu tham khảo

- olevba (Philippe Lagadec): https://decalage.info/python/olevba. Công cụ trích và phân tích macro VBA, kèm danh sách cờ phát hiện.
- Công cụ trích macro VBA và cách macro được lưu trong file Office: https://decalage.info/vba_tools/
- olevba trên aldeid (ví dụ kết quả `AutoOpen` được đánh dấu "Runs when the Word document is opened"): https://aldeid.com/wiki/Python-oletools/olevba
