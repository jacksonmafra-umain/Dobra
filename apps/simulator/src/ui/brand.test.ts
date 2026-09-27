import { readFileSync } from 'node:fs';
import { tokens } from '@dobra/brand/tokens';
import { describe, expect, it } from 'vitest';
import { applyPageTheme, findingKind, foldOverlayClass, logoFor, statusIcon } from './brand';

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

describe('findingKind', () => {
  it('colors a finding line by its own severity', () => {
    expect(findingKind('error')).toBe('overfull');
    expect(findingKind('warn')).toBe('text-in-vertical');
    expect(findingKind('info')).toBe('info');
  });
  it('treats an unknown severity as information', () => {
    expect(findingKind('fatal')).toBe('info');
  });
});

describe('applyPageTheme', () => {
  it('puts the theme on the page root, so the body and scrollbars behind the app follow it', () => {
    const root = { dataset: {} as DOMStringMap };
    applyPageTheme(root, 'light');
    expect(root.dataset.theme).toBe('light');
    applyPageTheme(root, 'dark');
    expect(root.dataset.theme).toBe('dark');
  });
});
