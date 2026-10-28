#!/usr/bin/env python3
"""Quản lý writeup.
  python ctf.py add "Tên bài" --category crypto --points 500 --solved "2026-10-28 10:00:00"
  python ctf.py build     # gộp challenges.json + writeups/*.md -> writeups/index.json

Danh sách bài nằm trong challenges.json. Mỗi bài có file writeups/<slug>.md (tuỳ chọn).
Bài nào còn chứa dòng <!-- TODO-WRITEUP --> được tính là chưa viết.
"""
import argparse, json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).parent
DIR = ROOT / "writeups"
CH = ROOT / "challenges.json"
MARK = "<!-- TODO-WRITEUP -->"

TEMPLATE = """---
techniques: 
summary: 
---

{mark}

## Đề bài

## Kỹ thuật sử dụng

- **tên kỹ thuật**: dùng ở bước nào, ý tưởng chính

## Cách giải

### Bước 1

```python
# code
```

## Flag

`flag{{...}}`
""".replace("{mark}", MARK)

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "writeup"

def load():
    return json.loads(CH.read_text(encoding="utf-8")) if CH.exists() else []

def front(text):
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
    return meta

def build():
    by = {c["slug"]: dict(c) for c in load()}
    for p in DIR.glob("*.md"):          # file không có trong challenges.json vẫn được đưa vào
        if p.stem not in by:
            m = front(p.read_text(encoding="utf-8"))
            by[p.stem] = dict(slug=p.stem, title=m.get("title", p.stem), category=m.get("category", "misc"),
                              points=int(m.get("points", 0) or 0), solved=m.get("solved", ""))
    items = []
    for slug, c in by.items():
        c.update(done=False, techniques=[], summary="")
        p = DIR / f"{slug}.md"
        if p.exists():
            text = p.read_text(encoding="utf-8")
            if MARK not in text:
                m = front(text)
                c["done"] = True
                c["techniques"] = [t.strip() for t in m.get("techniques", "").split(",") if t.strip()]
                c["summary"] = m.get("summary", "")
        items.append(c)
    items.sort(key=lambda c: c.get("solved", ""), reverse=True)
    (DIR / "index.json").write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(items)} bài, {sum(c['done'] for c in items)} bài đã có writeup")

def add(a):
    slug = slugify(a.title)
    ch = load()
    if not any(c["slug"] == slug for c in ch):
        ch.append(dict(slug=slug, title=a.title, category=a.category.lower(), points=a.points, solved=a.solved))
        CH.write_text(json.dumps(ch, ensure_ascii=False, indent=2), encoding="utf-8")
    p = DIR / f"{slug}.md"
    if not p.exists():
        p.write_text(TEMPLATE, encoding="utf-8")
        print(f"Đã tạo {p}")
    build()

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("add"); n.add_argument("title")
    n.add_argument("--category", default="crypto"); n.add_argument("--points", type=int, default=0)
    n.add_argument("--solved", default="")
    sub.add_parser("build")
    args = ap.parse_args()
    add(args) if args.cmd == "add" else build()
