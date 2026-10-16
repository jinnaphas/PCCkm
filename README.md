# 📚 Paradigm Library

Webapp สำหรับเก็บองค์ความรู้ (Paradigm) ของทีมเป็นหมวดหมู่ ค้นหาได้ด้วย Global Search
และอัพโหลด/อัพเดตเอกสารผ่าน Browser ได้โดยตรง — **ไม่ต้องมี server หรือ database**
ข้อมูลทั้งหมดเก็บอยู่ใน GitHub repository นี้

## สถาปัตยกรรม

| ส่วน | ทำงานอย่างไร |
|---|---|
| หน้าเว็บ | Static site (HTML/CSS/JS ล้วน ไม่มี build step) host บน GitHub Pages |
| ไฟล์เอกสาร | เก็บใน `assets/<หมวด>/<เอกสาร>/v<เวอร์ชัน>-<ชื่อไฟล์>` |
| Catalog (หมวดหมู่ + metadata) | ไฟล์เดียว: `data/library.json` |
| อัพโหลด/แก้ไขผ่านเว็บ | Browser เรียก GitHub Contents API โดยตรง → ทุกการแก้ไขคือ git commit |
| ค้นหา | ฝั่ง client ค้นจาก ชื่อ + Tag + คำอธิบาย ทันทีที่พิมพ์ |
| ประวัติเวอร์ชัน | ไฟล์แต่ละเวอร์ชันเก็บแยกกัน ย้อนดูเวอร์ชันเก่าได้จากหน้าเอกสาร |

## การติดตั้งครั้งแรก (ทำครั้งเดียว)

1. Merge โค้ดนี้เข้า branch `main`
2. ไปที่ **Settings → Pages** ของ repo แล้วตั้ง **Source = GitHub Actions**
3. รอ workflow `Deploy to GitHub Pages` ทำงานเสร็จ จะได้ URL เว็บ (เช่น `https://<owner>.github.io/PCCkm/`)

> **หมายเหตุ:** ถ้า repo เป็น private การใช้ GitHub Pages ต้องใช้แพลน GitHub Pro/Team ขึ้นไป
> ทางเลือกคือทำ repo เป็น public หรือให้ทุกคนเปิดเว็บแบบ login (อ่านผ่าน API) ก็ใช้งานได้เช่นกัน

## การสร้าง Token สำหรับอัพโหลดเอกสาร

สมาชิกทีมที่ต้องการ **เพิ่ม/แก้ไขเอกสาร** ต้องมี GitHub Token (ดูอย่างเดียวไม่ต้องใช้):

1. เข้า GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
2. Repository access: เลือกเฉพาะ repo นี้
3. Permissions: **Contents → Read and write** (แค่นี้พอ)
4. นำ Token ที่ได้ไปกรอกในปุ่ม **เข้าสู่ระบบ** บนหน้าเว็บ (กรอกครั้งเดียว จำไว้ในเครื่อง)

## โครงสร้างข้อมูล (`data/library.json`)

```jsonc
{
  "categories": [
    // หมวดหลัก: parentId = null, หมวดย่อย: parentId = id ของหมวดหลัก (รองรับหมวดย่อยหลายระดับ)
    { "id": "intellectual-capital", "name": "Intellectual Capital", "description": "…", "icon": "💡", "parentId": null },
    { "id": "ic-human-capital", "name": "Human Capital", "description": "…", "icon": "👥", "parentId": "intellectual-capital" }
  ],
  "documents": [
    {
      "id": "welcome-guide",
      "title": "…",
      "description": "…",
      "categoryId": "work-standards",
      "tags": ["คู่มือ"],
      // เอกสาร 1 รายการแนบได้หลายชิ้น — ผสมไฟล์อัพโหลดกับลิงก์ภายนอกได้
      "attachments": [
        { "kind": "file", "path": "assets/…/v1-….md", "name": "….md", "type": "md", "size": 1234 },
        { "kind": "link", "url": "https://youtube.com/…", "name": "วิดีโอสอนงาน" }
      ],
      "version": 1,
      "createdAt": "…", "createdBy": "…",
      "updatedAt": "…", "updatedBy": "…",
      "history": [ { "version": 1, "attachments": [ { "kind": "file", "path": "…", "name": "…" } ], "updatedAt": "…", "updatedBy": "…", "note": "…" } ]
      // เอกสารรูปแบบเก่า (file/externalUrl เดี่ยว) ถูกแปลงเป็น attachments อัตโนมัติตอนโหลด
    }
  ]
}
```

## Knowledge Management และการซิงก์กับ OneDrive

เอกสารใต้หมวด **Knowledge Management** (ฐานความรู้ Business Management) มีกติกาเพิ่มเติม:

- ต้องแนบไฟล์ **.md สำหรับ LLM** (เก็บเป็นไฟล์แนบที่มี `"role": "llm-md"` และแสดงเป็นปุ่ม "Markdown for LLM" ในหน้าเอกสาร)
- ต้องมี **Tag รหัสเอกสาร** `BM-<รหัสหมวด>-<ลำดับ 3 หลัก>` เช่น `BM-STR-004` — เป็นกุญแจจับคู่กับสารบัญ `00_INDEX.md/.csv` ใน OneDrive
- ชื่อไฟล์ต้องเหมือนฝั่ง OneDrive ทุกตัวอักษร

เครื่องมือ (ต้องมี Perl — ใช้ Git Bash บน Windows) อยู่ในโฟลเดอร์ `tools/`:

```bash
# ตรวจว่า OneDrive กับเว็บตรงกันทุกเอกสาร (exit 1 ถ้าพบความต่าง)
perl tools/check_sync.pl "/c/Users/<ชื่อผู้ใช้>/OneDrive - Precise Group/Business Management - Documents/Business Management"

# เพิ่มเอกสารใหม่จาก OneDrive ขึ้นเว็บ (ไม่ใส่ --apply = แสดงแผนเฉยๆ)
perl tools/sync_from_onedrive.pl "<โฟลเดอร์ OneDrive เดียวกัน>" --apply
```

ตารางจับคู่รหัสหมวดกับหมวดบนเว็บอยู่ใน `tools/check_sync.pl` และ `tools/sync_from_onedrive.pl` (ต้องแก้ทั้งสองไฟล์พร้อมกับ `00_INDEX.md` เมื่อเพิ่มหมวด) คู่มือฉบับเต็มอยู่ที่ OneDrive: `Business Management/Manual/BM_Folder_User_Guide_20261012.md`

## ข้อจำกัดที่ควรรู้

- ไฟล์ต่อชิ้นควรไม่เกิน ~50MB (เพดานของ GitHub API คือ 100MB) — วิดีโอใหญ่ให้เพิ่มเป็น **ลิงก์ภายนอก** แทน
- ผู้เยี่ยมชม (ไม่ login) เห็นข้อมูลตามรอบ deploy ของ Pages (อัพเดตช้ากว่าจริง ~1 นาที) ส่วนคนที่ login จะเห็นข้อมูลสดจาก API เสมอ
- การ "ลบ" เอกสารเป็นการนำออกจาก catalog เท่านั้น ไฟล์ยังอยู่ใน git history กู้คืนได้

## รันดูในเครื่อง (สำหรับผู้พัฒนา)

```bash
python3 -m http.server 8000
# เปิด http://localhost:8000
```
