// src/engine/window.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '../config/load';
import { parseConfig } from '../config/schema';
import type { InsetPart } from './environment';
import type { FoldFeature } from './folds';
import { clipParts, imeOverlap, placeWindow, translateFold } from './window';

const modes = parseConfig(raw).platforms.android.windowModes;
const phone = { width: 411, height: 923 };
const tablet = { width: 1280, height: 800 };

const parts: InsetPart[] = [
  { kind: 'statusBar', insets: { top: 24, right: 0, bottom: 0, left: 0 }, source: 'estimated' },
  { kind: 'displayCutout', insets: { top: 48, right: 0, bottom: 0, left: 0 }, source: 'estimated' },
  { kind: 'navigationBar', insets: { top: 0, right: 0, bottom: 24, left: 0 }, source: 'estimated' },
];

describe('placeWindow', () => {
  it('fills the display in full screen', () => {
    expect(placeWindow(modes, phone, 0, { mode: 'fullscreen' }).rect).toEqual({ x: 0, y: 0, width: 411, height: 923 });
  });

  it('stacks a portrait split and gives the primary window the top part', () => {
    const w = placeWindow(modes, phone, 0, { mode: 'split', splitRatio: 0.5, splitSide: 'primary' });
    expect(w.rect).toEqual({ x: 0, y: 0, width: 411, height: 457.5 });
    expect(w.divider).toEqual({ x: 0, y: 457.5, width: 411, height: 8 });
    expect(w.other).toEqual({ x: 0, y: 465.5, width: 411, height: 457.5 });
  });

  it('splits a landscape display side by side', () => {
    const w = placeWindow(modes, tablet, 0, { mode: 'split', splitRatio: 0.333, splitSide: 'secondary' });
    expect(w.rect.y).toBe(0);
    expect(w.rect.height).toBe(800);
    expect(Math.round(w.rect.x + w.rect.width)).toBe(1280);
  });

  it('centres a freeform window above the taskbar and adds a caption bar', () => {
    const w = placeWindow(modes, tablet, 48, { mode: 'freeform', size: { width: 700, height: 500 } });
    expect(w.rect).toEqual({ x: 290, y: 126, width: 700, height: 500 });
    expect(w.floating).toBe(true);
    expect(w.captionBar).toBe(modes.freeform.captionBar);
  });

  it('clamps a freeform window to the minimum and to the display', () => {
    expect(placeWindow(modes, tablet, 48, { mode: 'freeform', size: { width: 10, height: 10 } }).rect.width).toBe(modes.freeform.minSize.width);
    expect(placeWindow(modes, tablet, 48, { mode: 'freeform', size: { width: 5000, height: 5000 } }).rect).toMatchObject({ width: 1280, height: 752 });
  });

  it('puts picture-in-picture in the bottom-right corner at 16:9', () => {
    const w = placeWindow(modes, phone, 24, { mode: 'pip' });
    expect(w.rect.width).toBe(modes.pip.width);
    expect(w.rect.height).toBe(135);
    expect(w.rect.x + w.rect.width).toBe(411 - modes.pip.margin);
    expect(w.rect.y + w.rect.height).toBe(923 - 24 - modes.pip.margin);
    expect(w.captionBar).toBe(0);
  });
});

describe('clipParts', () => {
  it('drops top insets for the bottom window of a split and keeps the navigation bar', () => {
    const rect = { x: 0, y: 465.5, width: 411, height: 457.5 };
    const kinds = clipParts(parts, phone, rect).map((p) => p.kind);
    expect(kinds).toEqual(['navigationBar']);
  });

  it('keeps every inset for a full-screen window', () => {
    expect(clipParts(parts, phone, { x: 0, y: 0, width: 411, height: 923 })).toHaveLength(3);
  });
});

describe('imeOverlap', () => {
  it('is the part of the window the keyboard covers', () => {
    expect(imeOverlap(phone, { x: 0, y: 0, width: 411, height: 923 }, 290)).toBe(290);
    expect(imeOverlap(phone, { x: 0, y: 0, width: 411, height: 457.5 }, 290)).toBe(0);
  });
});

describe('translateFold', () => {
  const fold: FoldFeature = {
    axis: 'vertical',
    rect: { x: 425.5, y: 0, width: 0, height: 883 },
    separating: true,
    occludes: false,
    estimated: true,
  };
  it('moves a fold into window coordinates', () => {
    expect(translateFold(fold, { x: 100, y: 50, width: 700, height: 600 })?.rect).toEqual({ x: 325.5, y: 0, width: 0, height: 600 });
  });
  it('drops a fold outside the window', () => {
    expect(translateFold(fold, { x: 0, y: 0, width: 420, height: 883 })).toBeNull();
  });
});
