# Conjure

Write a poem. Conjure reads its sound, rhythm, rhyme and mood, then paints a 16:9 picture of it.

Plain HTML, CSS and canvas. No framework, no build step, no server. The same poem always makes the same picture, because every piece is seeded by its words.

## Run it locally

```bash
npx serve .
# or: python3 -m http.server 3000
```

## Deploy (GitHub + Vercel)

```bash
git remote add origin git@github.com:<you>/conjure.git
git push -u origin main
```

Then in Vercel: **Add New → Project → Import** the repo. Framework preset: **Other**. Leave build and output settings empty. Every push to `main` redeploys.

## How a poem becomes a picture

`js/analyze.js` measures the poem. `js/render.js` paints it in layers. Each factor steers one thing:

| Factor | Measured from | Drives |
|---|---|---|
| Imagery (water, fire, earth, air, night, body, time, love) | theme word lists | composition mode, flow direction, base hue |
| Sentiment | positive / negative lexicon | warm vs. cool palette, night ground |
| Intensity | share of feeling words | saturation, color-field strength |
| Color words | "red", "sea", "gold"… | palette anchors |
| Plosives (p b t d k g) | letter share vs. English baseline | shard shapes, grain |
| Liquids (l r) | " | blob shapes |
| Sibilants (s z sh) | " | ribbon shapes, smoother flow |
| Nasals (m n) | " | ring shapes |
| Vowel light | vowel share | ink lightness |
| Alliteration | adjacent words sharing a first sound | riso-style print offset |
| Meter | syllable regularity across lines | grid layout, angle snapping |
| Line variance | spread of line lengths | tilt and rotation |
| Line length | words per line | flow stroke length |
| Stanzas | blank-line groups | strata bands, color fields |
| Enjambment | lines without end punctuation | open outlines vs. filled shapes |
| Rhyme (exact + slant) | end-word sounds | threads between lines, mirror symmetry |
| Repetition | repeated content words | halftone dot echo |
| Energy | `!`, plosives, short lines, dashes | flow turbulence, complementary palette |
| Openness | `?`, `…`, dashes | open arcs, triadic palette |
| "I" / "you" | pronoun share | a sun, a ring, a tether between them |
| Keyword | most repeated, weightiest word | huge ghost type |
| Line endings `? ! , . ; — …` | last character of each line | arcs, rays, trailing dots, punches |

Composition modes: Tide, Kiln, Strata, Drift, Nocturne, Pulse, Clockwork, Bloom, and Measure or Murmur when no imagery dominates.

## Files

```
index.html            page
css/style.css         notebook + gallery styles
js/utils.js           hash, seeded random, simplex noise, OKLCH color
js/analyze.js         poem -> factors
js/render.js          factors -> 1920×1080 canvas, in layers
js/main.js            UI, reading panel, share links, PNG download
assets/               logo
scripts/build-preview.mjs   optional single-file build for sharing a preview
```

Share links encode the poem in the URL (`?p=…&v=…`), so anyone opening one gets the same picture.
