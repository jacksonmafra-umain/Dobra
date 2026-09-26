import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import type { GeoNode } from './geo';
import { adaptPlan } from './adapt';
import { envConfigOf } from './targets';

const config = envConfigOf(loadCatalog());
const n = (id: string, role: GeoNode['role'], x: number, width: number): GeoNode => ({ id, name: id, role, rect: { x, y: 0, width, height: 100 } });

describe('adaptPlan', () => {
  const phone = { width: 411, height: 923 };

  it('resizes to the target and splits at a separating hinge when asked', () => {
    const p = adaptPlan(config, { ...phone, root: [], fixed: [], stretching: [] }, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' }, { split: true });
    expect(p).toMatchObject({ width: 1100, height: 756, split: { axis: 'vertical', cuts: [{ at: 537, gutter: 26 }] }, splitNote: null });
    expect(p.flags.map((f) => f.reason)).toContain('choose-pane-content');
  });

  it('does not split at a crease that does not separate, and says why', () => {
    const p = adaptPlan(config, { ...phone, root: [], fixed: [], stretching: [] }, { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' }, { split: true });
    expect(p.split).toBeNull();
    expect(p.splitNote).toMatch(/does not separate/);
  });

  it('flags children past the new edge', () => {
    const root = [n('hero', 'media', 0, 411)];
    const p = adaptPlan(config, { ...phone, root, fixed: [], stretching: [] }, { deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape' }, { split: false });
    expect(p.flags.map((f) => [f.nodeId, f.reason])).toContainEqual(['hero', 'past-new-edge']);
  });

  it('flags pinned children only when the width changes by more than 20%', () => {
    const root = [n('badge', 'container', 380, 30)];
    const flip = adaptPlan(config, { ...phone, root, fixed: ['badge'], stretching: [] }, { deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape' }, { split: false });
    expect(flip.flags.map((f) => f.reason)).not.toContain('fixed-position');
    const tablet = adaptPlan(config, { ...phone, root, fixed: ['badge'], stretching: [] }, { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'landscape' }, { split: false });
    expect(tablet.flags.map((f) => [f.nodeId, f.reason])).toContainEqual(['badge', 'fixed-position']);
  });

  it('flags a bottom bar when the new width calls for a rail', () => {
    const p = adaptPlan(config, { ...phone, root: [n('Tab bar', 'chrome', 0, 411)], fixed: [], stretching: [] }, { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'landscape' }, { split: false });
    expect(p.flags.map((f) => f.reason)).toContain('bar-to-rail');
  });

  it('flags images when the frame changes shape', () => {
    const p = adaptPlan(config, { ...phone, root: [n('photo', 'media', 0, 300)], fixed: [], stretching: [] }, { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'landscape' }, { split: false });
    expect(p.flags.map((f) => [f.nodeId, f.reason])).toContainEqual(['photo', 'image-aspect']);
  });

  it('does not flag children that stretch with the frame', () => {
    const root = [n('hero', 'media', 0, 411)];
    const p = adaptPlan(config, { ...phone, root, fixed: [], stretching: ['hero'] }, { deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape' }, { split: false });
    expect(p.flags.map((f) => f.reason)).not.toContain('past-new-edge');
  });

  it('cuts at every separating hinge of a tri-fold', () => {
    const both = adaptPlan(config, { ...phone, root: [], fixed: [], stretching: [] }, { deviceId: 'galaxy-z-trifold', displayId: 'inner', pose: 'both-half', orientation: 'landscape' }, { split: true });
    expect(both.split?.cuts).toHaveLength(2);
    const left = adaptPlan(config, { ...phone, root: [], fixed: [], stretching: [] }, { deviceId: 'galaxy-z-trifold', displayId: 'inner', pose: 'left-half', orientation: 'landscape' }, { split: true });
    expect(left.split?.cuts).toHaveLength(1);
    expect(left.split!.cuts[0].at).toBeLessThan(left.width / 2);
  });
});
