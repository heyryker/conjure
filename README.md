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

`js/analyze.js` measures the poem (sound, rhythm, rhyme, punctuation, feeling, imagery). `js/render.js` uses those numbers to pick a **scene**, a **palette** and a **pixel size**, paints into a low-res buffer, dithers it into a few colors, lays fine 1-px lines on top, scales it up crisp to 1920×1080, then runs a grit stage: a print-style gradient wash, blurred light comets, melting drips, smeared and pixel-sorted streaks, a focus band with the rest drifting out of focus, smudges, bloom, stippled spray clouds and string-art hairlines. Grain, RGB split and glitch rows finish it.

Every poem becomes one of three scenes:

| Scene | Leans toward it |
|---|---|
| Field: a warped, dithered color field with one bloom per stanza, sometimes a band of line-blocks | feeling words, liquid sounds, love, body, run-on lines |
| Landscape: dithered towers over a lake, fogged with distance | earth, water, air, calm, regular meter |
| ASCII: the field (or a horizon) read out as a grid of characters by brightness, with one crisp band of type left readable over the grit | repetition, regular meter, commas, time, hard consonants |

The older Poster, Columns and Tiles scenes are still in `render.js` and can be forced with `C.paint(features, seed, { scene: 'poster' })`, but they are out of the rotation. Palettes favor light, soft-vibrant grounds (Lilac, Peach Fog, Seafoam, Haze, Orchid, Periwinkle, Dusk).

Other mappings: hard consonants make bigger pixels, soft ones finer; dashes and energy draw zigzag lines; rhymes become a network of threads; questions draw thin rings; commas scatter dust; "I" becomes a slatted sun; "you" a dashed orbit. Negative feeling, fire and night melt the picture; flowing lines and s-sounds smear it; calm, liquid sounds blur it; commas and hard consonants thicken the spray; rhyme and repetition draw the string fans.

Every conjuring is one of a kind: the seed mixes the poem with a random value. The poem is cleared from the page on submit and is never stored or sent anywhere.

## Variation

- **Square sizes:** the low-res buffer ranges from 96 to 640 squares wide (about 20px down to 3px squares), nudged by the poem's sound and a random offset. Mosaic patches sometimes re-pixelate rectangles at 24–96px.
- **Colour:** 25 palettes. About 1 in 5 pieces has its hues rotated, some borrow inks from another palette, and some gain an extra ink, so colour isn't limited to the fixed list.
- **Heatmap:** a thermal-camera recolouring (deep blue → magenta → red → orange → white-hot, or the piece's own palette ramped by brightness), applied to a noise-shaped region, in bands, or rarely over the whole image. More intense and energetic poems get it more often.
- **Breaking the rules:** about 1 in 10 pieces is wild: any of the six scenes, any palette (dark ones included), every effect pushed to an extreme in one direction or the other, any square size, heavy glitch and RGB split, and sometimes a mirror fold, inverted colour, or a second scene spliced in along a jagged pixel edge.

## Grunge

About 75% of pieces (90% of wild ones) get a grunge pass after the grit: photocopier contrast crush, fold creases (a dark valley beside a bright ridge), long film scratches and short scuffs, dust and the odd hair, and burnt, uneven edges. How dirty it gets rises with darker feeling, hard consonants, and night or earth imagery.

## Reveal

After Submit the picture dissolves in as 16px blocks that arrive in clumps along a ragged front moving from top to bottom, in uneven lurches with brief freezes, stray blocks landing ahead and torn strips flickering sideways along the edge (about 1–1.3 seconds) (instant for people with reduced motion on). It never uses the same, or a near-identical, palette as the landing page backdrop.

## Grayscale

The result view has a Color / Grayscale switch. Grayscale tries a few channel mixes (like a photographer's colored filters), keeps the one with the most contrast, stretches it to full black-to-white and adds a gentle S-curve. Download saves whichever version is showing.

## Files

```
index.html            page
css/style.css         writing card + full-bleed view
js/utils.js           hash, seeded random, simplex noise, OKLCH color
js/analyze.js         poem -> factors
js/render.js          factors -> pixel scenes -> 1920×1080 canvas
js/main.js            writing card, backdrop + banner, slow pixel-dissolve reveal, grayscale, PNG download
assets/               logo
scripts/build-preview.mjs   optional single-file build for sharing a preview
```
