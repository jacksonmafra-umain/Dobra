// src/engine/windowStates.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '../config/load';
import { parseConfig } from '../config/schema';
import { resolveEnvironment, type Selection } from './environment';

const config = parseConfig(raw);
const sel = (deviceId: string, extra: Partial<Selection> = {}): Selection => ({
  deviceId,
  displayId: '',
  orientation: 'portrait',
  free: null,
  ...extra,
});

describe('Android window states', () => {
  it('sizes the window, not the display, in split-screen', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { windowMode: 'split', splitRatio: 0.5 }));
    expect(env.display).toEqual({ width: 411, height: 923 });
    expect(env.height).toBe(457.5);
    expect(env.sizeClass).toEqual({ system: 'window', width: 'compact', height: 'compact' });
    expect(env.safeArea.bottom).toBe(0);
    expect(env.safeArea.top).toBe(48);
  });

  it('gives a freeform window a caption bar inset and no system bar insets', () => {
    const env = resolveEnvironment(config, sel('pixel-tablet', { windowMode: 'freeform', windowSize: { width: 700, height: 500 } }));
    expect(env).toMatchObject({ width: 700, height: 500 });
    expect(env.android?.parts.map((p) => p.kind)).toEqual(['captionBar']);
    expect(env.safeArea.top).toBe(config.platforms.android.windowModes.freeform.captionBar);
  });

  it('falls back to full screen for a mode the device does not offer', () => {
    const env = resolveEnvironment(config, sel('galaxy-z-flip-7', { pose: 'closed', windowMode: 'split' }));
    expect(env.window.mode).toBe('fullscreen');
    expect(env.notes.map((n) => n.id)).toContain('window-mode-unavailable');
  });

  it('shrinks dp when the user picks a larger display size', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { displayScale: 'larger' }));
    expect(env.width).toBe(Math.round(411 / 1.3));
    expect(env.android?.density).toBeCloseTo(2.625 * 1.3);
  });

  it('keeps a phone in its natural orientation when rotation is locked', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { rotation: 90, rotationLock: true }));
    expect(env.orientation).toBe('portrait');
    expect(env.notes.map((n) => n.id)).toContain('rotation-locked');
  });

  it('keeps a portrait-only app in portrait on a phone', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { rotation: 90, appPortrait: true, targetSdk: 35 }));
    expect(env.orientation).toBe('portrait');
  });

  it('letterboxes a portrait-only app on a large screen below targetSdk 36', () => {
    const env = resolveEnvironment(config, sel('pixel-tablet', { appPortrait: true, targetSdk: 35 }));
    expect(env.display).toEqual({ width: 1280, height: 800 });
    expect(env.width).toBe(500);
    expect(env.notes.map((n) => n.id)).toContain('letterboxed');
  });

  it('ignores the orientation request on a large screen at targetSdk 36', () => {
    const env = resolveEnvironment(config, sel('pixel-tablet', { appPortrait: true, targetSdk: 36 }));
    expect(env.width).toBe(1280);
    expect(env.notes.map((n) => n.id)).toContain('target-sdk-36');
  });

  it('does not rotate a display that cannot rotate for a portrait-only app', () => {
    const env = resolveEnvironment(config, sel('galaxy-z-flip-7', { pose: 'closed', appPortrait: true, targetSdk: 35 }));
    expect(env).toMatchObject({ width: 352, height: 339 });
  });

  it('adds an IME inset without changing the window size class', () => {
    const plain = resolveEnvironment(config, sel('pixel-9'));
    const typing = resolveEnvironment(config, sel('pixel-9', { ime: true }));
    expect(typing.ime).toBe(290);
    expect(typing.safeArea.bottom).toBe(290);
    expect(typing.sizeClass).toEqual(plain.sizeClass);
  });

  it('clips a crease that crosses a stacked split window to that window', () => {
    const env = resolveEnvironment(config, sel('pixel-9-pro-fold', { pose: 'book', windowMode: 'split', splitRatio: 0.5 }));
    expect(env.folds).toHaveLength(1);
    expect(env.folds[0].rect).toEqual({ x: 425.5, y: 0, width: 0, height: env.height });
    expect(env.regions).toHaveLength(2);
  });

  it('drops a crease that misses a side-by-side split window', () => {
    const env = resolveEnvironment(config, sel('pixel-9-pro-fold', { pose: 'tabletop', windowMode: 'split', splitRatio: 0.333 }));
    expect(env.window.rect.height).toBe(851);
    expect(env.folds).toHaveLength(1);
    const outer = resolveEnvironment(config, sel('galaxy-z-trifold', { pose: 'left-half', windowMode: 'split', splitRatio: 0.333, splitSide: 'secondary' }));
    expect(outer.folds.every((f) => f.rect.x > 0)).toBe(true);
  });
});

describe('orientation requests in multi-window', () => {
  it('does not rotate the display for a portrait-only app in split-screen', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { rotation: 90, windowMode: 'split', appPortrait: true, targetSdk: 35 }));
    expect(env.display).toEqual({ width: 923, height: 411 });
    expect(env.notes.map((n) => n.id)).not.toContain('portrait-request');
  });

  it('does not claim a letterbox for a split window', () => {
    const env = resolveEnvironment(config, sel('pixel-tablet', { windowMode: 'split', appPortrait: true, targetSdk: 35 }));
    expect(env.notes.map((n) => n.id)).not.toContain('letterboxed');
  });
});

describe('iOS window fields', () => {
  it('fills display and window and uses the display keyboard', () => {
    const env = resolveEnvironment(config, sel('iphone-17', { displayId: 'main', ime: true }));
    expect(env.display).toEqual({ width: 402, height: 874 });
    expect(env.window.mode).toBe('fullscreen');
    expect(env.ime).toBe(336);
  });
});
