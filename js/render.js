/* Conjure — turns a reading into a 1920×1080 painting.
   C.plan(ctx, features, seed) returns { mode, palette, steps }.
   Each step paints one layer; main.js runs them one frame apart so the piece builds up. */
(function (C) {
  'use strict';
  const TAU = Math.PI * 2;
  const W = 1920, H = 1080;
  const { clamp, lerp, rgba } = C;
  C.W = W; C.H = H;

  const MODES = {
    water: { name: 'Tide', hue: 215 },
    fire: { name: 'Kiln', hue: 32 },
    earth: { name: 'Strata', hue: 105 },
    air: { name: 'Drift', hue: 195 },
    night: { name: 'Nocturne', hue: 265 },
    body: { name: 'Pulse', hue: 8 },
    time: { name: 'Clockwork', hue: 70 },
    love: { name: 'Bloom', hue: 345 },
    measure: { name: 'Measure', hue: null },
    murmur: { name: 'Murmur', hue: null }
  };
  C.MODES = MODES;

  function pickMode(f) {
    if (f.dominantTheme) return f.dominantTheme;
    return f.meter > 0.62 ? 'measure' : 'murmur';
  }

  /* ---------- palette ---------- */
  function buildPalette(f, rand, modeKey) {
    let vx = 0, vy = 0, tw = 0;
    for (const k in f.themes) {
      const w = f.themes[k];
      if (w > 0 && MODES[k]) { const h = (MODES[k].hue * Math.PI) / 180; vx += Math.cos(h) * w; vy += Math.sin(h) * w; tw += w; }
    }
    let hue = tw > 0 ? ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360 : rand() * 360;
    if (f.sentiment !== 0) hue = C.mixHue(hue, f.sentiment > 0 ? 55 : 255, Math.abs(f.sentiment) * 0.35);
    if (f.colors.length) hue = C.mixHue(hue, f.colors[0].lch[2], 0.55);
    hue = (hue + (rand() - 0.5) * 24 + 360) % 360;

    const dark = f.themes.night > 0.12 || f.sentiment < -0.2 || modeKey === 'night' || rand() < 0.28;
    const chroma = Math.min(0.24, 0.09 + f.energy * 0.11 + f.intensity * 0.05);

    let scheme, offs;
    if (f.repetition > 0.35 || f.meter > 0.8) { scheme = 'Analogous'; offs = [0, 28, -28, 56, -14]; }
    else if (f.energy > 0.5) { scheme = 'Complementary'; offs = [0, 180, 24, 204, -18]; }
    else if (f.openness > 0.35) { scheme = 'Triadic'; offs = [0, 120, 240, 60, 180]; }
    else { scheme = 'Split'; offs = [0, 150, 210, 30, -30]; }

    const bright = f.vowelBright;
    const inks = offs.map((o, i) => {
      const h = (hue + o + (rand() - 0.5) * 16 + 360) % 360;
      const Lv = dark ? 0.6 + bright * 0.15 + rand() * 0.15 : 0.45 + bright * 0.12 + rand() * 0.2;
      const Cv = chroma * (0.75 + rand() * 0.45) * (i === 4 ? 0.6 : 1);
      return { lch: [Lv, Cv, h] };
    });
    f.colors.slice(0, 2).forEach((c, i) => { inks[i * 2 + 1] = { lch: c.lch.slice(), word: c.word }; });
    inks.forEach((k) => { k.rgb = C.oklch(...k.lch); });

    const bgHue = rand() < 0.5 ? hue : (hue + 180) % 360;
    const bgL = dark ? 0.15 + rand() * 0.05 : 0.94 + rand() * 0.03;
    const bg = C.oklch(bgL, dark ? 0.03 : 0.018, bgHue);
    const deep = C.oklch(dark ? 0.92 : 0.22, 0.03, hue); // contrast ink for punctuation marks
    const accent = inks.slice().sort((a, b) => b.lch[1] - a.lch[1])[0].rgb;
    return { hue, dark, scheme, inks: inks.map((k) => k.rgb), inkMeta: inks, bg, deep, accent };
  }

  /* ---------- layouts: where each line of the poem lands ---------- */
  function gauss(rand) { return (rand() + rand() + rand() + rand() - 2) / 2; }

  function layout(modeKey, f, rand) {
    const lines = f.lineInfo.slice(0, 48);
    const N = lines.length;
    const cx = W / 2, cy = H / 2;
    const pts = [];
    const phase = rand() * TAU;
    const center = { x: cx + (rand() - 0.5) * W * 0.25, y: cy + (rand() - 0.5) * H * 0.15 };
    switch (modeKey) {
      case 'water': {
        const waves = 1 + Math.round(f.lineVariance * 2 + rand());
        lines.forEach((_, i) => {
          const t = (i + 0.5) / N;
          pts.push({ x: W * (0.08 + 0.84 * t), y: cy + Math.sin(t * TAU * waves * 0.5 + phase) * H * 0.26 + gauss(rand) * 40 });
        });
        break;
      }
      case 'fire': {
        const o = { x: cx + (rand() - 0.5) * W * 0.2, y: H * 0.95 };
        center.x = o.x; center.y = o.y;
        lines.forEach((_, i) => {
          const a = -Math.PI / 2 + ((N > 1 ? i / (N - 1) : 0.5) - 0.5) * Math.PI * 0.95 + gauss(rand) * 0.12;
          const r = H * (0.25 + 0.62 * rand());
          pts.push({ x: o.x + Math.cos(a) * r * 1.35, y: o.y + Math.sin(a) * r });
        });
        break;
      }
      case 'earth': {
        const S = Math.max(1, f.stanzaCount);
        lines.forEach((l) => {
          const y = H * (0.14 + 0.72 * (l.stanza + 0.5) / S) + gauss(rand) * 18;
          const x = W * (0.08 + 0.84 * (l.idxInStanza + 0.5) / l.stanzaSize);
          pts.push({ x, y });
        });
        break;
      }
      case 'air':
        lines.forEach(() => pts.push({ x: W * (0.06 + 0.88 * rand()), y: H * (0.08 + 0.66 * Math.pow(rand(), 1.3)) }));
        break;
      case 'night': {
        const R = H * 0.34;
        lines.forEach((_, i) => {
          const a = (i / N) * TAU + phase;
          pts.push({ x: center.x + Math.cos(a) * R * 1.4, y: center.y + Math.sin(a) * R });
        });
        break;
      }
      case 'body':
        lines.forEach(() => pts.push({ x: center.x + gauss(rand) * W * 0.2, y: center.y + gauss(rand) * H * 0.24 }));
        break;
      case 'time':
        lines.forEach((_, i) => {
          const a = i * 2.39996 + phase;
          const r = (Math.sqrt(i + 0.5) / Math.sqrt(N)) * H * 0.43;
          pts.push({ x: center.x + Math.cos(a) * r * 1.3, y: center.y + Math.sin(a) * r });
        });
        break;
      case 'love': {
        const k = 2 + Math.floor(rand() * 3);
        lines.forEach((_, i) => {
          const th = (i / N) * TAU + phase;
          const r = H * 0.42 * (0.2 + 0.8 * Math.abs(Math.cos(k * th)));
          pts.push({ x: center.x + Math.cos(th) * r * 1.3, y: center.y + Math.sin(th) * r });
        });
        break;
      }
      case 'measure': {
        const cols = Math.ceil(Math.sqrt(N * 16 / 9)), rows = Math.ceil(N / cols);
        lines.forEach((_, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          pts.push({ x: W * (0.1 + 0.8 * (c + 0.5) / cols), y: H * (0.12 + 0.76 * (r + 0.5) / rows) });
        });
        break;
      }
      default: { // murmur: loosely spaced scatter
        const minD = Math.min(W, H) * 0.5 / Math.sqrt(N + 1);
        lines.forEach(() => {
          let p, tries = 0;
          do { p = { x: W * (0.07 + 0.86 * rand()), y: H * (0.1 + 0.8 * rand()) }; tries++; }
          while (tries < 30 && pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < minD));
          pts.push(p);
        });
      }
    }
    pts.forEach((p) => { p.x = clamp(p.x, 70, W - 70); p.y = clamp(p.y, 70, H - 70); });
    return { pts, lines, center };
  }

  /* ---------- glyph shapes, one per sound family ---------- */
  function shardPath(ctx, x, y, r, rot, rand) {
    const n = 3 + Math.floor(rand() * 4);
    const angs = Array.from({ length: n }, () => rand() * TAU).sort((a, b) => a - b);
    ctx.beginPath();
    angs.forEach((a, i) => {
      const rr = r * (0.55 + rand() * 0.8);
      const px = x + Math.cos(a + rot) * rr, py = y + Math.sin(a + rot) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
  }
  function blobPath(ctx, x, y, r, noise, off) {
    const n = 56, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 + 0.38 * noise(Math.cos(a) * 1.1 + off, Math.sin(a) * 1.1 + off));
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], q = pts[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      i ? ctx.quadraticCurveTo(p[0], p[1], mx, my) : ctx.moveTo(mx, my);
    }
    ctx.closePath();
  }
  function ribbonPath(ctx, x, y, r, rot, rand) {
    const freq = 1.2 + rand() * 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = i / 24 - 1;
      const lx = t * r * 1.9, ly = Math.sin(t * Math.PI * freq) * r * 0.5;
      const px = x + lx * Math.cos(rot) - ly * Math.sin(rot);
      const py = y + lx * Math.sin(rot) + ly * Math.cos(rot);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
  }

  /* ---------- the plan ---------- */
  C.plan = function (ctx, f, seed) {
    const rand = C.prng(seed);
    const noise = C.makeNoise(rand);
    const modeKey = pickMode(f);
    const mode = Object.assign({ key: modeKey }, MODES[modeKey]);
    const pal = buildPalette(f, rand, modeKey);
    const lay = layout(modeKey, f, rand);
    const blendOn = pal.dark ? 'screen' : 'multiply';
    const pick = () => pal.inks[Math.floor(rand() * pal.inks.length)];
    const steps = [];

    // 1. Ground: background and soft color fields (one per stanza)
    steps.push({ label: 'Ground', fn() {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(pal.bg);
      ctx.fillRect(0, 0, W, H);
      const fields = clamp(f.stanzaCount + 1, 2, 6);
      ctx.globalCompositeOperation = blendOn;
      for (let i = 0; i < fields; i++) {
        const x = rand() * W, y = rand() * H, r = H * (0.4 + rand() * 0.7);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const c = pal.inks[i % pal.inks.length];
        g.addColorStop(0, rgba(c, 0.22 + f.intensity * 0.18));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    } });

    // 2. Strata: a wavering band per stanza
    if (f.stanzaCount > 1 || modeKey === 'earth') {
      steps.push({ label: 'Strata', fn() {
        ctx.save();
        ctx.globalCompositeOperation = blendOn;
        const S = Math.max(2, f.stanzaCount);
        const tilt = (rand() - 0.5) * f.lineVariance * 0.35;
        for (let s = 0; s < S; s++) {
          const y0 = (H * (s + 0.25)) / S, th = (H / S) * (0.35 + rand() * 0.4);
          ctx.beginPath();
          for (let x = -40; x <= W + 40; x += 20) {
            const y = y0 + noise(x * 0.0016, s * 3.1) * 60 + Math.tan(tilt) * (x - W / 2);
            x === -40 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          for (let x = W + 40; x >= -40; x -= 20) {
            const y = y0 + th + noise(x * 0.0016, s * 3.1 + 9) * 60 + Math.tan(tilt) * (x - W / 2);
            ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = rgba(pal.inks[(s + 1) % pal.inks.length], 0.12 + f.meter * 0.12);
          ctx.fill();
        }
        ctx.restore();
      } });
    }

    // 3. Ghost type: the poem's key word, huge and cropped
    if (f.keyword) {
      steps.push({ label: 'Keyword', fn() {
        ctx.save();
        const word = f.caps > 0.5 ? f.keyword.toUpperCase() : f.keyword;
        const size = clamp((W * 1.5) / word.length, 220, 640);
        ctx.font = `italic 400 ${size}px "Libre Caslon Text", Georgia, serif`;
        ctx.textBaseline = 'alphabetic';
        const x = W * (rand() * 0.25 - 0.06), y = H * (0.6 + rand() * 0.35);
        ctx.translate(x, y);
        ctx.rotate((rand() - 0.5) * 0.12);
        ctx.fillStyle = rgba(pal.deep, pal.dark ? 0.07 : 0.06);
        ctx.fillText(word, 0, 0);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = rgba(pal.deep, 0.3);
        ctx.strokeText(word, 0, 0);
        ctx.restore();
      } });
    }

    // 4. Flow field: one particle per handful of words, steered by the mode
    const particles = Math.round(clamp(1200 + f.wordCount * 20, 1200, 4200));
    const stepsPer = Math.round(40 + clamp(f.avgLineWords / 12) * 90);
    const turbulence = 0.6 + f.energy * 2.4 - f.sibilant * 0.5;
    const scale = 0.0011 + f.energy * 0.0025;
    const biasStrength = f.dominantTheme ? 0.3 + f.themes[f.dominantTheme] * 0.45 : 0.15;
    const stepLen = 1.6 + f.avgWordLen * 0.35;
    const baseLW = 0.5 + f.avgWordLen * 0.28;
    const fc = lay.center;
    function bias(x, y) {
      switch (modeKey) {
        case 'water': return Math.sin(y * 0.004 + x * 0.0015) * 0.5;
        case 'fire': return -Math.PI / 2 + Math.sin(x * 0.006) * 0.3;
        case 'earth': return 0;
        case 'air': return -Math.PI / 7;
        case 'night': return Math.atan2(y - fc.y, x - fc.x) + Math.PI / 2;
        case 'body': return Math.atan2(fc.y - y, fc.x - x) + 0.5;
        case 'time': return Math.atan2(y - fc.y, x - fc.x) + Math.PI / 2 + 0.35;
        case 'love': return Math.atan2(y - fc.y, x - fc.x) + Math.PI / 2 - 0.4;
        default: return null;
      }
    }
    const chunks = 10;
    for (let c = 0; c < chunks; c++) {
      steps.push({ label: 'Flow', fn() {
        ctx.save();
        ctx.globalCompositeOperation = blendOn;
        ctx.lineCap = 'round';
        const count = Math.ceil(particles / chunks);
        for (let p = 0; p < count; p++) {
          let x, y;
          if (f.calm > 0.55 && rand() < 0.6) { x = rand() * W * 0.15 - 20; y = rand() * H; }
          else { x = rand() * W; y = rand() * H; }
          const col = pick();
          ctx.strokeStyle = rgba(col, clamp(0.07 + (1 - particles / 4200) * 0.14, 0.05, 0.22));
          ctx.lineWidth = baseLW * (0.4 + rand() * 1.2);
          ctx.beginPath();
          ctx.moveTo(x, y);
          const len = Math.round(stepsPer * (0.4 + rand() * 0.8));
          for (let s = 0; s < len; s++) {
            let a = noise(x * scale, y * scale) * Math.PI * turbulence;
            if (modeKey === 'measure') a = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
            const b = bias(x, y);
            let vx = Math.cos(a), vy = Math.sin(a);
            if (b !== null) { vx = lerp(vx, Math.cos(b), biasStrength); vy = lerp(vy, Math.sin(b), biasStrength); }
            const m = Math.hypot(vx, vy) || 1;
            x += (vx / m) * stepLen; y += (vy / m) * stepLen;
            if (x < -50 || x > W + 50 || y < -50 || y > H + 50) break;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      } });
    }

    // 5. Echo grid: repeated words become a halftone of dots
    if (f.repetition > 0.12) {
      steps.push({ label: 'Echo', fn() {
        ctx.save();
        const sp = 16 + (1 - f.repetition) * 26;
        const R = H * (0.18 + f.repetition * 0.32);
        const ox = W * (0.15 + rand() * 0.7), oy = H * (0.2 + rand() * 0.6);
        ctx.fillStyle = rgba(pal.accent, pal.dark ? 0.85 : 0.8);
        for (let gx = ox - R; gx <= ox + R; gx += sp) {
          for (let gy = oy - R; gy <= oy + R; gy += sp) {
            const d = Math.hypot(gx - ox, gy - oy) / R;
            if (d > 1) continue;
            const r = sp * 0.42 * Math.sqrt(1 - d) * (0.35 + 0.65 * (noise(gx * 0.004, gy * 0.004) * 0.5 + 0.5));
            if (r < 0.6) continue;
            ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU); ctx.fill();
          }
        }
        ctx.restore();
      } });
    }

    // 6. Focus: "I" becomes a sun, "you" a ring, both get a tether
    if (f.self > 0.05 || f.other > 0.05) {
      steps.push({ label: 'Focus', fn() {
        ctx.save();
        const a = { x: W * 0.618, y: H * 0.382 }, b = { x: W * 0.382, y: H * 0.618 };
        if (rand() < 0.5) { a.x = W - a.x; b.x = W - b.x; }
        if (f.self > 0.05 && f.other > 0.05) {
          ctx.strokeStyle = rgba(pal.deep, 0.55);
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 10]);
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (f.self > 0.05) {
          ctx.globalCompositeOperation = blendOn;
          ctx.fillStyle = rgba(pal.inks[0], 0.85);
          ctx.beginPath(); ctx.arc(a.x, a.y, H * (0.08 + f.self * 0.14), 0, TAU); ctx.fill();
        }
        if (f.other > 0.05) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = rgba(pal.inks[2], 0.9);
          ctx.lineWidth = 6 + f.other * 10;
          ctx.beginPath(); ctx.arc(b.x, b.y, H * (0.07 + f.other * 0.12), 0, TAU); ctx.stroke();
        }
        ctx.restore();
      } });
    }

    // 7. Glyphs: one mark per line. Sound picks the shape; punctuation picks the finish.
    const N = lay.lines.length;
    const sizeScale = clamp(Math.sqrt(14 / Math.max(1, N)), 0.5, 1.9);
    const misreg = 2 + f.alliteration * 16;
    const glyphs = lay.lines.map((l, i) => ({
      line: l, x: lay.pts[i].x, y: lay.pts[i].y,
      r: clamp(18 + l.words * 7, 22, 110) * sizeScale,
      rot: (rand() - 0.5) * TAU * (0.2 + f.lineVariance * 0.8),
      color: pal.inks[i % pal.inks.length], alt: pal.inks[(i + 2) % pal.inks.length]
    }));
    const perStep = Math.max(1, Math.ceil(N / 4));
    for (let s = 0; s < N; s += perStep) {
      const batch = glyphs.slice(s, s + perStep);
      steps.push({ label: 'Lines', fn() {
        for (const g of batch) drawGlyph(g);
      } });
    }
    function drawGlyph(g) {
      const { x, y, r, rot, line } = g;
      const outlined = !line.endPunct; // enjambed lines stay open
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pass = (dx, dy, color, alpha, op) => {
        ctx.globalCompositeOperation = op;
        ctx.save();
        ctx.translate(dx, dy);
        const lw = Math.max(2.5, r * 0.07);
        if (line.sound === 'plosive') {
          shardPath(ctx, x, y, r, rot, C.prng(g.seed || (g.seed = Math.floor(rand() * 1e9))));
        } else if (line.sound === 'liquid') {
          blobPath(ctx, x, y, r, noise, x * 0.01);
        } else if (line.sound === 'sibilant') {
          ribbonPath(ctx, x, y, r, rot, C.prng(g.seed || (g.seed = Math.floor(rand() * 1e9))));
          ctx.strokeStyle = rgba(color, alpha);
          ctx.lineWidth = outlined ? lw : r * 0.3;
          ctx.stroke();
          ctx.restore();
          return;
        } else {
          const k = clamp(Math.round(line.syl / 3), 2, 7);
          ctx.strokeStyle = rgba(color, alpha);
          ctx.lineWidth = outlined ? lw * 0.6 : lw;
          for (let i = 1; i <= k; i++) { ctx.beginPath(); ctx.arc(x, y, (r * i) / k, 0, TAU); ctx.stroke(); }
          ctx.restore();
          return;
        }
        if (outlined) { ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = lw; ctx.stroke(); }
        else { ctx.fillStyle = rgba(color, alpha); ctx.fill(); }
        ctx.restore();
      };
      // riso-style misregistration: a second color, offset by alliteration
      pass(misreg, misreg * 0.6, g.alt, 0.75, blendOn);
      pass(0, 0, g.color, 0.92, 'source-over');

      // line endings
      ctx.globalCompositeOperation = 'source-over';
      const p = line.endPunct;
      ctx.strokeStyle = rgba(pal.deep, 0.85);
      ctx.fillStyle = rgba(pal.deep, 0.9);
      ctx.lineWidth = 2.5;
      if (p.includes('?')) {
        const a0 = rand() * TAU;
        ctx.beginPath(); ctx.arc(x, y, r * 1.4, a0, a0 + TAU * 0.72); ctx.stroke();
      }
      if (p.includes('!')) {
        const n = 8 + Math.floor(rand() * 6);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rot;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25);
          ctx.lineTo(x + Math.cos(a) * r * 1.85, y + Math.sin(a) * r * 1.85);
          ctx.stroke();
        }
      }
      if (p.includes(',')) {
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(x + r + i * 16, y + i * 5, 4.5 - i, 0, TAU); ctx.fill(); }
      }
      if (p.includes('.') && !p.includes('..')) { ctx.beginPath(); ctx.arc(x, y, Math.max(5, r * 0.09), 0, TAU); ctx.fill(); }
      if (/[;:]/.test(p)) {
        ctx.beginPath(); ctx.arc(x - 8, y - r - 14, 5, 0, TAU); ctx.arc(x + 8, y - r - 14, 5, 0, TAU); ctx.fill();
      }
      if (/—|–|-/.test(p)) {
        ctx.beginPath(); ctx.moveTo(x + r * 1.1, y); ctx.lineTo(x + r * 2.2, y); ctx.stroke();
      }
      if (/\.\.\.|…/.test(p)) {
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - 18 + i * 18, y + r + 18, 4, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    // 8. Rhyme threads: arcs between lines that rhyme
    if (f.rhymePairs.length) {
      steps.push({ label: 'Rhyme', fn() {
        ctx.save();
        ctx.strokeStyle = rgba(pal.deep, 0.7);
        ctx.fillStyle = rgba(pal.deep, 0.9);
        ctx.lineWidth = 2;
        for (const [i, j] of f.rhymePairs) {
          if (!glyphs[i] || !glyphs[j]) continue;
          const a = glyphs[i], b = glyphs[j];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const dx = b.x - a.x, dy = b.y - a.y;
          const k = (rand() < 0.5 ? -1 : 1) * 0.35;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(mx - dy * k, my + dx * k, b.x, b.y);
          ctx.stroke();
          for (const g of [a, b]) { ctx.beginPath(); ctx.arc(g.x, g.y, 5, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
      } });
    }

    // 9. Mirror: strongly rhymed poems fold into partial symmetry
    if (f.rhyme > 0.45) {
      steps.push({ label: 'Mirror', fn() {
        const copy = document.createElement('canvas');
        copy.width = W; copy.height = H;
        copy.getContext('2d').drawImage(ctx.canvas, 0, 0);
        ctx.save();
        ctx.globalAlpha = 0.18 + f.rhyme * 0.25;
        ctx.globalCompositeOperation = blendOn;
        ctx.translate(W, 0); ctx.scale(-1, 1);
        ctx.drawImage(copy, 0, 0);
        ctx.restore();
      } });
    }

    // 10. Grain, then the signature
    steps.push({ label: 'Grain', fn() {
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const amt = 10 + (f.plosive + f.caps) * 10;
      let s = seed | 1;
      for (let i = 0; i < d.length; i += 4) {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const n = ((s >>> 0) / 4294967296 - 0.5) * amt;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
      if (pal.dark) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    } });

    const serial = seed.toString(16).toUpperCase().padStart(8, '0');
    steps.push({ label: 'Signature', fn() {
      ctx.save();
      ctx.font = '500 15px "Martian Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(pal.deep, 0.62);
      const txt = `CONJURE  ·  ${mode.name.toUpperCase()}  ·  ${f.lineCount} LINES  ·  N° ${serial}`;
      ctx.fillText(txt, W - 44, H - 38);
      ctx.restore();
    } });

    return { mode, palette: pal, steps, serial };
  };
})((window.Conjure = window.Conjure || {}));
