import { describe, expect, it } from 'vitest';
import type { FoldFeature } from './engine/folds';
import { rawConfig as raw } from './config/load';
import { parseConfig } from './config/schema';
import { resolveEnvironment } from './engine/environment';
import { collisionsToFindings, collisionZones, findCollisions, rectsOverlap, spansOverlap } from './collisions';

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

const config = parseConfig(raw);

describe('collisionsToFindings', () => {
  it('reports each collision as a hinge-content error on the fold', () => {
    const env = resolveEnvironment(config, { deviceId: 'pixel-9-pro-fold', displayId: '', orientation: 'portrait', free: null, pose: 'book' });
    const target = { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'book', orientation: env.orientation, rotation: 0 as const };
    const [f] = collisionsToFindings([{ region: 'Folding region', element: 'action_card "Deals"' }], target, env);
    expect(f).toMatchObject({ ruleId: 'hinge-content', severity: 'error', nodeId: 'action_card "Deals"', source: 'androidx-window' });
    expect(f.rect).toEqual(env.folds[0].rect);
  });

  it('cites the device source, not androidx, for an iPhone fold', () => {
    const env = resolveEnvironment(config, { deviceId: 'iphone-duo', displayId: 'inner', orientation: 'landscape', free: null, pose: 'book' });
    const target = { deviceId: 'iphone-duo', displayId: 'inner', pose: 'book', orientation: env.orientation };
    const [f] = collisionsToFindings([{ region: 'Folding region', element: 'h2 "Deals"' }], target, env);
    expect(f.source).toBe('estimated');
  });
});
