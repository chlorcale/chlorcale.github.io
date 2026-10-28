#!/usr/bin/env python3
"""Quản lý writeup CTF.

  python ctf.py add "Tên bài" --category crypto
  python ctf.py build  # gộp challenges.json + writeups/*.md -> writeups/index.json

Danh sách giữ thứ tự trong challenges.json. Bài có file .md vẫn được phát hiện;
dòng <!-- TODO-WRITEUP --> đánh dấu bài chưa viết xong.
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent
DIR = ROOT / "writeups"
CH = ROOT / "challenges.json"
MARK = "<!-- TODO-WRITEUP -->"

TEMPLATE = """---
title: {title}
category: {category}
techniques:
summary:
---

{mark}

## Đề bài

TODO: tóm tắt đề bài và điều kiện quan trọng.

## Kỹ thuật sử dụng

- **tên-kỹ-thuật**: ý tưởng chính và bước áp dụng.

## Cách giải

### Bước 1

TODO: mô tả cách giải.

## Flag

`flag{...}`
"""


def slugify(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-") or "writeup"


def front(text):
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    meta = {}
    if match:
        for line in match.group(1).splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                meta[key.strip()] = value.strip()
    return meta


def load():
    return json.loads(CH.read_text(encoding="utf-8")) if CH.exists() else []


def build():
    challenges = load()
    by_slug = {item["slug"]: dict(item) for item in challenges}
    discovered = []
    for path in sorted(DIR.glob("*.md")):
        if path.stem not in by_slug:
            meta = front(path.read_text(encoding="utf-8"))
            item = {"slug": path.stem, "title": meta.get("title", path.stem),
                    "category": meta.get("category", "misc") or "misc"}
            by_slug[path.stem] = item
            discovered.append(item)

    ordered = [by_slug[item["slug"]] for item in challenges]
    ordered.extend(discovered)
    items = []
    for challenge in ordered:
        item = {"slug": challenge["slug"], "title": challenge["title"],
                "category": challenge["category"]}
        path = DIR / f"{item['slug']}.md"
        item.update(done=False, techniques=[], summary="")
        if path.exists():
            text = path.read_text(encoding="utf-8")
            if MARK not in text:
                meta = front(text)
                item["done"] = True
                item["techniques"] = [value.strip() for value in meta.get("techniques", "").split(",") if value.strip()]
                item["summary"] = meta.get("summary", "")
        items.append(item)

    DIR.mkdir(exist_ok=True)
    (DIR / "index.json").write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"{len(items)} bài, {sum(item['done'] for item in items)} bài có writeup")


def add(args):
    slug = slugify(args.title)
    challenges = load()
    if not any(item["slug"] == slug for item in challenges):
        challenges.insert(0, {"slug": slug, "title": args.title, "category": args.category.lower()})
        CH.write_text(json.dumps(challenges, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path = DIR / f"{slug}.md"
    if not path.exists():
        template = TEMPLATE.replace("{title}", args.title).replace("{category}", args.category.lower()).replace("{mark}", MARK)
        path.write_text(template, encoding="utf-8")
        print(f"Đã tạo {path}")
    build()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="cmd", required=True)
    add_parser = commands.add_parser("add")
    add_parser.add_argument("title")
    add_parser.add_argument("--category", default="crypto")
    commands.add_parser("build")
    args = parser.parse_args()
    add(args) if args.cmd == "add" else build()
