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
    { "id": "work-standards", "name": "มาตรฐานการทำงาน", "description": "…", "icon": "📘" }
  ],
  "documents": [
    {
      "id": "welcome-guide",
      "title": "…",
      "description": "…",
      "categoryId": "work-standards",
      "tags": ["คู่มือ"],
      "file": { "path": "assets/…/v1-….md", "name": "….md", "type": "md", "size": 1234 },
      "externalUrl": null,          // ใช้แทน file ได้ สำหรับลิงก์ YouTube/Drive
      "version": 1,
      "createdAt": "…", "createdBy": "…",
      "updatedAt": "…", "updatedBy": "…",
      "history": [ { "version": 1, "path": "…", "updatedAt": "…", "updatedBy": "…", "note": "…" } ]
    }
  ]
}
```

## ข้อจำกัดที่ควรรู้

- ไฟล์ต่อชิ้นควรไม่เกิน ~50MB (เพดานของ GitHub API คือ 100MB) — วิดีโอใหญ่ให้เพิ่มเป็น **ลิงก์ภายนอก** แทน
- ผู้เยี่ยมชม (ไม่ login) เห็นข้อมูลตามรอบ deploy ของ Pages (อัพเดตช้ากว่าจริง ~1 นาที) ส่วนคนที่ login จะเห็นข้อมูลสดจาก API เสมอ
- การ "ลบ" เอกสารเป็นการนำออกจาก catalog เท่านั้น ไฟล์ยังอยู่ใน git history กู้คืนได้

## รันดูในเครื่อง (สำหรับผู้พัฒนา)

```bash
python3 -m http.server 8000
# เปิด http://localhost:8000
```
