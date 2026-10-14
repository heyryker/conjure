/* Conjure — page wiring: notebook, canvas, reading panel. */
(function (C) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const PREVIEW = !!window.CONJURE_PREVIEW;

  const SAMPLES = {
    dickinson: {
      title: 'Hope is the thing with feathers',
      by: 'Emily Dickinson',
      text: `“Hope” is the thing with feathers -
That perches in the soul -
And sings the tune without the words -
And never stops - at all -

And sweetest - in the Gale - is heard -
And sore must be the storm -
That could abash the little Bird
That kept so many warm -

I’ve heard it in the chillest land -
And on the strangest Sea -
Yet - never - in Extremity,
It asked a crumb - of me.`
    },
    blake: {
      title: 'The Tyger',
      by: 'William Blake',
      text: `Tyger Tyger, burning bright,
In the forests of the night;
What immortal hand or eye,
Could frame thy fearful symmetry?

In what distant deeps or skies.
Burnt the fire of thine eyes?
On what wings dare he aspire?
What the hand, dare seize the fire?`
    },
    teasdale: {
      title: 'There Will Come Soft Rains',
      by: 'Sara Teasdale',
      text: `There will come soft rains and the smell of the ground,
And swallows circling with their shimmering sound;

And frogs in the pools singing at night,
And wild plum trees in tremulous white;

Robins will wear their feathery fire,
Whistling their whims on a low fence-wire;

And not one will know of the war, not one
Will care at last when it is done.`
    },
    rossetti: {
      title: 'Who Has Seen the Wind?',
      by: 'Christina Rossetti',
      text: `Who has seen the wind?
Neither I nor you:
But when the leaves hang trembling,
The wind is passing through.

Who has seen the wind?
Neither you nor I:
But when the trees bow down their heads,
The wind is passing by.`
    }
  };

  const poemEl = $('#poem'), titleEl = $('#poem-title');
  const canvas = $('#art'), ctx = canvas.getContext('2d');
  canvas.width = C.W; canvas.height = C.H;
  const frame = $('#frame'), statusEl = $('#status');
  let variant = 0, job = 0, last = null;

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function save() {
    try { localStorage.setItem('conjure:draft', JSON.stringify({ title: titleEl.value, text: poemEl.value })); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem('conjure:draft') || 'null'); } catch (e) { return null; }
  }

  async function conjure() {
    const text = poemEl.value;
    if (!text.trim()) { statusEl.textContent = 'Write a few lines first, then press Conjure.'; poemEl.focus(); return; }
    const id = ++job;
    const f = C.analyze(text);
    const seed = C.seed32(text.trim() + '§' + variant);
    const plan = C.plan(ctx, f, seed);
    last = { f, plan };
    renderReading(f, plan);
    frame.classList.add('is-drawing');
    statusEl.textContent = 'Reading ' + f.lineCount + ' lines…';
    const slow = !reduceMotion();
    for (const step of plan.steps) {
      if (id !== job) return;
      step.fn();
      if (slow) { statusEl.textContent = step.label + '…'; await nextFrame(); }
    }
    if (id !== job) return;
    frame.classList.remove('is-drawing');
    statusEl.textContent = `${plan.mode.name} · variation ${variant + 1}`;
    $('#mode-name').textContent = plan.mode.name;
    $('#serial').textContent = 'N° ' + plan.serial;
    if (!PREVIEW) updateUrl();
  }

  /* ---------- the reading panel ---------- */
  const pct = (v) => Math.round(C.clamp(v) * 100);
  function bar(label, v, drives) {
    return `<div class="factor"><span class="f-label">${label}</span>` +
      `<span class="f-bar" aria-hidden="true"><i style="width:${pct(v)}%"></i></span>` +
      `<span class="f-val">${pct(v)}</span><span class="f-drives">${drives}</span></div>`;
  }
  function renderReading(f, plan) {
    const p = plan.palette;
    const sent = f.sentiment;
    const themeRows = Object.keys(f.themes)
      .filter((k) => f.themeCounts[k] > 0)
      .sort((a, b) => f.themes[b] - f.themes[a])
      .map((k) => bar(k, f.themes[k], `${f.themeCounts[k]} word${f.themeCounts[k] > 1 ? 's' : ''}`))
      .join('') || '<p class="f-empty">No strong imagery found. Layout falls back to rhythm.</p>';
    const swatches = p.inkMeta.map((k) =>
      `<span class="swatch" style="background:${C.hex(k.rgb)}" title="${k.word ? '“' + k.word + '”' : C.hex(k.rgb)}"></span>`).join('');
    const sentPos = ((sent + 1) / 2) * 100;

    $('#reading').innerHTML = `
      <section class="group">
        <h3>Sound</h3>
        ${bar('Plosives', f.plosive, 'shards, grain')}
        ${bar('Liquids', f.liquid, 'blobs')}
        ${bar('Sibilants', f.sibilant, 'ribbons, smoother flow')}
        ${bar('Nasals', f.nasal, 'rings')}
        ${bar('Vowel light', f.vowelBright, 'ink lightness')}
        ${bar('Alliteration', f.alliteration, 'print offset')}
      </section>
      <section class="group">
        <h3>Rhythm</h3>
        ${bar('Meter', f.meter, 'order, grid snap')}
        ${bar('Line variance', f.lineVariance, 'tilt, rotation')}
        ${bar('Enjambment', f.enjambment, 'open outlines')}
        ${bar('Rhyme', f.rhyme, 'threads, mirror')}
        ${bar('Repetition', f.repetition, 'dot echo')}
        <div class="factor"><span class="f-label">Shape</span><span class="f-stat">${f.lineCount} lines · ${f.stanzaCount} stanza${f.stanzaCount === 1 ? '' : 's'} · ${f.wordCount} words</span></div>
      </section>
      <section class="group">
        <h3>Feeling</h3>
        <div class="factor"><span class="f-label">Sentiment</span>
          <span class="f-scale" aria-hidden="true"><b style="left:${sentPos}%"></b></span>
          <span class="f-val">${sent > 0 ? '+' : ''}${sent.toFixed(2)}</span><span class="f-drives">cool ↔ warm</span></div>
        ${bar('Intensity', f.intensity, 'saturation')}
        ${bar('Energy', f.energy, 'turbulence')}
        ${bar('Calm', f.calm, 'laminar flow')}
        ${bar('Openness', f.openness, 'open arcs')}
        ${bar('“I”', f.self, 'sun')}
        ${bar('“You”', f.other, 'ring')}
      </section>
      <section class="group">
        <h3>Imagery</h3>
        ${themeRows}
        <div class="factor"><span class="f-label">Keyword</span><span class="f-stat"><em>${escapeHtml(f.keyword || '—')}</em></span></div>
        <div class="factor"><span class="f-label">Palette</span><span class="f-stat swatches">${swatches}</span><span class="f-drives">${p.scheme.toLowerCase()}${p.dark ? ', night ground' : ''}</span></div>
      </section>`;
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------- share links (deployed site only) ---------- */
  const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  function updateUrl() {
    try {
      const u = new URL(location.href);
      u.searchParams.set('p', b64e(poemEl.value.trim()));
      if (titleEl.value.trim()) u.searchParams.set('t', titleEl.value.trim()); else u.searchParams.delete('t');
      u.searchParams.set('v', String(variant));
      history.replaceState(null, '', u);
    } catch (e) { /* ignore */ }
  }
  function fromUrl() {
    try {
      const u = new URL(location.href);
      const p = u.searchParams.get('p');
      if (!p) return null;
      return { text: b64d(p), title: u.searchParams.get('t') || '', variant: parseInt(u.searchParams.get('v') || '0', 10) || 0 };
    } catch (e) { return null; }
  }

  /* ---------- controls ---------- */
  function useSample(key) {
    const s = SAMPLES[key];
    titleEl.value = s.title;
    poemEl.value = s.text;
    variant = 0;
    save();
    conjure();
  }
  document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => useSample(b.dataset.sample)));
  $('#conjure').addEventListener('click', () => { variant = 0; conjure(); });
  $('#variation').addEventListener('click', () => { variant++; conjure(); });
  $('#clear').addEventListener('click', () => { titleEl.value = ''; poemEl.value = ''; save(); poemEl.focus(); statusEl.textContent = 'Fresh page. Write something.'; });
  poemEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); variant = 0; conjure(); }
  });
  poemEl.addEventListener('input', save);
  titleEl.addEventListener('input', save);

  const dl = $('#download'), share = $('#share');
  if (PREVIEW) { dl.hidden = true; share.hidden = true; }
  dl.addEventListener('click', () => {
    if (!last) return;
    const name = (titleEl.value.trim() || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `conjure-${name}-${last.plan.serial.toLowerCase()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
  share.addEventListener('click', async () => {
    updateUrl();
    try { await navigator.clipboard.writeText(location.href); statusEl.textContent = 'Link copied. Same poem, same picture.'; }
    catch (e) { statusEl.textContent = 'Copy the address bar to share this piece.'; }
  });

  /* ---------- start ---------- */
  async function start() {
    const shared = PREVIEW ? null : fromUrl();
    const draft = load();
    if (shared) { poemEl.value = shared.text; titleEl.value = shared.title; variant = shared.variant; }
    else if (draft && draft.text && draft.text.trim()) { poemEl.value = draft.text; titleEl.value = draft.title || ''; }
    else { titleEl.value = SAMPLES.dickinson.title; poemEl.value = SAMPLES.dickinson.text; }
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('italic 400 200px "Libre Caslon Text"'),
          document.fonts.load('500 15px "Martian Mono"')
        ]),
        new Promise((r) => setTimeout(r, 1500))
      ]);
    } catch (e) { /* fonts optional */ }
    conjure();
  }
  start();
})((window.Conjure = window.Conjure || {}));
