const app = document.getElementById('app');
const CATS = { crypto: 'Crypto', forensics: 'Forensics', pwn: 'Pwn', reverse: 'Reverse', web: 'Web', misc: 'Misc' };
const COLORS = { crypto: 'var(--cat-crypto)', forensics: 'var(--cat-forensics)', pwn: 'var(--cat-pwn)', reverse: 'var(--cat-reverse)', web: 'var(--cat-web)', misc: 'var(--cat-misc)' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const catName = c => CATS[c] || c;
const state = { q: '', cat: 'all' };
let DB = [];
let feedmeCleanup = null;
const ASSET_VERSION = '20261030-19';
let markedPromise;
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

/* ---------- Random BullSheet ----------
   Mỗi bộ sprite nằm trong MỘT khung cố định, các frame xếp chồng và chỉ đổi độ trong suốt:
   không đổi src, không đổi kích thước ⇒ không nhúng lên xuống. */
function initBullSheet() {
  const reset = document.getElementById('bullsheet-reset');
  const overlay = document.getElementById('bullsheet-overlay');
  if (!reset || !overlay) return;
  const audio = document.getElementById('site-track');
  const stopSfx = document.getElementById('dio-sfx');
  const jupiter = document.getElementById('jupiter-video');
  const ruins = document.getElementById('jupiter-ruins');
  const ruinCtx = ruins?.getContext('2d');
  const dioFrame = overlay.querySelector('.dio-frame');
  const worldFrame = overlay.querySelector('.world-frame');
  if (!dioFrame || !worldFrame) { console.warn('[bullsheet] thiếu .dio-frame hoặc .world-frame trong index.html'); return; }
  const dioImgs = [...dioFrame.querySelectorAll('img')];
  const worldImgs = [...worldFrame.querySelectorAll('img')];
  const T = { dioFrame: 125, worldIn: 1000, worldFrame: 200, impact: 2400, end: 10000 };
  let timers = [], runId = 0, running = false, musicWasPlaying = false;
  let nextMode = 'dio';
  let ruinRaf = 0, lastEmber = 0, embers = [], glassPaths = [], jupiterStartedAt = 0;
  let fireAudioContext = null, fireMaster = null, fireNoiseSource = null, fireRumble = null, fireNoiseBuffer = null, fireCrackleTimer = 0;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const num = (el, name) => Number(el.style.getPropertyValue(name)) || 0;

  // Khung cố định = kích thước lớn nhất của các frame; mọi frame giữ nguyên tỉ lệ pixel.
  function measure(frame, imgs) {
    const w = Math.max(...imgs.map(i => i.naturalWidth)), h = Math.max(...imgs.map(i => i.naturalHeight));
    if (!w || !h) return;
    frame.style.setProperty('--w', w); frame.style.setProperty('--h', h);
  }
  function fit() {
    const small = innerWidth <= 700;
    const dw = num(dioFrame, '--w'), dh = num(dioFrame, '--h'), ww = num(worldFrame, '--w');
    if (dw && dh) dioFrame.style.setProperty('--k', Math.min(Math.min(innerHeight * (small ? .56 : .65), small ? 560 : 720) / dh, innerWidth * (small ? .72 : .55) / dw));
    if (ww) worldFrame.style.setProperty('--k', Math.min(innerWidth * (small ? .98 : .88), innerHeight * 1.3) / ww);
  }

  // Nạp + giải mã sẵn mọi frame cùng kích thước để cutscene đổi dáng mà không nhảy khung.
  const ready = (async () => {
    await Promise.all([...dioImgs, ...worldImgs].map(img => img.decode().catch(() => {})));
    measure(dioFrame, dioImgs); measure(worldFrame, worldImgs); fit();
  })();
  addEventListener('resize', () => { fit(); if (overlay.classList.contains('jupiter-audio-only')) sizeRuinCanvas(); });

  function sizeRuinCanvas() {
    if (!ruins) return;
    ruins.width = Math.max(240, Math.ceil(innerWidth / 4));
    ruins.height = Math.max(135, Math.ceil(innerHeight / 4));
    buildGlassCracks(ruins.width, ruins.height);
  }
  function buildGlassCracks(w, h) {
    glassPaths = [];
    const impacts = [{ x: w * .5, y: h * .43, rays: 16 }, { x: w * .19, y: h * .31, rays: 7 }, { x: w * .82, y: h * .58, rays: 7 }, { x: w * .57, y: h * .84, rays: 5 }];
    impacts.forEach(impact => {
      for (let ray = 0; ray < impact.rays; ray++) {
        const angle = Math.PI * 2 * ray / impact.rays + (Math.random() - .5) * .2;
        const dx = Math.cos(angle), dy = Math.sin(angle), length = Math.hypot(w, h) * (.38 + Math.random() * .25);
        let x = impact.x, y = impact.y, travelled = 0, points = [[x, y]];
        while (travelled < length && x > -8 && x < w + 8 && y > -8 && y < h + 8) {
          const step = 5 + Math.random() * 7;
          x += dx * step + (Math.random() - .5) * 3; y += dy * step + (Math.random() - .5) * 3;
          travelled += step; points.push([x, y]);
        }
        glassPaths.push({ points, weight: .72 + Math.random() * .52, opacity: .52 + Math.random() * .3 });
        if (ray % 2 === 0 && points.length > 7) {
          const start = points[Math.floor(points.length * (.36 + Math.random() * .25))];
          const branchAngle = angle + (Math.random() < .5 ? -1 : 1) * (.45 + Math.random() * .55);
          let bx = start[0], by = start[1], branch = [[bx, by]];
          for (let j = 0; j < 7; j++) { bx += Math.cos(branchAngle) * 7 + (Math.random() - .5) * 3; by += Math.sin(branchAngle) * 7 + (Math.random() - .5) * 3; branch.push([bx, by]); }
          glassPaths.push({ points: branch, weight: .48 + Math.random() * .35, opacity: .3 + Math.random() * .25 });
        }
      }
    });
  }
  function drawGlassCracks(ctx) {
    ctx.save(); ctx.lineJoin = 'miter'; ctx.lineCap = 'square';
    for (const crack of glassPaths) {
      const { points, weight, opacity } = crack;
      for (let i = 0; i < points.length - 1; i++) {
        const distance = i / Math.max(1, points.length - 1);
        const taper = (1 - distance * .82) * (.78 + ((i * 17 + points.length * 13) % 7) * .055);
        const [[x1, y1], [x2, y2]] = [points[i], points[i + 1]];
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(8,12,18,${opacity * taper})`; ctx.lineWidth = 1.15 * weight * taper; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(194,220,226,${opacity * .72 * taper})`; ctx.lineWidth = .42 * weight * taper; ctx.stroke();
      }
    }
    ctx.restore();
  }
  function armFireAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      if (!fireAudioContext) fireAudioContext = new AudioContextClass();
      fireAudioContext.resume().catch(() => {});
      if (fireNoiseSource) return;
      fireNoiseBuffer = fireAudioContext.createBuffer(1, fireAudioContext.sampleRate, fireAudioContext.sampleRate);
      const samples = fireNoiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      fireMaster = fireAudioContext.createGain(); fireMaster.gain.value = 0; fireMaster.connect(fireAudioContext.destination);
      const lowpass = fireAudioContext.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 720;
      const noiseGain = fireAudioContext.createGain(); noiseGain.gain.value = .055;
      fireNoiseSource = fireAudioContext.createBufferSource(); fireNoiseSource.buffer = fireNoiseBuffer; fireNoiseSource.loop = true;
      fireNoiseSource.connect(lowpass); lowpass.connect(noiseGain); noiseGain.connect(fireMaster); fireNoiseSource.start();
      fireRumble = fireAudioContext.createOscillator(); fireRumble.type = 'triangle'; fireRumble.frequency.value = 54;
      const rumbleGain = fireAudioContext.createGain(); rumbleGain.gain.value = .035;
      fireRumble.connect(rumbleGain); rumbleGain.connect(fireMaster); fireRumble.start();
    } catch (_) { /* Web Audio không được hỗ trợ thì vẫn chạy hiệu ứng hình */ }
  }
  function scheduleFireCrackle() {
    if (!fireAudioContext || !fireMaster || !overlay.classList.contains('jupiter-audio-only')) return;
    const ctx = fireAudioContext, now = ctx.currentTime, pop = ctx.createBufferSource(), band = ctx.createBiquadFilter(), env = ctx.createGain();
    pop.buffer = fireNoiseBuffer; band.type = 'bandpass'; band.frequency.value = 1100 + Math.random() * 3100; band.Q.value = .8 + Math.random() * 1.6;
    env.gain.setValueAtTime(.0001, now); env.gain.exponentialRampToValueAtTime(.12 + Math.random() * .18, now + .009); env.gain.exponentialRampToValueAtTime(.0001, now + .075 + Math.random() * .1);
    pop.connect(band); band.connect(env); env.connect(fireMaster); pop.start(now); pop.stop(now + .2);
    fireCrackleTimer = setTimeout(scheduleFireCrackle, 80 + Math.random() * 260);
  }
  function igniteFireAudio() {
    armFireAudio();
    if (!fireAudioContext || !fireMaster) return;
    fireAudioContext.resume().catch(() => {});
    fireMaster.gain.cancelScheduledValues(fireAudioContext.currentTime);
    fireMaster.gain.setTargetAtTime(.58, fireAudioContext.currentTime, .35);
    clearTimeout(fireCrackleTimer); scheduleFireCrackle();
  }
  function intensifyFireAudio() {
    if (fireAudioContext && fireMaster) fireMaster.gain.setTargetAtTime(.92, fireAudioContext.currentTime, .7);
  }
  function stopFireAudio() {
    clearTimeout(fireCrackleTimer); fireCrackleTimer = 0;
    if (fireAudioContext && fireMaster) { fireMaster.gain.cancelScheduledValues(fireAudioContext.currentTime); fireMaster.gain.setTargetAtTime(0, fireAudioContext.currentTime, .06); }
    try { fireNoiseSource?.stop(); } catch (_) { /* đã dừng */ }
    try { fireRumble?.stop(); } catch (_) { /* đã dừng */ }
    fireNoiseSource = fireRumble = fireMaster = fireNoiseBuffer = null;
    fireAudioContext?.suspend().catch(() => {});
  }
  function stopRuinAnimation() {
    if (ruinRaf) cancelAnimationFrame(ruinRaf);
    ruinRaf = 0; embers = []; glassPaths = [];
    if (ruinCtx && ruins) ruinCtx.clearRect(0, 0, ruins.width, ruins.height);
  }
  function drawRuins(now) {
    if (!overlay.classList.contains('jupiter-audio-only') || !ruinCtx || !ruins) { ruinRaf = 0; return; }
    const ctx = ruinCtx, w = ruins.width, h = ruins.height, px = Math.max(1, Math.round(w / 320));
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5, 8, 12, .13)'; ctx.fillRect(0, 0, w, h);

    // Blocky smoke columns roll upward from the wreckage.
    const sources = [.16, .5, .84];
    sources.forEach((origin, s) => {
      for (let puff = 0; puff < 5; puff++) {
        const rise = ((now * .00004 + s * .27 + puff * .19) % .82);
        const drift = Math.sin(now * .00045 + puff * 1.7 + s) * (3 + rise * 15);
        const x = origin * w + drift, y = h - rise * h * 1.08;
        const size = px * (3 + rise * 11), alpha = .025 + (1 - rise / .82) * .065;
        ctx.fillStyle = `rgba(${puff % 3 ? '64,70,77' : '91,77,68'},${alpha})`;
        ctx.fillRect(x, y, size * 1.8, size);
        ctx.fillRect(x - size, y + size * .55, size * 1.25, size * 1.1);
        ctx.fillRect(x + size, y + size * .65, size * 1.1, size * .9);
      }
    });

    // Pixel flames surge above a broken dark skyline.
    const flicker = now * .008;
    for (let x = 0; x < w; x += px * 3) {
      const wave = (Math.sin(x * .13 + flicker) + Math.sin(x * .047 - flicker * 1.6) + 2) / 4;
      const flameH = h * (.055 + wave * .14 + Math.random() * .035);
      for (let y = 0; y < flameH; y += px * 2) {
        const heat = y / flameH;
        ctx.fillStyle = heat < .16 ? '#ffe36b' : heat < .42 ? '#ff982f' : heat < .76 ? '#eb4821' : '#812b25';
        ctx.fillRect(x + (Math.random() < .14 ? px : 0), h - y, px * 2, px * 2);
      }
    }
    ctx.fillStyle = 'rgba(15,19,23,.94)';
    for (let x = 0; x < w; x += px * 8) {
      const height = px * (5 + ((Math.sin(x * .09) + 1) * 8));
      ctx.fillRect(x, h - height, px * (5 + (x % 7)), height);
    }

    if (now - lastEmber > 55) {
      lastEmber = now;
      for (let i = 0; i < 4; i++) embers.push({ x: Math.random() * w, y: h * (.55 + Math.random() * .42), vx: (Math.random() - .5) * 1.5, vy: -(1 + Math.random() * 2.8), life: 35 + Math.random() * 45 });
    }
    embers = embers.filter(p => p.life > 0);
    embers.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; ctx.fillStyle = p.life % 3 ? '#ffc14b' : '#ff542c'; ctx.fillRect(p.x, p.y, px * 2, px * 2); });
    drawGlassCracks(ctx);
    ruinRaf = requestAnimationFrame(drawRuins);
  }
  function startRuinAnimation() {
    if (!ruins) return;
    sizeRuinCanvas(); lastEmber = 0; embers = [];
    if (!ruinRaf) ruinRaf = requestAnimationFrame(drawRuins);
  }
  if (jupiter) {
    jupiter.addEventListener('playing', () => {
      if (overlay.classList.contains('jupiter-mode') && !jupiterStartedAt) jupiterStartedAt = performance.now();
    });
    jupiter.addEventListener('timeupdate', () => {
      if (!overlay.classList.contains('jupiter-mode')) return;
      if (jupiter.currentTime >= 25 && !overlay.classList.contains('jupiter-audio-only')) {
        overlay.classList.add('jupiter-audio-only');
        document.body.classList.add('jupiter-ruined');
        startRuinAnimation();
        igniteFireAudio();
      }
    });
    jupiter.addEventListener('ended', () => {
      if (!overlay.classList.contains('jupiter-mode')) { resetScene(); return; }
      const elapsed = jupiterStartedAt ? performance.now() - jupiterStartedAt : jupiter.currentTime * 1000;
      intensifyFireAudio();
      later(resetScene, Math.max(0, 40000 - elapsed));
    });
  }

  async function start(mode = 'dio') {
    if (running) return;
    running = true; const id = ++runId;
    // Âm thanh phải bắt đầu ngay trong lượt bấm (chính sách autoplay của trình duyệt).
    musicWasPlaying = !audio.paused; if (musicWasPlaying) audio.pause();
    clearTimers();
    if (mode === 'jupiter' && jupiter) {
      overlay.classList.remove('active', 'impact', 'world-arrived', 'jupiter-audio-only');
      void overlay.offsetWidth;
      overlay.classList.add('active', 'jupiter-mode');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('bullsheet-active');
      slowMelanieForTimeStop();
      armFireAudio();
      jupiterStartedAt = 0;
      try { jupiter.currentTime = 0; } catch (_) { /* video chưa nạp metadata */ }
      jupiter.play().catch(() => { if (id === runId) { resetScene(); start('dio'); } });
      return;
    }
    overlay.classList.remove('jupiter-mode', 'jupiter-audio-only');
    stopSfx.currentTime = 0; stopSfx.play().catch(() => {});
    await ready;
    if (id !== runId) return;                       // đã reset trong lúc chờ
    dioFrame.dataset.pose = '0'; worldFrame.dataset.pose = '0';
    overlay.classList.remove('active', 'impact', 'world-arrived'); void overlay.offsetWidth;
    overlay.classList.add('active'); overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('bullsheet-active');
    slowMelanieForTimeStop();
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((pose, i) => later(() => { dioFrame.dataset.pose = String(pose); }, T.dioFrame * (i + 1)));
    later(() => {
      overlay.classList.add('world-arrived');
      [1, 2, 3].forEach((pose, i) => later(() => { worldFrame.dataset.pose = String(pose); }, T.worldFrame * (i + 1)));
    }, T.worldIn);
    later(() => overlay.classList.add('impact'), T.impact);
    later(resetScene, T.end);
  }

  function resetScene() {
    runId++; clearTimers();
    overlay.classList.remove('active', 'impact', 'world-arrived', 'jupiter-mode', 'jupiter-audio-only');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bullsheet-active', 'jupiter-ruined');
    dioFrame.dataset.pose = '0'; worldFrame.dataset.pose = '0';
    stopSfx.pause(); stopSfx.currentTime = 0;
    if (jupiter) { jupiter.pause(); jupiterStartedAt = 0; try { jupiter.currentTime = 0; } catch (_) { /* video chưa sẵn sàng */ } }
    stopFireAudio();
    stopRuinAnimation();
    if (musicWasPlaying) audio.play().catch(() => {});
    musicWasPlaying = false; running = false;
    resumeMelanieAfterTimeStop();
  }

  document.addEventListener('click', e => {
    if (!e.target.closest?.('#bullsheet-button')) return;
    const mode = nextMode; nextMode = mode === 'dio' ? 'jupiter' : 'dio';
    start(mode);
  });
  reset.addEventListener('click', resetScene);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('active')) resetScene(); });
}

function initMusic() {
  const audio = document.getElementById('site-track'), play = document.getElementById('music-toggle'), mute = document.getElementById('music-mute');
  const title = document.getElementById('music-title'), dockTitle = document.getElementById('dock-title'), artist = document.getElementById('music-artist'), tracks = [...document.querySelectorAll('.track')];
  const dock = document.getElementById('music-dock'), panelToggle = document.getElementById('music-panel-toggle'), panel = document.getElementById('music-dock-panel');
  audio.volume = 0.28;
  let pointerOpening = false;
  function setDockOpen(open) {
    dock.classList.toggle('is-open', open); panelToggle.setAttribute('aria-expanded', String(open)); panel.setAttribute('aria-hidden', String(!open)); panel.inert = !open;
  }
  setDockOpen(false);
  panelToggle.addEventListener('pointerdown', e => { pointerOpening = e.pointerType !== 'mouse'; });
  panelToggle.addEventListener('click', e => {
    if (matchMedia('(hover: hover) and (pointer: fine)').matches || e.detail === 0) setDockOpen(true);
    else setDockOpen(!dock.classList.contains('is-open'));
    pointerOpening = false;
  });
  dock.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') setDockOpen(true); });
  dock.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { if (dock.contains(document.activeElement)) document.activeElement.blur(); setDockOpen(false); } });
  dock.addEventListener('focusin', e => { if (e.target !== panelToggle || !pointerOpening) setDockOpen(true); });
  dock.addEventListener('focusout', e => { if (!dock.contains(e.relatedTarget)) setDockOpen(false); });
  function updateTrack() {
    title.textContent = PLAYLIST[currentTrack].title; dockTitle.textContent = PLAYLIST[currentTrack].title; artist.textContent = PLAYLIST[currentTrack].artist;
    tracks.forEach((button, i) => { button.classList.toggle('selected', i === currentTrack); button.setAttribute('aria-pressed', String(i === currentTrack)); });
  }
  function showPlayback() {
    const isPlaying = !audio.paused;
    play.setAttribute('aria-pressed', String(isPlaying)); play.setAttribute('aria-label', isPlaying ? 'Tạm dừng nhạc' : 'Phát nhạc');
    play.querySelector('span').textContent = isPlaying ? 'Tạm dừng' : 'Phát'; play.firstChild.textContent = isPlaying ? 'Ⅱ ' : '▶ ';
  }
  async function selectTrack(index, autoplay = !audio.paused) {
    audio.pause(); currentTrack = (index + PLAYLIST.length) % PLAYLIST.length;
    audio.src = PLAYLIST[currentTrack].src; audio.load(); updateTrack(); showPlayback();
    if (autoplay) { try { await audio.play(); } catch (_) { /* nút phát có thể thử lại */ } showPlayback(); }
  }
  audio.src = PLAYLIST[currentTrack].src; updateTrack();
  // Try autoplay on page load. Browsers may block audible autoplay until a user gesture.
  let waitingForGesture = true;
  const startOnGesture = async event => {
    if (!waitingForGesture || !audio.paused) return;
    if (dock.contains(event.target)) return;
    waitingForGesture = false;
    ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => document.removeEventListener(eventName, startOnGesture));
    try { await audio.play(); } catch (_) { /* music button remains available if playback is still blocked */ }
    showPlayback();
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => document.addEventListener(eventName, startOnGesture, { passive: true }));
  audio.play().then(() => {
    waitingForGesture = false;
    ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => document.removeEventListener(eventName, startOnGesture));
    showPlayback();
  }).catch(() => showPlayback());
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
}

function initPipabo() {
  const audio=document.getElementById('pipabo-track'),button=document.getElementById('pipabo-toggle');
  if(!audio||!button)return;
  audio.volume=.22;
  const update=()=>{const playing=!audio.paused;button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-label',playing?'Tắt Pipabo':'Bật Pipabo');button.title=playing?'Tắt Pipabo':'Bật Pipabo';};
  button.addEventListener('click',async()=>{if(audio.paused){try{await audio.play();}catch(_){button.title='Trình duyệt chặn tự phát; bấm lại để thử';}}else audio.pause();update();});
  audio.addEventListener('play',update);audio.addEventListener('pause',update);audio.addEventListener('ended',update);
  audio.pause();
  update();
}
const MELANIE_FRAMES = Array.from({ length: 16 }, (_, i) => `assets/melanie-frames/frame-${String(i).padStart(2, '0')}.png`);
let melanieFrame = 0, melaniePlaybackTimer = 0, melanieSlowTimer = 0;
const MELANIE_FRAME_CACHE = MELANIE_FRAMES.map(src => { const image = new Image(); image.src = src; return image; });
function setMelanieFrame(index) {
  melanieFrame = (index + MELANIE_FRAMES.length) % MELANIE_FRAMES.length;
  document.querySelectorAll('.melanie-art').forEach(img => { img.src = MELANIE_FRAMES[melanieFrame]; });
}
function clearMelanieTimers() {
  clearInterval(melaniePlaybackTimer); clearTimeout(melanieSlowTimer);
  melaniePlaybackTimer = melanieSlowTimer = 0;
}
function syncMelanieMotion() {
  if (document.body.classList.contains('bullsheet-active')) return;
  clearMelanieTimers();
  document.body.classList.remove('melanie-frozen');
  const images = [...document.querySelectorAll('.melanie-art')];
  const shouldAnimate = !document.body.classList.contains('article-open') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!shouldAnimate) {
    images.forEach(img => { img.src = img.dataset.still || 'assets/melanie-hcmut.png'; });
    return;
  }
  setMelanieFrame(0);
  melaniePlaybackTimer = setInterval(() => setMelanieFrame(melanieFrame + 1), 110);
}
function slowMelanieForTimeStop() {
  clearMelanieTimers();
  const slowSteps = [120, 200, 330, 520, 800];
  let step = 0;
  const advance = () => {
    if (!document.body.classList.contains('bullsheet-active')) return;
    if (step >= slowSteps.length) { document.body.classList.add('melanie-frozen'); return; }
    setMelanieFrame(melanieFrame + 1);
    melanieSlowTimer = setTimeout(advance, slowSteps[step++]);
  };
  melanieSlowTimer = setTimeout(advance, 120);
}
function resumeMelanieAfterTimeStop() { syncMelanieMotion(); }
function initMelanieMotion() {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', syncMelanieMotion);
}
async function load() {
  // Mỗi phần khởi tạo chạy riêng: lỗi ở hiệu ứng/nhạc không được chặn việc tải danh sách bài.
  for (const init of [initTheme, initMusic, initPipabo, initMelanieMotion, initBullSheet]) {
    try { init(); } catch (e) { console.error(`[${init.name}]`, e); }
  }
  try { const r = await fetchFresh('writeups/index.json'); if (!r.ok) throw new Error('index'); DB = await r.json(); route(); }
  catch (_) { app.innerHTML = '<p class="muted">Không tải được danh sách bài. Kiểm tra kết nối rồi <button type="button" onclick="location.reload()">thử tải lại</button>.</p>'; }
}
function route() {
  if(feedmeCleanup){feedmeCleanup();feedmeCleanup=null;}
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.body.classList.toggle('article-open', view === 'w');
  document.body.classList.toggle('show-backdrop', view !== 'w');
  document.body.classList.toggle('feedme-open', view === 'feedme');
  document.querySelectorAll('nav a[data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === (['about','feedme'].includes(view) ? view : 'home')));
  window.scrollTo(0, 0); document.title = 'BKISC-Recruitment-CTF 2026 · chlorcale/writeups';
  if (view === 'w') { renderPost(decodeURIComponent(arg || '')); syncMelanieMotion(); return; }
  if (view === 'about') { renderAbout(); syncMelanieMotion(); return; }
  if (view === 'feedme') { renderFeedme(); syncMelanieMotion(); return; }
  renderHome(); syncMelanieMotion();
}
function renderFeedme() {
  app.innerHTML = `<section class="feedme-page" tabindex="0"><header class="feedme-heading"><p class="event-stamp">DỰ ÁN NUÔI TÔI</p><h1>Feed me<span>!</span></h1><p>Chọn một trong ba ô thức ăn rồi nhấn <kbd>Enter</kbd> để cho mèo ăn.</p></header><div class="feedme-world"><div class="feedme-crosshair" aria-hidden="true">+</div><div class="feed-cat-stage"><img id="feed-cat" class="feed-cat" src="assets/cat.png" alt="Mèo đen đang chờ được cho ăn"><canvas id="feed-video-canvas" class="feed-video-canvas" aria-hidden="true"></canvas></div><video id="feed-video" src="assets/cat-clapping.mp4" preload="metadata" playsinline></video><div class="feed-counter" aria-live="polite">Time feeded: <strong id="feed-count">0</strong><small>lượt trên trình duyệt này</small></div><p class="feed-message" id="feed-message">Mèo đang đợi đồ ăn...</p><span class="feed-pixel-decor decor-a" aria-hidden="true">✦</span><span class="feed-pixel-decor decor-b" aria-hidden="true">✚</span><div class="feed-hotbar" role="group" aria-label="Túi đồ gồm 9 ô">${Array.from({length:9},(_,i)=>`<button class="feed-slot${i===0?' selected':''}" type="button" data-slot="${i}" aria-label="Ô ${i+1}${i<3?', thức ăn'+(i+1):''}${i===0?', đang chọn':''}" ${i===0?'aria-pressed="true"':'aria-pressed="false"'}>${i<3?`<img src="assets/food${i+1}.png" alt=""><span class="feed-amount">∞</span>`:''}</button>`).join('')}</div></div><p class="feed-disclaimer">Bộ đếm chỉ lưu trên trình duyệt hiện tại. GitHub Pages không có máy chủ để cộng lượt cho mọi khách truy cập.</p></section>`;
  initFeedme();
}
function initFeedme() {
  const page=document.querySelector('.feedme-page'), stage=page.querySelector('.feed-cat-stage'), video=document.getElementById('feed-video'), canvas=document.getElementById('feed-video-canvas'), ctx=canvas.getContext('2d',{willReadFrequently:true}), counter=document.getElementById('feed-count'), message=document.getElementById('feed-message');
  const slots=[...page.querySelectorAll('.feed-slot')]; let frame=0;
  page.focus({preventScroll:true});
  try { counter.textContent=localStorage.getItem('chlor-feed-count')||'0'; } catch (_) { counter.textContent='0'; }
  const paint=()=>{
    if(video.paused||video.ended||!video.videoWidth)return;
    const width=320,height=Math.max(1,Math.round(320*video.videoHeight/video.videoWidth));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.drawImage(video,0,0,width,height);
    const frameData=ctx.getImageData(0,0,width,height), pixels=frameData.data;
    for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2],green=g-Math.max(r,b);if(g>65&&green>18)pixels[i+3]=Math.max(0,Math.min(255,255-(green-18)*5));}
    ctx.putImageData(frameData,0,0);
    frame=requestAnimationFrame(paint);
  };
  const feed=async()=>{
    let count=Number(counter.textContent)||0; count++;
    counter.textContent=String(count); message.textContent='Yum! Mèo cảm ơn bạn ♥';
    try{localStorage.setItem('chlor-feed-count',String(count));}catch(_){}
    canvas.classList.add('playing');stage.classList.add('clapping');
    try{video.currentTime=0; await video.play(); paint();}catch(_){canvas.classList.remove('playing');stage.classList.remove('clapping');message.textContent='Không phát được video. Thử nhấn cho ăn lại nhé.';}
  };
  slots.forEach(slot=>{
    slot.addEventListener('click',()=>{slots.forEach(s=>{s.classList.remove('selected');s.setAttribute('aria-pressed','false');});slot.classList.add('selected');slot.setAttribute('aria-pressed','true');});
  });
  page.addEventListener('keydown',e=>{const selected=Number(page.querySelector('.feed-slot.selected')?.dataset.slot);if(e.key==='Enter'&&!e.repeat&&selected>=0&&selected<3){e.preventDefault();feed();}});
  video.addEventListener('ended',()=>{cancelAnimationFrame(frame);canvas.classList.remove('playing');stage.classList.remove('clapping');message.textContent='Mèo đang đợi thêm đồ ăn...';});
  video.addEventListener('error',()=>{canvas.classList.remove('playing');stage.classList.remove('clapping');message.textContent='Không tải được video mèo.';});
  feedmeCleanup=()=>{cancelAnimationFrame(frame);video.pause();};
}
function categories() { return [...new Set(DB.map(w => w.category))].sort((a,b) => (Object.keys(CATS).indexOf(a) < 0 ? 99 : Object.keys(CATS).indexOf(a)) - (Object.keys(CATS).indexOf(b) < 0 ? 99 : Object.keys(CATS).indexOf(b))); }
function renderHome() {
  const cats = categories();
  const counts = Object.fromEntries(cats.map(c => [c, DB.filter(w => w.category === c).length]));
  const done = DB.filter(w => w.done).length;
  app.innerHTML = `<section class="hero"><div class="melanie-corner" aria-hidden="true"><img class="melanie-art" src="assets/melanie-hcmut.png" data-still="assets/melanie-hcmut.png" alt=""></div><div class="hero-copy"><p class="event-stamp">BKISC-Recruitment-CTF 2026</p><h1>chlorcale<span>/writeups</span></h1><p class="lede">Blog Page CTF ghi các writeup của NMHP.</p></div>
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
  return `<a class="card ${w.done?'is-done':'is-todo'}" href="#/w/${encodeURIComponent(w.slug)}" style="--cat:${color}"><span class="cover">${cover(w.slug,w.category,w.done)}</span><span class="card-info"><span class="card-title">${esc(w.title)}</span><span class="card-meta"><i></i>${esc(catName(w.category))}</span><span class="status">${w.done?'<span class="check" aria-label="Có writeup">✓</span> Có writeup':'Chưa viết'}</span></span></a>`;
}
function drawList() {
  const cats = categories(), filters=document.getElementById('filters');
  if (!filters) return;
  filters.innerHTML = `<button class="filter ${state.cat==='all'?'active':''}" data-filter="all" aria-pressed="${state.cat==='all'}">Tất cả</button>`+cats.map(c=>`<button class="filter ${state.cat===c?'active':''}" data-filter="${esc(c)}" aria-pressed="${state.cat===c}">${esc(catName(c))}</button>`).join('')+'<button id="bullsheet-button" class="filter bullsheet-button" type="button">Random BullSheet</button>';
  filters.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.cat=b.dataset.filter;renderHome();}));
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
  const summary=String(data.summary||w.summary||'').trim();
  app.innerHTML=`<div class="read-progress" id="progress"></div><div class="post-layout"><div class="post-main"><a class="back" href="#/">← Tất cả bài</a><header class="post-head"><div class="post-cat" style="--cat:${color}"><i></i>${esc(catName(w.category))}</div><h1>${esc(w.title)}</h1>${techniques.length?`<div class="techs">${techniques.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}${summary?`<p class="post-summary">${esc(summary)}</p>`:''}</header><article id="article-body">${window.marked?marked.parse(body):basicMarkdown(body)}</article>${postNav(idx)}</div><aside class="toc" aria-label="Mục lục bài viết"><h2>Mục lục</h2><nav id="toc-links"></nav></aside></div>`;
  const article=document.getElementById('article-body');
  article.querySelectorAll('pre').forEach(pre=>{const code=pre.querySelector('code');if(!code)return;if(window.hljs)hljs.highlightElement(code);const lang=(code.className.match(/language-([\w-]+)/)||[])[1]||'text';pre.insertAdjacentHTML('beforebegin',`<div class="code-label"><span>${esc(lang)}</span><button class="copy" type="button">Sao chép</button></div>`);pre.classList.add('code-block');});
  article.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{const code=b.parentElement.nextElementSibling.querySelector('code');try{await navigator.clipboard.writeText(code.innerText);b.textContent='Đã chép';setTimeout(()=>b.textContent='Sao chép',1500);}catch(_){b.textContent='Không chép được';setTimeout(()=>b.textContent='Sao chép',1500);}}));
  const techHead=[...article.querySelectorAll('h2')].find(h=>h.textContent.trim()==='Kỹ thuật sử dụng');if(techHead){let n=techHead.nextElementSibling;while(n&&n.tagName!=='H2'){const next=n.nextElementSibling;n.classList.add('tech-callout-item');n=next;}techHead.classList.add('tech-callout-title');}
  const flagHead=[...article.querySelectorAll('h2')].find(h=>h.textContent.trim()==='Flag');if(flagHead){const next=flagHead.nextElementSibling;if(next){next.classList.add('flag-ticket');const code=next.querySelector('code');if(code)next.insertAdjacentHTML('beforeend','<button class="copy flag-copy" type="button">Sao chép</button>');}}
  article.querySelectorAll('h3').forEach(h=>{const m=h.textContent.match(/^Bước\s+(\d+)/i);if(m)h.innerHTML=`<span class="step-badge">${m[1]}</span>${esc(h.textContent.replace(/^Bước\s+\d+\.?\s*/i,''))}`;});
  const headings=[...article.querySelectorAll('h2,h3')];const toc=document.getElementById('toc-links');toc.innerHTML=headings.map((h,i)=>{h.id=`section-${i}`;return `<a href="#${h.id}" class="${h.tagName==='H3'?'sub':''}">${esc(h.textContent)}</a>`;}).join('');
  if('IntersectionObserver'in window){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){toc.querySelectorAll('a').forEach(a=>a.classList.toggle('current',a.hash===`#${e.target.id}`));}}),{rootMargin:'-20% 0px -70% 0px'});headings.forEach(h=>io.observe(h));}
  addEventListener('scroll',()=>{const bar=document.getElementById('progress');if(!bar)return;const max=document.documentElement.scrollHeight-innerHeight;bar.style.transform=`scaleX(${max>0?scrollY/max:0})`;},{passive:true});
  article.querySelectorAll('.flag-copy').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.parentElement.querySelector('code').innerText);b.textContent='Đã chép';setTimeout(()=>b.textContent='Sao chép',1500);}catch(_){b.textContent='Không chép được';setTimeout(()=>b.textContent='Sao chép',1500);}}));
}
function postNav(idx){return `<nav class="post-nav" aria-label="Điều hướng bài">${idx>0?`<a href="#/w/${encodeURIComponent(DB[idx-1].slug)}">← ${esc(DB[idx-1].title)}</a>`:'<span></span>'}${idx<DB.length-1?`<a class="next" href="#/w/${encodeURIComponent(DB[idx+1].slug)}">${esc(DB[idx+1].title)} →</a>`:''}</nav>`;}
function renderAbout(){app.innerHTML='<section class="about"><h1>Giới thiệu</h1><p>Helo i am <a href="https://github.com/chlorcale">chlorcale</a> :3</p></section>';}
addEventListener('hashchange',route);load();
