import { describe, expect, it } from 'vitest';
import type { FoldFeature } from './engine/folds';
import { collisionZones, findCollisions, rectsOverlap, spansOverlap } from './collisions';

const fold = (axis: 'vertical' | 'horizontal', separating: boolean, occludes = false): FoldFeature => ({
  axis,
  rect: axis === 'vertical' ? { x: 100, y: 0, width: 10, height: 400 } : { x: 0, y: 200, width: 300, height: 10 },
  separating,
  occludes,
  estimated: false,
});

describe('collision geometry', () => {
  it('overlaps rects and spans with exclusive edges', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, width: 11, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(true);
    expect(spansOverlap(0, 10, 10, 5)).toBe(false);
    expect(spansOverlap(0, 11, 10, 5)).toBe(true);
  });

  it('makes zones only for folds that separate or occlude, plus reserved regions', () => {
    const zones = collisionZones({
      folds: [fold('vertical', true), fold('horizontal', false), fold('horizontal', false, true)],
      reservedRegions: [{ id: 'camera', label: 'Camera', kind: 'camera', estimated: false, rect: { x: 0, y: 0, width: 50, height: 30 } }],
    });
    expect(zones.map((z) => [z.label, z.scrollAxis])).toEqual([
      ['Folding region', 'x'],
      ['Folding region', 'none'],
      ['Camera', 'none'],
    ]);
  });

  it('checks scrolling subjects on the x span of vertical folds only', () => {
    const zones = collisionZones({ folds: [fold('vertical', true), fold('horizontal', true)], reservedRegions: [] });
    const hits = findCollisions(
      [
        { id: 'scrolls-across-vertical', rect: { x: 90, y: 900, width: 40, height: 20 }, scrolls: true },
        { id: 'scrolls-over-horizontal', rect: { x: 0, y: 195, width: 50, height: 20 }, scrolls: true },
        { id: 'fixed-over-horizontal', rect: { x: 0, y: 195, width: 50, height: 20 }, scrolls: false },
        { id: 'clear', rect: { x: 0, y: 0, width: 50, height: 20 }, scrolls: false },
      ],
      zones,
    );
    expect(hits).toEqual([
      { id: 'scrolls-across-vertical', zone: 'Folding region' },
      { id: 'fixed-over-horizontal', zone: 'Folding region' },
    ]);
  });
});
