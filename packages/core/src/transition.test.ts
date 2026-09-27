import { describe, expect, it } from 'vitest';
import type { GeoNode } from './geo';
import { resizeVsReload } from './transition';

const T = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'open', orientation: 'portrait' } as const;
const n = (id: string, x: number, width = 100): GeoNode => ({ id, name: id, role: 'container', rect: { x, y: 0, width, height: 50 } });

describe('resize-vs-reload', () => {
  it('passes when resizing lays the page out as a reload would', () => {
    expect(resizeVsReload([n('a', 0), n('b', 100)], [n('a', 2), n('b', 101)], T)).toEqual([]);
  });

  it('reports a page that only lays itself out on load', () => {
    const resized = [n('a', 0, 360), n('b', 0, 360), n('c', 0, 360), n('d', 0, 360)];
    const reloaded = [n('a', 0, 750), n('b', 0, 375), n('c', 375, 375), n('d', 0, 750)];
    const [f] = resizeVsReload(resized, reloaded, T);
    expect(f).toMatchObject({ ruleId: 'resize-vs-reload', severity: 'warn', target: T, estimated: true });
    expect(f.message).toMatch(/4 elements/);
  });

  it('ignores content that only moved down, as a late banner or image pushes it', () => {
    const at = (id: string, y: number): GeoNode => ({ id, name: id, role: 'container', rect: { x: 0, y, width: 750, height: 50 } });
    expect(resizeVsReload([at('a', 0), at('b', 60), at('c', 120)], [at('a', 100), at('b', 160), at('c', 220)], T)).toEqual([]);
  });

  it('ignores elements that exist in only one of the two layouts', () => {
    expect(resizeVsReload([n('a', 0), n('only-before', 0)], [n('a', 0), n('only-after', 500)], T)).toEqual([]);
  });
});
