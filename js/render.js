/* Conjure — pixel renderer.
   A poem picks a scene, a palette and a pixel size. The scene is painted into a
   low-res index buffer, dithered into a few vibrant colors, overlaid with fine
   1-px "instrument" lines, scaled up crisp to 1920×1080, then given grain,
   RGB split and glitch rows.  C.paint(features, seed) -> { canvas, scene, palette, serial } */
(function (C) {
  'use strict';
  const OW = 1920, OH = 1080;   // output
  const AW = 960, AH = 540;     // accent grid (2 output px per accent px)
  const TAU = Math.PI * 2;
  const clamp = C.clamp;
  C.W = OW; C.H = OH;

  /* ---------- ordered dither matrix (8×8 Bayer, values in [0,1)) ---------- */
  const BAYER = (() => {
    let b = [[0, 2], [3, 1]];
    for (let n = 2; n < 8; n *= 2) {
      const nb = [];
      for (let y = 0; y < n * 2; y++) {
        nb.push([]);
        for (let x = 0; x < n * 2; x++) {
          nb[y].push(b[y % n][x % n] * 4 + [[0, 2], [3, 1]][Math.floor(y / n)][Math.floor(x / n)]);
        }
      }
      b = nb;
    }
    return b.map((r) => r.map((v) => (v + 0.5) / 64));
  })();
  const bayer = (x, y) => BAYER[y & 7][x & 7];

  /* ---------- palettes: first color is the ground ---------- */
  const PALETTES = [
    { name: 'Periwinkle', c: ['#7f83f2', '#5c0e2e', '#ff8ad8', '#e8e6ff'], tags: { air: 1, water: 0.5, time: 0.3 }, sky: 1, soft: 1 },
    { name: 'Sage', c: ['#d8dfa3', '#ff6fd2', '#5c0e2e', '#7f83f2'], tags: { earth: 1, love: 0.7 } },
    { name: 'Blaze', c: ['#ff5717', '#58102b', '#ffb199', '#ffe14a'], tags: { fire: 1, body: 0.6 } },
    { name: 'Neon', c: ['#060608', '#00e7ff', '#ff1fc7', '#ffe81a', '#13d66b', '#ff4a1c'], tags: { night: 1, fire: 0.4 }, dark: 1, energy: 1 },
    { name: 'Knit', c: ['#2a5bd7', '#3fd17a', '#ffe04a', '#ff5d78'], tags: { water: 0.7, time: 0.6, earth: 0.4 } },
    { name: 'Pop', c: ['#ffffff', '#1aa1ff', '#ff2b8c', '#ffe500', '#121212', '#ff7b57'], tags: { time: 0.8, love: 0.4 }, energy: 0.6 },
    { name: 'Dusk', c: ['#cfc6b4', '#ff4f6e', '#3c7aa6', '#ece36a'], tags: { body: 0.8, water: 0.7, earth: 0.5 }, sky: 1, soft: 1 },
    { name: 'Acid', c: ['#0d0d10', '#c8ff00', '#ff3ea5', '#6c5cff'], tags: { night: 0.7, fire: 0.3 }, dark: 1, energy: 0.9 },
    { name: 'Lagoon', c: ['#06283a', '#16e0c6', '#ff8a3d', '#f2efe0'], tags: { water: 1, night: 0.4 }, dark: 1, sky: 0.5 },
    { name: 'Bubblegum', c: ['#ffd3ea', '#1f1ad8', '#ff5a36', '#7be0ff'], tags: { love: 1, air: 0.6 }, sky: 0.6 },
    { name: 'Mint', c: ['#b9f6d9', '#2b1a90', '#ff4fa1', '#ffe14a'], tags: { earth: 0.7, air: 0.5 }, sky: 0.6 },
    { name: 'Ultraviolet', c: ['#18063a', '#ff4fd9', '#40f0ff', '#fff46a'], tags: { night: 1, love: 0.4 }, dark: 1, sky: 0.5 },
    { name: 'Lilac', c: ['#e9e4ff', '#8a7bff', '#ff5fa8', '#4a1d5e', '#ffd166'], tags: { air: 0.7, love: 0.6, night: 0.3 }, soft: 1, sky: 0.8 },
    { name: 'Peach Fog', c: ['#f3d6c6', '#ff3d6e', '#3a6fb0', '#f2ee8a', '#5b1530'], tags: { body: 0.7, water: 0.5, fire: 0.4 }, soft: 1, sky: 1 },
    { name: 'Seafoam', c: ['#d4efe8', '#2f4fd1', '#ff6b9a', '#fff2a8', '#1d2f6b'], tags: { water: 0.9, air: 0.4 }, soft: 1, sky: 0.9 },
    { name: 'Haze', c: ['#dcd7ea', '#ff4f8b', '#4b6bd6', '#f7d046', '#3d1440'], tags: { time: 0.6, earth: 0.4, love: 0.4 }, soft: 1, sky: 1 },
    { name: 'Orchid', c: ['#f1e6f5', '#b44dff', '#ff7a3d', '#2a2a8a', '#7ee0c3'], tags: { love: 0.6, fire: 0.4, earth: 0.3 }, soft: 1, sky: 0.7 }
  ];
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sat = (c) => Math.max(...c) - Math.min(...c);

  /* ---------- index buffers + pixel primitives ---------- */
  function buf(w, h, fill) { return { w, h, d: new Int16Array(w * h).fill(fill) }; }
  function px(b, x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
    b.d[y * b.w + x] = c;
  }
  function line(b, x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 8000; guard++) {
      px(b, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function ring(b, cx, cy, r, c, dashed) {
    const n = Math.max(12, Math.ceil(TAU * r * 1.4));
    for (let i = 0; i < n; i++) {
      if (dashed && (i % 6) > 2) continue;
      const a = (i / n) * TAU;
      px(b, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
    }
  }
  function rect(b, x, y, w, h, c) {
    for (let yy = y | 0; yy < (y + h) | 0; yy++) for (let xx = x | 0; xx < (x + w) | 0; xx++) px(b, xx, yy, c);
  }
  function fbm(noise, x, y, oct = 4) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  const unit = (v) => clamp(0.5 + v * 0.75); // fbm (~±0.65) -> 0..1

  /* ---------- scene choice ---------- */
  function pickScene(f, rand) {
    const t = f.themes;
    // Rotation is the soft, melting direction: a dithered landscape or a dithered colour field.
    // poster / columns / tiles remain available through opts.scene.
    const scores = {
      skyline: ((t.earth || 0) + (t.water || 0)) * 0.6 + f.calm * 0.45 + (t.air || 0) * 0.3 + f.meter * 0.15,
      knit: f.intensity * 0.35 + f.liquid * 0.35 + (t.love || 0) * 0.5 + (t.body || 0) * 0.3 + f.enjambment * 0.2,
      ascii: 0.2 + f.repetition * 0.4 + f.meter * 0.25 + clamp(f.comma) * 0.2 + (t.time || 0) * 0.3 + f.plosive * 0.2
    };
    let best = 'knit', bs = -1;
    for (const k in scores) { const s = scores[k] + rand() * 0.55; if (s > bs) { bs = s; best = k; } }
    return best;
  }

  function pickPalette(f, rand, scene, avoid) {
    // never repeat the avoided palette, nor one whose ground or lead ink sits close to it
    const near = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 70; };
    const banned = avoid && PALETTES.find((p) => p.name === avoid);
    const ok = (p) => !banned || (p !== banned && !near(p.c[0], banned.c[0]) && !near(p.c[1], banned.c[1]));
    let best = PALETTES[0], bs = -Infinity;
    for (const p of PALETTES) {
      if (!ok(p)) continue;
      let s = rand() * 0.7 + (p.soft ? 0.7 : 0) - (p.dark ? 0.6 : 0);
      for (const k in p.tags) s += (f.themes[k] || 0) * p.tags[k];
      s += (p.energy || 0) * f.energy * 0.5;
      if (p.dark) s += (f.sentiment < -0.1 ? 0.35 : 0) + (scene === 'columns' ? 1.2 : 0);
      else if (scene === 'columns') s -= 0.6;
      if (scene === 'skyline') s += (p.sky || 0) * 0.7;
      if (scene === 'tiles' && p.c.length >= 5) s += 0.4;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  /* ---------- the painting ---------- */
  C.paint = function (f, seed, opts) {
    const rand = C.prng(seed);
    const noise = C.makeNoise(rand);
    const picked = pickScene(f, rand);
    const scene = (opts && opts.scene) || picked;
    const pal = pickPalette(f, rand, scene, opts && opts.avoidPalette);

    // palette as RGB list; derived tones get appended on demand
    const P = pal.c.map(hexRgb);
    const toneCache = {};
    function tone(i, j, t) {
      const k = i + ':' + j + ':' + t;
      if (toneCache[k] !== undefined) return toneCache[k];
      P.push(P[i].map((v, n) => Math.round(v + (P[j][n] - v) * t)));
      return (toneCache[k] = P.length - 1);
    }
    const base = pal.c.length;
    const G = 0; // ground
    const inks = Array.from({ length: base - 1 }, (_, i) => i + 1);
    const contrast = inks.reduce((a, b) => (Math.abs(lum(P[b]) - lum(P[G])) > Math.abs(lum(P[a]) - lum(P[G])) ? b : a));
    const accent = inks.reduce((a, b) => (sat(P[b]) + Math.abs(lum(P[b]) - lum(P[G])) * 0.4 > sat(P[a]) + Math.abs(lum(P[a]) - lum(P[G])) * 0.4 ? b : a));
    const pickInk = () => inks[Math.floor(rand() * inks.length)];

    // pixel size: hard consonants -> chunky, soft sounds -> fine
    const delicacy = clamp(0.45 + 0.35 * f.sibilant + 0.3 * f.liquid - 0.45 * f.plosive + 0.2 * f.calm);
    const widths = [192, 240, 320, 480];
    let W0 = widths[Math.round(delicacy * 3)];
    if (scene === 'tiles') W0 = 480;
    if (scene === 'columns') W0 = 240;
    if (scene === 'knit') W0 = delicacy > 0.5 && rand() < 0.6 ? 240 : 160;
    if (scene === 'skyline') W0 = 320;
    if (scene === 'ascii') W0 = 240;
    const H0 = Math.round((W0 * 9) / 16);
    const B = buf(W0, H0, G);
    const A = buf(AW, AH, -1);

    const lines = f.lineInfo.length ? f.lineInfo : [{ words: 1, syl: 1, sound: 'liquid', endPunct: '', wordLens: [4], wordCodes: [7], wordStops: [false], stanza: 0 }];
    const allWords = [];
    lines.forEach((l) => l.wordLens.forEach((len, i) => allWords.push({ len, code: l.wordCodes[i], stop: l.wordStops[i] })));
    if (!allWords.length) allWords.push({ len: 4, code: 7, stop: false });

    /* ===== scenes ===== */
    function SCENES_poster() {
      // stanza -> region, region pattern from that stanza's dominant sound
      const S = clamp(f.stanzaCount || 1, 1, 4);
      const margin = f.meter > 0.5 || rand() < 0.4 ? Math.round(H0 * (0.04 + rand() * 0.04)) : 0;
      const box = { x0: margin, y0: margin, x1: W0 - margin, y1: H0 - margin };
      const stanzaSound = [];
      for (let s = 0; s < S; s++) {
        const counts = {};
        lines.filter((l) => Math.min(l.stanza, S - 1) === s).forEach((l) => { counts[l.sound] = (counts[l.sound] || 0) + 1; });
        stanzaSound.push(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'liquid');
      }
      const regions = [];
      const split = S === 1 ? (rand() < 0.6 ? 'inset' : 'single') : (f.lineVariance > 0.55 ? 'cols' : 'bands');
      const two = f.intensity < 0.35 || rand() < 0.5; // strict two-color poster
      const ramp = (r) => {
        if (two) return r % 2 ? [inks[0], G] : [G, inks[0]];
        const a = inks[r % inks.length], b = inks[(r + 1) % inks.length];
        return r % 2 ? [a, G] : [G, a, b].slice(0, f.energy > 0.45 ? 3 : 2);
      };
      if (split === 'inset' || split === 'single') {
        regions.push({ ...box, fn: pattern(stanzaSound[0], box), ramp: ramp(0) });
        if (split === 'inset') {
          const ins = Math.round(H0 * (0.12 + rand() * 0.12));
          const inner = { x0: box.x0 + ins * 1.6, y0: box.y0 + ins, x1: box.x1 - ins * 1.6, y1: box.y1 - ins };
          regions.push({ ...inner, fn: pattern(soundFor(1), inner), ramp: ramp(1) });
        }
      } else {
        const total = lines.length;
        let acc = 0;
        for (let s = 0; s < S; s++) {
          const n = lines.filter((l) => Math.min(l.stanza, S - 1) === s).length || 1;
          const a = acc / total, b = (acc + n) / total;
          acc += n;
          const r = split === 'bands'
            ? { x0: box.x0, x1: box.x1, y0: Math.round(box.y0 + (box.y1 - box.y0) * a) + (s ? 1 : 0), y1: Math.round(box.y0 + (box.y1 - box.y0) * b) }
            : { y0: box.y0, y1: box.y1, x0: Math.round(box.x0 + (box.x1 - box.x0) * a) + (s ? 1 : 0), x1: Math.round(box.x0 + (box.x1 - box.x0) * b) };
          regions.push({ ...r, fn: pattern(stanzaSound[s], r), ramp: ramp(s) });
        }
      }
      fillRegions(regions);
      if (f.self > 0.05) sun();
      function soundFor(i) { return ['nasal', 'sibilant', 'plosive', 'liquid'][(i + Math.floor(rand() * 4)) % 4]; }
      function sun() {
        const r = H0 * (0.12 + f.self * 0.12);
        const cx = W0 * (rand() < 0.5 ? 0.33 : 0.67), cy = H0 * (0.55 + rand() * 0.2);
        const c = two ? inks[0] : accent;
        for (let y = Math.floor(cy - r); y <= cy + r; y++) {
          for (let x = Math.floor(cx - r); x <= cx + r; x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
            const slit = y > cy && ((y - Math.floor(cy)) % 5) < 1 + ((y - cy) / r) * 2.5;
            px(B, x, y, slit ? G : c);
          }
        }
      }
    }

    function pattern(sound, reg) {
      const opts = { plosive: ['blocks', 'rain', 'checker'], sibilant: ['waves', 'warp'], liquid: ['blobs', 'warp'], nasal: ['moire', 'rings'] }[sound] || ['warp'];
      const kind = opts[Math.floor(rand() * opts.length)];
      const cx = (reg.x0 + (reg.x1 - reg.x0) * (0.2 + rand() * 0.6)) / H0, cy = (reg.y0 + (reg.y1 - reg.y0) * (0.2 + rand() * 0.6)) / H0;
      const o = rand() * 100;
      switch (kind) {
        case 'moire': {
          const c2x = cx + (rand() - 0.5) * 0.6, c2y = cy + (rand() - 0.5) * 0.4;
          const fr = 60 + rand() * 90;
          return { L: 2, fn: (nx, ny) => 0.5 + 0.5 * Math.sin(Math.hypot(nx - cx, ny - cy) * fr) * Math.sin(Math.hypot(nx - c2x, ny - c2y) * fr * 1.06) };
        }
        case 'rings': {
          const fr = 25 + rand() * 40;
          return { L: 2, fn: (nx, ny) => { const d = Math.hypot(nx - cx, ny - cy); return ((d * fr + fbm(noise, nx * 3 + o, ny * 3) * 1.5) % 1 + 1) % 1 < 0.5 ? 1 : 0; } };
        }
        case 'warp': {
          const sc = 0.8 + rand() * 1.2, bands = 2 + Math.floor(rand() * 2);
          return { L: 2, fn: (nx, ny) => {
            const q = fbm(noise, nx * sc + o, ny * sc, 2);
            const r = fbm(noise, nx * sc + 2.2 * q + 1.7, ny * sc + 2.2 * q + 9.2, 3);
            return ((unit(r) * bands) % 1);
          } };
        }
        case 'waves': {
          const fr = 35 + rand() * 60, amp = 0.5 + rand() * 1.4;
          return { L: 2, fn: (nx, ny) => 0.5 + 0.5 * Math.sin(ny * fr + amp * fbm(noise, nx * 2 + o, ny * 2, 3) * TAU) };
        }
        case 'blobs': {
          const sc = 1.3 + rand() * 1.8;
          return { L: 3, fn: (nx, ny) => unit(fbm(noise, nx * sc + o, ny * sc, 5) * 1.3) };
        }
        case 'checker': {
          const a = 30 + rand() * 50, b = 30 + rand() * 50;
          return { L: 2, fn: (nx, ny) => 0.5 + 0.5 * Math.sin(nx * a + fbm(noise, nx * 2, ny * 2 + o) * 4) * Math.sin(ny * b) };
        }
        case 'rain': {
          const cw = 0.012 + rand() * 0.025;
          return { L: 2, fn: (nx, ny) => {
            const col = Math.floor(nx / cw);
            const h = (C.seed32('r' + col + o) % 1000) / 1000;
            const top = h * 0.6, len = 0.2 + ((C.seed32('l' + col + o) % 1000) / 1000) * 0.8;
            return ny > top + (reg.y0 / H0) && ny < top + len + (reg.y0 / H0) ? 1 : 0;
          } };
        }
        default: { // blocks: xor of word-sized rectangles
          const rs = [];
          const n = 6 + Math.floor(rand() * 9);
          for (let i = 0; i < n; i++) {
            const w = allWords[(i * 3) % allWords.length].len;
            rs.push({ x: reg.x0 + rand() * (reg.x1 - reg.x0), y: reg.y0 + rand() * (reg.y1 - reg.y0), w: (reg.x1 - reg.x0) * (0.05 + w * 0.025), h: (reg.y1 - reg.y0) * (0.04 + rand() * 0.3) });
          }
          return { L: 2, px: true, fn: (x, y) => { let k = 0; for (const r of rs) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) k++; return k % 2; } };
        }
      }
    }

    function fillRegions(regions) {
      for (let y = 0; y < H0; y++) {
        for (let x = 0; x < W0; x++) {
          let reg = null;
          for (let i = regions.length - 1; i >= 0; i--) {
            const r = regions[i];
            if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) { reg = r; break; }
          }
          if (!reg) continue;
          const p = reg.fn;
          const v = p.px ? p.fn(x, y) : p.fn(x / H0, y / H0);
          const L = Math.min(p.L, reg.ramp.length);
          const lvl = clamp(Math.floor(v * (L - 1) + bayer(x, y)), 0, L - 1);
          B.d[y * W0 + x] = reg.ramp[lvl];
        }
      }
    }

    // neon glitch columns: one column per line, one stacked block per word
    function SCENES_columns() {
      const dimAcc = tone(G, accent, 0.28);
      for (let k = -H0; k < W0; k += 9 + Math.floor(rand() * 10)) line(B, k, H0, k + H0, 0, dimAcc);
      const colW = 5 + Math.round(clamp(f.avgWordLen / 7) * 3), gap = 2;
      const nCols = Math.floor((W0 - 8) / (colW + gap));
      const x0 = Math.floor((W0 - nCols * (colW + gap)) / 2);
      for (let c = 0; c < nCols; c++) {
        if (rand() < 0.12) continue;
        const l = lines[c % lines.length];
        let y = Math.floor(H0 * (0.02 + 0.45 * unit(noise(c * 0.17, 3.3)) * (0.4 + rand() * 0.8)));
        const words = l.wordLens.length ? l.wordLens.map((len, i) => ({ len, code: l.wordCodes[i] })) : [{ len: 3, code: 1 }];
        const xc = x0 + c * (colW + gap) + (rand() < 0.2 ? Math.round((rand() - 0.5) * 4) : 0);
        let w = 0;
        while (y < H0 * 0.95 && w < words.length * 2) {
          const wd = words[w % words.length];
          const h = Math.max(2, wd.len * 2 + (wd.code % 3));
          const ink = inks[(wd.code + c) % inks.length];
          const dim = tone(G, ink, 0.35);
          const up = (wd.code >> 3) % 2;
          for (let yy = 0; yy < h; yy++) {
            const v = wd.len < 4 ? 1 : (up ? 1 - yy / h : yy / h) * 0.85 + 0.15;
            for (let xx = 0; xx < colW; xx++) {
              const lvl = clamp(Math.floor(v * 2 + bayer(xc + xx, y + yy)), 0, 2);
              px(B, xc + xx, y + yy, [G, dim, ink][lvl]);
            }
          }
          y += h + (wd.code % 4 === 0 ? 3 : 0);
          w++;
        }
      }
    }

    // word tiles: every word becomes a tile; content words get richer motifs
    function SCENES_tiles() {
      const cols = clamp(Math.round(18 + allWords.length / 6), 18, 40);
      const t = Math.floor(W0 / cols), rows = Math.ceil(H0 / t);
      const ox = Math.floor((W0 - cols * t) / 2);
      const all = [G, ...inks];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const wd = allWords[i % allWords.length];
          const rep = Math.floor(i / allWords.length);
          const h = C.seed32(wd.code + ':' + rep + ':' + seed);
          const bg = all[h % all.length];
          let fg = all[(h >>> 4) % all.length];
          if (fg === bg) fg = all[(all.indexOf(bg) + 1) % all.length];
          const third = all[(h >>> 9) % all.length];
          const motif = wd.stop ? [10, 11, 2, 0][wd.code % 4] : wd.code % 12;
          for (let y = 0; y < t; y++) {
            for (let x = 0; x < t; x++) {
              const u = (x + 0.5) / t, v = (y + 0.5) / t;
              px(B, ox + c * t + x, r * t + y, motifAt(motif, u, v, wd.len) ? fg : (motif === 3 && Math.hypot(u - 0.5, v - 0.5) < 0.14 ? third : bg));
            }
          }
        }
      }
    }
    function motifAt(m, u, v, len) {
      const du = Math.abs(u - 0.5), dv = Math.abs(v - 0.5), d = Math.hypot(u - 0.5, v - 0.5);
      switch (m) {
        case 0: return du + dv < 0.38;
        case 1: return Math.abs(u - v) < 0.14 || Math.abs(u + v - 1) < 0.14;
        case 2: return d < 0.38;
        case 3: return d > 0.24 && d < 0.44;
        case 4: { const n = 2 + (len % 3); return (Math.floor(u * n) + Math.floor(v * n)) % 2 === 0; }
        case 5: return ((u + v) * (2 + (len % 3))) % 1 < 0.5;
        case 6: return ((du + dv) * 4) % 1 < 0.5;
        case 7: return du < 0.14 || dv < 0.14;
        case 8: return Math.hypot(du - 0.25, dv - 0.25) < 0.17;
        case 9: return u > v;
        case 10: return true;
        default: return du < 0.16 && dv < 0.16;
      }
    }

    // voxel landscape: a still lake, rows of pillars painted back to front, fog dithered in with distance
    function SCENES_skyline() {
      const sky = G;
      const glow = tone(G, accent, 0.3);
      const hor = Math.round(H0 * (0.3 + rand() * 0.1));
      const tallC = inks[0], bodyC = inks[1 % inks.length], mossC = inks[2 % inks.length];
      const lakeFar = tone(G, bodyC, 0.25), lakeNear = tone(G, bodyC, 0.5);
      for (let y = 0; y < H0; y++) {
        for (let x = 0; x < W0; x++) {
          let c;
          if (y < hor) c = clamp(y / hor) ** 1.6 * 0.9 + bayer(x, y) > 1 ? glow : sky;
          else c = clamp((y - hor) / (H0 - hor)) + bayer(x, y) * 0.9 > 0.9 ? lakeNear : lakeFar;
          B.d[y * W0 + x] = c;
        }
      }
      const water = 0.38 + (f.themes.water || 0) * 0.12;
      const amp = 0.75 + f.energy * 0.5 + f.intensity * 0.3;
      const rhythm = lines.map((l) => l.syl);
      const maxSyl = Math.max(1, ...rhythm);
      const Z = 64;
      for (let z = 0; z < Z; z++) {
        const t = z / (Z - 1);
        const yb = Math.round(hor + Math.pow(t, 1.8) * (H0 - hor) * 1.04);
        const cw = 1 + Math.floor(t * 5);
        const maxH = H0 * (0.05 + 0.38 * t) * amp;
        const fog = Math.pow(1 - t, 1.25) * 0.95;
        for (let x = -cw; x < W0 + cw; x += cw) {
          const wx = ((x - W0 / 2) / (W0 * (0.25 + t * 0.75))) * 2.2;
          const wz = z * 0.06;
          const ridge = rhythm[Math.abs(Math.floor(wx * 1.2 + wz)) % rhythm.length] / maxSyl;
          const spike = Math.pow(unit(noise(wx * 4.1 + 7, wz * 3.3)), 3);
          const hgt = clamp(unit(fbm(noise, wx * 0.45 + 10, wz * 0.8, 3) * 1.5) * (0.8 + 0.35 * ridge) + spike * 0.25);
          if (hgt < water) continue;
          const k = (hgt - water) / (1 - water);
          const cellHash = (C.seed32(Math.floor(x / cw) + ':' + z + ':' + seed) % 1000) / 1000;
          if (cellHash > 0.3 + k * 0.6) continue; // gaps make separate towers
          const bh = Math.max(1, Math.pow(k, 1.7) * maxH * (0.6 + cellHash * 0.8));
          const top = Math.floor(yb - bh);
          const tall = k > 0.55;
          for (let yy = top; yy <= yb; yy++) {
            const fromTop = yy - top;
            let c = tall && fromTop < bh * 0.7 ? tallC : (k < 0.12 && fromTop < cw ? mossC : bodyC);
            for (let xx = x; xx < x + cw; xx++) {
              const cc = bayer(xx, yy) < fog ? (yy < hor ? glow : lakeFar) : c;
              px(B, xx, yy, cc);
            }
          }
          // broken reflection in the lake
          const rh = Math.min(bh * 0.6, H0 - yb);
          for (let yy = yb + 1; yy < yb + rh; yy++) {
            for (let xx = x; xx < x + cw; xx++) {
              if (bayer(xx, yy) < 0.45 + fog * 0.5 || (yy & 1)) continue;
              px(B, xx, yy, tall ? tone(lakeNear, tallC, 0.6) : tone(lakeNear, bodyC, 0.7));
            }
          }
        }
      }
    }

    // knit: a dithered color field with an organic threshold, and a band of line-blocks
    function SCENES_knit() {
      const ramp = inks.length >= 3 ? [inks[0], G, inks[1], inks[2]] : [G, inks[0]];
      const corner = [inks[inks.length - 1], ramp[0]];
      const sc = 1.6 + rand() * 1.2, o = rand() * 50;
      const blooms = Array.from({ length: clamp(f.stanzaCount || 1, 1, 4) }, () => ({ x: 0.2 + rand() * 1.4, y: 0.2 + rand() * 0.6, r: 0.9 + rand() * 0.9 }));
      const warp = 0.6 + f.sibilant * 0.8 + rand() * 0.6;
      const hasBand = rand() < 0.55;
      const bandY0 = Math.round(H0 * 0.8), bandY1 = Math.round(H0 * 0.93);
      for (let y = 0; y < H0; y++) {
        for (let x = 0; x < W0; x++) {
          const nx = x / H0, ny = y / H0;
          const thr = bayer(x, y) * 0.5 + ((C.seed32(x + ',' + y + ',' + o) % 1000) / 1000) * 0.5;
          const inCorner = nx + (1 - ny) * 0.8 > (W0 / H0) * 0.92 + fbm(noise, nx * 4, ny * 4 + o, 2) * 0.25;
          const r = inCorner ? corner : ramp;
          const q = fbm(noise, nx * 1.1 + o + 3, ny * 1.1, 2) * warp;
          let v = unit(fbm(noise, nx * sc + o + q, ny * sc + q, 4) * 1.3) * 0.65;
          for (const b of blooms) v += clamp(1 - Math.hypot(nx + q * 0.3 - b.x, ny - b.y) * b.r) * 0.4;
          v = clamp(v);
          const lvl = clamp(Math.floor(v * (r.length - 1) + thr), 0, r.length - 1);
          B.d[y * W0 + x] = r[lvl];
        }
      }
      if (!hasBand) return;
      // band: one block per line, width from word count
      const bx0 = 2, bx1 = W0 - 3;
      rect(B, bx0, bandY0, bx1 - bx0, bandY1 - bandY0, inks[2 % inks.length]);
      line(B, bx0, bandY0, bx1, bandY0, inks[0]); line(B, bx0, bandY1, bx1, bandY1, inks[0]);
      line(B, bx0, bandY0, bx0, bandY1, inks[0]); line(B, bx1, bandY0, bx1, bandY1, inks[0]);
      let x = bx0 + 3;
      const totalW = lines.reduce((s, l) => s + l.words + 1, 0);
      const k = (bx1 - bx0 - 6) / Math.max(1, totalW);
      lines.forEach((l, i) => {
        const w = Math.max(1, Math.round(l.words * k));
        const hh = Math.max(1, Math.round((bandY1 - bandY0 - 4) * (0.35 + 0.6 * clamp(l.syl / 12))));
        rect(B, x, bandY1 - 2 - hh, w, hh, inks[i % 2 ? 0 : 1 % inks.length]);
        x += w + Math.max(1, Math.round(k));
      });
    }

    // ascii: a warped field (or a horizon of towers) read out as a grid of characters by brightness.
    // The buffer only carries a faint dithered under-layer; the characters are drawn at full size later.
    const asciiField = (() => {
      const o = rand() * 60, sc = 1.2 + rand() * 1.6, warp = 0.5 + f.sibilant * 0.9 + rand() * 0.5;
      const blooms = Array.from({ length: clamp(f.stanzaCount || 1, 1, 4) }, () => ({ x: 0.2 + rand() * 1.4, y: 0.2 + rand() * 0.6, r: 0.9 + rand() * 1.1 }));
      const horizon = (f.themes.earth || 0) + (f.themes.water || 0) > 0.3 || rand() < 0.3;
      const hor = 0.35 + rand() * 0.2;
      return (nx, ny) => { // nx in 0..16/9, ny in 0..1
        const q = fbm(noise, nx * 1.1 + o, ny * 1.1, 2) * warp;
        let v = unit(fbm(noise, nx * sc + o + q, ny * sc + q, 4) * 1.3) * 0.6;
        for (const b of blooms) v += clamp(1 - Math.hypot(nx + q * 0.3 - b.x, ny - b.y) * b.r) * 0.45;
        if (horizon) {
          const ridge = hor + unit(fbm(noise, nx * 2.2 + o, 3.1, 3)) * 0.25 - 0.12;
          v = ny < ridge ? v * 0.45 : clamp(v * 0.7 + 0.35 + (ny - ridge) * 0.4);
        }
        return clamp(v);
      };
    })();
    function SCENES_ascii() {
      const dim = tone(G, inks[0], 0.12);
      for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
        const v = asciiField(x / H0, y / H0);
        B.d[y * W0 + x] = v * 0.5 + bayer(x, y) > 1 ? dim : G;
      }
    }
    let asciiRamp = null, asciiFs = 0;
    function drawAscii(c, band) {
      const ramps = {
        classic: ' .,:;-=+*x#%@',
        blocks: ' ·░▒▓█',
        dots: ' .·•●',
        long: " .'`^,:;Il!i~+_-?]}1)|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"
      };
      const ramp = asciiRamp || (asciiRamp = f.plosive > 0.6 ? ramps.classic : f.sibilant > 0.6 ? ramps.long : (rand() < 0.3 ? ramps.dots : ramps.classic));
      const fs = asciiFs || (asciiFs = Math.round(20 + (1 - delicacy) * 14)); // softer poems -> smaller, finer type
      const cw = Math.ceil(fs * 0.62), ch = Math.ceil(fs * 1.05);
      c.save();
      c.font = `600 ${fs}px ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace`;
      c.textBaseline = 'top';
      // denser cells get the colors that stand out most from the ground
      const colorRamp = inks.slice().sort((a, b) => Math.abs(lum(P[a]) - lum(P[G])) - Math.abs(lum(P[b]) - lum(P[G]))).slice(-4);
      for (let y = 0; y < OH; y += ch) {
        if (band && (y < band[0] || y > band[1])) continue;
        for (let x = 0; x < OW; x += cw) {
          const v = asciiField((x + cw / 2) / OH, (y + ch / 2) / OH);
          const bx = Math.floor(x / cw), by = Math.floor(y / ch);
          const t = clamp(v * 1.15 - 0.05 + (bayer(bx, by) - 0.5) * 0.2);
          const gi = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
          if (gi === 0) continue;
          const col = colorRamp[Math.min(colorRamp.length - 1, Math.floor(t * colorRamp.length))];
          if (t > 0.95 && bayer(bx + 2, by + 1) < 0.25) { // dense cells flip: solid block, ground-colored glyph
            c.fillStyle = `rgb(${P[col].join(',')})`;
            c.fillRect(x, y, cw, ch);
            c.fillStyle = `rgb(${P[G].join(',')})`;
          } else {
            c.fillStyle = `rgb(${P[col].join(',')})`;
          }
          c.fillText(ramp[gi], x, y);
        }
      }
      c.restore();
    }
    const SCENES = { poster: SCENES_poster, columns: SCENES_columns, tiles: SCENES_tiles, skyline: SCENES_skyline, knit: SCENES_knit, ascii: SCENES_ascii };
    SCENES[scene]();

    /* ===== fine accents (2 output px) ===== */
    const sx = AW / W0;
    const nodes = lines.slice(0, 40).map((_, i) => {
      const a = i * 2.39996 + rand() * 0.3;
      const r = Math.sqrt((i + 0.5) / Math.min(40, lines.length)) * AH * 0.42;
      return { x: AW / 2 + Math.cos(a) * r * 1.5 + (rand() - 0.5) * 60, y: AH / 2 + Math.sin(a) * r + (rand() - 0.5) * 40 };
    });

    // zigzag instrument lines: energy, dashes, glitch scene
    const zig = Math.round(f.energy * 5 + f.dash * 4 + (scene === 'columns' ? 5 : 0));
    for (let z = 0; z < zig; z++) {
      let x = rand() * AW, y = rand() * AH;
      let dx = rand() < 0.5 ? 1 : -1, dy = rand() < 0.5 ? 1 : -1;
      const segs = 3 + Math.floor(rand() * 6);
      for (let s = 0; s < segs; s++) {
        const len = 10 + rand() * (s % 2 ? 30 : 140);
        const nx = x + dx * len, ny = y + (s % 2 ? 0 : dy * len);
        line(A, x, y, nx, ny, accent);
        x = nx; y = ny;
        if (rand() < 0.5) dy = -dy;
      }
    }

    // network: rhymes become edges between line-nodes, plus nearest-neighbour threads
    if (f.rhymePairs.length || f.rhyme > 0.1 || f.repetition > 0.3) {
      const netC = contrast;
      nodes.forEach((n, i) => {
        const near = nodes.map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
        near.forEach((o) => { if (rand() < 0.6) line(A, n.x, n.y, nodes[o.j].x, nodes[o.j].y, netC); });
      });
      f.rhymePairs.forEach(([i, j]) => { if (nodes[i] && nodes[j]) line(A, nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, accent); });
      nodes.forEach((n) => rect(A, n.x - 1, n.y - 1, 3, 3, netC));
    }

    // questions and open lines: thin rings
    const ringSets = Math.round(clamp(f.question * 3 + f.openness * 2, 0, 4));
    for (let r = 0; r < ringSets; r++) {
      const cx = rand() * AW, cy = rand() * AH, k = 3 + Math.floor(rand() * 6), step = 4 + rand() * 10;
      for (let i = 1; i <= k; i++) ring(A, cx, cy, i * step, contrast, i % 2 === 0);
    }

    // commas: dust
    const dust = Math.round(40 + f.comma * 260 + (scene === 'skyline' ? 120 : 0));
    for (let i = 0; i < dust; i++) {
      const x = rand() * AW, y = rand() * AH;
      if (rand() < 0.75) px(A, x, y, accent); else rect(A, x, y, 2, 2, contrast);
    }

    // regular meter: registration crosses, like a print sheet
    if (f.meter > 0.6) {
      const step = 120;
      for (let y = 60; y < AH; y += step) for (let x = 60; x < AW; x += step) {
        if (rand() < 0.5) continue;
        line(A, x - 4, y, x + 4, y, contrast); line(A, x, y - 4, x, y + 4, contrast);
      }
    }
    // "you": a fine dashed orbit
    if (f.other > 0.05) {
      const cx = AW * (0.3 + rand() * 0.4), cy = AH * (0.3 + rand() * 0.4);
      ring(A, cx, cy, AH * (0.18 + f.other * 0.2), contrast, true);
    }

    /* ===== compose at 960×540, then scale ×2 ===== */
    const mid = document.createElement('canvas');
    mid.width = AW; mid.height = AH;
    const mctx = mid.getContext('2d');
    const img = mctx.createImageData(AW, AH);
    const d = img.data;
    for (let y = 0; y < AH; y++) {
      const by = Math.min(H0 - 1, Math.floor(y / sx));
      for (let x = 0; x < AW; x++) {
        const a = A.d[y * AW + x];
        const c = P[a >= 0 ? a : B.d[by * W0 + Math.min(W0 - 1, Math.floor(x / sx))]];
        const i = (y * AW + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    mctx.putImageData(img, 0, 0);

    const out = document.createElement('canvas');
    out.width = OW; out.height = OH;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mid, 0, 0, OW, OH);
    if (scene === 'ascii') drawAscii(ctx);

    /* ===== grit: gradient wash, light comets, melt, smear, focus blur, smudges, bloom, spray, string lines ===== */
    const grit = {
      wash: clamp(0.35 + f.intensity * 0.35 + rand() * 0.3),
      cones: Math.round(rand() * 2 + f.openness * 3 + f.vowelBright * 2),
      melt: clamp(0.3 + (f.sentiment < 0 ? -f.sentiment : 0) * 0.8 + (f.themes.fire || 0) * 0.6 + (f.themes.night || 0) * 0.3 + rand() * 0.4),
      smear: clamp(0.35 + f.sibilant * 0.35 + f.enjambment * 0.3 + rand() * 0.3),
      blur: clamp(0.35 + f.calm * 0.35 + f.liquid * 0.3 + rand() * 0.3),
      spray: clamp(0.3 + clamp(f.comma) * 0.35 + f.plosive * 0.3 + rand() * 0.35),
      strings: clamp(f.rhyme * 0.6 + f.repetition * 0.5 + rand() * 0.45)
    };
    if (scene === 'ascii') { // keep the characters legible: lighter blur, spray and wash; melt and smear stay
      grit.blur *= 0.35; grit.spray *= 0.35; grit.wash *= 0.55; grit.cones = Math.min(grit.cones, 1);
    }

    function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    function blurred(src, k) {
      const a = mk(OW / 4, OH / 4), b = mk(OW / k, OH / k), c = mk(OW / 4, OH / 4), o = mk(OW, OH);
      for (const [dst, s] of [[a, src], [b, a], [c, b], [o, c]]) {
        const x = dst.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.drawImage(s, 0, 0, dst.width, dst.height);
      }
      return o;
    }
    const css = (i, a) => `rgba(${P[i][0]},${P[i][1]},${P[i][2]},${a})`;
    applyGrit();
    if (scene === 'ascii') { // a crisp, readable band of type over the gritty layer
      const cy = OH * (0.25 + rand() * 0.5), hh = OH * (0.12 + rand() * 0.16);
      ctx.save(); ctx.globalAlpha = 0.9; drawAscii(ctx, [cy - hh, cy + hh]); ctx.restore();
    }

    function applyGrit() {
      // 1. gradient wash: a broad print-like gradient over everything, sometimes as vertical strips
      ctx.save();
      ctx.globalCompositeOperation = pal.dark ? 'screen' : 'overlay';
      ctx.globalAlpha = grit.wash * (pal.dark ? 0.35 : 0.45);
      const ang = rand() * TAU, r = Math.hypot(OW, OH) / 2;
      const lg = ctx.createLinearGradient(OW / 2 - Math.cos(ang) * r, OH / 2 - Math.sin(ang) * r, OW / 2 + Math.cos(ang) * r, OH / 2 + Math.sin(ang) * r);
      const stops = [pickInk(), pickInk(), pickInk()];
      stops.forEach((c, i) => lg.addColorStop(i / (stops.length - 1), css(c, 1)));
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, OW, OH);
      if (rand() < 0.35 + f.meter * 0.3) {
        const n = 5 + Math.floor(rand() * 7), w = OW / n;
        const a = pickInk(), b = pickInk();
        ctx.globalCompositeOperation = pal.dark ? 'screen' : 'multiply';
        ctx.globalAlpha = 0.18 + grit.wash * 0.2;
        for (let i = 0; i < n; i++) {
          const g = ctx.createLinearGradient(0, -rand() * OH * 0.3, 0, OH * (1 + rand() * 0.3));
          g.addColorStop(0, css(a, 1)); g.addColorStop(0.55, css(G, 0.2)); g.addColorStop(1, css(b, 1));
          ctx.fillStyle = g;
          ctx.fillRect(i * w, 0, w - 2, OH);
        }
      }
      ctx.restore();

      // 2. light comets: soft wedges of color, blurred into beams
      if (grit.cones > 0) {
        const L = mk(OW, OH), lc = L.getContext('2d');
        for (let i = 0; i < grit.cones; i++) {
          const x = rand() * OW, y = rand() * OH, a = rand() * TAU, len = OH * (0.2 + rand() * 0.45), w = 0.06 + rand() * 0.12;
          const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len;
          const g = lc.createLinearGradient(x, y, tx, ty);
          const c = pickInk();
          g.addColorStop(0, css(c, 0)); g.addColorStop(0.75, css(c, 0.85)); g.addColorStop(1, css(accent, 1));
          lc.fillStyle = g;
          lc.beginPath();
          lc.moveTo(x + Math.cos(a + Math.PI / 2) * len * w, y + Math.sin(a + Math.PI / 2) * len * w);
          lc.lineTo(tx, ty);
          lc.lineTo(x + Math.cos(a - Math.PI / 2) * len * w, y + Math.sin(a - Math.PI / 2) * len * w);
          lc.closePath();
          lc.fill();
        }
        ctx.save();
        ctx.globalCompositeOperation = pal.dark ? 'screen' : 'source-over';
        ctx.globalAlpha = 0.85;
        ctx.drawImage(blurred(L, 8), 0, 0);
        ctx.restore();
      }

      // pixel-level passes
      const img = ctx.getImageData(0, 0, OW, OH);
      const d = img.data;
      const RB = OW * 4;

      // 3. melt: columns drip downward from a line
      if (grit.melt > 0.45) {
        const src = new Uint8ClampedArray(d);
        const y0 = Math.floor(OH * (0.1 + rand() * 0.5));
        const xa = rand() < 0.5 ? 0 : Math.floor(rand() * OW * 0.5), xb = xa === 0 ? OW : Math.min(OW, xa + OW * (0.3 + rand() * 0.5));
        const maxDrip = OH * (0.12 + grit.melt * 0.3);
        const o = rand() * 100;
        for (let x = xa; x < xb; x++) {
          const drip = maxDrip * Math.pow(unit(fbm(noise, x * 0.004 + o, 3.7, 3) * 1.6), 2.2);
          if (drip < 2) continue;
          for (let y = y0; y < OH; y++) {
            const t = clamp((y - y0) / (OH * 0.35));
            const sy = Math.max(y0, Math.floor(y - drip * t));
            const di = (y * OW + x) * 4, si = (sy * OW + x) * 4;
            d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2];
          }
        }
      }

      // 4. smear: motion-drag streaks in soft-edged bands (vertical when lines vary a lot)
      const vertical = f.lineVariance > 0.6 && rand() < 0.7;
      const bands = 1 + Math.round(grit.smear * 4);
      for (let bnd = 0; bnd < bands; bnd++) {
        const span = vertical ? OW : OH, len = vertical ? OH : OW;
        const c0 = Math.floor(rand() * span), half = Math.floor(span * (0.02 + rand() * 0.08 * grit.smear));
        const k = 0.04 + rand() * 0.12;
        const dir = rand() < 0.5 ? 1 : -1;
        for (let line = c0 - half; line < c0 + half; line++) {
          if (line < 0 || line >= span) continue;
          const edge = Math.sin(((line - (c0 - half)) / (2 * half)) * Math.PI);
          const str = edge * (0.6 + grit.smear * 0.4);
          const start = Math.floor(rand() * len * 0.5);
          let r = -1, g = 0, b = 0;
          for (let s = 0; s < len; s++) {
            const p = dir > 0 ? s : len - 1 - s;
            if (s < start) continue;
            const i = vertical ? (p * OW + line) * 4 : (line * OW + p) * 4;
            if (r < 0) { r = d[i]; g = d[i + 1]; b = d[i + 2]; }
            r += (d[i] - r) * k; g += (d[i + 1] - g) * k; b += (d[i + 2] - b) * k;
            d[i] += (r - d[i]) * str; d[i + 1] += (g - d[i + 1]) * str; d[i + 2] += (b - d[i + 2]) * str;
          }
        }
      }
      // short pixel-sort runs by brightness: the gritty glitch streak
      const sorts = Math.round(grit.smear * 4 + f.energy * 4);
      for (let n = 0; n < sorts; n++) {
        const y0 = Math.floor(rand() * OH), h = 2 + Math.floor(rand() * 40), x0 = Math.floor(rand() * OW * 0.7), w = Math.floor(OW * (0.1 + rand() * 0.3));
        for (let y = y0; y < Math.min(OH, y0 + h); y++) {
          const row = [];
          for (let x = x0; x < Math.min(OW, x0 + w); x++) { const i = y * RB + x * 4; row.push([d[i], d[i + 1], d[i + 2]]); }
          row.sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]));
          row.forEach((c, j) => { const i = y * RB + (x0 + j) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; });
        }
      }
      ctx.putImageData(img, 0, 0);

      // 5. focus blur: a sharp band, the rest drifts out of focus; plus a few smudges
      const soft = blurred(out, 16 + Math.round(grit.blur * 16));
      const mask = mk(OW, OH), mc = mask.getContext('2d');
      mc.drawImage(soft, 0, 0);
      mc.globalCompositeOperation = 'destination-in';
      const fy = OH * (0.3 + rand() * 0.4), fw = 0.18 + (1 - grit.blur) * 0.2;
      const mg = mc.createLinearGradient(0, 0, 0, OH);
      mg.addColorStop(0, 'rgba(0,0,0,1)');
      mg.addColorStop(clamp(fy / OH - fw), 'rgba(0,0,0,0)');
      mg.addColorStop(clamp(fy / OH + fw), 'rgba(0,0,0,0)');
      mg.addColorStop(1, 'rgba(0,0,0,1)');
      mc.fillStyle = mg;
      mc.fillRect(0, 0, OW, OH);
      ctx.save();
      ctx.globalAlpha = 0.25 + grit.blur * 0.45;
      ctx.drawImage(mask, 0, 0);
      ctx.restore();
      const smudges = 1 + Math.round(grit.blur * 3);
      for (let i = 0; i < smudges; i++) {
        const sm = mk(OW, OH), sc = sm.getContext('2d');
        const x = rand() * OW, y = rand() * OH, rr = OH * (0.08 + rand() * 0.25);
        sc.drawImage(soft, (rand() - 0.5) * 80, (rand() - 0.5) * 40);
        sc.globalCompositeOperation = 'destination-in';
        const rg = sc.createRadialGradient(x, y, 0, x, y, rr);
        rg.addColorStop(0, 'rgba(0,0,0,0.95)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        sc.fillStyle = rg;
        sc.save(); sc.translate(x, y); sc.scale(1.8, 1); sc.translate(-x, -y);
        sc.fillRect(0, 0, OW, OH); sc.restore();
        ctx.drawImage(sm, 0, 0);
      }

      // 6. bloom
      ctx.save();
      ctx.globalCompositeOperation = pal.dark ? 'screen' : 'soft-light';
      ctx.globalAlpha = pal.dark ? 0.35 : 0.5;
      ctx.drawImage(blurred(out, 32), 0, 0);
      ctx.restore();

      // 7. spray: stippled clouds of single pixels following a noise field
      const dots = Math.round(grit.spray * 40000);
      const so = rand() * 100, sscale = 0.0012 + rand() * 0.002;
      const sprayCols = [accent, contrast, pickInk()];
      for (let i = 0, tries = 0; i < dots && tries < dots * 6; tries++) {
        const x = rand() * OW, y = rand() * OH;
        const v = unit(fbm(noise, x * sscale + so, y * sscale * 1.6, 4) * 1.6);
        if (v * v * v * v < rand()) continue;
        i++;
        ctx.fillStyle = css(sprayCols[i % 3 === 0 ? 1 : (i % 7 === 0 ? 2 : 0)], 0.55 + rand() * 0.45);
        const s = rand() < 0.85 ? 2 : 4;
        ctx.fillRect(x | 0, y | 0, s, s);
      }

      // 8. string lines: fans of hairlines from a few anchors to a grid of nodes, one node per line of the poem
      if (grit.strings > 0.35) {
        const anchors = Array.from({ length: 2 + Math.floor(rand() * 4) }, () => ({ x: rand() < 0.5 ? rand() * OW * 0.2 : OW * (0.8 + rand() * 0.2), y: rand() * OH }));
        const nl = Math.min(64, Math.max(12, lines.length * 3));
        const cols = Math.ceil(Math.sqrt(nl * 1.6)), rows = Math.ceil(nl / cols);
        const gx = OW * (0.2 + rand() * 0.2), gy = OH * (0.15 + rand() * 0.1), gw = OW * (0.35 + rand() * 0.25), gh = OH * (0.5 + rand() * 0.25);
        ctx.save();
        ctx.strokeStyle = css(contrast, 0.12 + grit.strings * 0.12);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const nodesFull = [];
        for (let i = 0; i < nl; i++) nodesFull.push({ x: gx + (gw * (i % cols)) / Math.max(1, cols - 1), y: gy + (gh * Math.floor(i / cols)) / Math.max(1, rows - 1) });
        for (const a of anchors) for (const n of nodesFull) { if (rand() < 0.75) { ctx.moveTo(a.x, a.y); ctx.lineTo(n.x, n.y); } }
        ctx.stroke();
        ctx.fillStyle = css(contrast, 0.9);
        nodesFull.forEach((n) => ctx.fillRect(n.x - 2, n.y - 2, 4, 4));
        ctx.restore();
      }
    }

    /* ===== post: glitch rows, RGB split, stitch, scanlines, grain ===== */
    const fin = ctx.getImageData(0, 0, OW, OH);
    const q = fin.data;
    const rowBytes = OW * 4;

    const glitches = Math.round(f.energy * 6 + clamp(f.exclaim * 2) * 6 + (scene === 'columns' ? 4 : 0) + (rand() < 0.5 ? 1 : 0));
    const tmp = new Uint8ClampedArray(rowBytes);
    for (let g = 0; g < glitches; g++) {
      const y0 = Math.floor(rand() * OH), h = 2 + Math.floor(rand() * 26);
      const shift = Math.round((rand() - 0.5) * 2 * (20 + rand() * 140)) * 4;
      for (let y = y0; y < Math.min(OH, y0 + h); y++) {
        const off = y * rowBytes;
        tmp.set(q.subarray(off, off + rowBytes));
        for (let i = 0; i < rowBytes; i++) q[off + i] = tmp[((i - shift) % rowBytes + rowBytes) % rowBytes];
      }
    }

    const split = scene === 'knit' ? 1 : 1 + Math.round(f.energy * 3 + (pal.dark ? 1 : 0));
    if (split) {
      const s4 = split * 4;
      for (let y = 0; y < OH; y++) {
        const off = y * rowBytes;
        for (let i = rowBytes - 4; i >= s4; i -= 4) q[off + i] = q[off + i - s4];          // red right
        for (let i = 0; i < rowBytes - s4; i += 4) q[off + i + 2] = q[off + i + 2 + s4];    // blue left
      }
    }

    const cell = OW / W0;
    const grain = 24 + Math.round((f.plosive + f.caps) * 10) + (pal.dark ? 6 : 0);
    let s = seed | 1;
    for (let y = 0; y < OH; y++) {
      const scan = pal.dark && y % 3 === 0 ? 0.88 : 1;
      for (let x = 0; x < OW; x++) {
        let m = scan;
        if (scene === 'knit') {
          const u = (x % cell) / cell, v = (y % cell) / cell;
          m *= 1 - 0.28 * Math.pow(Math.abs(u - 0.5) * 2, 2) - 0.1 * v + (Math.abs(u - 0.5) < 0.07 && v > 0.45 ? -0.18 : 0);
        }
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const n = (((s >>> 0) / 4294967296) - 0.5) * grain;
        const cn = (((s >>> 8) & 255) / 255 - 0.5) * grain * 0.35;
        const i = (y * OW + x) * 4;
        q[i] = q[i] * m + n + cn;
        q[i + 1] = q[i + 1] * m + n;
        q[i + 2] = q[i + 2] * m + n - cn;
      }
    }
    ctx.putImageData(fin, 0, 0);

    return { canvas: out, scene, grit, palette: pal.name, colors: pal.c.slice(), pixel: Math.round(cell), serial: seed.toString(16).toUpperCase().padStart(8, '0') };
  };
})((window.Conjure = window.Conjure || {}));
