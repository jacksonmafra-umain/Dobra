import { describe, expect, it } from 'vitest';
import { composite, contrast, cssBlock, parseColor } from './css';

describe('css test helpers', () => {
  it('reads one block by its exact selector, ignoring comments', () => {
    const css = `/* a */\n:root {\n  --x: #fff; /* note */\n  --y: rgb(0 0 0 / 0.5);\n}\n[data-theme='light'] { --x: #000; }`;
    expect([...cssBlock(css, ':root')]).toEqual([['--x', '#fff'], ['--y', 'rgb(0 0 0 / 0.5)']]);
    expect(cssBlock(css, "[data-theme='light']").get('--x')).toBe('#000');
  });

  it('throws when the selector is missing', () => {
    expect(() => cssBlock(':root { --x: 1; }', '.nope')).toThrow(/\.nope/);
  });

  it('parses hex and space-separated rgb with alpha', () => {
    expect(parseColor('#00F0FF')).toEqual({ r: 0, g: 240, b: 255, a: 1 });
    expect(parseColor('rgb(17 24 39 / 0.85)')).toEqual({ r: 17, g: 24, b: 39, a: 0.85 });
    expect(() => parseColor('red')).toThrow(/red/);
  });

  it('composites a translucent color over an opaque one', () => {
    const c = composite(parseColor('rgb(255 255 255 / 0.5)'), parseColor('#000000'));
    expect(c).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });

  it('measures WCAG contrast', () => {
    expect(contrast(parseColor('#ffffff'), parseColor('#000000'))).toBeCloseTo(21, 5);
    expect(contrast(parseColor('#777777'), parseColor('#ffffff'))).toBeCloseTo(4.48, 2);
  });
});
