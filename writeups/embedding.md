---
title: Embedding
category: crypto
techniques: polynomial-evaluation, complex-to-real-linear-system, bounded-integer-recovery, mixed-integer-linear-programming
summary: Khôi phục 42 byte của flag từ 16 mẫu phức bằng cách biến phép encode thành hệ tuyến tính và tận dụng việc hệ số là byte nguyên.
---

## Đề bài

Challenge cho ta một chương trình `Encoder` và 16 giá trị phức `ct`. Nhiệm vụ là tìm lại phần nội dung flag gồm đúng 42 byte:

```text
BKISC{<42 byte cần tìm>}
```

Đoạn code tạo đa thức như sau:

```python
pt = list(flag[6:-1].encode())
p = Polynomial(pt)
ct = encoder.encode(p)
```

Điều quan trọng nằm ở `Polynomial(pt)`: danh sách byte được dùng làm **hệ số của đa thức**. Nếu 42 byte lần lượt là `a0, a1, ..., a41`, thì:

\[
p(x)=a_0+a_1x+a_2x^2+\cdots+a_{41}x^{41}.
\]

Mỗi hệ số là một byte, nên:

\[
a_j\in\{0,1,\ldots,255\}.
\]

Nói cách khác, ta không cần đoán trực tiếp cả chuỗi flag. Ta cần tìm 42 số nguyên trong khoảng 0–255.

## Kỹ thuật sử dụng

- **polynomial-evaluation**: hiểu mỗi phần tử `ct` là giá trị của đa thức tại một điểm phức đã biết.
- **complex-to-real-linear-system**: một phương trình phức tương đương hai phương trình thực (phần thực và phần ảo).
- **bounded-integer-recovery**: khai thác việc mỗi hệ số chỉ có thể là số nguyên từ 0 đến 255.
- **mixed-integer-linear-programming**: dùng MILP để tìm một bộ 42 hệ số nguyên thỏa tất cả các phương trình, trong sai số làm tròn của dữ liệu.
- **re-encoding-verification**: encode lại các hệ số tìm được và so sánh với `ct` ban đầu.

## Cách giải

### Bước 1. Hiểu chương trình đã biến flag thành dữ liệu gì

Trong `chal.py`, phần nằm giữa `BKISC{` và `}` được chuyển thành byte:

```python
flag = flag[6:-1].encode()
pt = list(flag)
p = Polynomial(pt)
```

Ví dụ, ký tự `A` có mã byte ASCII là 65. Nếu payload bắt đầu bằng `A`, hệ số đầu tiên sẽ là `a0 = 65`.

`Polynomial(pt)` hiểu danh sách theo thứ tự **hệ số từ bậc thấp đến bậc cao**:

```text
pt[0]  -> hệ số x^0
pt[1]  -> hệ số x^1
pt[2]  -> hệ số x^2
...
pt[41] -> hệ số x^41
```

Do payload dài 42 byte nên đa thức có 42 hệ số, bậc tối đa là 41.

### Bước 2. `Encoder` thực sự làm gì?

Trong `Encoder(128)`, chương trình đặt:

\[
\zeta=e^{2\pi i/128}.
\]

Đây là một số phức nằm trên đường tròn đơn vị. Các lũy thừa của nó tạo ra những điểm khác nhau trên đường tròn.

Hàm `sigma()` tính đa thức tại các điểm:

\[
\zeta^1,\zeta^3,\zeta^5,\ldots,\zeta^{127}.
\]

Có tổng cộng 64 điểm vì `128 // 2 = 64`.

Nhưng `pi()` chỉ lấy 16 phần tử đầu tiên:

```python
N = self.poly_degree // 8  # 128 // 8 = 16
return z[:N]
```

Vì vậy, `ct` chỉ chứa 16 kết quả:

\[
ct_i=p(\zeta^{2i+1}),\qquad i=0,1,\ldots,15.
\]

Đây là điều quan trọng: **mỗi phần tử `ct` là một phép tính đã trộn cả 42 byte lại với nhau**. Ta cần tách chúng ra để tìm lại từng byte.

### Bước 3. Viết một giá trị `ct` thành phương trình

Xét mẫu đầu tiên, ứng với \(i=0\):

\[
ct_0=p(\zeta).
\]

Thay đa thức vào:

\[
ct_0=a_0+a_1\zeta+a_2\zeta^2+\cdots+a_{41}\zeta^{41}.
\]

Mẫu tiếp theo là:

\[
ct_1=a_0+a_1\zeta^3+a_2\zeta^6+\cdots+a_{41}\zeta^{123}.
\]

Các mẫu còn lại cũng có dạng tương tự. Những lũy thừa của \(\zeta\) đều đã biết; thứ duy nhất chưa biết là các hệ số `a0` đến `a41`.

Ta có thể hình dung mỗi phương trình như một cái cân: 42 byte được nhân với 42 trọng số đã biết, cộng lại thì ra một số phức `ct[i]`.

### Bước 4. Vì sao có 16 mẫu phức mà lại nói có 32 phương trình?

Một số phức luôn có hai phần:

\[
c=x+yi,
\]

trong đó `x` là phần thực và `y` là phần ảo.

Do tất cả hệ số `a[j]` đều là số thực, từ một phương trình phức ta tách được hai phương trình thực:

\[
\operatorname{Re}(ct_i)=\sum_{j=0}^{41}a_j\cos\left(\frac{2\pi(2i+1)j}{128}\right),
\]

\[
\operatorname{Im}(ct_i)=\sum_{j=0}^{41}a_j\sin\left(\frac{2\pi(2i+1)j}{128}\right).
\]

Vậy:

- 1 mẫu phức cung cấp 2 con số thực.
- 16 mẫu phức cung cấp 32 con số thực.
- Ta cần tìm 42 hệ số chưa biết.

Đó là lý do bài toán có **32 phương trình thực nhưng 42 ẩn**.

### Bước 5. Vì sao không thể nội suy đa thức thông thường?

Với một đa thức bậc tối đa 41 có hệ số bất kỳ, thông thường cần 42 điểm đánh giá khác nhau để khôi phục đủ 42 hệ số.

Ở đây ta chỉ có 16 điểm phức (tương đương 32 phương trình thực). Nếu xem 42 hệ số là số thực tùy ý, sẽ có nhiều bộ hệ số khác nhau cùng thỏa mãn dữ liệu. Vì vậy, dùng `numpy.linalg.solve()` như một hệ vuông thông thường sẽ không phù hợp; nội suy đa thức cổ điển cũng thiếu dữ liệu.

Nhưng challenge có thêm một thông tin rất quan trọng: **các hệ số không phải số thực bất kỳ, chúng là byte**.

Mỗi hệ số chỉ có 256 khả năng:

\[
0\le a_j\le255,\qquad a_j\text{ là số nguyên}.
\]

Ta hãy hình dung thế này:

- Nếu cho phép hệ số là số thực, mỗi hệ phương trình có thể có cả một vùng nghiệm liên tục.
- Nhưng ta chỉ chấp nhận các điểm có tọa độ nguyên và nằm trong khoảng 0–255.
- Ràng buộc này loại bỏ rất nhiều nghiệm không hợp lệ.
- Kết hợp với các con số `ct` được in ra khá chính xác, bộ giải có thể tìm được bộ byte phù hợp.

Đây là lý do ta chuyển từ bài toán nội suy thông thường sang bài toán tìm nghiệm nguyên có giới hạn.

### Bước 6. Đưa hệ phương trình về dạng ma trận thực

Đặt điểm đánh giá thứ `i` là:

\[
z_i=\zeta^{2i+1}.
\]

Mỗi mẫu có dạng:

\[
ct_i=\sum_{j=0}^{41}a_jz_i^j.
\]

Ta tạo ma trận `V` với:

\[
V_{i,j}=z_i^j.
\]

Khi đó:

\[
V\mathbf a=\mathbf{ct}.
\]

Vì bộ giải MILP làm việc với số thực, ta tách ma trận và vector phức thành phần thực và phần ảo:

\[
A=\begin{bmatrix}\operatorname{Re}(V)\\\operatorname{Im}(V)\end{bmatrix},\qquad
b=\begin{bmatrix}\operatorname{Re}(ct)\\\operatorname{Im}(ct)\end{bmatrix}.
\]

Ta thu được hệ thực:

\[
A\mathbf a\approx b.
\]

Kích thước của `A` là `32 × 42`: 32 hàng dữ liệu và 42 cột tương ứng 42 byte cần tìm.

### Bước 7. Dùng MILP để tìm 42 byte

MILP là viết tắt của *Mixed-Integer Linear Programming*. Tên nghe khá phức tạp, nhưng ở bài này ta chỉ dùng nó để nói với bộ giải ba điều:

1. Có 42 biến cần tìm, tương ứng 42 byte.
2. Mỗi biến phải là số nguyên và nằm trong khoảng 0–255.
3. Khi nhân các biến với ma trận `A`, kết quả phải gần bằng vector `b`.

Vì `ct` được in ra dưới dạng số dấu phẩy động đã làm tròn, ta không ép hai vế bằng nhau tuyệt đối. Ta cho phép sai số nhỏ `EPS`:

\[
b-EPS\le A\mathbf a\le b+EPS.
\]

Trong code, `integrality=np.ones(42)` yêu cầu cả 42 biến đều là số nguyên; `Bounds(0, 255)` giới hạn mỗi biến trong miền byte. Hàm mục tiêu đặt bằng 0 vì ta chỉ cần tìm một nghiệm thỏa điều kiện, không cần tối ưu một đại lượng nào khác.

Lưu code sau thành `solve.py`:

```python
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint

# 16 complex samples copied from the challenge output.
ct = np.array([
    1.55367707e+03 + 2290.98945448j,
    -2.42571179e+02 + 22.03084637j,
    5.52411574e+01 + 585.39185796j,
    1.06858953e+02 + 211.44562546j,
    2.34366725e+01 + 150.26556811j,
    -2.78019360e+01 + 220.19162972j,
    5.50846477e+01 + 230.10337675j,
    -7.78780258e+01 - 70.28849563j,
    1.24489765e+01 + 270.54243572j,
    -4.12925431e+01 - 87.27798145j,
    7.37984325e+01 - 16.7052092j,
    7.58777814e+01 + 136.08459185j,
    1.12022207e+02 + 61.75312169j,
    -1.12528306e+02 + 133.03599859j,
    4.00746170e-01 + 19.20971283j,
    7.36139489e+01 - 28.89291931j,
], dtype=np.complex128)

DEG = 128
N_COEFFS = 42
EPS = 1e-3

# Recreate the 16 evaluation points used by Encoder.
zeta = np.exp(2j * np.pi / DEG)
V = np.array([
    [zeta ** ((2 * i + 1) * j) for j in range(N_COEFFS)]
    for i in range(16)
], dtype=np.complex128)

# One complex equation becomes two real equations.
A = np.vstack((V.real, V.imag))
b = np.concatenate((ct.real, ct.imag))

# Find 42 integer byte values in [0, 255].
result = milp(
    c=np.zeros(N_COEFFS),
    integrality=np.ones(N_COEFFS),
    bounds=Bounds(
        np.zeros(N_COEFFS),
        np.full(N_COEFFS, 255),
    ),
    constraints=LinearConstraint(A, b - EPS, b + EPS),
    options={"time_limit": 120},
)

if not result.success or result.x is None:
    raise RuntimeError(f"MILP did not find a solution: {result.message}")

# Convert the solution to 42 bytes.
coeffs = np.rint(result.x).astype(np.uint8)
payload = coeffs.tobytes()

# Verify by evaluating the recovered polynomial again.
recovered_ct = V @ coeffs.astype(np.float64)
max_error = np.max(np.abs(recovered_ct - ct))

print("Recovered payload:", payload.decode("ascii", errors="replace"))
print("Flag:", f"BKISC{{{payload.decode('ascii', errors='replace')}}}")
print("Maximum complex residual:", max_error)

if max_error > EPS:
    raise RuntimeError("Verification failed: residual is too large")
```

Cài thư viện và chạy:

```bash
python3 -m pip install numpy scipy
python3 solve.py
```

### Bước 8. Đọc kết quả và kiểm tra lại

Bộ giải tìm được 42 hệ số:

```text
L1l_1s_B3TT3r_!Ll_1S_5TrOng3R_UwU_5H3353C1
```

Ghép lại prefix và suffix đã biết:

```text
BKISC{L1l_1s_B3TT3r_!Ll_1S_5TrOng3R_UwU_5H3353C1}
```

Không nên chỉ nhìn dòng `Optimization terminated successfully` rồi kết luận đã đúng. Ta cần kiểm tra ngược: dùng 42 byte tìm được để tính lại 16 mẫu phức.

Cụ thể, tính:

\[
\widehat{ct}_i=\sum_{j=0}^{41}a_j\zeta^{(2i+1)j}.
\]

Sau đó so sánh `recovered_ct` với `ct`. Với dữ liệu của challenge, sai số phức lớn nhất khoảng:

\[
\max_i|\widehat{ct}_i-ct_i|\approx4.01\times10^{-6}.
\]

Sai số này nhỏ hơn ngưỡng `EPS = 10^{-3}`, nghĩa là các byte tìm được tái tạo lại đúng 16 mẫu mà đề bài cung cấp, trong giới hạn sai số do số được in ra đã làm tròn.

### Bước 9. Lỗi trong lần thử đầu tiên

Lần chạy trước gặp:

```text
IndentationError: unexpected indent
```

Nguyên nhân là dòng `ct = np.array(...)` bị thụt đầu dòng dù nó nằm ở cấp ngoài cùng của file. Đây chỉ là lỗi định dạng Python, không liên quan đến toán học của challenge. Hãy đặt `import`, `ct = ...` và các khai báo đầu chương trình sát lề trái như code ở Bước 7.

Một điểm dễ nhầm nữa: `numpy.linalg.solve()` dùng cho hệ phương trình vuông thông thường, trong khi ma trận ở đây có kích thước `32 × 42`. Không thể gọi nó như thể ta có đủ 42 phương trình độc lập. Phần giúp giải được bài không phải một phép nội suy bí mật nào, mà là việc đưa điều kiện **42 hệ số phải là byte nguyên** vào bộ giải MILP.

## Flag

`BKISC{L1l_1s_B3TT3r_!Ll_1S_5TrOng3R_UwU_5H3353C1}`

## Tài liệu tham khảo

- SciPy `scipy.optimize.milp`: https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html
- SciPy `Bounds`: https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.Bounds.html
- SciPy `LinearConstraint`: https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.LinearConstraint.html
- NumPy `polynomial.Polynomial`: https://numpy.org/doc/stable/reference/generated/numpy.polynomial.polynomial.Polynomial.html
