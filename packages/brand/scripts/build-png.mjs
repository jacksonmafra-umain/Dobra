// Renders the PNG sizes from the SVGs. Run after changing icon.svg or favicon.svg:
// node packages/brand/scripts/build-png.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const dir = new URL('../', import.meta.url);
mkdirSync(new URL('png/', dir), { recursive: true });

for (const [source, out, px] of [
  ['favicon.svg', 'favicon-32.png', 32],
  ['icon.svg', 'icon-128.png', 128],
  ['icon.svg', 'icon-512.png', 512],
]) {
  const svg = readFileSync(new URL(source, dir), 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
  writeFileSync(new URL(`png/${out}`, dir), png);
}
