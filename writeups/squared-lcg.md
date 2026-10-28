---
techniques: lcg-state-recovery, sign-ambiguity, modular-inverse, aes-ecb, sha256-key-derivation
summary: Khôi phục seed của LCG từ leak s² + c, rồi dùng seed làm khoá AES.
---

## Đề bài

`p` là số nguyên tố 1024 bit với `p % 4 == 3`. Một LCG `state = a*state + b mod p` sinh 5 state từ `seed` (số nguyên tố 512 bit). Ta chỉ biết `leaks[i] = states[i]² + c mod p`. Flag mã hoá AES-ECB với `key = sha256(long_to_bytes(seed))`.

## Kỹ thuật sử dụng

- **lcg-state-recovery**: biết `a`, `b` và một state thì suy ra mọi state khác. LCG là phép affine nên khả nghịch mod `p`.
- **sign-ambiguity**: leak chứa `s²` nên chỉ biết `±s`. Đổi dấu cả dãy thì `a` giữ nguyên, còn `b` thành `-b`.
- **modular-inverse**: cần `a⁻¹ mod p` để lùi một bước. `p` nguyên tố nên mọi `a ≠ 0` đều khả nghịch.
- **sha256-key-derivation**: key AES suy từ `seed`, nên seed đúng thì giải mã ra flag. Dùng luôn làm bước kiểm chứng.
- **aes-ecb**: không có IV, biết key là giải được ngay.

## Cách giải

### Bước 1. Nhận ra `states[0]` chưa phải `seed`

`G.next()` chạy trước khi lưu state, nên `states[0] = a*seed + b`. Phải lùi thêm một bước để ra `seed`.

### Bước 2. Tìm `a`, `b`, `c` và `s1`

TODO: ghi cách tìm. Gợi ý: với `d_i = s_{i+1} - s_i` thì `d_{i+1}² = d_i · d_{i+2}`.

### Bước 3. Đảo LCG

`state_n = (state_{n+1} - b) · a⁻¹ mod p`. Dấu của `a`, `b`, `s1` phải cùng một dãy: dùng `p - s1` thì `b` cũng phải đổi thành `p - b`.

```python
a_inv = inverse(a, p)
seed = ((p - s1) - (p - b)) * a_inv % p
```

### Bước 4. Giải mã

```python
key = sha256(long_to_bytes(seed)).digest()
print(unpad(AES.new(key, AES.MODE_ECB).decrypt(ciphertext), 16))
```

Đáp án đúng khi `seed` là số nguyên tố ≤ 512 bit và unpad hợp lệ.

## Flag

`BKISC{crypto_n33ds_just_pap3r_and_p3nc1l}`
