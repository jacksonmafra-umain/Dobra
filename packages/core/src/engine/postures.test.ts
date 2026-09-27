import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment, type Selection } from './environment';
import { resolveLayout } from './layout';

const config = parseConfig(raw);
const screen = config.screens[0];
const sel = (deviceId: string, pose: string, extra: Partial<Selection> = {}): Selection => ({
  deviceId,
  displayId: '',
  orientation: 'portrait',
  free: null,
  pose,
  ...extra,
});

describe('androidx.window postures', () => {
  it('reports a FLAT crease on an open Pixel Fold that does not separate', () => {
    const env = resolveEnvironment(config, sel('pixel-9-pro-fold', 'open'));
    expect(env).toMatchObject({ width: 851, height: 883 });
    expect(env.sizeClass).toMatchObject({ width: 'expanded' });
    expect(env.folds).toHaveLength(1);
    expect(env.folds[0].android).toEqual({ orientation: 'VERTICAL', state: 'FLAT', occlusionType: 'NONE', isSeparating: false });
    expect(env.regions).toHaveLength(1);
  });

  it('separates the window at the crease in book posture', () => {
    const env = resolveEnvironment(config, sel('pixel-9-pro-fold', 'book'));
    expect(env.folds[0].android).toMatchObject({ orientation: 'VERTICAL', state: 'HALF_OPENED', isSeparating: true });
    expect(env.regions.map((r) => r.width)).toEqual([425.5, 425.5]);
    const layout = resolveLayout(config, env, screen);
    expect(layout.panes).toBe(2);
    expect(layout.scene.panes[0].rect.x + layout.scene.panes[0].rect.width).toBe(425.5);
  });

  it('turns the crease horizontal in tabletop and keeps a bottom bar', () => {
    const env = resolveEnvironment(config, sel('pixel-9-pro-fold', 'tabletop'));
    expect(env).toMatchObject({ width: 883, height: 851, orientation: 'landscape' });
    expect(env.folds[0].android?.orientation).toBe('HORIZONTAL');
    expect(env.regions.map((r) => r.height)).toEqual([425.5, 425.5]);
    expect(resolveLayout(config, env, screen).navigation.pattern).toBe('bar');
  });

  it('treats the Flip cover as landscape-shaped but Compact width', () => {
    const env = resolveEnvironment(config, sel('galaxy-z-flip-7', 'closed'));
    expect(env).toMatchObject({ width: 352, height: 339, orientation: 'landscape' });
    expect(env.sizeClass).toEqual({ system: 'window', width: 'compact', height: 'compact' });
    expect(env.android?.coverScreen?.userGranted).toBe(true);
    expect(env.android?.rotationLocked).toBe(true);
  });

  it('is tabletop on a half-open Flip without rotating', () => {
    const env = resolveEnvironment(config, sel('galaxy-z-flip-7', 'flex'));
    expect(env.folds[0].android?.orientation).toBe('HORIZONTAL');
    expect(env.orientation).toBe('portrait');
  });

  it('models a tri-fold as a list of folds', () => {
    const env = resolveEnvironment(config, sel('galaxy-z-trifold', 'both-half'));
    expect(env.folds).toHaveLength(2);
    expect(env.regions).toHaveLength(3);
    const partly = resolveEnvironment(config, sel('galaxy-z-trifold', 'left-half'));
    expect(partly.folds.map((f) => f.separating)).toEqual([true, false]);
    expect(partly.regions).toHaveLength(2);
  });

  it('documents rear display mode as a posture on the outer display', () => {
    const env = resolveEnvironment(config, sel('pixel-9-pro-fold', 'rear-display'));
    expect(env.pose?.windowArea).toBe('rear-display');
    expect(env.width).toBe(443);
  });
});
