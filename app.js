const app = document.getElementById('app');
const CATS = { crypto: 'Crypto', forensics: 'Forensics', pwn: 'Pwn', reverse: 'Reverse', web: 'Web', misc: 'Misc' };
const COLORS = { crypto: 'var(--cat-crypto)', forensics: 'var(--cat-forensics)', pwn: 'var(--cat-pwn)', reverse: 'var(--cat-reverse)', web: 'var(--cat-web)', misc: 'var(--cat-misc)' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const catName = c => CATS[c] || c;
const state = { q: '', cat: 'all' };
let DB = [];
const ASSET_VERSION = '20261028-9';
let markedPromise;
let resumeMusicOnReturn = false;
let currentTrack = 0;
const PLAYLIST = [
  { title: 'Thiệp Hồng Sai Tên', artist: 'Saxophone · Tạ Trung Đức', src: 'assets/thiep-hong-sai-ten-sax.mp3' },
  { title: 'Đớn Đau Vô Cùng', artist: 'DATKAA x MHI · Lofi Ver.', src: 'assets/don-dau-vo-cung-lofi.mp3' }
];
async function fetchFresh(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try { return await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${ASSET_VERSION}`, { cache: 'no-store', signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
function ensureMarked() {
  if (window.marked) return Promise.resolve();
  if (!markedPromise) markedPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js';
    script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
  });
  return markedPromise;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = document.getElementById('theme-toggle');
  if (button) { button.setAttribute('aria-label', `Đổi giao diện (hiện tại: ${theme === 'dark' ? 'tối' : 'sáng'})`); button.setAttribute('aria-pressed', String(theme === 'dark')); }
}
function initTheme() {
  let theme;
  try { theme = localStorage.getItem('theme'); } catch (_) { /* storage có thể bị tắt */ }
  applyTheme(theme === 'light' || theme === 'dark' ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next); try { localStorage.setItem('theme', next); } catch (_) { /* tiếp tục dùng giao diện trong phiên */ }
  });
}
function initMusic() {
  const audio = document.getElementById('site-track'), play = document.getElementById('music-toggle'), mute = document.getElementById('music-mute');
  const title = document.getElementById('music-title'), artist = document.getElementById('music-artist'), tracks = [...document.querySelectorAll('.track')];
  audio.volume = 0.28;
  function updateTrack() {
    title.textContent = PLAYLIST[currentTrack].title; artist.textContent = PLAYLIST[currentTrack].artist;
    tracks.forEach((button, i) => { button.classList.toggle('selected', i === currentTrack); button.setAttribute('aria-pressed', String(i === currentTrack)); });
  }
  function showPlayback() {
    const isPlaying = !audio.paused;
    play.setAttribute('aria-pressed', String(isPlaying)); play.setAttribute('aria-label', isPlaying ? 'Tạm dừng nhạc' : 'Phát nhạc');
    play.querySelector('span').textContent = isPlaying ? 'Tạm dừng' : 'Phát'; play.firstChild.textContent = isPlaying ? 'Ⅱ ' : '▶ ';
  }
  async function selectTrack(index, autoplay = !audio.paused) {
    resumeMusicOnReturn = false; audio.pause(); currentTrack = (index + PLAYLIST.length) % PLAYLIST.length;
    audio.src = PLAYLIST[currentTrack].src; audio.load(); updateTrack(); showPlayback();
    if (autoplay) { try { await audio.play(); } catch (_) { /* nút phát có thể thử lại */ } showPlayback(); }
  }
  audio.src = PLAYLIST[currentTrack].src; updateTrack();
  tracks.forEach((button, i) => button.addEventListener('click', () => selectTrack(i, true)));
  document.getElementById('music-prev').addEventListener('click', () => selectTrack(currentTrack - 1));
  document.getElementById('music-next').addEventListener('click', () => selectTrack(currentTrack + 1));
  play.addEventListener('click', async () => {
    if (audio.paused) { try { await audio.play(); } catch (_) { play.querySelector('span').textContent = 'Lỗi phát'; } }
    else audio.pause();
    showPlayback();
  });
  audio.addEventListener('play', showPlayback); audio.addEventListener('pause', showPlayback);
  audio.addEventListener('ended', () => selectTrack(currentTrack + 1, true));
  mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    mute.setAttribute('aria-pressed', String(audio.muted)); mute.setAttribute('aria-label', audio.muted ? 'Bật tiếng' : 'Tắt tiếng');
    mute.textContent = audio.muted ? '🔇' : '🔊';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !audio.paused) { resumeMusicOnReturn = true; audio.pause(); }
    else if (!document.hidden && resumeMusicOnReturn) { resumeMusicOnReturn = false; audio.play().catch(() => {}); }
  });
}
async function load() {
  initTheme();
  initMusic();
  try { const r = await fetchFresh('writeups/index.json'); if (!r.ok) throw new Error('index'); DB = await r.json(); route(); }
  catch (_) { app.innerHTML = '<p class="muted">Không tải được danh sách bài. Kiểm tra kết nối rồi <button type="button" onclick="location.reload()">thử tải lại</button>.</p>'; }
}
function route() {
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.body.classList.toggle('article-open', view === 'w');
  document.body.classList.toggle('show-backdrop', view !== 'w');
  const melanie = document.querySelector('.melanie-video');
  if (view === 'w' || matchMedia('(prefers-reduced-motion: reduce)').matches) melanie.pause();
  else melanie.play().catch(() => {});
  document.querySelectorAll('nav a[data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === (view === 'about' ? 'about' : 'home')));
  window.scrollTo(0, 0); document.title = 'BKISC-Recruitment-CTF 2026 · chlorcale/writeups';
  if (view === 'w') return renderPost(decodeURIComponent(arg || ''));
  if (view === 'about') return renderAbout();
  renderHome();
}
function categories() { return [...new Set(DB.map(w => w.category))].sort((a,b) => (Object.keys(CATS).indexOf(a) < 0 ? 99 : Object.keys(CATS).indexOf(a)) - (Object.keys(CATS).indexOf(b) < 0 ? 99 : Object.keys(CATS).indexOf(b))); }
function renderHome() {
  const cats = categories();
  const counts = Object.fromEntries(cats.map(c => [c, DB.filter(w => w.category === c).length]));
  const done = DB.filter(w => w.done).length;
  app.innerHTML = `<section class="hero"><div class="hero-copy"><p class="event-stamp">BKISC-Recruitment-CTF 2026</p><h1>chlorcale<span>/writeups</span></h1><p class="lede">Sổ tay bài giải CTF — ghi lại cách nghĩ, công cụ và đường đi đến flag.</p></div>
    <div class="overview"><div class="distribution" aria-label="Phân bố bài theo mảng">${cats.map(c => `<button class="dist-segment ${state.cat===c?'selected':''}" data-cat="${esc(c)}" style="--cat:${COLORS[c]||COLORS.misc};--share:${counts[c]/DB.length}" title="${esc(catName(c))}: ${counts[c]} bài" aria-label="Lọc ${esc(catName(c))}, ${counts[c]} bài"></button>`).join('')}</div>
    <div class="dist-labels">${cats.map(c => `<button class="dist-label" data-cat="${esc(c)}"><i style="--cat:${COLORS[c]||COLORS.misc}"></i>${esc(catName(c))} <span>${counts[c]}</span></button>`).join('')}</div>
    <p class="stats"><strong>${DB.length}</strong> bài đã giải <span>·</span> <strong>${done}</strong> bài có writeup</p></div></section>
    <section class="library"><div class="tools"><label class="search-wrap"><span aria-hidden="true">⌕</span><input type="search" id="q" placeholder="Tìm tên bài…" value="${esc(state.q)}" aria-label="Tìm bài theo tên"></label><div id="filters" class="filters" aria-label="Lọc theo mảng"></div></div><div id="list"></div></section>`;
  document.getElementById('q').addEventListener('input', e => { state.q=e.target.value; drawList(); });
  app.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { state.cat = state.cat === b.dataset.cat ? 'all' : b.dataset.cat; renderHome(); }));
  drawList();
}
function card(w) {
  const color = COLORS[w.category] || COLORS.misc;
  return `<a class="card ${w.done?'is-done':'is-todo'}" href="#/w/${encodeURIComponent(w.slug)}" style="--cat:${color}"><span class="cover">${cover(w.slug,w.category,w.done)}</span><span class="card-info"><span class="card-title">${esc(w.title)}</span><span class="card-meta"><i></i>${esc(catName(w.category))}</span><span class="status">${w.done?'<span class="check" aria-label="Writeup موجود">✓</span> Có writeup':'Chưa viết'}</span></span></a>`;
}
function drawList() {
  const cats = categories(), filters=document.getElementById('filters');
  if (!filters) return;
  filters.innerHTML = `<button class="filter ${state.cat==='all'?'active':''}" data-filter="all" aria-pressed="${state.cat==='all'}">Tất cả</button>`+cats.map(c=>`<button class="filter ${state.cat===c?'active':''}" data-filter="${esc(c)}" aria-pressed="${state.cat===c}">${esc(catName(c))}</button>`).join('');
  filters.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.cat=b.dataset.filter;renderHome();}));
  const q=state.q.trim().toLocaleLowerCase('vi');
  const rows=DB.filter(w=>(state.cat==='all'||w.category===state.cat)&&(!q||w.title.toLocaleLowerCase('vi').includes(q)));
  const el=document.getElementById('list');
  if(!rows.length){el.innerHTML='<p class="empty">Không tìm thấy bài phù hợp.</p>';return;}
  el.innerHTML=cats.filter(c=>rows.some(w=>w.category===c)).map(c=>`<section class="group"><h2><i style="--cat:${COLORS[c]||COLORS.misc}"></i>${esc(catName(c))}<span>${rows.filter(w=>w.category===c).length} bài</span></h2><div class="grid">${rows.filter(w=>w.category===c).map(card).join('')}</div></section>`).join('');
}

function hashSeed(text){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function cover(slug,category,done=true){
  const random=mulberry32(hashSeed(slug)), color=COLORS[category]||COLORS.misc;
  const grid=Array.from({length:11},(_,i)=>`<path d="M${i*32} 0v160" stroke="var(--line)" stroke-width="1" fill="none"/>`).join('')+Array.from({length:6},(_,i)=>`<path d="M0 ${i*32}h320" stroke="var(--line)" stroke-width="1" fill="none"/>`).join('');
  let art='';
  if(category==='crypto') {const hex=Array.from({length:32},()=>Math.floor(random()*16).toString(16));art=hex.map((x,i)=>{const col=i%8,row=Math.floor(i/8),active=(row===1&&col>1&&col<6)||(row===2&&col===5);return `<text x="${16+col*38}" y="${42+row*30}" class="hex ${active?'glow':''}">${x}</text>`;}).join('');}
  else if(category==='forensics'){art=Array.from({length:20},(_,i)=>{const y=24+Math.floor(i/5)*29,x=14+(i%5)*60,w=30+Math.floor(random()*25);return `<rect x="${x}" y="${y}" width="${w}" height="9" rx="2" class="packet ${i>=10&&i<15?'glow':''}"/>`;}).join('')+'<circle cx="239" cy="81" r="27" class="lens"/><circle cx="239" cy="81" r="17" class="lens-inner"/><path d="m258 101 22 22" class="lens"/>';}
  else if(category==='pwn'){art='<g class="stack"><rect x="35" y="98" width="110" height="25"/><rect x="35" y="69" width="110" height="25"/><rect x="35" y="40" width="110" height="25"/><rect x="35" y="11" width="110" height="25"/></g><g class="labels"><text x="53" y="115">buf</text><text x="53" y="86">canary</text><text x="53" y="57">rbp</text><text x="53" y="28">ret</text></g><path d="M162 112h35V23h42" class="arrow"/><path d="m232 17 9 6-9 6" class="arrow"/><rect x="253" y="10" width="45" height="29" rx="4" class="ret"/><text x="260" y="29" class="small">RET</text>';}
  else if(category==='reverse'){const n=5+Math.floor(random()*3), pts=Array.from({length:n},(_,i)=>({x:24+i*43,y:27+Math.floor(random()*100)}));art=pts.slice(1).map((p,i)=>`<path class="flow" d="M${pts[i].x+27} ${pts[i].y+13}L${p.x} ${p.y+13}"/>`).join('')+`<path class="flow" d="M${pts[1].x+13} ${pts[1].y+22}Q125 146 ${pts[3].x+7} ${pts[3].y+24}"/>`+pts.map((p,i)=>`<rect x="${p.x}" y="${p.y}" width="27" height="25" rx="7" class="node ${i===n-1?'glow':''}"/>`).join('');}
  else if(category==='web'){art=['GET /admin','POST /login','GET /flag'].map((s,i)=>`<text x="18" y="${37+i*39}" class="request">${s}</text><rect x="240" y="${19+i*39}" width="54" height="24" rx="12" class="status-pill ${i===2?'glow':''}"/><text x="250" y="${36+i*39}" class="small">${[200,302,403][i]}</text>`).join('');}
  else {const pts=Array.from({length:13},()=>({x:20+random()*280,y:15+random()*125}));art=pts.map((p,i)=>i%3?`<path class="star-line" d="M${pts[i-1].x} ${pts[i-1].y}L${p.x} ${p.y}"/>`: '').join('')+pts.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="${i%4===0?4:2.5}" class="star-dot ${i%4===0?'glow':''}"/>`).join('');}
  return `<svg viewBox="0 0 320 160" role="img" aria-label="Bìa ${esc(catName(category))}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="g-${esc(slug)}" width="32" height="32" patternUnits="userSpaceOnUse">${grid}</pattern></defs><rect width="320" height="160" fill="var(--paper)"/><rect width="320" height="160" fill="url(#g-${esc(slug)})" class="grid-bg"/><g style="--accent:${color}" class="cover-art ${done?'':'faded'}">${art}</g></svg>`;
}

function parseFront(md){const m=md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);const data={};if(m)m[1].split('\n').forEach(line=>{const i=line.indexOf(':');if(i>0)data[line.slice(0,i).trim()]=line.slice(i+1).trim();});return {data,body:m?md.slice(m[0].length):md};}
function basicMarkdown(md){
  let source=esc(md).replace(/```([\w-]*)\n([\s\S]*?)```/g,(_,lang,code)=>`\n<pre><code class="language-${lang||'text'}">${code.trimEnd()}</code></pre>\n`);
  source=source.replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>');
  source=source.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.*\|\n?)*)/gm,(_,head,rows)=>{const cells=s=>s.split('|').filter(Boolean).map(x=>`<td>${x.trim()}</td>`).join('');return `<table><tbody><tr>${cells(head)}</tr>${rows.trim().split('\n').map(row=>`<tr>${cells(row)}</tr>`).join('')}</tbody></table>`;});
  source=source.replace(/^> (.+)$/gm,'<blockquote><p>$1</p></blockquote>').replace(/^- (.+)$/gm,'<li>$1</li>');
  source=source.replace(/(?:<li>.*?<\/li>\n?)+/gs,items=>`<ul>${items}</ul>`).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
  return source.split(/\n{2,}/).map(part=>/^<(h[23]|pre|table|blockquote|ul)/.test(part.trim())?part:`<p>${part.replace(/\n/g,'<br>')}</p>`).join('\n');
}
async function renderPost(slug){
  const idx=DB.findIndex(x=>x.slug===slug),w=DB[idx];if(!w){app.innerHTML='<p>Không tìm thấy bài. <a href="#/">Về danh sách</a></p>';return;}
  document.title=`${w.title} · BKISC-Recruitment-CTF 2026`;const color=COLORS[w.category]||COLORS.misc;
  let md='';if(w.done){try{const r=await fetchFresh(`writeups/${encodeURIComponent(w.slug)}.md`);if(!r.ok)throw new Error('HTTP');md=await r.text();}catch(_){app.innerHTML=`<div class="post-layout"><div class="post-main"><a class="back" href="#/">← Tất cả bài</a><h1>${esc(w.title)}</h1><p class="muted">Không tải được nội dung writeup. Kết nối có thể đang chậm hoặc bị gián đoạn.</p><button type="button" onclick="location.reload()">Thử lại</button></div></div>`;return;}}
  await Promise.race([ensureMarked().then(() => true).catch(() => false), new Promise(resolve => setTimeout(() => resolve(false), 1200))]);
  const {data,body}=parseFront(md);
  if(!w.done){app.innerHTML=`<div class="post-layout"><div class="post-main"><a class="back" href="#/">← Tất cả bài</a><header class="post-head"><div class="post-cat" style="--cat:${color}"><i></i>${esc(catName(w.category))}</div><h1>${esc(w.title)}</h1></header><div class="todo-panel"><div class="todo-cover">${cover(w.slug,w.category,false)}</div><h2>Writeup chưa có</h2><p>Tạo tệp <code>writeups/${esc(w.slug)}.md</code>, viết nội dung theo cấu trúc bài CTF rồi sinh lại chỉ mục.</p><pre><code>python ctf.py build</code></pre></div>${postNav(idx)}</div></div>`;return;}
  const techniques=(data.techniques||'').split(',').map(x=>x.trim()).filter(Boolean);
  app.innerHTML=`<div class="read-progress" id="progress"></div><div class="post-layout"><div class="post-main"><a class="back" href="#/">← Tất cả bài</a><header class="post-head"><div class="post-cat" style="--cat:${color}"><i></i>${esc(catName(w.category))}</div><h1>${esc(w.title)}</h1>${techniques.length?`<div class="techs">${techniques.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}</header><article id="article-body">${window.marked?marked.parse(body):basicMarkdown(body)}</article>${postNav(idx)}</div><aside class="toc" aria-label="Mục lục bài viết"><h2>Mục lục</h2><nav id="toc-links"></nav></aside></div>`;
  const article=document.getElementById('article-body');
  article.querySelectorAll('pre').forEach(pre=>{const code=pre.querySelector('code');if(!code)return;if(window.hljs)hljs.highlightElement(code);const lang=(code.className.match(/language-([\w-]+)/)||[])[1]||'text';pre.insertAdjacentHTML('beforebegin',`<div class="code-label"><span>${esc(lang)}</span><button class="copy" type="button">Sao chép</button></div>`);pre.classList.add('code-block');});
  article.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{const code=b.parentElement.nextElementSibling.querySelector('code');try{await navigator.clipboard.writeText(code.innerText);b.textContent='Đã chép';setTimeout(()=>b.textContent='Sao chép',1500);}catch(_){b.textContent='Không chép được';setTimeout(()=>b.textContent='Sao chép',1500);}}));
  const techHead=[...article.querySelectorAll('h2')].find(h=>h.textContent.trim()==='Kỹ thuật sử dụng');if(techHead){let n=techHead.nextElementSibling;while(n&&n.tagName!=='H2'){const next=n.nextElementSibling;n.classList.add('tech-callout-item');n=next;}techHead.classList.add('tech-callout-title');}
  const flagHead=[...article.querySelectorAll('h2')].find(h=>h.textContent.trim()==='Flag');if(flagHead){const next=flagHead.nextElementSibling;if(next){next.classList.add('flag-ticket');const code=next.querySelector('code');if(code)next.insertAdjacentHTML('beforeend','<button class="copy flag-copy" type="button">Sao chép</button>');}}
  article.querySelectorAll('h3').forEach(h=>{const m=h.textContent.match(/^Bước\s+(\d+)/i);if(m)h.innerHTML=`<span class="step-badge">${m[1]}</span>${esc(h.textContent.replace(/^Bước\s+\d+\.?\s*/i,''))}`;});
  const headings=[...article.querySelectorAll('h2,h3')];const toc=document.getElementById('toc-links');toc.innerHTML=headings.map((h,i)=>{h.id=`section-${i}`;return `<a href="#${h.id}" class="${h.tagName==='H3'?'sub':''}">${esc(h.textContent)}</a>`;}).join('');
  if('IntersectionObserver'in window){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){toc.querySelectorAll('a').forEach(a=>a.classList.toggle('current',a.hash===`#${e.target.id}`));}}),{rootMargin:'-20% 0px -70% 0px'});headings.forEach(h=>io.observe(h));}
  addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;document.getElementById('progress').style.transform=`scaleX(${max>0?scrollY/max:0})`;},{passive:true});
  article.querySelectorAll('.flag-copy').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.parentElement.querySelector('code').innerText);b.textContent='Đã chép';setTimeout(()=>b.textContent='Sao chép',1500);}catch(_){b.textContent='Không chép được';setTimeout(()=>b.textContent='Sao chép',1500);}}));
}
function postNav(idx){return `<nav class="post-nav" aria-label="Điều hướng bài">${idx>0?`<a href="#/w/${encodeURIComponent(DB[idx-1].slug)}">← ${esc(DB[idx-1].title)}</a>`:'<span></span>'}${idx<DB.length-1?`<a class="next" href="#/w/${encodeURIComponent(DB[idx+1].slug)}">${esc(DB[idx+1].title)} →</a>`:''}</nav>`;}
function renderAbout(){app.innerHTML='<section class="about"><h1>Giới thiệu</h1><p>Sổ tay writeup CTF của <a href="https://github.com/chlorcale">chlorcale</a>. Mỗi bài lưu lại đề bài, kỹ thuật sử dụng và cách giải theo từng bước.</p></section>';}
addEventListener('hashchange',route);load();
