import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { envConfigOf } from './targets';
import { presetSpec } from './presets';

const config = envConfigOf(loadCatalog());

describe('preset frames', () => {
  it('sizes and names a frame after its target', () => {
    const p = presetSpec(config, { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'book', orientation: 'portrait' });
    expect(p).toMatchObject({ key: 'galaxy-z-fold-7/inner/book/portrait', width: 750, height: 832, unit: 'dp' });
    expect(p.name).toBe('Screen / Galaxy Z Fold 7 · Inner display · Half-open, book (Flex mode) · portrait');
  });

  it('names a target without a posture as flat', () => {
    expect(presetSpec(config, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' }).name).toBe('Screen / Pixel 9 · Display · flat · portrait');
  });

  it('draws a separating hinge, a padded safe zone and a two-pane grid split at it', () => {
    const p = presetSpec(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });
    expect(p.hinges).toEqual([{ rect: { x: 537, y: 0, width: 26, height: 756 }, separating: true, occludes: true }]);
    expect(p.safeZones).toEqual([{ x: 521, y: 0, width: 58, height: 756 }]);
    expect(p.twoPane).toEqual({ axis: 'vertical', gutter: 26, offset: 0 });
  });

  it('has no two-pane grid when the crease does not separate', () => {
    const p = presetSpec(config, { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' });
    expect(p.hinges).toHaveLength(1);
    expect(p.hinges[0].separating).toBe(false);
    expect(p.twoPane).toBeNull();
    expect(p.safeZones).toEqual([]);
  });

  it('uses Material grid defaults by width class', () => {
    expect(presetSpec(config, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' }).grid).toEqual({ columns: 4, gutter: 16, margin: 16 });
    expect(presetSpec(config, { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'landscape' }).grid).toEqual({ columns: 12, gutter: 24, margin: 24 });
  });

  it('copies the safe-area insets', () => {
    expect(presetSpec(config, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' }).insets).toEqual({ top: 48, right: 0, bottom: 24, left: 0 });
  });
});
