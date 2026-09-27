import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@hinge/core/catalog/load';
import { targetKey } from '@hinge/core/targets';
import { chooseTargets } from './targets';

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

  it('expands categories to all their targets', () => {
    const keys = chooseTargets(catalog, { targets: null, categories: ['dual-screen'] }).map(targetKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('surface-duo-2/'))).toBe(true);
  });
});
