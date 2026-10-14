/* Conjure — page wiring.
   The poem lives only in the textarea. On submit it is read once, cleared,
   turned into numbers, and dropped. Nothing is stored or sent anywhere. */
(function (C) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const write = $('#write'), view = $('#view');
  const form = $('#form'), poem = $('#poem'), submit = $('#submit');
  const art = $('#art'), toast = $('#toast');
  art.width = C.W; art.height = C.H;
  const actx = art.getContext('2d');
  actx.imageSmoothingEnabled = false;
  let current = null; // { canvas, gray, serial }
  let mode = 'color'; // stays for the session so the next piece opens in the same mode
  let job = 0;
  let backdropPalette = null; // the result never reuses the landing page's palette
  let printing = false;

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

  poem.addEventListener('input', () => { submit.disabled = !poem.value.trim(); });
  poem.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!poem.value.trim()) return;

    // read once, then let the words go
    let features = C.analyze(poem.value);
    const salt = crypto.getRandomValues(new Uint32Array(1))[0];
    const seed = (C.seed32(poem.value) ^ salt) >>> 0;
    poem.value = '';
    submit.disabled = true;

    const id = ++job;
    write.hidden = true;
    view.hidden = false;
    actx.fillStyle = '#000';
    actx.fillRect(0, 0, C.W, C.H);
    await frame(); await frame();
    if (id !== job) return;

    current = C.paint(features, seed, { avoidPalette: backdropPalette });
    current.gray = null;
    features = null;
    await reveal(shown(), id);
    $('#back').focus({ preventScroll: true });
  });

  // pixel dissolve: blocks of the finished image land in random order, slowly, easing in and out
  async function reveal(src, id) {
    if (reduceMotion()) { actx.drawImage(src, 0, 0); return; }
    printing = true;
    const bs = 16, cols = C.W / bs, rows = Math.ceil(C.H / bs);
    const order = Array.from({ length: cols * rows }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const FRAMES = 150; // ~2.5s at 60fps
    let done = 0;
    for (let k = 1; k <= FRAMES; k++) {
      if (id !== job) { printing = false; return; }
      const t = k / FRAMES, eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const upto = Math.round(eased * order.length);
      for (; done < upto; done++) {
        const i = order[done], x = (i % cols) * bs, y = Math.floor(i / cols) * bs;
        actx.drawImage(src, x, y, bs, bs, x, y, bs, bs);
      }
      await frame();
    }
    actx.drawImage(src, 0, 0);
    printing = false;
  }

  // grayscale: luminance with a gentle S-curve so the darks and lights keep their bite
  function toGray(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    // luminance, then auto-levels (stretch the 1st–99th percentile to full black–white),
    // so colors that were bright but similar in value still separate
    // like a photographer's colored filter: try a few channel mixes, keep the one with most contrast
    const mixes = [[0.2126, 0.7152, 0.0722], [0.7, 0.25, 0.05], [0.1, 0.3, 0.6], [0.3, 0.6, 0.1], [0.55, 0.05, 0.4]];
    let w = mixes[0], best = -1;
    for (const m of mixes) {
      let s = 0, s2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 97) { const v = m[0] * d[i] + m[1] * d[i + 1] + m[2] * d[i + 2]; s += v; s2 += v * v; n++; }
      const sd = Math.sqrt(s2 / n - (s / n) ** 2);
      if (sd > best) { best = sd; w = m; }
    }
    const L = new Uint8ClampedArray(d.length / 4), hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      L[j] = Math.round(w[0] * d[i] + w[1] * d[i + 1] + w[2] * d[i + 2]);
      hist[L[j]]++;
    }
    const pct = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= L.length * p) return v; } return 255; };
    const lo = pct(0.01), hi = Math.max(lo + 1, pct(0.99));
    const curve = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const t = Math.min(1, Math.max(0, (i - lo) / (hi - lo))), s = t * t * (3 - 2 * t);
      curve[i] = Math.round((t * 0.4 + s * 0.6) * 255);
    }
    for (let i = 0, j = 0; i < d.length; i += 4, j++) d[i] = d[i + 1] = d[i + 2] = curve[L[j]];
    x.putImageData(img, 0, 0);
    return c;
  }
  function shown() {
    if (mode === 'gray') return current.gray || (current.gray = toGray(current.canvas));
    return current.canvas;
  }
  function setMode(m) {
    if (printing) job++; // switching mid-print finishes the print at once
    printing = false;
    mode = m;
    $('#mode-color').setAttribute('aria-pressed', String(m === 'color'));
    $('#mode-gray').setAttribute('aria-pressed', String(m === 'gray'));
    if (current) actx.drawImage(shown(), 0, 0);
  }
  $('#mode-color').addEventListener('click', () => setMode('color'));
  $('#mode-gray').addEventListener('click', () => setMode('gray'));

  function back() {
    job++;
    current = null;
    actx.clearRect(0, 0, C.W, C.H);
    view.hidden = true;
    write.hidden = false;
    poem.focus();
  }
  $('#back').addEventListener('click', back);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !view.hidden) back(); });

  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(say.t);
    say.t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  $('#download').addEventListener('click', async () => {
    if (!current) return;
    const filename = `conjure-${current.serial.toLowerCase()}${mode === 'gray' ? '-gray' : ''}.png`;
    const blob = await new Promise((r) => shown().toBlob(r, 'image/png'));
    if (!blob) { say('Couldn’t make the file. Try again.'); return; }

    // inside a Claude artifact the viewer handles saving; elsewhere use a normal download
    const downloads = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
    if (downloads) {
      try { await downloads.save({ filename, data: blob }); say('Saved.'); }
      catch (err) { if (err && err.code !== 'declined') say('Download isn’t available here.'); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  // backdrop: a fresh piece painted from a few random image words, never from anything typed
  const WORDS = ['rain', 'river', 'salt', 'moon', 'feather', 'stone', 'bloom', 'smoke', 'tide', 'dusk', 'wing', 'glass',
    'ember', 'field', 'mist', 'velvet', 'hollow', 'honey', 'static', 'shore', 'orchid', 'cloud', 'dream', 'skin'];
  function paintBackdrop() {
    const bd = $('#backdrop');
    const r = () => WORDS[(crypto.getRandomValues(new Uint32Array(1))[0]) % WORDS.length];
    const text = Array.from({ length: 4 }, () => `${r()} and ${r()}, the ${r()} ${r()}`).join('\n');
    const piece = C.paint(C.analyze(text), crypto.getRandomValues(new Uint32Array(1))[0]);
    backdropPalette = piece.palette;
    bd.width = piece.canvas.width; bd.height = piece.canvas.height;
    bd.getContext('2d').drawImage(piece.canvas, 0, 0);
    bd.classList.add('ready');
    const { base, alt } = bannerColors(piece.colors, bd);
    const head = $('.card-head');
    head.style.backgroundColor = `rgb(${base.join(',')})`;
    head.style.backgroundImage = `url(${bannerTexture(base, alt, head)})`;
    head.classList.add('textured');
  }
  // banner: a palette color that stands apart from what dominates the backdrop,
  // deepened if needed so the white logo reads on it (contrast >= 3:1)
  function bannerColors(hexes, bd) {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const onWhite = (c) => 1.05 / (lum(c) + 0.05);
    // average backdrop color from a coarse sample
    const s = document.createElement('canvas'); s.width = 48; s.height = 27;
    const sx = s.getContext('2d'); sx.drawImage(bd, 0, 0, 48, 27);
    const d = sx.getImageData(0, 0, 48, 27).data;
    const avg = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; }
    avg.forEach((v, i) => { avg[i] = v / (d.length / 4); });
    const dist = (c) => Math.hypot(c[0] - avg[0], c[1] - avg[1], c[2] - avg[2]);
    const sat = (c) => Math.max(...c) - Math.min(...c);
    const deepen = (c) => { let k = 1; let o = c; while (onWhite(o) < 3 && k > 0.2) { k -= 0.05; o = c.map((v) => Math.round(v * k)); } return o; };
    const ranked = hexes.map(rgb).filter((c) => sat(c) > 40).map(deepen)
      .sort((a, b) => (dist(b) + sat(b) * 0.5) - (dist(a) + sat(a) * 0.5));
    const base = ranked[0] || [17, 17, 17];
    const alt = ranked[1] || base.map((v) => Math.round(v * 0.6));
    return { base, alt };
  }

  // pixel grit for the banner: chunky dithered cells blending base -> alt, a few smeared rows,
  // sparse specks and fine grain, kept dark enough that the white logo always reads
  function bannerTexture(base, alt, el) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(el.clientWidth * dpr), H = Math.round(el.clientHeight * dpr);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const img = x.createImageData(W, H), d = img.data;
    const rnd = C.prng(crypto.getRandomValues(new Uint32Array(1))[0]);
    const noise = C.makeNoise(rnd);
    const cell = Math.round(5 * dpr);
    const bay = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const deep = base.map((v) => Math.round(v * 0.72));
    const phase = rnd() * 10, tilt = rnd() < 0.5 ? 1 : -1;
    const smears = Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({ y: Math.floor(rnd() * H), h: Math.round((1 + rnd() * 3) * dpr), x0: Math.floor(rnd() * W * 0.6), len: Math.floor(W * (0.15 + rnd() * 0.4)) }));
    for (let cy = 0; cy * cell < H; cy++) {
      for (let cx = 0; cx * cell < W; cx++) {
        const u = (cx * cell) / W, v = (cy * cell) / H;
        let t = 0.5 + 0.5 * noise(u * 3 + phase, v * 1.5) + (tilt > 0 ? u - 0.5 : 0.5 - u) * 0.6;
        t = Math.max(0, Math.min(1, t));
        const lvl = Math.min(2, Math.floor(t * 2 + bay[cy & 3][cx & 3] / 16));
        const col = [deep, base, alt][lvl];
        for (let yy = cy * cell; yy < Math.min(H, (cy + 1) * cell); yy++) {
          for (let xx = cx * cell; xx < Math.min(W, (cx + 1) * cell); xx++) {
            const i = (yy * W + xx) * 4;
            d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
          }
        }
      }
    }
    // smeared rows: drag color along a few short bands
    for (const sm of smears) {
      for (let yy = sm.y; yy < Math.min(H, sm.y + sm.h); yy++) {
        let r = -1, g = 0, b = 0;
        for (let xx = sm.x0; xx < Math.min(W, sm.x0 + sm.len); xx++) {
          const i = (yy * W + xx) * 4;
          if (r < 0) { r = d[i]; g = d[i + 1]; b = d[i + 2]; }
          r += (d[i] - r) * 0.06; g += (d[i + 1] - g) * 0.06; b += (d[i + 2] - b) * 0.06;
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
      }
    }
    // specks + grain
    for (let n = 0; n < W * H * 0.004; n++) {
      const i = (Math.floor(rnd() * H) * W + Math.floor(rnd() * W)) * 4;
      const lift = rnd() < 0.5 ? 60 : -50;
      d[i] += lift; d[i + 1] += lift; d[i + 2] += lift;
    }
    for (let i = 0; i < d.length; i += 4) {
      const g = (rnd() - 0.5) * 26;
      d[i] += g; d[i + 1] += g; d[i + 2] += g;
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  // paint after first frame so the card shows immediately
  setTimeout(paintBackdrop, 80); // a timer, not rAF, so it still paints in a background tab

  poem.focus();
})((window.Conjure = window.Conjure || {}));
