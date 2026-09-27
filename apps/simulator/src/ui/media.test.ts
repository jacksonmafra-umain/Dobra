// src/ui/media.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '@hinge/core/config/load';
import { parseConfig } from '@hinge/core/config/schema';
import { findDevice, resolveEnvironment, type Selection } from '@hinge/core/engine/environment';
import { resolveMedia } from './media';

const config = parseConfig(raw);
const sel = (deviceId: string, extra: Partial<Selection> = {}): Selection => ({ deviceId, displayId: '', orientation: 'portrait', free: null, ...extra });
const media = (s: Selection, o = {}) => resolveMedia(findDevice(config, s.deviceId), resolveEnvironment(config, s), o);

describe('resolveMedia', () => {
  it('uses the touch defaults on a phone', () => {
    expect(media(sel('pixel-9'))).toMatchObject({ pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', overridden: [], estimated: true });
  });
  it('uses the desktop defaults on a Chromebook', () => {
    expect(media(sel('chromebook'))).toMatchObject({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium' });
  });
  it('applies an override and names it', () => {
    const m = media(sel('pixel-tablet'), { pointer: 'fine' });
    expect(m.pointer).toBe('fine');
    expect(m.overridden).toEqual(['pointer']);
  });
  it('does not count an override equal to the device value', () => {
    expect(media(sel('pixel-9'), { pointer: 'coarse' }).overridden).toEqual([]);
  });
  it('derives the posture from separating folds', () => {
    expect(media(sel('pixel-9-pro-fold', { displayId: 'inner', pose: 'tabletop' })).windowPosture).toBe('Tabletop');
    expect(media(sel('pixel-9-pro-fold', { displayId: 'inner', pose: 'book' })).windowPosture).toBe('Book');
    expect(media(sel('pixel-9')).windowPosture).toBe('Flat');
  });
});
