// Inlines CSS and JS into a single page for a quick shareable preview (dist/preview.html).
// The real site needs no build: Vercel serves index.html, css/ and js/ as static files.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const css = readFileSync('css/style.css', 'utf8');
const body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const scripts = ['utils', 'analyze', 'render', 'main']
  .map((n) => `<script>\n${readFileSync(`js/${n}.js`, 'utf8')}\n</script>`).join('\n');
const page = body.replace(/<!--SCRIPTS-->[\s\S]*<!--\/SCRIPTS-->/,
  `<script>window.CONJURE_PREVIEW = true;</script>\n${scripts}`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/preview.html', `<title>Conjure</title>\n${fonts}\n<style>\n${css}\n</style>\n${page}`);
console.log('dist/preview.html written');
