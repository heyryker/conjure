# Conjure

Write a poem. Conjure reads its sound, rhythm, rhyme and mood, then paints a 16:9 picture of it.

Plain HTML, CSS and canvas. No framework, no build step, no server.

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

`js/analyze.js` measures the poem (sound, rhythm, rhyme, punctuation, feeling, imagery). `js/render.js` uses those numbers to pick a **scene**, a **palette** and a **pixel size**, paints into a low-res buffer, dithers it into a few colors, lays fine 1-px lines on top, scales it up crisp to 1920×1080 and adds grain, RGB split and glitch rows.

| Scene | Leans toward it |
|---|---|
| Poster: each stanza a region of moiré, contour noise, waves, blocks or rain | stanzas, rhyme, regular meter |
| Columns: one neon column per line, one block per word | energy, `!`, night imagery |
| Tiles: one tile per word, content words get richer motifs | repetition, meter, long poems |
| Skyline: dithered voxel landscape over a lake | earth, water, calm |
| Knit: a hand-dithered color field with a band of line-blocks | feeling words, liquid sounds, love, body |

Other mappings: hard consonants make bigger pixels, soft ones finer; dashes and energy draw zigzag lines; rhymes become a network of threads; questions draw thin rings; commas scatter dust; "I" becomes a slatted sun; "you" a dashed orbit.

Every conjuring is one of a kind: the seed mixes the poem with a random value. The poem is cleared from the page on submit and is never stored or sent anywhere.

## Files

```
index.html            page
css/style.css         writing card + full-bleed view
js/utils.js           hash, seeded random, simplex noise, OKLCH color
js/analyze.js         poem -> factors
js/render.js          factors -> pixel scenes -> 1920×1080 canvas
js/main.js            writing card, reveal, back, PNG download
assets/               logo
scripts/build-preview.mjs   optional single-file build for sharing a preview
```
