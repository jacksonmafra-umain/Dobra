// src/engine/sceneLayout.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '../config/load';
import { parseConfig } from '../config/schema';
import { resolveEnvironment } from './environment';
import { resolveLayout } from './layout';

const config = parseConfig(raw);
const locations = config.screens.find((s) => s.id === 'locations')!;
const layoutFor = (deviceId: string, pose?: string) =>
  resolveLayout(config, resolveEnvironment(config, { deviceId, displayId: '', orientation: 'portrait', free: null, pose }), locations);

describe('scene in the layout', () => {
  it('shows only the detail on a phone', () => {
    const l = layoutFor('pixel-9');
    expect(l.scene.fellBack).toBe(true);
    expect(l.panes).toBe(1);
  });
  it('splits list and detail on an open Pixel Fold', () => {
    expect(layoutFor('pixel-9-pro-fold', 'open').scene.panes.map((p) => p.role)).toEqual(['list', 'detail']);
  });
  it('splits at the crease in book posture', () => {
    const l = layoutFor('pixel-9-pro-fold', 'book');
    expect(l.scene.panes[0].rect.x).toBe(l.margin.left);
    expect(l.scene.panes[0].rect.x + l.scene.panes[0].rect.width).toBe(425.5);
  });
  it('keeps screens without a scene single on a one-pane rule', () => {
    const home = config.screens.find((s) => s.id === 'home')!;
    const env = resolveEnvironment(config, { deviceId: 'pixel-9', displayId: '', orientation: 'portrait', free: null });
    expect(resolveLayout(config, env, home).scene.strategy).toBe('single');
  });

  it('keeps an existing two-pane rule two-pane when the screen declares no scene', () => {
    const home = config.screens.find((s) => s.id === 'home')!;
    const env = resolveEnvironment(config, { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait', free: { width: 800, height: 900 }, freePlatform: 'ios' });
    const l = resolveLayout(config, env, home);
    expect(l.rule.id).toBe('regular-regular');
    expect(l.panes).toBe(2);
  });
});
