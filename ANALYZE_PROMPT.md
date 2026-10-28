# Prompt để paste cùng lời giải vào AI

Dán đoạn dưới đây, rồi dán đề + lời giải / code / log của bạn ở cuối. Lưu kết quả thành `writeups/<slug>.md` (slug xem trong `challenges.json`, ví dụ `squared-lcg`), rồi chạy `python ctf.py build`.
Tên bài, mảng, điểm và thời gian giải đã nằm trong `challenges.json` nên AI không cần viết lại.

---

Bạn là người viết writeup CTF. Dưới đây là đề bài và lời giải của tôi. Hãy viết lại thành một file Markdown bằng tiếng Việt theo đúng khuôn sau. Không bịa chi tiết không có trong lời giải; chỗ nào thiếu thì ghi "TODO: ...".

1. Bắt đầu bằng front matter:
```
---
techniques: kỹ thuật 1, kỹ thuật 2, ...
summary: một câu mô tả cách giải
---
```
   Tên kỹ thuật ngắn, viết thường, nối bằng gạch ngang, ví dụ `lcg-state-recovery`, `sign-ambiguity`, `modular-inverse`, `aes-ecb`.

2. Các mục theo đúng thứ tự:
   - `## Đề bài`: tóm tắt đề và điều kiện quan trọng.
   - `## Kỹ thuật sử dụng`: danh sách gạch đầu dòng, mỗi dòng dạng `- **tên kỹ thuật**: dùng ở bước nào và ý tưởng chính`. Giải thích công thức ngắn gọn.
   - `## Cách giải`: chia thành `### Bước 1`, `### Bước 2`, ... Mỗi bước nêu ý nghĩ rồi tới code. Ghi rõ chỗ tôi từng sai hoặc vướng và cách sửa.
   - `## Flag`: flag đặt trong dấu backtick.

[Dán đề + lời giải ở đây]
