import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { DEFAULT_MEDIA } from '../catalog/media';
import { envConfigOf } from '../targets';
import { loadConfig } from '../config/load';
import type { LayoutRule } from '../config/types';
import { resolveEnvironment, type Selection } from './environment';
import { ruleMatches } from './layout';

const config = envConfigOf(loadCatalog());
const phone: Selection = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait', free: null };
const desktop: Selection = { deviceId: 'chromebook', displayId: 'main', orientation: 'landscape', free: null };

describe('environment media facts', () => {
  it('takes the device category defaults', () => {
    expect(resolveEnvironment(config, phone).media).toEqual(DEFAULT_MEDIA.phone);
    expect(resolveEnvironment(config, desktop).media).toMatchObject({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium' });
  });

  it('applies a selection override key by key', () => {
    const env = resolveEnvironment(config, { ...phone, media: { pointer: 'fine', keyboard: undefined } });
    expect(env.media).toEqual({ ...DEFAULT_MEDIA.phone, pointer: 'fine' });
  });

  it('gives a free window the phone defaults', () => {
    expect(resolveEnvironment(config, { ...phone, free: { width: 500, height: 700 } }).media).toEqual(DEFAULT_MEDIA.phone);
  });
});

const simConfig = loadConfig();
const rule = (match: LayoutRule['match']): LayoutRule => ({ ...simConfig.layoutRules.find((r) => r.platform === 'android')!, match });

describe('media match keys', () => {
  it('matches a rule keyed on pointer only where the pointer fits', () => {
    const fine = rule({ pointer: 'fine' });
    expect(ruleMatches(fine, resolveEnvironment(config, desktop))).toBe(true);
    expect(ruleMatches(fine, resolveEnvironment(config, phone))).toBe(false);
    expect(ruleMatches(fine, resolveEnvironment(config, { ...phone, media: { pointer: 'fine' } }))).toBe(true);
  });

  it('matches keyboard and viewing distance', () => {
    expect(ruleMatches(rule({ keyboard: 'physical' }), resolveEnvironment(config, desktop))).toBe(true);
    expect(ruleMatches(rule({ viewingDistance: 'far' }), resolveEnvironment(config, desktop))).toBe(false);
  });

  it('keeps rules without media keys matching as before', () => {
    expect(ruleMatches(rule({}), resolveEnvironment(config, desktop))).toBe(true);
  });
});
