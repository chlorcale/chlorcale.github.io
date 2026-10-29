/* Mưa pixel: 3 lớp parallax + đường chân trời thành phố + sét hiếm.
   Vẽ ở độ phân giải thấp rồi phóng nguyên số nguyên → từng điểm ảnh sắc nét.
   Khi BullSheet bật (body.bullsheet-active) mưa đứng yên giữa trời = "ngừng thời gian". */
(() => {
  const canvas = document.getElementById('rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const LAYERS = [                       // xa → gần
    { share: .50, speed: [2.2, 3.0], len: [2, 3], alpha: .30 },
    { share: .34, speed: [3.6, 4.6], len: [4, 6], alpha: .48 },
    { share: .16, speed: [5.4, 7.0], len: [7, 10], alpha: .80 }
  ];
  const WIND = -.22;                     // lệch ngang trên mỗi điểm ảnh rơi
  const rnd = (a, b) => a + Math.random() * (b - a);

  let PX = 3, W = 1, H = 1, layers = [], buildings = [], windows = [], pal = {};
  let flash = 0, nextBolt = 0, twinkleAt = 0, last = performance.now(), resizeTimer;

  function hexToRgb(hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return h.length === 6 && !Number.isNaN(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [120, 190, 255];
  }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function readPalette() {
    const cs = getComputedStyle(root), v = k => cs.getPropertyValue(k).trim();
    const dark = root.dataset.theme === 'dark';
    pal = { dark, rain: hexToRgb(v('--cat-web')), sky: hexToRgb(dark ? v('--paper') : v('--ink')),
            win: hexToRgb(v('--mark')), flash: dark ? [200, 230, 255] : [255, 255, 255] };
  }

  function spawn(d, anywhere) {
    const len = Math.round(rnd(d.len[0], d.len[1]));
    return { x: rnd(0, W - WIND * H), y: anywhere ? rnd(-len, H) : -rnd(len, len + H * .3), v: rnd(d.speed[0], d.speed[1]), len };
  }

  function layoutCity() {
    buildings = []; windows = [];
    [{ layer: 0, maxH: .17, w: [10, 26], gap: [0, 3], lit: .14 }, { layer: 1, maxH: .105, w: [8, 20], gap: [1, 5], lit: .22 }].forEach(L => {
      let x = -Math.round(rnd(0, 8));
      while (x < W) {
        const bw = Math.round(rnd(L.w[0], L.w[1])), bh = Math.max(8, Math.round(rnd(.35, 1) * L.maxH * H));
        buildings.push({ x, w: bw, h: bh, layer: L.layer });
        for (let wx = 2; wx < bw - 2; wx += 4) for (let wy = 3; wy < bh - 2; wy += 5)
          if (Math.random() < L.lit) windows.push({ x: x + wx, y: H - bh + wy, layer: L.layer, on: Math.random() < .6 });
        x += bw + Math.round(rnd(L.gap[0], L.gap[1]));
      }
    });
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const devPx = Math.max(2, Math.round((innerWidth < 700 ? 2.5 : 3) * dpr));   // số điểm ảnh thiết bị cho 1 điểm mưa (nguyên)
    PX = devPx / dpr;
    W = Math.max(1, Math.ceil(innerWidth / PX)); H = Math.max(1, Math.ceil(innerHeight / PX));
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W * PX}px`; canvas.style.height = `${H * PX}px`;
    const total = Math.min(320, Math.max(70, Math.round(W * H / 1300)));
    layers = LAYERS.map(d => ({ d, drops: Array.from({ length: Math.round(total * d.share) }, () => spawn(d, true)) }));
    layoutCity(); draw();
  }

  function step(dt, now) {
    for (const { d, drops } of layers) for (const p of drops) {
      p.y += p.v * dt; p.x += p.v * dt * WIND;
      if (p.y - p.len > H) Object.assign(p, spawn(d, false));
    }
    if (now > twinkleAt) {
      twinkleAt = now + rnd(500, 1400);
      for (let i = 0; i < 2 && windows.length; i++) { const w = windows[(Math.random() * windows.length) | 0]; w.on = !w.on; }
    }
    if (flash > 0) flash = flash < .02 ? 0 : flash * Math.pow(.88, dt);
    if (now > nextBolt) {
      flash = 1; if (Math.random() < .6) setTimeout(() => { flash = Math.max(flash, .8); }, rnd(110, 190));
      nextBolt = now + rnd(16000, 38000);
    }
  }

  function drawCity() {
    const a = pal.dark ? [.5, .95] : [.05, .09];
    for (const l of [0, 1]) {
      ctx.fillStyle = rgba(pal.sky, a[l]);
      for (const b of buildings) if (b.layer === l) ctx.fillRect(b.x, H - b.h, b.w, b.h);
      ctx.fillStyle = rgba(pal.win, l ? .7 : .4);
      for (const w of windows) if (w.layer === l && w.on) ctx.fillRect(w.x, w.y, 1, 2);
    }
  }

  function drawLayer({ d, drops }) {
    ctx.fillStyle = rgba(pal.rain, d.alpha * .55);                       // đuôi mờ
    for (const p of drops) for (let k = 2; k < p.len; k++) ctx.fillRect(Math.round(p.x - k * WIND), Math.round(p.y - k), 1, 1);
    ctx.fillStyle = rgba(pal.rain, d.alpha);                              // đầu sáng
    for (const p of drops) { ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); ctx.fillRect(Math.round(p.x - WIND), Math.round(p.y - 1), 1, 1); }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawCity();
    layers.forEach(drawLayer);
    if (flash > 0) { ctx.fillStyle = rgba(pal.flash, flash * .10); ctx.fillRect(0, 0, W, H); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(3, (now - last) / 16.667); last = now;
    if (reduceMotion.matches || document.body.classList.contains('bullsheet-active')) return;   // giữ nguyên khung hình
    step(dt, now); draw();
  }

  readPalette(); resize();
  nextBolt = performance.now() + rnd(6000, 12000);
  requestAnimationFrame(frame);
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
  new MutationObserver(() => { readPalette(); draw(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  reduceMotion.addEventListener?.('change', draw);
})();
