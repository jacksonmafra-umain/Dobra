import { readFileSync } from 'node:fs';
import { tokens } from '@dobra/brand/tokens';
import { describe, expect, it } from 'vitest';
import { foldOverlayClass, logoFor, statusIcon } from './brand';

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

describe('statusIcon', () => {
  it('gives each severity its own icon', () => {
    expect(statusIcon('error')).toBe('error');
    expect(statusIcon('warn')).toBe('warn');
    expect(statusIcon('info')).toBe('info');
  });
  it('falls back to info for a severity it does not know', () => {
    expect(statusIcon('fatal')).toBe('info');
  });
});

describe('foldOverlayClass', () => {
  it('draws a physical gap as a rose hatch', () => {
    expect(foldOverlayClass({ axis: 'vertical', separating: true, occludes: true })).toBe('ov-fold ov-fold--vertical ov-fold--occludes');
  });
  it('draws a separating crease as a cyan line', () => {
    expect(foldOverlayClass({ axis: 'horizontal', separating: true, occludes: false })).toBe('ov-fold ov-fold--horizontal ov-fold--line');
  });
  it('keeps a flat, non-separating crease dashed', () => {
    expect(foldOverlayClass({ axis: 'vertical', separating: false, occludes: false })).toBe('ov-fold ov-fold--vertical ov-fold--flat');
  });
});
