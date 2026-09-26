import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { envConfigOf, targetKey } from './targets';
import { matchFrame } from './match';

const config = envConfigOf(loadCatalog());

describe('matchFrame', () => {
  it('trusts a valid tag first', () => {
    const m = matchFrame({ tag: 'galaxy-z-fold-7/inner/book/portrait', name: 'Anything', width: 1, height: 1 }, config);
    expect(m.by).toBe('tag');
    expect(m.targets.map(targetKey)).toEqual(['galaxy-z-fold-7/inner/book/portrait']);
  });

  it('ignores a tag for a device the catalog no longer has', () => {
    const m = matchFrame({ tag: 'gone-device/main/-/portrait', name: 'Frame 1', width: 3, height: 3 }, config);
    expect(m.by).toBe('none');
  });

  it('reads a key written in the frame name', () => {
    const m = matchFrame({ name: 'Home — pixel-9/main/-/portrait', width: 10, height: 10 }, config);
    expect(m.by).toBe('name');
  });

  it('matches by size within 1px, in either orientation, and keeps every candidate', () => {
    const m = matchFrame({ name: 'Frame 12', width: 1100.4, height: 756 }, config);
    expect(m.by).toBe('size');
    expect(m.targets.map(targetKey)).toContain('surface-duo-2/spanned/spanned/landscape');
    const rotated = matchFrame({ name: 'Frame 13', width: 780, height: 360 }, config);
    expect(rotated.targets.map((t) => t.deviceId)).toContain('galaxy-s25');
  });

  it('reports the nearest size when nothing matches', () => {
    const m = matchFrame({ name: 'Odd', width: 399, height: 801 }, config);
    expect(m.by).toBe('none');
    expect(m.nearest).toBeDefined();
  });

  it('does not trust a tag or name for a target the device cannot show', () => {
    expect(matchFrame({ tag: 'iphone-duo/outer/book/portrait', name: 'x', width: 1, height: 1 }, config).by).toBe('none');
    expect(matchFrame({ name: 'galaxy-z-flip-7/cover/closed/portrait', width: 1, height: 1 }, config).by).toBe('none');
  });
});
