// Outlines "Dobra" in Geist Bold and draws the fold line through the "o", as in the logo PNG in
// .redesign/logo. Writes logo.svg (for dark backgrounds) and logo-light.svg (for light ones).
// Run after changing the logo: node packages/brand/scripts/build-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

// Copied from tokens.css (a test checks they match).
const COLORS = {
  dark: { text: '#DFE2EE', fold: '#00F0FF' },
  light: { text: '#0F131C', fold: '#007C85' },
};
const SIZE = 100; // font size in SVG units
const FOLD_AT = 0.42; // where the line crosses the "o", as a fraction of its width
const FOLD_WIDTH = 5; // line thickness in SVG units
const OVERSHOOT = 0.14; // how far the line runs past the letters, as a fraction of their height
const PAD = 2;

const r = (n) => Math.round(n * 100) / 100;

// opentype.js 2.0 Path.toPathData emits NaN after a zero-length segment, so the commands are
// serialised here instead.
function pathData(commands) {
  const f = (n) => r(n).toFixed(2);
  return commands
    .map((c) => {
      if (c.type === 'M' || c.type === 'L') return `${c.type}${f(c.x)} ${f(c.y)}`;
      if (c.type === 'Q') return `Q${f(c.x1)} ${f(c.y1)} ${f(c.x)} ${f(c.y)}`;
      if (c.type === 'C') return `C${f(c.x1)} ${f(c.y1)} ${f(c.x2)} ${f(c.y2)} ${f(c.x)} ${f(c.y)}`;
      return 'Z';
    })
    .join('');
}

export function buildLogo(fontBuffer, variant) {
  const font = opentype.parse(fontBuffer);
  const glyphs = font.getPaths('Dobra', 0, SIZE, SIZE);
  const boxes = glyphs.map((p) => p.getBoundingBox());
  const x1 = Math.min(...boxes.map((b) => b.x1));
  const x2 = Math.max(...boxes.map((b) => b.x2));
  const y1 = Math.min(...boxes.map((b) => b.y1));
  const y2 = Math.max(...boxes.map((b) => b.y2));
  const o = boxes[1];
  const over = (y2 - y1) * OVERSHOOT;
  const lineX = o.x1 + (o.x2 - o.x1) * FOLD_AT - FOLD_WIDTH / 2;
  const top = y1 - over;
  const bottom = y2 + over;
  const vb = [x1 - PAD, top, x2 - x1 + PAD * 2, bottom - top].map(r).join(' ');
  const letters = glyphs.map((p) => pathData(p.commands)).join('');
  const { text, fold } = COLORS[variant];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img">`,
    '  <title>Dobra</title>',
    `  <path fill="${text}" d="${letters}"/>`,
    `  <rect fill="${fold}" x="${r(lineX)}" y="${r(top)}" width="${FOLD_WIDTH}" height="${r(bottom - top)}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const b = readFileSync(require.resolve('@fontsource/geist/files/geist-latin-700-normal.woff'));
  const font = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  writeFileSync(new URL('../logo.svg', import.meta.url), buildLogo(font, 'dark'));
  writeFileSync(new URL('../logo-light.svg', import.meta.url), buildLogo(font, 'light'));
}
