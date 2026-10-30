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


h1 + h2 ≡ 2 · (2p)^e   (mod N)    →  gcd(h1 + h2, N) = p
h1 − h2 ≡ 2 · (3q)^e   (mod N)    →  gcd(h1 − h2, N) = q


Kiểm tra bằng số nhỏ: `p = 5`, `q = 7`, `N = 35`, `e = 3` cho `h1 = 6`, `h2 = 34`. Khi đó `h1 + h2 = 40 ≡ 5` và `gcd(5, 35) = 5 = p`, còn `h1 − h2 = −28 ≡ 7` và `gcd(7, 35) = 7 = q`.

### Bước 2. Lấy p, q bằng gcd

```python
import re
from math import gcd

N = 421377246467277886038028896700405088631043758416336568839866177451678423919297407192578297658019146263771604862707393244548421872595833306496345591781545673395742804440652668114290036419806969662228958985568241158392280767868099389076836763286251989716764325786694264254928675898456872878019368221340636152556572186747545941773036452814330556148435282321078676447594511112089479096337340893056397992323840961368677571893487139875113844976720785041543080527167431402276501184831683204135947464132740062754285210468785561707417040317518674057504836888472820241731241149606337299786000751789705079893982251260167290483904755527456100244252168282286235788887151120616848269
e = 65537
c = 366588717030182182260249247462015778894198433108486616119097743325541119771659002808378400400428647045983517289840866805800622867268960879543675965970879618282889491949762660478030412155802762944934840775817986758588892161824409964119102635465427500768374789867604315575063882154555718035420674265343584638768131922517795394578091139889885914293391886197060211260758552493607374770376950262915033649544018217635265029098093870636292883388683713248106389163700168034543130945005563031154943192680114870803779021714680177283386540772502648804420214013222819087762133971241518390000183581534043437453023880303209895795337129474592873445000508397605563812790596812978877386
h1 = 2842201374303852392174414923408361867162391326477759802723488337752180377040045781396358233454247529467767952432103367063527844556091409915446457739455624226177572860857524712230213629318258726428933096969290227254902795413227572882313084993533082084693458753126365392430938012351885963501442152233816320817786256670863058164810433382575880637780246706581996525079131765067409032186331957387274697593931288175991199032159731081320754862882908147852568617339969862089564486030467199920991781947382672300048207722786379935075117233976394361664286628417552546985390104087960173502661180746617542377232085566631194548125387898751534495408891775439959294224698694889138066
h2 = 134859596215989258976826805327169522770456008779431758849286268406045824323619564785572601220324027422935688770972255726567870066819080930201795968426160719862653734479924678330294469698709878446812801473814949765713674703479109554979698173665614810369758933873764038578340536735220633696469532443278756794486698128105599492188778900397343910402275031305516387026978003379384048308721117353228712230581782128721908041330841742487293517377985828161047908899724052043539879371337416336455154094157960979862634484800591188706641414896880091906513899288552974603214655526655341063463733342382156810814640745424910051608796391883178111177950887237424593858453133857796981196


p = gcd((h1 + h2) % N, N)
q = gcd((h1 - h2) % N, N)
assert p * q == N          # kiểm tra chéo: đúng thì p, q chắc chắn đúng
```

### Bước 3. Giải mã RSA

```python
from Crypto.Util.number import long_to_bytes

phi = (p - 1) * (q - 1)
d = pow(e, -1, phi)        
M = pow(c, d, N)           
data = long_to_bytes(M)
print(data)

>>> b'(36,9) (3,1) (45,1) (52,0) (19,1) (59,4) (45,2) (60,6) (54,9) (47,6) (0,3) (18,2) (50,6) (57,0) (18,9) (33,9) (8,9) (25,6) (57,0) (32,9) (8,2) (64,0) (24,6) (25,6) (36,4) (64,0) (62,3) (33,1) (50,3) (33,3) (45,4) (16,6) (42,1) (32,1) (9,2) (43,9) (8,9) (43,3) (45,3)'
```


> **Lưu ý nhỏ:** đừng đặt tên biến là `sum` vì trùng hàm có sẵn của Python. Nếu `long_to_bytes` báo lỗi thì cài `pip install pycryptodome`.

### Bước 4. Kết quả là book cipher

`data` chưa phải flag mà là chuỗi các cặp:

```
b'(36,9) (3,1) (45,1) (52,0) (19,1) (59,4) ... (43,3) (45,3)'
```

Có 39 cặp. Số lớn nhất ở vị trí đầu là 64 và ở vị trí sau là 9. Docstring của đề có đúng 10 dòng (đánh số 0 đến 9) và dòng dài nhất khoảng 70 ký tự. Vậy mỗi cặp là **(cột, dòng)** trong docstring.


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
