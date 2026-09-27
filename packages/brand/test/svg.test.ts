import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { tokens } from '../tokens';
import { buildLogo } from '../scripts/build-logo.mjs';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const SVGS = ['icon.svg', 'favicon.svg', 'logo.svg', 'logo-light.svg'];

describe.each(SVGS)('%s', (file) => {
  const svg = read(file);

  it('has a viewBox, an xmlns and no text or comments', () => {
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/viewBox="[\d.\s-]+"/);
    expect(svg).not.toMatch(/<text[\s>]/);
    expect(svg).not.toContain('<!--');
  });

  it('renders with resvg', () => {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 64 } }).render();
    expect(png.width).toBe(64);
  });
});

describe('favicon.svg', () => {
  it('keeps the fold axis and drops details that vanish at 16 px', () => {
    const svg = read('favicon.svg');
    expect(svg).toContain('x1="256"');
    expect(svg).not.toContain('stroke-opacity="0.12"');
    expect(svg).not.toContain('height="6"');
  });
});

const require = createRequire(import.meta.url);
const geistBold = () => {
  const b = readFileSync(require.resolve('@fontsource/geist/files/geist-latin-700-normal.woff'));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe.each([
  ['logo.svg', 'dark'],
  ['logo-light.svg', 'light'],
] as const)('%s', (file, variant) => {
  const svg = read(file);

  it('is titled Dobra and made only of paths', () => {
    expect(svg).toContain('<title>Dobra</title>');
    expect(svg).toMatch(/<path /);
    expect(svg).not.toContain('NaN');
  });

  it('uses the theme text color for letters and the fold color for the line', () => {
    expect(svg).toContain(`fill="${tokens[variant].text}"`);
    expect(svg).toContain(`fill="${tokens[variant].fold}"`);
  });

  it('is exactly what the script produces, deterministically', () => {
    const a = buildLogo(geistBold(), variant);
    expect(buildLogo(geistBold(), variant)).toBe(a);
    expect(svg).toBe(a);
  });
});
