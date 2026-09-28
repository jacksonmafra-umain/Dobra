import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { envConfigOf, parseTargetKey, targetKey } from '@dobra/core/targets';
import { chooseTargets, groupByWindow, windowName } from './targets';

const catalog = loadCatalog();

describe('chooseTargets', () => {
  it('defaults to one device per required coverage cell', () => {
    const keys = chooseTargets(catalog, { targets: null, categories: [] }).map(targetKey);
    expect(keys).toContain('surface-duo-2/spanned/spanned/landscape');
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThanOrEqual(catalog.requirements.length);
  });

  it('takes explicit keys and names an unknown one', () => {
    expect(chooseTargets(catalog, { targets: ['pixel-9/main/-/portrait'], categories: [] }).map(targetKey)).toEqual(['pixel-9/main/-/portrait']);
    expect(() => chooseTargets(catalog, { targets: ['nope/x/-/portrait'], categories: [] })).toThrow(/nope\/x\/-\/portrait/);
  });

  it('drops repeated keys', () => {
    expect(chooseTargets(catalog, { targets: ['pixel-9/main/-/portrait', 'pixel-9/main/-/portrait'], categories: [] }).map(targetKey)).toEqual(['pixel-9/main/-/portrait']);
  });

  it('expands categories to all their targets', () => {
    const keys = chooseTargets(catalog, { targets: null, categories: ['dual-screen'] }).map(targetKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('surface-duo-2/'))).toBe(true);
  });
});

const config = envConfigOf(catalog);
const t = (key: string) => parseTargetKey(key)!;
const grouped = (keys: string[]) => groupByWindow(config, keys.map(t)).map((g) => g.map(targetKey));

describe('groupByWindow', () => {
  it('puts targets the browser emulates identically into one window, in first-seen order', () => {
    const keys = ['razr-ultra-2026/inner/flex/portrait', 'pixel-9/main/-/portrait', 'razr-ultra-2026/inner/flex/landscape', 'galaxy-z-fold-7/inner/book/portrait', 'galaxy-z-fold-7/inner/book/landscape'];
    expect(grouped(keys)).toEqual([
      ['razr-ultra-2026/inner/flex/portrait', 'razr-ultra-2026/inner/flex/landscape'],
      ['pixel-9/main/-/portrait'],
      ['galaxy-z-fold-7/inner/book/portrait', 'galaxy-z-fold-7/inner/book/landscape'],
    ]);
  });

  it('keeps apart windows that differ only in shape, fold or device', () => {
    expect(grouped(['pixel-9/main/-/portrait', 'pixel-9/main/-/landscape'])).toHaveLength(2);
    // The open Fold shows no fold to the page; the book posture shows one.
    expect(grouped(['galaxy-z-fold-7/inner/open/portrait', 'galaxy-z-fold-7/inner/book/portrait'])).toHaveLength(2);
    expect(grouped(['pixel-9-pro-fold/inner/book/portrait', 'pixel-10-pro-fold/inner/book/portrait'])).toHaveLength(2);
  });

  it('takes targets of other postures when the window is the same', () => {
    expect(grouped(['galaxy-z-fold-7/inner/open/portrait', 'galaxy-z-fold-7/inner/dual-screen/portrait'])).toHaveLength(1);
  });
});

describe('windowName', () => {
  it('names a single target by its key and a shared window by what its targets have in common', () => {
    expect(windowName([t('pixel-9/main/-/portrait')])).toBe('pixel-9/main/-/portrait');
    expect(windowName([t('razr-ultra-2026/inner/flex/portrait'), t('razr-ultra-2026/inner/flex/landscape')])).toBe('razr-ultra-2026/inner/flex (portrait, landscape)');
    expect(windowName([t('galaxy-z-fold-7/inner/open/portrait'), t('galaxy-z-fold-7/inner/dual-screen/portrait')])).toBe('galaxy-z-fold-7/inner (open/portrait, dual-screen/portrait)');
  });
});
