const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS = {crypto:'Crypto', pwn:'Pwn', web:'Web', reverse:'Reverse', forensics:'Forensics', misc:'Misc'};
const catName = c => CATS[c] || c;
const fmtTime = s => { const m = /^\d{4}-(\d\d)-(\d\d) (\d\d:\d\d)/.exec(s||''); return m ? `${m[2]}/${m[1]} ${m[3]}` : (s||''); };
let DB = [];
const state = {q:'', cat:'all'};

async function load() {
  try {
    const r = await fetch('writeups/index.json', {cache:'no-store'});
    DB = await r.json();
  } catch (e) {
    app.innerHTML = '<p class="muted">Chưa có <code>writeups/index.json</code>. Chạy <code>python ctf.py build</code> rồi push lại.</p>';
    return;
  }
  route();
}

function route() {
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.v === (view === 'about' ? 'about' : 'home')));
  window.scrollTo(0, 0);
  document.title = 'chlorcale · CTF writeups';
  if (view === 'w') return renderPost(decodeURIComponent(arg || ''));
  if (view === 'about') return renderAbout();
  renderHome();
}

function renderHome() {
  const cats = Object.keys(CATS).filter(c => DB.some(w => w.category === c))
    .concat([...new Set(DB.map(w => w.category))].filter(c => !CATS[c]));
  const done = DB.filter(w => w.done).length, pts = DB.reduce((s, w) => s + (w.points || 0), 0);
  app.innerHTML = `
    <h1>Challenges</h1>
    <p class="lede">${DB.length} bài đã giải, ${pts} điểm. ${done} bài đã có writeup. Mở một bài để xem kỹ thuật dùng trong bài và cách giải.</p>
    <div class="tools"><input type="search" id="q" placeholder="Tìm theo tên bài…" value="${esc(state.q)}" aria-label="Tìm kiếm"></div>
    <div class="chips" id="chips">
      ${['all', ...cats].map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${state.cat===c}">${c==='all'?'Tất cả':esc(catName(c))}</button>`).join('')}
    </div>
    <div id="list"></div>`;
  document.getElementById('q').addEventListener('input', e => { state.q = e.target.value; drawList(); });
  document.getElementById('chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.cat = b.dataset.c;
    document.querySelectorAll('#chips .chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.c === state.cat));
    drawList();
  });
  drawList();
}

function row(w) {
  return `<a class="row" href="#/w/${encodeURIComponent(w.slug)}">
    <span class="t">${esc(w.title)}</span>
    <span class="pts">${esc(w.points)} đ</span>
    <span class="when">${esc(fmtTime(w.solved))}</span>
    <span class="st ${w.done ? 'ok' : 'todo'}">${w.done ? 'có writeup' : 'chưa viết'}</span>
  </a>`;
}

function drawList() {
  const q = state.q.trim().toLowerCase();
  const rows = DB.filter(w => (state.cat === 'all' || w.category === state.cat) && (!q || w.title.toLowerCase().includes(q)));
  const el = document.getElementById('list');
  if (!rows.length) { el.innerHTML = '<p class="muted">Không có bài nào khớp.</p>'; return; }
  const groups = {};
  rows.forEach(w => (groups[w.category] ??= []).push(w));
  el.innerHTML = Object.entries(groups).map(([c, ws]) =>
    `<section class="group"><h2>${esc(catName(c))} (${ws.length})</h2>${ws.map(row).join('')}</section>`).join('');
}

async function renderPost(slug) {
  const w = DB.find(x => x.slug === slug);
  if (!w) { app.innerHTML = '<p>Không tìm thấy bài này. <a href="#/">Về danh sách</a></p>'; return; }
  document.title = `${w.title} · chlorcale`;
  const head = `<a class="back" href="#/">← Tất cả challenge</a>
    <article><h1>${esc(w.title)}</h1>
    <div class="meta">${esc(catName(w.category))} · ${esc(w.points)} điểm · giải lúc ${esc(fmtTime(w.solved))}</div>`;
  if (!w.done) {
    app.innerHTML = head + `<p class="muted">Chưa có writeup cho bài này. Dán lời giải vào <code>writeups/${esc(w.slug)}.md</code> rồi chạy <code>python ctf.py build</code>.</p></article>`;
    return;
  }
  app.innerHTML = head + '<p class="muted">Đang tải…</p></article>';
  const r = await fetch(`writeups/${encodeURIComponent(w.slug)}.md`);
  const md = (await r.text()).replace(/^---[\s\S]*?\n---\s*\n?/, '');
  const techs = (w.techniques || []).length
    ? `<div class="techs"><span class="muted">Kỹ thuật:</span> ${w.techniques.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '';
  app.innerHTML = head + techs + `<div id="body">${marked.parse(md)}</div></article>`;
  document.querySelectorAll('#body pre code').forEach(b => hljs.highlightElement(b));
}

function renderAbout() {
  app.innerHTML = `<h1>Giới thiệu</h1>
    <article><p>Sổ tay writeup CTF của <a href="https://github.com/chlorcale">chlorcale</a>. Mỗi bài ghi lại đề, các kỹ thuật dùng trong bài và cách giải từng bước.</p>
    <p>Sửa nội dung này trong <code>app.js</code> (hàm <code>renderAbout</code>).</p></article>`;
}

window.addEventListener('hashchange', route);
load();
