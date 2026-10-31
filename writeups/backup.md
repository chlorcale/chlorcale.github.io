---
title: Backup
category: forensics
techniques: oci-image-layer-extraction, docker-layer-forensics, sqlite-database-analysis, audit-log-analysis, aes-256-cbc, pkcs7-unpadding
summary: Trích các layer của OCI image để lấy lại bootstrap.json chứa khoá AES và docservice-seed.tar, đối chiếu audit log với SQLite để xác định document 184 rồi giải mã AES-256-CBC.
---

## Đề bài

Đề cung cấp một Docker image của một cổng nội bộ, được lưu dưới dạng **OCI image layout** trong thư mục `backup-image/`. Image có tên `docker.io/kangtheconq/backup:latest`, không kèm mã nguồn nào ngoài những gì nằm trong chính các layer.

Image chạy entrypoint `python3 /srv/app/app.py`. Khi khởi động, chương trình này giải nén `/opt/docservice-seed.tar` vào `/srv/data`, chuyển audit log sang `/var/log/docservice/audit.jsonl`, rồi **xoá** `bootstrap.json` và file seed. Vì vậy nếu chỉ `docker run` image, phần cấu hình chứa khoá mã hoá sẽ không còn.

Thứ cần tìm là flag, nằm trong một tài liệu bị hạn chế của document store. Điều kiện quan trọng: chỉ có image tĩnh, không có service đang chạy, và các file "đã xoá" vẫn còn trong layer.

## Kỹ thuật sử dụng

- **oci-image-layer-extraction**: OCI layout lưu manifest, config và layer thành các blob đặt tên theo `sha256`. Đọc `index.json` → index lồng → image manifest → lấy digest từng layer, giải nén `gzip` + `tar` để dựng lại filesystem.
- **docker-layer-forensics**: mỗi layer là một tar bất biến. File bị `unlink` lúc runtime không biến mất khỏi layer cũ, nên phải tìm `bootstrap.json` và seed tar trong layer thay vì chạy container.
- **sqlite-database-analysis**: `documents.db` lưu metadata tài liệu, gồm `export_path` và `iv_hex`. Đọc bằng `sqlite3` rồi ghép với đúng file ciphertext.
- **audit-log-analysis**: `audit.jsonl` cho biết ai đã tải tài liệu nào; ở đây `contractor-temp` tải document 184, trùng với tài liệu "Restricted".
- **aes-256-cbc** và **pkcs7-unpadding**: khoá lấy từ `bootstrap.json`, IV lấy theo từng dòng trong database, ciphertext là dữ liệu thô không có header; giải mã rồi bỏ padding PKCS#7.

## Cách giải

### Bước 1. Đi từ `index.json` xuống các layer

Trong thư mục image có hai lối vào:

- `manifest.json` — định dạng `docker save`, liệt kê thẳng danh sách layer.
- `index.json` — định dạng OCI, trỏ tới một manifest khác theo digest.

Đi theo `index.json` sẽ tổng quát hơn. Ở đây `index.json` trỏ tới `sha256:692274…`, nhưng blob đó **không phải image manifest** mà là một OCI index lồng bên trong. Nó chứa hai manifest:

| Manifest | Platform | Vai trò |
|---|---|---|
| `9c4a14863b24…` | `linux/amd64` | image manifest thật, chứa config và 6 layer |
| `606f0cf844b7…` | `unknown/unknown` | attestation (SLSA provenance), không phải layer chạy |

Nếu đọc thẳng `index["manifests"][0]` rồi truy cập `["layers"]` sẽ lỗi `KeyError: 'layers'` — đó là vướng mắc đầu tiên. Cần đệ quy và bỏ qua manifest có `platform.os == "unknown"`.

```python
import json, os

ROOT = "backup-image"
BLOBS = os.path.join(ROOT, "blobs", "sha256")

def blob(digest):
    return open(os.path.join(BLOBS, digest.split(":", 1)[1]), "rb").read()

def resolve(node):
    doc = json.loads(blob(node["digest"]))
    if "layers" in doc:
        return doc
    for child in doc.get("manifests", []):
        if child.get("platform", {}).get("os") == "unknown":
            continue          # bỏ attestation
        return resolve(child)
    raise RuntimeError("không tìm thấy image manifest")

index = json.load(open(os.path.join(ROOT, "index.json"), encoding="utf-8"))
manifest = resolve(index["manifests"][0])

for layer in manifest["layers"]:
    print(layer["digest"], layer["size"])
```

Config của image cho biết cách service chạy:

```json
{
  "Entrypoint": ["python3", "/srv/app/app.py"],
  "WorkingDir": "/srv/app",
  "Volumes": {"/srv/data": {}}
}
```

Sáu layer và nội dung của chúng:

| Layer | Nội dung |
|---|---|
| `63e7e49699e8…` | Alpine base (busybox, `/bin`, `/etc`, …) |
| `24f0c844862e…` | `apk add python3 openssl` |
| `5880e8293a04…` | tạo thư mục `/srv/app` |
| `dd93f7955889…` | `/srv/app/app.py` |
| `5e926e247584…` | `/srv/data/bootstrap.json` — **chứa khoá** |
| `e266ac32a828…` | `/opt/docservice-seed.tar` — **database + ciphertext + audit** |

### Bước 2. Vì sao khoá vẫn lấy được dù đã bị xoá?

Đọc `app.py` trong layer `dd93f7955889…`:

```python
if not (data / 'documents.db').exists():
    with tarfile.open(seed) as archive:
        archive.extractall(data, filter='data')
    shutil.move(str(data / 'audit.jsonl'), audit)

(data / 'bootstrap.json').unlink(missing_ok=True)
seed.unlink(missing_ok=True)
```

Luồng chạy:

1. Nếu `/srv/data/documents.db` chưa có, giải nén seed tar vào `/srv/data`.
2. Chuyển `audit.jsonl` sang `/var/log/docservice/`.
3. Xoá `bootstrap.json` và `docservice-seed.tar`.

Sau khi container chạy, database và các file `.enc` vẫn còn trong `/srv/data`, nhưng **khoá thì không**. Điểm mấu chốt là `unlink` chỉ thay đổi layer trên cùng của container; layer gốc trong image vẫn giữ nguyên file. Chỉ cần trích layer `5e926e247584…` là lấy lại được `bootstrap.json`.

Lưu ý thêm: image còn một attestation manifest. Tên subject trong đó là `pkg:docker/wrong-backup@latest` — chỉ là tên lúc build, không liên quan đến hướng giải.

### Bước 3. Trích `bootstrap.json` để lấy khoá

Duyệt từng layer, giải nén `gzip` rồi mở bằng `tarfile`, tìm file có tên `bootstrap.json`:

```python
import gzip, io, tarfile

bootstrap = None
seed_bytes = None

for layer in manifest["layers"]:
    raw = blob(layer["digest"])
    try:
        data = gzip.decompress(raw)
    except OSError:
        continue
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for name in tar.getnames():
            if name.endswith("bootstrap.json"):
                bootstrap = json.loads(tar.extractfile(name).read())
            elif name.endswith("docservice-seed.tar"):
                seed_bytes = tar.extractfile(name).read()
```

Nội dung `bootstrap.json`:

```json
{
  "storage_path": "/srv/data",
  "encryption": {
    "algorithm": "AES-256-CBC",
    "padding": "PKCS7",
    "key_hex": "a77d4438b10987dd5ea0d7a121982e26bc9420b1709d3d8a8d72b0a03cafcc36",
    "iv_location": "documents.iv_hex in documents.db",
    "format": "raw ciphertext; no salt header"
  },
  "note": "Initial provisioning configuration; remove after document-store initialization."
}
```

Khoá AES-256:

```text
a77d4438b10987dd5ea0d7a121982e26bc9420b1709d3d8a8d72b0a03cafcc36
```

### Bước 4. Mở `docservice-seed.tar`

Seed tar chứa đúng những gì cần cho việc giải mã:

```text
audit.jsonl
documents.db
exports/4cecfcfe20ce3ff7ca3eb86fe0ffc663.enc
exports/6ad50d193ca8e16931ee09a330cc1eaf.enc
exports/923ccec38bc59d31b98c2fc737454be1.enc
exports/e113f7ad13710b1079489e54521cfa34.enc
exports/e59aeb7c987da6c1fddf0a2c8abb66e5.enc
```

### Bước 5. Đối chiếu audit log với database

`audit.jsonl` ghi lại các lần đăng nhập và tải tài liệu:

```json
{"timestamp": "2026-10-20T03:13:49Z", "action": "login", "user": "contractor-temp", "document_id": null, "status": 200, "source_ip": "10.24.8.77"}
{"timestamp": "2026-10-20T03:14:22Z", "action": "download", "user": "contractor-temp", "document_id": 184, "status": 200, "source_ip": "10.24.8.77"}
{"timestamp": "2026-10-20T03:15:01Z", "action": "logout", "user": "contractor-temp", "document_id": null, "status": 200, "source_ip": "10.24.8.77"}
```

Tài khoản tạm `contractor-temp` đăng nhập, tải **document 184** rồi đăng xuất. Đây là tài liệu đáng chú ý nhất.

Database có một bảng duy nhất:

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  title TEXT,
  export_path TEXT,
  cipher TEXT,
  iv_hex TEXT,
  created_at TEXT
);
```

Dòng ứng với document 184:

```text
id          = 184
title       = Restricted recruitment assessment
export_path = exports/4cecfcfe20ce3ff7ca3eb86fe0ffc663.enc
iv_hex      = d815161ab7c1cbe9a721eaeb076994e5
cipher      = AES-256-CBC
```

Database còn bốn tài liệu khác (173, 178, 190, 195), nhưng chỉ 184 là tài liệu "Restricted" và khớp với audit log.

Đọc database trực tiếp từ seed tar bằng `sqlite3`:

```python
import sqlite3

with tarfile.open(fileobj=io.BytesIO(seed_bytes)) as seed:
    db = sqlite3.connect(":memory:")
    db.deserialize(seed.extractfile("documents.db").read())

    title, path, iv_hex = db.execute(
        "SELECT title, export_path, iv_hex FROM documents WHERE id = 184"
    ).fetchone()

    ciphertext = seed.extractfile(path).read()
```

`sqlite3.Connection.deserialize` cần Python 3.11 trở lên; nếu dùng bản cũ hơn thì ghi bytes ra file tạm rồi `sqlite3.connect(path)`.

### Bước 6. Giải mã AES-256-CBC

Có đủ ba thành phần: khoá trong `bootstrap.json`, IV trong dòng 184, ciphertext trong seed tar. Dữ liệu là ciphertext thô, không có salt hay header, nên giải mã trực tiếp rồi bỏ padding PKCS#7:

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad

key = bytes.fromhex(bootstrap["encryption"]["key_hex"])

plaintext = unpad(
    AES.new(key, AES.MODE_CBC, bytes.fromhex(iv_hex)).decrypt(ciphertext),
    AES.block_size,
)
print(plaintext.decode())
```

Kết quả:

```text
Restricted recruitment assessment

INTERNAL - RESTRICTED
Recruitment assessment verification marker:
BKISC{w4it_d0ck3r_is_n0t_th4t_h4rd_r1ght_?}
```

### Bước 7. Script hoàn chỉnh

Script dưới đây không hard-code khoá, không hard-code IV và không dựa vào `manifest.json`:

```python
import gzip
import io
import json
import os
import sqlite3
import tarfile

from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad

ROOT = "backup-image"
BLOBS = os.path.join(ROOT, "blobs", "sha256")


def blob(digest):
    return open(os.path.join(BLOBS, digest.split(":", 1)[1]), "rb").read()


def resolve(node):
    doc = json.loads(blob(node["digest"]))
    if "layers" in doc:
        return doc
    for child in doc.get("manifests", []):
        if child.get("platform", {}).get("os") == "unknown":
            continue
        return resolve(child)
    raise RuntimeError("không tìm thấy image manifest")


index = json.load(open(os.path.join(ROOT, "index.json"), encoding="utf-8"))
manifest = resolve(index["manifests"][0])

bootstrap = None
seed_bytes = None

for layer in manifest["layers"]:
    try:
        data = gzip.decompress(blob(layer["digest"]))
    except OSError:
        continue
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for name in tar.getnames():
            if name.endswith("bootstrap.json"):
                bootstrap = json.loads(tar.extractfile(name).read())
            elif name.endswith("docservice-seed.tar"):
                seed_bytes = tar.extractfile(name).read()

key = bytes.fromhex(bootstrap["encryption"]["key_hex"])

with tarfile.open(fileobj=io.BytesIO(seed_bytes)) as seed:
    db = sqlite3.connect(":memory:")
    db.deserialize(seed.extractfile("documents.db").read())

    title, path, iv_hex = db.execute(
        "SELECT title, export_path, iv_hex FROM documents WHERE id = 184"
    ).fetchone()

    ciphertext = seed.extractfile(path).read()

plaintext = unpad(
    AES.new(key, AES.MODE_CBC, bytes.fromhex(iv_hex)).decrypt(ciphertext),
    AES.block_size,
)
print(title)
print(plaintext.decode())
```

Có thể dùng `docker load`, `skopeo` hoặc `umoci` để mở image, nhưng với OCI layout đã có sẵn thì đọc thẳng blob rồi `gzip` + `tar` là cách ngắn nhất.

### Bước 8. Kiểm chứng bằng Docker (tuỳ chọn)

Muốn quan sát hành vi thật của service thì nạp image vào Docker. Thư mục `backup-image/` là OCI layout, không phải file tar, nên phải đóng gói trước:

```powershell
cd backup-image
tar -cf "$env:TEMP\backup-image.tar" .
docker load -i "$env:TEMP\backup-image.tar"
```

![Docker Desktop - image backup đã nạp thành công](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/backup/01-docker-images.png?raw=true)

Chạy bình thường:

```powershell
docker run -d --name backup-demo kangtheconq/backup:latest
docker logs backup-demo
docker exec backup-demo ls -la /srv/data /opt
```

Kết quả:

- `docker logs` in ra toàn bộ `audit.jsonl`.
- `/srv/data` chỉ còn `documents.db` và `exports/` (5 file `.enc`).
- `/opt` rỗng.
- Không còn `bootstrap.json`.

![Docker Desktop - log audit in ra khi container khởi động](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/backup/02-docker-logs.png?raw=true)

Đúng như phân tích ở Bước 2: `app.py` đã xoá cấu hình và seed tar ngay sau khi giải nén.

![Docker Desktop - /srv/data sau khi chạy, không còn bootstrap.json](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/backup/03-run-normal-srv-data.png?raw=true)

Nếu chỉ muốn thấy lại khoá mà không trích layer, ghi đè entrypoint để `app.py` không chạy:

```powershell
docker run -d --name backup-keep --entrypoint sh kangtheconq/backup:latest -c "sleep 3600"
docker exec backup-keep cat /srv/data/bootstrap.json
docker rm -f backup-keep
```

Lần này `/srv/data/bootstrap.json` và `/opt/docservice-seed.tar` vẫn còn, vì tiến trình xoá file chưa hề chạy. Cách này chỉ để kiểm chứng nhanh; lời giải chính vẫn là trích layer, vì nó không phụ thuộc vào việc có chạy được container hay không.

![Docker Desktop - bootstrap.json còn nguyên khi ghi đè entrypoint](https://github.com/chlorcale/chlorcale.github.io/blob/main/writeups/images/backup/04-bypass-bootstrap.png?raw=true)

> **Bài học:** xoá file trong container không xoá file khỏi layer đã build. Bất kỳ image hay bản backup nào còn giữ layer cũ đều có thể bị khôi phục dữ liệu tưởng như "đã xoá", kể cả khoá mã hoá.

## Flag

`BKISC{w4it_d0ck3r_is_n0t_th4t_h4rd_r1ght_?}`
