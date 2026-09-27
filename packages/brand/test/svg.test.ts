import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const SVGS = ['icon.svg', 'favicon.svg'];

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
