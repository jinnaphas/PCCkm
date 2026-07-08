/*
 * GitHub client — ทุกการอ่าน/เขียนข้อมูลของ Paradigm Library
 * เก็บลง repo GitHub โดยตรงผ่าน Contents API
 */

const GITHUB_CONFIG = {
  owner: 'jinnaphas',
  repo: 'PCCkm',
  branch: 'main',
};

const LIBRARY_PATH = 'data/library.json';

const GitHub = {
  apiBase() {
    const { owner, repo } = GITHUB_CONFIG;
    return `https://api.github.com/repos/${owner}/${repo}`;
  },

  headers(token) {
    const h = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  },

  async request(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${this.apiBase()}${path}`, {
      method,
      headers: this.headers(token),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = `GitHub API error (${res.status})`;
      try {
        const data = await res.json();
        if (data.message) message += `: ${data.message}`;
      } catch (_) { /* ไม่มี body */ }
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  },

  // ตรวจ token + ดึงชื่อผู้ใช้ ใช้ตอน login
  async verifyToken(token) {
    const res = await fetch('https://api.github.com/user', { headers: this.headers(token) });
    if (!res.ok) throw new Error('Token ไม่ถูกต้อง หรือหมดอายุ');
    return res.json();
  },

  // อ่านไฟล์จาก repo (คืน { content(base64), sha })
  async getFile(path, token) {
    const { branch } = GITHUB_CONFIG;
    return this.request(`/contents/${encodeURIComponent(path).replaceAll('%2F', '/')}?ref=${branch}`, { token });
  },

  // สร้าง/อัพเดตไฟล์ใน repo — content เป็น base64
  async putFile(path, base64Content, message, token, sha) {
    const { branch } = GITHUB_CONFIG;
    const body = { message, content: base64Content, branch };
    if (sha) body.sha = sha;
    return this.request(`/contents/${encodeURIComponent(path).replaceAll('%2F', '/')}`, {
      method: 'PUT',
      token,
      body,
    });
  },

  /*
   * โหลด catalog:
   * - ถ้ามี token → อ่านผ่าน API (ได้ข้อมูลสดเสมอ ไม่ต้องรอ Pages redeploy)
   * - ถ้าไม่มี → อ่านไฟล์ตรงจากเว็บ (โหมดผู้เยี่ยมชมบน GitHub Pages)
   */
  async loadLibrary(token) {
    if (token) {
      const data = await this.getFile(LIBRARY_PATH, token);
      const json = JSON.parse(decodeBase64Utf8(data.content));
      return { library: json, sha: data.sha };
    }
    const res = await fetch(`${LIBRARY_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('โหลดข้อมูลคลังเอกสารไม่สำเร็จ');
    return { library: await res.json(), sha: null };
  },

  /*
   * บันทึก catalog กลับเข้า repo
   * อ่าน sha ล่าสุดก่อนเขียนทุกครั้ง แล้วให้ mutate() แก้ข้อมูลบนของสดนั้น
   * เพื่อลดโอกาสเขียนทับกันเมื่อมีคนอัพโหลดพร้อมกัน
   */
  async updateLibrary(mutate, message, token) {
    const current = await this.getFile(LIBRARY_PATH, token);
    const library = JSON.parse(decodeBase64Utf8(current.content));
    mutate(library);
    const content = encodeBase64Utf8(JSON.stringify(library, null, 2) + '\n');
    await this.putFile(LIBRARY_PATH, content, message, token, current.sha);
    return library;
  },

  // URL สำหรับดาวน์โหลด/preview ไฟล์ asset (relative ใช้ได้ทั้ง Pages และเปิด local)
  fileUrl(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  },
};

/* base64 helpers ที่รองรับ UTF-8 (ภาษาไทย) */
function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* อ่านไฟล์จาก <input type="file"> เป็น base64 (ตัด data: prefix ออก) */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}
