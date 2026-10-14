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

    current = C.paint(features, seed);
    current.gray = null;
    features = null;
    await reveal(shown(), id);
    $('#back').focus({ preventScroll: true });
  });

  // pixel dissolve: blocks of the finished image land in random order
  async function reveal(src, id) {
    if (reduceMotion()) { actx.drawImage(src, 0, 0); return; }
    const bs = 60, cols = C.W / bs, rows = C.H / bs;
    const order = Array.from({ length: cols * rows }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const perFrame = Math.ceil(order.length / 40);
    for (let k = 0; k < order.length; k += perFrame) {
      if (id !== job) return;
      for (const i of order.slice(k, k + perFrame)) {
        const x = (i % cols) * bs, y = Math.floor(i / cols) * bs;
        actx.drawImage(src, x, y, bs, bs, x, y, bs, bs);
      }
      await frame();
    }
    actx.drawImage(src, 0, 0);
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
    bd.width = piece.canvas.width; bd.height = piece.canvas.height;
    bd.getContext('2d').drawImage(piece.canvas, 0, 0);
    bd.classList.add('ready');
  }
  // paint after first frame so the card shows immediately
  requestAnimationFrame(() => setTimeout(paintBackdrop, 60));

  poem.focus();
})((window.Conjure = window.Conjure || {}));
