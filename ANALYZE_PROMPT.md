# Prompt viết writeup

Dán nội dung dưới đây cùng đề bài và lời giải. Lưu kết quả thành `writeups/<slug>.md` (slug lấy từ `challenges.json`), rồi chạy `python ctf.py build`.

---

Bạn là người viết writeup CTF. Hãy viết lại đề bài và lời giải tôi cung cấp thành một tệp Markdown bằng tiếng Việt. Không bịa chi tiết; phần thiếu ghi `TODO: ...`.

Bắt đầu bằng front matter:

```yaml
---
title: Tên bài
category: crypto
techniques: kỹ-thuật-1, kỹ-thuật-2
summary: Một câu tóm tắt cách giải.
---
```

Giữ nguyên tên và slug đã có. `title` và `category` chỉ cần có nếu bài chưa có trong `challenges.json`.

Các mục theo đúng thứ tự:

1. `## Đề bài`: tóm tắt đề và điều kiện quan trọng.
2. `## Kỹ thuật sử dụng`: danh sách dạng `- **tên-kỹ-thuật**: bước áp dụng và ý tưởng chính`.
3. `## Cách giải`: chia thành `### Bước 1`, `### Bước 2`, ...; nêu ý tưởng rồi tới code, ghi lại lỗi/vướng mắc nếu lời giải có đề cập.
4. `## Flag`: flag đặt trong dấu backtick.

Nếu writeup chưa hoàn chỉnh, giữ dòng `<!-- TODO-WRITEUP -->` để chỉ mục nhận biết bài chưa viết xong. Không thêm điểm hoặc thời gian giải.

---

[Dán đề bài và lời giải ở đây]
