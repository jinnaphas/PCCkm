/*
 * Paradigm Library — SPA หลัก
 * routing (hash), ค้นหา, แสดงผล, อัพโหลด/อัพเดตเอกสาร
 */

const SESSION_KEY = 'pcckm.session';
const MAX_FILE_MB = 50; // GitHub Contents API รองรับสูงสุด ~100MB — เตือนก่อนที่ 50MB

const state = {
  library: { categories: [], documents: [] },
  session: null, // { name, token, githubLogin }
  loaded: false,
  loadError: null,
};

/* ---------- ประเภทไฟล์ ---------- */

const FILE_KINDS = {
  pdf: { kinds: ['pdf'], icon: '📄', label: 'PDF' },
  image: { kinds: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'], icon: '🖼️', label: 'รูปภาพ' },
  video: { kinds: ['mp4', 'webm', 'mov', 'm4v'], icon: '🎬', label: 'วิดีโอ' },
  audio: { kinds: ['mp3', 'wav', 'm4a', 'ogg'], icon: '🎧', label: 'เสียง' },
  md: { kinds: ['md', 'markdown', 'txt'], icon: '📝', label: 'เอกสารข้อความ' },
  word: { kinds: ['doc', 'docx'], icon: '📃', label: 'Word' },
  excel: { kinds: ['xls', 'xlsx', 'csv'], icon: '📊', label: 'Excel' },
  ppt: { kinds: ['ppt', 'pptx'], icon: '📽️', label: 'PowerPoint' },
  archive: { kinds: ['zip', 'rar', '7z'], icon: '🗜️', label: 'ไฟล์บีบอัด' },
};

function fileKind(nameOrExt) {
  const ext = String(nameOrExt).split('.').pop().toLowerCase();
  for (const [kind, def] of Object.entries(FILE_KINDS)) {
    if (def.kinds.includes(ext)) return { kind, ...def };
  }
  return { kind: 'other', icon: '📁', label: ext.toUpperCase() };
}

function docIcon(doc) {
  if (doc.externalUrl) return '🔗';
  return fileKind(doc.file?.name || '').icon;
}

/* ---------- utilities ---------- */

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return iso; }
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function slugify(text) {
  const s = String(text).toLowerCase().trim()
    .replace(/[^a-z0-9ก-๙]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'doc';
}

function sanitizeFileName(name) {
  return String(name).replace(/[^A-Za-z0-9ก-๙._-]+/g, '_');
}

function uniqueDocId(title) {
  const base = slugify(title);
  const existing = new Set(state.library.documents.map((d) => d.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function categoryById(id) {
  return state.library.categories.find((c) => c.id === id);
}

/* หมวดหมู่รองรับ 2 ระดับ: หมวดหลัก (parentId = null) และหมวดย่อย */
function topLevelCategories() {
  return state.library.categories.filter((c) => !c.parentId);
}

function childrenOf(id) {
  return state.library.categories.filter((c) => c.parentId === id);
}

function descendantIds(id) {
  const ids = [id];
  for (const child of childrenOf(id)) ids.push(...descendantIds(child.id));
  return ids;
}

function docCountDeep(id) {
  const ids = new Set(descendantIds(id));
  return state.library.documents.filter((d) => ids.has(d.categoryId)).length;
}

function docById(id) {
  return state.library.documents.find((d) => d.id === id);
}

/* ---------- session ---------- */

function loadSession() {
  try {
    state.session = JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch (_) { state.session = null; }
}

function saveSession(session) {
  state.session = session;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  renderHeader();
}

/* ---------- ค้นหา ---------- */

function searchDocuments(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const results = [];
  for (const doc of state.library.documents) {
    const title = doc.title.toLowerCase();
    const desc = (doc.description || '').toLowerCase();
    const tags = (doc.tags || []).map((t) => t.toLowerCase());
    const catName = (categoryById(doc.categoryId)?.name || '').toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      let matched = false;
      if (title.includes(term)) { score += title.startsWith(term) ? 12 : 8; matched = true; }
      if (tags.some((t) => t === term)) { score += 10; matched = true; }
      else if (tags.some((t) => t.includes(term))) { score += 6; matched = true; }
      if (desc.includes(term)) { score += 3; matched = true; }
      if (catName.includes(term)) { score += 2; matched = true; }
      if (!matched) { matchedAll = false; break; }
    }
    if (matchedAll && score > 0) results.push({ doc, score });
  }
  return results.sort((a, b) => b.score - a.score).map((r) => r.doc);
}

/* ---------- router ---------- */

function parseRoute() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [page, ...rest] = hash.split('/');
  return { page: page || 'home', param: rest.join('/') };
}

function navigate(hash) {
  location.hash = hash;
}

function render() {
  renderSidebar();
  closeSidebar();
  const app = document.getElementById('app');
  if (state.loadError) {
    app.innerHTML = `<div class="empty-state">⚠️ ${escapeHtml(state.loadError)}</div>`;
    return;
  }
  if (!state.loaded) {
    app.innerHTML = '<div class="empty-state">กำลังโหลดคลังเอกสาร…</div>';
    return;
  }
  const { page, param } = parseRoute();
  if (page === 'category' && param) renderCategory(app, param);
  else if (page === 'doc' && param) renderDoc(app, param);
  else if (page === 'search') renderSearchPage(app, param);
  else renderHome(app);
  window.scrollTo(0, 0);
}

/* ---------- sidebar ---------- */

const expandedCats = new Set();

function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const { page, param } = parseRoute();
  const activeCatId = page === 'category' ? param
    : (page === 'doc' ? docById(param)?.categoryId : null);
  if (activeCatId) {
    const active = categoryById(activeCatId);
    if (active?.parentId) expandedCats.add(active.parentId);
    else if (childrenOf(activeCatId).length) expandedCats.add(activeCatId);
  }

  const groups = topLevelCategories().map((cat) => {
    const kids = childrenOf(cat.id);
    const open = expandedCats.has(cat.id);
    return `
      <div class="side-group">
        <div class="side-item ${activeCatId === cat.id ? 'active' : ''}">
          <a class="side-link" href="#/category/${encodeURIComponent(cat.id)}">
            <span class="side-icon">${escapeHtml(cat.icon || '📁')}</span>
            <span class="side-name">${escapeHtml(cat.name)}</span>
          </a>
          <span class="side-count">${docCountDeep(cat.id)}</span>
          ${kids.length ? `<button class="side-caret ${open ? 'open' : ''}" data-cat="${escapeHtml(cat.id)}" aria-label="ขยาย/ย่อหมวดย่อย">▸</button>` : ''}
        </div>
        ${kids.length && open ? `<div class="side-children">
          ${kids.map((k) => `
            <div class="side-item side-sub ${activeCatId === k.id ? 'active' : ''}">
              <a class="side-link" href="#/category/${encodeURIComponent(k.id)}">
                <span class="side-icon">${escapeHtml(k.icon || '·')}</span>
                <span class="side-name">${escapeHtml(k.name)}</span>
              </a>
              <span class="side-count">${docCountDeep(k.id)}</span>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  }).join('');

  nav.innerHTML = `
    <div class="side-item side-home ${page === 'home' ? 'active' : ''}">
      <a class="side-link" href="#/"><span class="side-icon">🏠</span><span class="side-name">หน้าแรก</span></a>
    </div>
    <div class="side-label">หมวดหมู่</div>
    ${groups || '<div class="side-empty">ยังไม่มีหมวดหมู่</div>'}`;

  nav.querySelectorAll('.side-caret').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.cat;
      if (expandedCats.has(id)) expandedCats.delete(id);
      else expandedCats.add(id);
      renderSidebar();
    };
  });
}

function openSidebar() { document.body.classList.add('sidebar-open'); }
function closeSidebar() { document.body.classList.remove('sidebar-open'); }

/* ---------- views ---------- */

function docCard(doc) {
  const cat = categoryById(doc.categoryId);
  const tags = (doc.tags || []).slice(0, 4).map((t) =>
    `<span class="tag">${escapeHtml(t)}</span>`).join('');
  return `
    <a class="doc-card" href="#/doc/${encodeURIComponent(doc.id)}">
      <div class="doc-card-icon">${docIcon(doc)}</div>
      <div class="doc-card-body">
        <div class="doc-card-title">${escapeHtml(doc.title)}</div>
        <div class="doc-card-desc">${escapeHtml(doc.description || '')}</div>
        <div class="doc-card-meta">
          ${cat ? `<span class="doc-card-cat">${escapeHtml(cat.icon)} ${escapeHtml(cat.name)}</span>` : ''}
          <span>v${doc.version}</span>
          <span>${formatDate(doc.updatedAt)}</span>
        </div>
        <div class="doc-card-tags">${tags}</div>
      </div>
    </a>`;
}

function renderHome(app) {
  const cats = topLevelCategories().map((cat) => {
    const kids = childrenOf(cat.id);
    return `
      <a class="cat-card" href="#/category/${encodeURIComponent(cat.id)}">
        <div class="cat-card-icon">${escapeHtml(cat.icon || '📁')}</div>
        <div class="cat-card-name">${escapeHtml(cat.name)}</div>
        <div class="cat-card-desc">${escapeHtml(cat.description || '')}</div>
        <div class="cat-card-count">${docCountDeep(cat.id)} เอกสาร${kids.length ? ` · ${kids.length} หมวดย่อย` : ''}</div>
      </a>`;
  }).join('');

  const recent = [...state.library.documents]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 6);

  app.innerHTML = `
    <section class="hero">
      <h1>📚 Paradigm Library</h1>
      <p>คลังองค์ความรู้ของทีม — ค้นหา เปิดดู และแบ่งปัน Paradigm ได้ในที่เดียว</p>
    </section>
    <section>
      <div class="section-head"><h2>หมวดหมู่</h2></div>
      <div class="cat-grid">${cats || '<div class="empty-state">ยังไม่มีหมวดหมู่</div>'}</div>
    </section>
    <section>
      <div class="section-head"><h2>อัพเดตล่าสุด</h2></div>
      <div class="doc-list">${recent.map(docCard).join('') || '<div class="empty-state">ยังไม่มีเอกสาร</div>'}</div>
    </section>`;
}

function renderCategory(app, catId) {
  const cat = categoryById(catId);
  if (!cat) { app.innerHTML = '<div class="empty-state">ไม่พบหมวดหมู่นี้</div>'; return; }
  const parent = cat.parentId ? categoryById(cat.parentId) : null;
  const kids = childrenOf(catId);
  const ids = new Set(descendantIds(catId));
  const docs = state.library.documents
    .filter((d) => ids.has(d.categoryId))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const allTags = [...new Set(docs.flatMap((d) => d.tags || []))];

  app.innerHTML = `
    <nav class="breadcrumb">
      <a href="#/">หน้าแรก</a> ›
      ${parent ? `<a href="#/category/${encodeURIComponent(parent.id)}">${escapeHtml(parent.name)}</a> ›` : ''}
      ${escapeHtml(cat.name)}
    </nav>
    <section class="hero hero-sm">
      <h1>${escapeHtml(cat.icon || '📁')} ${escapeHtml(cat.name)}</h1>
      <p>${escapeHtml(cat.description || '')}</p>
    </section>
    ${kids.length ? `<div class="subcat-row">
      ${kids.map((k) => `
        <a class="subcat-chip" href="#/category/${encodeURIComponent(k.id)}">
          ${escapeHtml(k.icon || '📁')} ${escapeHtml(k.name)} <span class="side-count">${docCountDeep(k.id)}</span>
        </a>`).join('')}
    </div>` : ''}
    ${allTags.length ? `<div class="tag-filter" id="tag-filter">
      ${allTags.map((t) => `<button class="tag tag-btn" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
    </div>` : ''}
    <div class="doc-list" id="cat-doc-list">
      ${docs.map(docCard).join('') || '<div class="empty-state">ยังไม่มีเอกสารในหมวดนี้ — กด "+ เพิ่มเอกสาร" เพื่อเริ่มต้น</div>'}
    </div>`;

  const active = new Set();
  const filterEl = document.getElementById('tag-filter');
  if (filterEl) {
    filterEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-btn');
      if (!btn) return;
      const tag = btn.dataset.tag;
      if (active.has(tag)) { active.delete(tag); btn.classList.remove('active'); }
      else { active.add(tag); btn.classList.add('active'); }
      const filtered = active.size
        ? docs.filter((d) => [...active].every((t) => (d.tags || []).includes(t)))
        : docs;
      document.getElementById('cat-doc-list').innerHTML =
        filtered.map(docCard).join('') || '<div class="empty-state">ไม่มีเอกสารที่ตรงกับ Tag ที่เลือก</div>';
    });
  }
}

function renderSearchPage(app, query) {
  const q = query || '';
  const results = searchDocuments(q);
  app.innerHTML = `
    <nav class="breadcrumb"><a href="#/">หน้าแรก</a> › ค้นหา</nav>
    <section class="hero hero-sm">
      <h1>🔍 ผลการค้นหา “${escapeHtml(q)}”</h1>
      <p>พบ ${results.length} รายการ</p>
    </section>
    <div class="doc-list">
      ${results.map(docCard).join('') || '<div class="empty-state">ไม่พบเอกสารที่ตรงกับคำค้นหา ลองใช้คำอื่น หรือค้นจาก Tag</div>'}
    </div>`;
}

function renderDoc(app, docId) {
  const doc = docById(docId);
  if (!doc) { app.innerHTML = '<div class="empty-state">ไม่พบเอกสารนี้</div>'; return; }
  const cat = categoryById(doc.categoryId);
  const tags = (doc.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const history = [...(doc.history || [])].sort((a, b) => b.version - a.version);

  app.innerHTML = `
    <nav class="breadcrumb">
      <a href="#/">หน้าแรก</a> ›
      ${cat?.parentId ? `<a href="#/category/${encodeURIComponent(cat.parentId)}">${escapeHtml(categoryById(cat.parentId)?.name || '')}</a> ›` : ''}
      ${cat ? `<a href="#/category/${encodeURIComponent(cat.id)}">${escapeHtml(cat.name)}</a> ›` : ''}
      ${escapeHtml(doc.title)}
    </nav>
    <article class="doc-detail">
      <header class="doc-detail-head">
        <div class="doc-detail-icon">${docIcon(doc)}</div>
        <div class="doc-detail-titles">
          <h1>${escapeHtml(doc.title)}</h1>
          <div class="doc-card-meta">
            <span>เวอร์ชัน ${doc.version}</span>
            <span>อัพเดตล่าสุด ${formatDate(doc.updatedAt)} โดย ${escapeHtml(doc.updatedBy || '-')}</span>
          </div>
          <div class="doc-card-tags">${tags}</div>
        </div>
        <div class="doc-detail-actions">
          ${doc.externalUrl
            ? `<a class="btn btn-primary" href="${escapeHtml(doc.externalUrl)}" target="_blank" rel="noopener">เปิดลิงก์ ↗</a>`
            : `<a class="btn btn-primary" href="${GitHub.fileUrl(doc.file.path)}" download="${escapeHtml(doc.file.name)}">⬇ ดาวน์โหลด</a>`}
          <button class="btn" id="btn-update-doc">อัพเดตเวอร์ชัน / แก้ไข</button>
          <button class="btn btn-danger-ghost" id="btn-delete-doc">ลบ</button>
        </div>
      </header>
      <p class="doc-detail-desc">${escapeHtml(doc.description || '')}</p>
      <div class="preview" id="preview-area"></div>
      <section class="history">
        <h2>ประวัติเวอร์ชัน</h2>
        <table class="history-table">
          <thead><tr><th>เวอร์ชัน</th><th>ไฟล์</th><th>วันที่</th><th>โดย</th><th>บันทึก</th></tr></thead>
          <tbody>
            ${history.map((h) => `
              <tr>
                <td>v${h.version}</td>
                <td>${h.path
                  ? `<a href="${GitHub.fileUrl(h.path)}" target="_blank" rel="noopener">${escapeHtml(h.name || h.path.split('/').pop())}</a>`
                  : (h.externalUrl ? `<a href="${escapeHtml(h.externalUrl)}" target="_blank" rel="noopener">ลิงก์ภายนอก ↗</a>` : '-')}</td>
                <td>${formatDate(h.updatedAt)}</td>
                <td>${escapeHtml(h.updatedBy || '-')}</td>
                <td>${escapeHtml(h.note || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </section>
    </article>`;

  renderPreview(doc);
  document.getElementById('btn-update-doc').onclick = () => requireLogin(() => openDocModal(doc));
  document.getElementById('btn-delete-doc').onclick = () => requireLogin(() => deleteDocument(doc));
}

async function renderPreview(doc) {
  const area = document.getElementById('preview-area');
  if (!area) return;
  if (doc.externalUrl) {
    const yt = youtubeEmbedUrl(doc.externalUrl);
    area.innerHTML = yt
      ? `<iframe class="preview-frame" src="${escapeHtml(yt)}" allowfullscreen></iframe>`
      : `<div class="preview-fallback">🔗 เอกสารนี้เป็นลิงก์ภายนอก — <a href="${escapeHtml(doc.externalUrl)}" target="_blank" rel="noopener">เปิดดูที่นี่ ↗</a></div>`;
    return;
  }
  const url = GitHub.fileUrl(doc.file.path);
  const { kind } = fileKind(doc.file.name);
  if (kind === 'pdf') {
    area.innerHTML = `<embed class="preview-frame" src="${url}" type="application/pdf" />`;
  } else if (kind === 'image') {
    area.innerHTML = `<img class="preview-img" src="${url}" alt="${escapeHtml(doc.title)}" />`;
  } else if (kind === 'video') {
    area.innerHTML = `<video class="preview-frame" src="${url}" controls></video>`;
  } else if (kind === 'audio') {
    area.innerHTML = `<audio src="${url}" controls style="width:100%"></audio>`;
  } else if (kind === 'md') {
    area.innerHTML = '<div class="preview-md">กำลังโหลด…</div>';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      area.innerHTML = `<div class="preview-md">${renderMarkdown(await res.text())}</div>`;
    } catch (_) {
      area.innerHTML = '<div class="preview-fallback">เปิดตัวอย่างไม่สำเร็จ — ใช้ปุ่มดาวน์โหลดแทน</div>';
    }
  } else {
    const { icon, label } = fileKind(doc.file.name);
    area.innerHTML = `<div class="preview-fallback">${icon} ไฟล์ ${escapeHtml(label)} ยังไม่รองรับการแสดงตัวอย่างในหน้าเว็บ — ใช้ปุ่มดาวน์โหลดเพื่อเปิดดู (${formatSize(doc.file.size)})</div>`;
  }
}

function youtubeEmbedUrl(url) {
  const m = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/* Markdown renderer ขนาดเล็ก (heading, bold/italic, list, link, code) */
function renderMarkdown(md) {
  const lines = escapeHtml(md).split('\n');
  const out = [];
  let inList = false;
  let inCode = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      closeList();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(raw); continue; }
    let line = raw
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { closeList(); out.push(`<h${h[1].length + 1}>${h[2]}</h${h[1].length + 1}>`); continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) { closeList(); out.push(`<blockquote>${line.replace(/^\s*>\s?/, '')}</blockquote>`); continue; }
    if (/^\s*---+\s*$/.test(line)) { closeList(); out.push('<hr>'); continue; }
    closeList();
    out.push(line.trim() ? `<p>${line}</p>` : '');
  }
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

/* ---------- header / search box ---------- */

function renderHeader() {
  const authEl = document.getElementById('auth-area');
  if (state.session) {
    authEl.innerHTML = `
      <span class="user-chip" title="เข้าสู่ระบบผ่าน GitHub: ${escapeHtml(state.session.githubLogin || '')}">👤 ${escapeHtml(state.session.name)}</span>
      <button class="btn btn-ghost" id="btn-logout">ออก</button>`;
    document.getElementById('btn-logout').onclick = () => { saveSession(null); toast('ออกจากระบบแล้ว'); };
  } else {
    authEl.innerHTML = '<button class="btn btn-ghost" id="btn-login">เข้าสู่ระบบ</button>';
    document.getElementById('btn-login').onclick = () => openLoginModal();
  }
}

function bindSearchBox() {
  const input = document.getElementById('search-input');
  const dropdown = document.getElementById('search-dropdown');

  const close = () => { dropdown.classList.remove('open'); };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { close(); return; }
    const results = searchDocuments(q).slice(0, 8);
    dropdown.innerHTML = results.length
      ? results.map((d) => {
          const cat = categoryById(d.categoryId);
          return `<a class="search-item" href="#/doc/${encodeURIComponent(d.id)}">
            <span>${docIcon(d)}</span>
            <span class="search-item-text">
              <span class="search-item-title">${escapeHtml(d.title)}</span>
              <span class="search-item-cat">${escapeHtml(cat?.name || '')}</span>
            </span></a>`;
        }).join('') + `<a class="search-item search-item-all" href="#/search/${encodeURIComponent(q)}">ดูผลการค้นหาทั้งหมด →</a>`
      : '<div class="search-item search-item-empty">ไม่พบเอกสารที่ตรงกับคำค้นหา</div>';
    dropdown.classList.add('open');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      navigate(`#/search/${encodeURIComponent(input.value.trim())}`);
      close();
      input.blur();
    }
    if (e.key === 'Escape') close();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) close();
  });
  dropdown.addEventListener('click', close);

  // กด "/" ที่ไหนก็ได้เพื่อโฟกัสช่องค้นหา
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select')) {
      e.preventDefault();
      input.focus();
    }
  });
}

/* ---------- modals ---------- */

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  return root.querySelector('.modal');
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function requireLogin(next) {
  if (state.session?.token) next();
  else openLoginModal(next);
}

function openLoginModal(next) {
  const modal = openModal(`
    <h2>เข้าสู่ระบบ</h2>
    <p class="modal-hint">ใช้สำหรับอัพโหลดและแก้ไขเอกสาร — ต้องมี GitHub Token ที่มีสิทธิ์เขียน repo นี้ (ดูวิธีสร้างใน README หรือขอจากผู้ดูแล)</p>
    <form id="login-form">
      <label>ชื่อที่แสดง<input name="name" required placeholder="เช่น จินณพัส" /></label>
      <label>GitHub Token<input name="token" type="password" required placeholder="github_pat_… หรือ ghp_…" /></label>
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">เข้าสู่ระบบ</button>
      </div>
    </form>`);
  modal.querySelector('#btn-cancel').onclick = closeModal;
  modal.querySelector('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const token = form.get('token').trim();
    const submitBtn = e.target.querySelector('[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังตรวจสอบ…';
    try {
      const user = await GitHub.verifyToken(token);
      saveSession({ name: form.get('name').trim(), token, githubLogin: user.login });
      closeModal();
      toast(`เข้าสู่ระบบแล้ว (${user.login})`);
      await reloadLibrary();
      if (next) next();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'เข้าสู่ระบบ';
      toast(err.message, true);
    }
  };
}

function openCategoryModal() {
  const parentOptions = topLevelCategories().map((c) =>
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
  const modal = openModal(`
    <h2>เพิ่มหมวดหมู่ใหม่</h2>
    <form id="cat-form">
      <label>ชื่อหมวดหมู่<input name="name" required placeholder="เช่น งานสำรวจ" /></label>
      <label>อยู่ภายใต้หมวด
        <select name="parentId">
          <option value="">— เป็นหมวดหลัก —</option>
          ${parentOptions}
        </select>
      </label>
      <label>คำอธิบาย<input name="description" placeholder="อธิบายสั้นๆ ว่าหมวดนี้เก็บอะไร" /></label>
      <label>ไอคอน (อีโมจิ 1 ตัว)<input name="icon" placeholder="📁" maxlength="4" /></label>
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>`);
  modal.querySelector('#btn-cancel').onclick = closeModal;
  modal.querySelector('#cat-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = form.get('name').trim();
    const id = uniqueCategoryId(name);
    await withBusy(e.target, async () => {
      state.library = await GitHub.updateLibrary((lib) => {
        lib.categories.push({
          id,
          name,
          description: form.get('description').trim(),
          icon: form.get('icon').trim() || '📁',
          parentId: form.get('parentId') || null,
        });
      }, `เพิ่มหมวดหมู่: ${name}`, state.session.token);
      closeModal();
      toast('เพิ่มหมวดหมู่แล้ว');
      render();
    });
  };
}

function uniqueCategoryId(name) {
  const base = slugify(name);
  const existing = new Set(state.library.categories.map((c) => c.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/*
 * Modal เพิ่ม/แก้ไขเอกสาร — doc = undefined คือสร้างใหม่
 */
function openDocModal(doc) {
  const isEdit = !!doc;
  // เรียงหมวดหลักตามด้วยหมวดย่อย (เยื้องขวา) ให้เลือกเก็บเอกสารได้ทั้งสองระดับ
  const cats = topLevelCategories().flatMap((top) => [
    `<option value="${escapeHtml(top.id)}" ${doc?.categoryId === top.id ? 'selected' : ''}>${escapeHtml(top.icon)} ${escapeHtml(top.name)}</option>`,
    ...childrenOf(top.id).map((k) =>
      `<option value="${escapeHtml(k.id)}" ${doc?.categoryId === k.id ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;— ${escapeHtml(k.name)}</option>`),
  ]).join('');
  const sourceIsLink = isEdit && !!doc.externalUrl;

  const modal = openModal(`
    <h2>${isEdit ? 'อัพเดตเอกสาร' : 'เพิ่มเอกสารใหม่'}</h2>
    <form id="doc-form">
      <label>ชื่อเอกสาร<input name="title" required value="${escapeHtml(doc?.title || '')}" placeholder="ชื่อที่ใช้ค้นหาและแสดงผล" /></label>
      <label>คำอธิบาย<textarea name="description" rows="3" placeholder="สรุปว่าเอกสารนี้คืออะไร ใช้เมื่อไหร่">${escapeHtml(doc?.description || '')}</textarea></label>
      <div class="form-row">
        <label>หมวดหมู่<select name="categoryId" required>${cats}</select></label>
        <label>Tag (คั่นด้วย ,)<input name="tags" value="${escapeHtml((doc?.tags || []).join(', '))}" placeholder="เช่น SOP, โครงการ A" /></label>
      </div>
      <label>แหล่งเอกสาร
        <select name="sourceType" id="source-type">
          <option value="file" ${!sourceIsLink ? 'selected' : ''}>อัพโหลดไฟล์</option>
          <option value="link" ${sourceIsLink ? 'selected' : ''}>ลิงก์ภายนอก (YouTube, Drive ฯลฯ)</option>
        </select>
      </label>
      <label id="file-field" ${sourceIsLink ? 'hidden' : ''}>ไฟล์ ${isEdit ? '(เว้นว่างไว้ถ้าแก้เฉพาะข้อมูล ไม่เปลี่ยนไฟล์)' : ''}
        <input name="file" type="file" ${isEdit || sourceIsLink ? '' : 'required'} />
        <span class="modal-hint">ขนาดแนะนำไม่เกิน ${MAX_FILE_MB}MB — วิดีโอใหญ่ให้ใช้ลิงก์ภายนอกแทน</span>
      </label>
      <label id="link-field" ${sourceIsLink ? '' : 'hidden'}>URL<input name="externalUrl" type="url" value="${escapeHtml(doc?.externalUrl || '')}" placeholder="https://…" /></label>
      ${isEdit ? '<label>บันทึกการแก้ไข<input name="note" placeholder="เช่น ปรับขั้นตอนที่ 3 ตามมาตรฐานใหม่" /></label>' : ''}
      <div class="modal-actions">
        <button type="button" class="btn" id="btn-cancel">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'บันทึกการอัพเดต' : 'เพิ่มเอกสาร'}</button>
      </div>
    </form>`);

  const sourceSel = modal.querySelector('#source-type');
  sourceSel.onchange = () => {
    const isLink = sourceSel.value === 'link';
    modal.querySelector('#file-field').hidden = isLink;
    modal.querySelector('#link-field').hidden = !isLink;
  };
  modal.querySelector('#btn-cancel').onclick = closeModal;
  modal.querySelector('#doc-form').onsubmit = (e) => {
    e.preventDefault();
    saveDocument(e.target, doc);
  };
}

async function saveDocument(formEl, existingDoc) {
  const form = new FormData(formEl);
  const title = form.get('title').trim();
  const sourceType = form.get('sourceType');
  const file = form.get('file');
  const hasNewFile = sourceType === 'file' && file && file.size > 0;

  if (hasNewFile && file.size > MAX_FILE_MB * 1024 * 1024) {
    const goOn = confirm(`ไฟล์ขนาด ${formatSize(file.size)} ใหญ่กว่าที่แนะนำ (${MAX_FILE_MB}MB) การอัพโหลดอาจช้าหรือล้มเหลว ต้องการดำเนินการต่อไหม?`);
    if (!goOn) return;
  }
  if (sourceType === 'link' && !form.get('externalUrl').trim()) {
    toast('กรุณาใส่ URL ของเอกสาร', true);
    return;
  }
  if (!existingDoc && sourceType === 'file' && !hasNewFile) {
    toast('กรุณาเลือกไฟล์', true);
    return;
  }

  await withBusy(formEl, async () => {
    const { token, name: userName } = state.session;
    const now = new Date().toISOString();
    const docId = existingDoc ? existingDoc.id : uniqueDocId(title);
    const newVersion = existingDoc ? existingDoc.version + 1 : 1;
    const categoryId = form.get('categoryId');
    const tags = form.get('tags').split(',').map((t) => t.trim()).filter(Boolean);
    const note = (form.get('note') || '').trim() || (existingDoc ? 'อัพเดตข้อมูล' : 'เวอร์ชันแรก');

    // 1) อัพโหลดไฟล์ (ถ้ามีไฟล์ใหม่) — เก็บแยกตามเวอร์ชัน เพื่อย้อนดูของเก่าได้
    let fileMeta = existingDoc?.file || null;
    let externalUrl = null;
    if (sourceType === 'link') {
      externalUrl = form.get('externalUrl').trim();
      if (hasNewFile === false) fileMeta = null;
    } else if (hasNewFile) {
      const safeName = sanitizeFileName(file.name);
      const path = `assets/${categoryId}/${docId}/v${newVersion}-${safeName}`;
      toast('กำลังอัพโหลดไฟล์…');
      const base64 = await fileToBase64(file);
      await GitHub.putFile(path, base64, `อัพโหลดไฟล์: ${title} (v${newVersion})`, token);
      fileMeta = { path, name: file.name, type: file.name.split('.').pop().toLowerCase(), size: file.size };
    }

    // 2) อัพเดต catalog (อ่าน sha สดก่อนเขียนเสมอ)
    const changedSource = hasNewFile || sourceType === 'link';
    state.library = await GitHub.updateLibrary((lib) => {
      const historyEntry = {
        version: newVersion,
        path: externalUrl ? null : fileMeta?.path || null,
        name: externalUrl ? null : fileMeta?.name || null,
        externalUrl,
        updatedAt: now,
        updatedBy: userName,
        note,
      };
      if (existingDoc) {
        const target = lib.documents.find((d) => d.id === docId);
        if (!target) throw new Error('ไม่พบเอกสารนี้ในคลัง (อาจถูกลบไปแล้ว)');
        Object.assign(target, {
          title,
          description: form.get('description').trim(),
          categoryId,
          tags,
          updatedAt: now,
          updatedBy: userName,
        });
        if (changedSource) {
          target.version = newVersion;
          target.file = externalUrl ? null : fileMeta;
          target.externalUrl = externalUrl;
          target.history = [...(target.history || []), historyEntry];
        }
      } else {
        lib.documents.push({
          id: docId,
          title,
          description: form.get('description').trim(),
          categoryId,
          tags,
          file: externalUrl ? null : fileMeta,
          externalUrl,
          version: 1,
          createdAt: now,
          createdBy: userName,
          updatedAt: now,
          updatedBy: userName,
          history: [historyEntry],
        });
      }
    }, existingDoc ? `อัพเดตเอกสาร: ${title} (v${newVersion})` : `เพิ่มเอกสาร: ${title}`, token);

    closeModal();
    toast(existingDoc ? 'อัพเดตเอกสารเรียบร้อย' : 'เพิ่มเอกสารเรียบร้อย');
    navigate(`#/doc/${encodeURIComponent(docId)}`);
    render();
  });
}

async function deleteDocument(doc) {
  if (!confirm(`ลบ “${doc.title}” ออกจากคลัง?\n\n(รายการจะหายจากหน้าเว็บ แต่ไฟล์และประวัติยังอยู่ใน git history ของ repo กู้คืนได้โดยผู้ดูแล)`)) return;
  try {
    state.library = await GitHub.updateLibrary((lib) => {
      lib.documents = lib.documents.filter((d) => d.id !== doc.id);
    }, `ลบเอกสาร: ${doc.title}`, state.session.token);
    toast('ลบเอกสารแล้ว');
    navigate('#/');
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ปิดปุ่มระหว่างบันทึก + จัดการ error รวมทุกฟอร์ม */
async function withBusy(formEl, fn) {
  const btn = formEl.querySelector('[type=submit]');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก…';
  try {
    await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ---------- toast ---------- */

let toastTimer = null;
function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${isError ? 'toast-error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 6000 : 3000);
}

/* ---------- init ---------- */

async function reloadLibrary() {
  const { library } = await GitHub.loadLibrary(state.session?.token);
  state.library = library;
  state.loaded = true;
  state.loadError = null;
}

async function init() {
  loadSession();
  renderHeader();
  bindSearchBox();
  document.getElementById('btn-add-doc').onclick = () => requireLogin(() => openDocModal());
  document.getElementById('btn-add-category').onclick = () => requireLogin(openCategoryModal);
  document.getElementById('btn-sidebar-toggle').onclick = () => {
    document.body.classList.toggle('sidebar-open');
  };
  document.getElementById('sidebar-backdrop').onclick = closeSidebar;
  window.addEventListener('hashchange', render);
  render(); // แสดงสถานะกำลังโหลด
  try {
    await reloadLibrary();
  } catch (err) {
    // token อาจหมดสิทธิ์อ่าน — ลอง fallback อ่านแบบ static
    try {
      const { library } = await GitHub.loadLibrary(null);
      state.library = library;
      state.loaded = true;
    } catch (_) {
      state.loadError = `โหลดคลังเอกสารไม่สำเร็จ: ${err.message}`;
    }
  }
  render();
}

init();
