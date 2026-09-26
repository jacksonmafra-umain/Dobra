import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { enumerateTargets, envConfigOf, parseTargetKey, resolveTarget, targetKey, type Target } from './targets';

const config = envConfigOf(loadCatalog());

describe('targets', () => {
  it('round-trips keys, with or without a posture', () => {
    const withPose: Target = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'book', orientation: 'landscape' };
    const flat: Target = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' };
    expect(targetKey(withPose)).toBe('galaxy-z-fold-7/inner/book/landscape');
    expect(targetKey(flat)).toBe('pixel-9/main/-/portrait');
    expect(parseTargetKey(targetKey(withPose))).toEqual(withPose);
    expect(parseTargetKey(targetKey(flat))).toEqual(flat);
    expect(parseTargetKey('not a key')).toBeNull();
    expect(parseTargetKey('a/b/c/sideways')).toBeNull();
  });

  it('enumerates every posture and orientation a device offers', () => {
    const keys = enumerateTargets(config).map(targetKey);
    expect(keys).toContain('galaxy-z-flip-7/cover/closed/landscape');
    expect(keys).not.toContain('galaxy-z-flip-7/cover/closed/portrait');
    expect(keys).toContain('pixel-9/main/-/portrait');
    expect(keys).toContain('pixel-9/main/-/landscape');
    expect(keys).toContain('surface-duo-2/spanned/spanned/landscape');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves a target without an app profile', () => {
    const env = resolveTarget(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });
    expect(env).toMatchObject({ width: 1100, height: 756 });
    expect(env.folds[0]).toMatchObject({ separating: true, occludes: true });
    const side = resolveTarget(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned-landscape', orientation: 'portrait' });
    expect(side).toMatchObject({ width: 756, height: 1100 });
  });

  it('names the key when a target cannot be resolved', () => {
    expect(() => resolveTarget(config, { deviceId: 'pixel-9', displayId: 'main', pose: 'nope', orientation: 'portrait' })).toThrow(
      /pixel-9\/main\/nope\/portrait/,
    );
  });

  it('refuses targets a device cannot show: a posture on the wrong display, or an orientation it never takes', () => {
    expect(() => resolveTarget(config, { deviceId: 'iphone-duo', displayId: 'outer', pose: 'book', orientation: 'portrait' })).toThrow(/Unknown target/);
    expect(() => resolveTarget(config, { deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'portrait' })).toThrow(/Unknown target/);
  });
});
