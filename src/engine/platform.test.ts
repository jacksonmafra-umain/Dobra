import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment, type Selection } from './environment';
import { resolveLayout } from './layout';
import { windowSizeClass } from './sizeClass';

const config = parseConfig(raw);
const android = config.platforms.android;
const screen = config.screens[0];

const free = (width: number, height: number, freePlatform: 'ios' | 'android'): Selection => ({
  deviceId: 'iphone-17',
  displayId: 'main',
  orientation: 'portrait',
  free: { width, height },
  freePlatform,
});

describe('WindowSizeClass breakpoints', () => {
  it.each([
    [599, 'compact'],
    [600, 'medium'],
    [839, 'medium'],
    [840, 'expanded'],
    [1200, 'large'],
    [1600, 'extraLarge'],
  ])('width %i dp is %s', (w, id) => {
    expect(windowSizeClass(android, w, 800)).toMatchObject({ width: id });
  });

  it.each([
    [479, 'compact'],
    [480, 'medium'],
    [900, 'expanded'],
  ])('height %i dp is %s', (h, id) => {
    expect(windowSizeClass(android, 400, h)).toMatchObject({ height: id });
  });
});

describe('platform vocabulary', () => {
  it('labels Android windows in dp and iOS windows in pt', () => {
    expect(resolveEnvironment(config, free(400, 800, 'android')).unit).toBe('dp');
    expect(resolveEnvironment(config, free(400, 800, 'ios')).unit).toBe('pt');
  });

  it('never gives an Android window compact/regular classes', () => {
    const env = resolveEnvironment(config, free(700, 900, 'android'));
    expect(env.sizeClass).toEqual({ system: 'window', width: 'medium', height: 'expanded' });
  });

  it('matches iOS rules only for iOS and Android rules only for Android', () => {
    const ios = resolveLayout(config, resolveEnvironment(config, free(400, 800, 'ios')), screen);
    const droid = resolveLayout(config, resolveEnvironment(config, free(400, 800, 'android')), screen);
    expect(ios.rule.platform).toBe('ios');
    expect(droid.rule.platform).toBe('android');
  });

  it('keeps a short, narrow Android window out of the side-by-side rule (Flip cover, 352×339)', () => {
    const layout = resolveLayout(config, resolveEnvironment(config, free(352, 339, 'android')), screen);
    expect(layout.rule.id).toBe('android-compact-short');
    expect(layout.hero.variant).toBe('stacked');
  });
});

describe('Android navigation patterns', () => {
  const nav = (w: number, h: number) =>
    resolveLayout(config, resolveEnvironment(config, free(w, h, 'android')), screen).navigation.pattern;
  it('uses a bottom bar on compact width', () => expect(nav(411, 900)).toBe('bar'));
  it('uses a rail on medium and expanded width', () => {
    expect(nav(700, 900)).toBe('rail');
    expect(nav(900, 900)).toBe('rail');
  });
  it('uses a drawer on large width', () => expect(nav(1280, 800)).toBe('drawer'));
  it('moves to a rail when a wide window is short', () => expect(nav(900, 400)).toBe('rail'));
});
