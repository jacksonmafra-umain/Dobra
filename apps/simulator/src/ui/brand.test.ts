import { readFileSync } from 'node:fs';
import { tokens } from '@dobra/brand/tokens';
import { describe, expect, it } from 'vitest';
import { logoFor } from './brand';

// Vite inlines small assets as data URLs (with single quotes) and serves larger ones as files; read either form.
const svgOf = (url: string) =>
  url.startsWith('data:') ? decodeURIComponent(url.slice(url.indexOf(',') + 1)).replaceAll("'", '"') : readFileSync(new URL(url, import.meta.url), 'utf8');

describe('logoFor', () => {
  it('uses the light-lettered logo on the dark theme', () => {
    expect(svgOf(logoFor('dark'))).toContain(`fill="${tokens.dark.text}"`);
  });
  it('uses the dark-lettered logo on the light theme', () => {
    expect(svgOf(logoFor('light'))).toContain(`fill="${tokens.light.text}"`);
  });
});
