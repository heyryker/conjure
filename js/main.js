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
  let current = null; // { canvas, serial }
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
    features = null;
    await reveal(current.canvas, id);
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
    const filename = `conjure-${current.serial.toLowerCase()}.png`;
    const blob = await new Promise((r) => current.canvas.toBlob(r, 'image/png'));
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

  poem.focus();
})((window.Conjure = window.Conjure || {}));
