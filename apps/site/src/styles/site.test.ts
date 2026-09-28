import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./site.css', import.meta.url), 'utf8');

describe('code block colors', () => {
  // The page is dark by default (and stays dark with JavaScript off on a dark system), so Shiki's
  // dark colors must be the default and the light ones must follow the light theme.
  it('uses the dark Shiki colors unless the page is light', () => {
    expect(css).toMatch(/\.astro-code, \.astro-code span \{ color: var\(--shiki-dark\); \}/);
    expect(css).toMatch(/\[data-theme='light'\] \.astro-code, \[data-theme='light'\] \.astro-code span \{ color: var\(--shiki-light\); \}/);
    expect(css).toMatch(/@media \(prefers-color-scheme: light\) \{ :root:not\(\[data-theme\]\) \.astro-code, :root:not\(\[data-theme\]\) \.astro-code span \{ color: var\(--shiki-light\); \} \}/);
  });
});

describe('monospace ligatures', () => {
  // JetBrains Mono would draw "://" and "--" as single glyphs, so a typed URL reads as "http: /".
  it('turns contextual ligatures off on every element', () => {
    expect(css).toMatch(/\*, ::before, ::after \{ font-variant-ligatures: no-contextual !important; \}/);
  });
});
