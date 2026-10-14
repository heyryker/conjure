/* Conjure — reads a poem and turns it into numbers.
   Every value in the returned object is either a count, a 0..1 factor,
   or sentiment in -1..1. render.js decides what each one draws. */
(function (C) {
  'use strict';
  const clamp = C.clamp;

  const STOP = new Set(('a an the and or but if of to in on at by for with from as is are was were be been being am ' +
    'it its this that these those there their them they he she him her his hers we us our you your i me my mine ' +
    'not no so do does did done have has had will would shall should can could may might must than then too very ' +
    'into onto upon over under out up down off just all any each every some such own same what which who whom ' +
    'whose when where why how o oh thee thou thy thine ye ’s \'s').split(/\s+/));

  const POS = new Set(('love loved loving joy hope light bright sweet warm gold golden smile laugh laughter bloom blooms ' +
    'grace gentle kind soft dream dreams free peace calm glad happy delight beauty beautiful shine shining sing sings ' +
    'song dance alive heaven bless blessed tender wonder fair spring summer morning dawn rise embrace kiss sunlight ' +
    'honey safe home gift rose glow sparkle true pure heal faith brave sweetest warmth').split(' '));
  const NEG = new Set(('dark death die dead dying cold grief pain sorrow sad tear tears cry weep lost lose alone lonely ' +
    'fear afraid broken break ache hurt wound blood grave ghost empty hollow shadow fall fell fallen bitter cruel ' +
    'storm rage ruin war hate sick wither decay silence gone nothing drown chill winter doom despair regret mourn ' +
    'dread dust gale abyss sore wrath scream harm').split(' '));

  const THEMES = {
    water: 'sea ocean river rain wave waves tide water lake drown swim flood stream tears shore salt mist fog sailor boat harbor pool wet',
    fire: 'fire flame flames burn burning burned sun heat ember embers blaze ash ashes smoke spark furnace forge tyger tiger bright scorch',
    earth: 'stone stones earth root roots tree trees forest mountain hill field soil dust clay grass leaf leaves flower flowers bloom garden seed seeds rock land',
    air: 'wind winds sky bird birds feather feathers wing wings cloud clouds breath breathe air fly flight gale sore soar float',
    night: 'night nights dark darkness moon star stars shadow shadows dream dreams sleep midnight black void ghost dusk',
    body: 'heart hand hands eye eyes skin blood bone bones mouth lips body face hair breast soul vein veins pulse',
    time: 'time hour hours day days year years forever never always again once clock end begin morning evening dawn age ages',
    love: 'love loved lover lovers kiss kisses dear darling desire beloved embrace tender hold held'
  };
  const THEME_SETS = {};
  for (const k in THEMES) THEME_SETS[k] = new Set(THEMES[k].split(' '));

  // color words -> OKLCH [L, C, h]
  const COLOR_WORDS = {
    red: [0.58, 0.2, 27], crimson: [0.5, 0.19, 15], scarlet: [0.6, 0.21, 32], blood: [0.42, 0.16, 22],
    rose: [0.7, 0.13, 0], pink: [0.8, 0.1, 350], orange: [0.72, 0.17, 55], amber: [0.78, 0.15, 70],
    gold: [0.8, 0.14, 85], golden: [0.8, 0.14, 85], yellow: [0.88, 0.16, 98], sun: [0.82, 0.16, 75],
    green: [0.62, 0.15, 145], grass: [0.68, 0.16, 135], forest: [0.45, 0.1, 155], leaf: [0.64, 0.15, 130],
    sea: [0.5, 0.12, 235], ocean: [0.42, 0.11, 245], blue: [0.52, 0.18, 260], sky: [0.74, 0.1, 230],
    river: [0.58, 0.1, 225], rain: [0.68, 0.06, 240], violet: [0.52, 0.17, 300], purple: [0.45, 0.16, 310],
    lilac: [0.76, 0.08, 305], night: [0.25, 0.06, 270], black: [0.2, 0.01, 260], white: [0.96, 0.01, 90],
    snow: [0.95, 0.015, 230], silver: [0.8, 0.015, 240], grey: [0.6, 0.01, 250], gray: [0.6, 0.01, 250],
    brown: [0.45, 0.07, 55], earth: [0.48, 0.06, 60], fire: [0.66, 0.21, 38], flame: [0.68, 0.2, 45],
    moon: [0.9, 0.04, 100], star: [0.93, 0.07, 95], stars: [0.93, 0.07, 95], ember: [0.6, 0.18, 35]
  };

  const BASE = { plosive: 0.21, sibilant: 0.075, liquid: 0.105, nasal: 0.093 };
  const norm = (ratio, base) => clamp((ratio / base - 0.6) / 0.8);

  function syllables(w) {
    w = w.replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  function rhymeKey(w) {
    w = (w || '').replace(/[^a-z]/g, '');
    if (w.length < 2) return null;
    const m = w.match(/[aeiouy]+[^aeiouy]*$/);
    let k = m ? m[0] : w.slice(-2);
    if (k.length < 2) k = w.slice(-2);
    return k;
  }

  function soundCounts(s) {
    const letters = s.replace(/[^a-z]/g, '');
    const n = letters.length || 1;
    let plo = 0, sib = 0, liq = 0, nas = 0, vow = 0;
    for (const ch of letters) {
      if ('pbtdkgcq'.includes(ch)) plo++;
      else if ('szxj'.includes(ch)) sib++;
      else if ('lr'.includes(ch)) liq++;
      else if ('mn'.includes(ch)) nas++;
      else if ('aeiouy'.includes(ch)) vow++;
    }
    sib += (letters.match(/sh/g) || []).length * 0.5;
    return { n, plo: plo / n, sib: sib / n, liq: liq / n, nas: nas / n, vow: vow / n };
  }

  const countOf = (s, re) => (s.match(re) || []).length;

  C.analyze = function (raw) {
    const text = raw.replace(/\r/g, '').trim();
    const lower = text.toLowerCase();
    const rawLines = text.split('\n');

    // stanzas and lines
    const lineInfo = [];
    let stanza = 0, idxInStanza = 0, prevBlank = false;
    for (const rl of rawLines) {
      const t = rl.trim();
      if (!t) { if (!prevBlank && lineInfo.length) { stanza++; idxInStanza = 0; } prevBlank = true; continue; }
      prevBlank = false;
      const lw = (t.toLowerCase().match(/[a-z’']+/g) || []).map((w) => w.replace(/[’']/g, ''));
      const sc = soundCounts(t.toLowerCase());
      const rel = {
        plosive: sc.plo / BASE.plosive, sibilant: sc.sib / BASE.sibilant,
        liquid: sc.liq / BASE.liquid, nasal: sc.nas / BASE.nasal
      };
      const sound = Object.keys(rel).reduce((a, b) => (rel[b] > rel[a] ? b : a));
      const endMatch = t.match(/([.,;:!?…—–-]+)["'”’)\]]*\s*$/);
      const endPunct = endMatch ? endMatch[1] : '';
      lineInfo.push({
        words: lw.length,
        wordLens: lw.map((w) => w.length),
        wordCodes: lw.map((w) => C.seed32(w) & 0xffff),
        wordStops: lw.map((w) => STOP.has(w) || w.length < 3), syl: lw.reduce((s, w) => s + syllables(w), 0),
        sound, endPunct, rhymeKey: rhymeKey(lw[lw.length - 1]), stanza, idxInStanza: idxInStanza++
      });
    }
    const L = Math.max(1, lineInfo.length);
    const stanzaCount = lineInfo.length ? lineInfo[lineInfo.length - 1].stanza + 1 : 0;
    for (const li of lineInfo) li.stanzaSize = lineInfo.filter((x) => x.stanza === li.stanza).length;

    const words = (lower.match(/[a-z’']+/g) || []).map((w) => w.replace(/[’']/g, '')).filter(Boolean);
    const W = Math.max(1, words.length);

    // sound
    const sc = soundCounts(lower);
    const plosive = norm(sc.plo, BASE.plosive), sibilant = norm(sc.sib, BASE.sibilant);
    const liquid = norm(sc.liq, BASE.liquid), nasal = norm(sc.nas, BASE.nasal);
    const vowelBright = clamp((sc.vow - 0.32) / 0.14);

    // rhythm
    const wpl = lineInfo.map((l) => l.words);
    const avgLineWords = C.mean(wpl);
    const lineVariance = clamp(C.cv(wpl) / 0.6);
    const meter = clamp(1 - C.cv(lineInfo.map((l) => l.syl)) / 0.5);
    const avgWordLen = C.mean(words.map((w) => w.length));

    // punctuation (rates per line)
    const exclaim = countOf(text, /!/g) / L, question = countOf(text, /\?/g) / L;
    const comma = countOf(text, /,/g) / L;
    const dash = countOf(text, /—|–|\s-\s|--/g) / L;
    const ellipsis = countOf(text, /…|\.\.\./g) / L;
    const caps = clamp((countOf(text, /[A-Z]/g) / Math.max(1, countOf(text, /[A-Za-z]/g)) - 0.03) / 0.15);

    // words
    const freq = new Map();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    const contentWords = words.filter((w) => !STOP.has(w) && w.length > 2);
    const uniqueContent = new Set(contentWords);
    const diversity = contentWords.length ? uniqueContent.size / contentWords.length : 1;
    const repetition = clamp((1 - diversity) / 0.45);

    let allit = 0, pairs = 0;
    for (let i = 1; i < words.length; i++) {
      const a = words[i - 1], b = words[i];
      if (STOP.has(a) || STOP.has(b)) continue;
      pairs++;
      if (a[0] === b[0] && !'aeiou'.includes(a[0])) allit++;
    }
    const alliteration = clamp(pairs ? (allit / pairs) / 0.25 : 0);

    // rhyme
    // exact rhyme (same vowel + coda) counts 1, slant rhyme (same final consonants) counts 0.5
    const coda = (k) => (k ? (k.match(/[^aeiouy]+$/) || [''])[0] : '');
    const rhymePairs = [];
    let rhymeScore = 0;
    for (let i = 0; i < lineInfo.length; i++) {
      for (let j = i + 1; j < Math.min(lineInfo.length, i + 5); j++) {
        const a = lineInfo[i].rhymeKey, b = lineInfo[j].rhymeKey;
        if (!a || !b) continue;
        if (a === b) { rhymePairs.push([i, j]); rhymeScore += 1; break; }
        const ca = coda(a), cb = coda(b);
        if (ca && ca === cb && ca !== 's') { rhymePairs.push([i, j]); rhymeScore += 0.5; break; }
      }
    }
    const rhyme = clamp(rhymeScore / Math.max(1, L / 2));

    // feeling
    let pos = 0, neg = 0;
    for (const w of words) { if (POS.has(w)) pos++; if (NEG.has(w)) neg++; }
    const sentiment = (pos - neg) / Math.max(3, pos + neg);
    const intensity = clamp(((pos + neg) / W) * 7);

    // themes
    const themeCounts = {}, themes = {};
    for (const k in THEME_SETS) {
      themeCounts[k] = words.filter((w) => THEME_SETS[k].has(w)).length;
      themes[k] = clamp((themeCounts[k] / W) * 9);
    }
    let dominantTheme = null;
    for (const k in themes) {
      if (themeCounts[k] >= 1 && (!dominantTheme || themes[k] > themes[dominantTheme])) dominantTheme = k;
    }

    const colors = [];
    const seenColor = new Set();
    for (const w of words) {
      if (COLOR_WORDS[w] && !seenColor.has(w)) { seenColor.add(w); colors.push({ word: w, lch: COLOR_WORDS[w], n: 0 }); }
    }
    for (const c of colors) c.n = words.filter((w) => w === c.word).length;
    colors.sort((a, b) => b.n - a.n || b.lch[1] - a.lch[1]);

    // pronouns
    const pron = (set) => clamp((words.filter((w) => set.includes(w)).length / W) * 14);
    const self = pron(['i', 'me', 'my', 'mine', 'myself']);
    const other = pron(['you', 'your', 'yours', 'thee', 'thou', 'thy', 'thine']);
    const collective = pron(['we', 'us', 'our', 'ours']);

    // composite moods
    const energy = clamp(0.4 * clamp(exclaim * 2.5) + 0.35 * plosive + 0.15 * clamp(1 - avgLineWords / 12) + 0.1 * clamp(dash * 2));
    const calm = clamp(0.35 * sibilant + 0.25 * liquid + 0.25 * meter + 0.15 * clamp(avgLineWords / 10));
    const openness = clamp(question * 2 + ellipsis * 2 + dash * 0.8);
    const enjambment = clamp(lineInfo.filter((l) => !l.endPunct).length / L);

    return {
      lineInfo, lineCount: lineInfo.length, stanzaCount, wordCount: words.length,
      plosive, sibilant, liquid, nasal, vowelBright,
      avgLineWords, avgWordLen, lineVariance, meter, enjambment,
      exclaim, question, comma, dash, ellipsis, caps,
      diversity, repetition, alliteration, rhyme, rhymePairs,
      sentiment, intensity, themes, themeCounts, dominantTheme, colors,
      self, other, collective,
      energy, calm, openness
    };
  };
})((window.Conjure = window.Conjure || {}));
