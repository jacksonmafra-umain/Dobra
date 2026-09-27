import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment, type Selection } from './environment';

const config = parseConfig(raw);
const pixel = (extra: Partial<Selection> = {}): Selection => ({
  deviceId: 'pixel-9',
  displayId: 'main',
  orientation: 'portrait',
  free: null,
  ...extra,
});

describe('Android device resolution', () => {
  it('resolves Pixel 9 in dp with WindowSizeClass', () => {
    const env = resolveEnvironment(config, pixel());
    expect(env).toMatchObject({ platform: 'android', unit: 'dp', width: 411, height: 923, orientation: 'portrait' });
    expect(env.sizeClass).toEqual({ system: 'window', width: 'compact', height: 'expanded' });
    expect(env.barAxis).toBeNull();
  });

  it('keeps the cutout and status bar on top in the natural orientation', () => {
    const env = resolveEnvironment(config, pixel());
    expect(env.safeArea.top).toBe(48);
    expect(env.safeArea.bottom).toBe(24);
    expect(env.android?.parts.map((p) => p.kind)).toEqual(['statusBar', 'displayCutout', 'navigationBar']);
  });

  it('rotates the cutout to the side and swaps the size', () => {
    const env = resolveEnvironment(config, pixel({ rotation: 90 }));
    expect(env).toMatchObject({ width: 923, height: 411, orientation: 'landscape' });
    expect(env.safeArea).toMatchObject({ top: 24, left: 48 });
    expect(env.sizeClass).toEqual({ system: 'window', width: 'expanded', height: 'compact' });
  });

  it('gives the 3-button bar a bigger inset than the gesture handle, on the side of a rotated phone', () => {
    expect(resolveEnvironment(config, pixel({ navMode: 'three-button' })).safeArea.bottom).toBe(48);
    const rotated = resolveEnvironment(config, pixel({ navMode: 'three-button', rotation: 90 }));
    expect(rotated.safeArea).toMatchObject({ right: 48, bottom: 0 });
  });

  it('keeps the 3-button bar at the bottom on a tablet', () => {
    const env = resolveEnvironment(config, { ...pixel({ navMode: 'three-button', rotation: 90 }), deviceId: 'pixel-tablet' });
    expect(env).toMatchObject({ width: 800, height: 1280 });
    expect(env.safeArea.bottom).toBe(48);
  });
});
