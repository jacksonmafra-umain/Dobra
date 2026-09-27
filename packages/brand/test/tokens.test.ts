import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_TOKENS, tokens } from '../tokens';
import { composite, contrast, cssBlock, parseColor } from './css';

const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
const themes = { dark: cssBlock(css, ":root, [data-theme='dark']"), light: cssBlock(css, "[data-theme='light']") };
const shared = cssBlock(css, ':where(:root)');
const TEXT_ACCENTS = ['fold', 'pass', 'warn', 'hinge'] as const;

describe('tokens.css', () => {
  it('defines exactly the same theme tokens in dark and light', () => {
    expect([...themes.light.keys()].sort()).toEqual([...themes.dark.keys()].sort());
  });

  it('has no theme token in the shared block', () => {
    for (const name of shared.keys()) expect(themes.dark.has(name), name).toBe(false);
  });

  it('defines the shared radius, spacing, font and type tokens', () => {
    for (const name of [
      '--dobra-radius-sm', '--dobra-radius', '--dobra-radius-lg', '--dobra-radius-xl',
      '--dobra-space-xs', '--dobra-space-sm', '--dobra-space-md', '--dobra-space-lg', '--dobra-space-xl',
      '--dobra-font-display', '--dobra-font-body', '--dobra-font-mono',
      '--dobra-type-headline-lg', '--dobra-type-body-md', '--dobra-type-label-md',
    ]) expect(shared.has(name), name).toBe(true);
  });
});

describe('tokens.ts', () => {
  it('mirrors both theme blocks of tokens.css exactly', () => {
    for (const theme of ['dark', 'light'] as const) {
      const fromCss = Object.fromEntries([...themes[theme]].map(([k, v]) => [k.replace('--dobra-', ''), v]));
      expect(tokens[theme]).toEqual(fromCss);
    }
    expect([...THEME_TOKENS].sort()).toEqual(Object.keys(tokens.dark).sort());
  });
});

describe.each(['dark', 'light'] as const)('contrast in %s', (theme) => {
  const t = tokens[theme];
  const bg = parseColor(t.bg);
  const panel = composite(parseColor(t.panel), bg);

  it('keeps text and muted text readable on the canvas and on panels', () => {
    for (const fg of [t.text, t.muted]) {
      expect(contrast(parseColor(fg), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseColor(fg), panel)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accents readable as text on the canvas', () => {
    for (const name of TEXT_ACCENTS) expect(contrast(parseColor(t[name]), bg), name).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps text and every accent readable on Level 2 flyouts', () => {
    const flyout = composite(parseColor(t.flyout), panel);
    for (const name of ['text', 'muted', 'accent-2', ...TEXT_ACCENTS] as const)
      expect(contrast(parseColor(t[name]), flyout), name).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps text on a fold-colored fill readable', () => {
    expect(contrast(parseColor(t['on-fold']), parseColor(t.fold))).toBeGreaterThanOrEqual(4.5);
  });
});
