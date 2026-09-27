// src/ui/parity.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '@hinge/core/config/load';
import { parseConfig } from '@hinge/core/config/schema';
import { runLayoutChecks, targetOf } from '@hinge/core/engine/checks';
import { findDevice, resolveEnvironment, type Selection } from '@hinge/core/engine/environment';
import { resolveLayout } from '@hinge/core/engine/layout';
import { counterpartOf, counterpartSelection, parityRows } from './parity';

const config = parseConfig(raw);
const dev = (id: string) => findDevice(config, id);
const sel = (deviceId: string, extra: Partial<Selection> = {}): Selection => ({ deviceId, displayId: '', orientation: 'portrait', free: null, ...extra });
const side = (s: Selection) => {
  const env = resolveEnvironment(config, s);
  const screen = config.screens.find((x) => x.id === 'home')!;
  const layout = resolveLayout(config, env, screen);
  return { env, layout, findings: runLayoutChecks(config, env, layout, screen, targetOf(s, env)) };
};

describe('counterpartOf', () => {
  it('pairs devices of the same category by nearest width', () => {
    expect(counterpartOf(config, dev('iphone-17')).id).toBe('pixel-9');
    expect(counterpartOf(config, dev('pixel-9')).platform).toBe('ios');
    expect(counterpartOf(config, dev('pixel-tablet')).id).toMatch(/^ipad-/);
  });
  it('falls back when the other platform has no device in that category', () => {
    expect(counterpartOf(config, dev('galaxy-z-flip-7')).platform).toBe('ios');
    expect(counterpartOf(config, dev('chromebook')).id).toMatch(/^ipad-/);
    expect(counterpartOf(config, dev('surface-duo-2')).platform).toBe('ios');
  });
});

describe('counterpartSelection', () => {
  it('carries the orientation to an iOS counterpart', () => {
    expect(counterpartSelection(config, sel('pixel-9'), 'iphone-17', 'landscape')).toMatchObject({ deviceId: 'iphone-17', orientation: 'landscape' });
  });
  it('rotates an Android counterpart only when its natural shape differs', () => {
    expect(counterpartSelection(config, sel('iphone-17'), 'pixel-9', 'landscape').rotation).toBe(90);
    expect(counterpartSelection(config, sel('iphone-17'), 'pixel-9', 'portrait').rotation).toBe(0);
    expect(resolveEnvironment(config, counterpartSelection(config, sel('iphone-17'), 'pixel-9', 'landscape')).orientation).toBe('landscape');
  });
});

describe('parityRows', () => {
  it('compares window, size class, rule, navigation, scene and findings', () => {
    const rows = parityRows(side(sel('iphone-17')), side(sel('pixel-9')));
    expect(rows.map((r) => r.label)).toEqual(['Window', 'Size class', 'Layout rule', 'Navigation', 'Scene', 'Findings']);
    expect(rows.find((r) => r.label === 'Window')!.a).toMatch(/pt$/);
    expect(rows.find((r) => r.label === 'Window')!.b).toMatch(/dp$/);
  });
  it('marks only the rows that differ', () => {
    const rows = parityRows(side(sel('pixel-9')), side(sel('pixel-9', { rotation: 90 })));
    expect(rows.find((r) => r.label === 'Window')!.differs).toBe(true);
    expect(parityRows(side(sel('pixel-9')), side(sel('pixel-9'))).some((r) => r.differs)).toBe(false);
  });
});
