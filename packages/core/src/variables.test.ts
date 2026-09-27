import { describe, expect, it } from 'vitest';
import catalogJson from './catalog/catalog.json';
import profileJson from './profiles/sample.profile.json';
import { loadCatalog } from './catalog/load';
import { composeConfig } from './config/compose';
import { variableSpec, type SpecCollection, type VariableSpec } from './variables';

const catalog = loadCatalog();
const profile = composeConfig(catalogJson, profileJson);
const col = (spec: VariableSpec, key: string): SpecCollection => spec.collections.find((c) => c.key === key)!;
const val = (c: SpecCollection, name: string, mode: string) => c.variables.find((v) => v.name === name)!.values[mode];
const desc = (c: SpecCollection, name: string) => c.variables.find((v) => v.name === name)!.description;

describe('size-class variables', () => {
  it('makes one collection per chosen platform with modes named after the size classes', () => {
    const spec = variableSpec(catalog, { platforms: ['android', 'ios'], targets: [] });
    expect(col(spec, 'size-classes/android')).toMatchObject({ name: 'Dobra · Size classes · Android' });
    expect(col(spec, 'size-classes/android').modes.map((m) => m.name)).toEqual(['Compact', 'Medium', 'Expanded', 'Large', 'ExtraLarge']);
    expect(col(spec, 'size-classes/ios').modes.map((m) => m.name)).toEqual(['Compact', 'Regular']);
    expect(variableSpec(catalog, { platforms: ['ios'], targets: [] }).collections.map((c) => c.key)).toEqual(['size-classes/ios']);
  });

  it('uses the platform defaults and says where they came from', () => {
    const a = col(variableSpec(catalog, { platforms: ['android'], targets: [] }), 'size-classes/android');
    expect(val(a, 'layout/margin', 'compact')).toBe(16);
    expect(val(a, 'layout/columns', 'expanded')).toBe(12);
    expect(val(a, 'breakpoint/min-width', 'medium')).toBe(600);
    expect(val(a, 'breakpoint/max-width', 'medium')).toBe(840);
    expect(val(a, 'breakpoint/max-width', 'extraLarge')).toBe(0);
    expect(desc(a, 'layout/columns')).toMatch(/Material 3.*\(estimated\)/);
    expect(a.variables.find((v) => v.name === 'layout/margin')!.scopes).toEqual(['GAP']);
    const ios = col(variableSpec(catalog, { platforms: ['ios'], targets: [] }), 'size-classes/ios');
    expect(val(ios, 'breakpoint/max-width', 'compact')).toBe(600);
    expect(val(ios, 'breakpoint/min-width', 'regular')).toBe(600);
  });

  it('takes a loaded profile per class', () => {
    const a = col(variableSpec(catalog, { profile, profileName: 'Sample', platforms: ['android'], targets: [] }), 'size-classes/android');
    const rule = profile.layoutRules.find((r) => r.id === 'android-expanded')!;
    expect(val(a, 'layout/columns', 'expanded')).toBe(rule.grid.columns);
    expect(val(a, 'layout/margin', 'expanded')).toBe(rule.pageMargin.base);
    expect(desc(a, 'layout/columns')).toMatch(/Profile: Sample/);
  });

  it('keeps the defaults for a class the profile cannot match', () => {
    const iosOnly = { ...profile, layoutRules: profile.layoutRules.filter((r) => r.platform === 'ios') };
    const a = col(variableSpec(catalog, { profile: iosOnly, profileName: 'iOS only', platforms: ['android'], targets: [] }), 'size-classes/android');
    expect(val(a, 'layout/margin', 'compact')).toBe(16);
    expect(desc(a, 'layout/margin')).toMatch(/Platform default \(the profile has no rule for this class\)/);
  });
});

import { envConfigOf, resolveTarget, targetKey } from './targets';

const env = envConfigOf(catalog);
const DUO = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;
const PIXEL = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' } as const;
const IPHONE = { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait' } as const;

describe('device variables', () => {
  const spec = variableSpec(catalog, { platforms: [], targets: [DUO, PIXEL, IPHONE] });
  const d = col(spec, 'devices');

  it('has one mode per target, keyed by target key', () => {
    expect(d.name).toBe('Dobra · Devices');
    expect(d.modes.map((m) => m.key)).toEqual([DUO, PIXEL, IPHONE].map(targetKey));
    expect(d.modes[0].name).toMatch(/^Surface Duo 2 · /);
    expect(d.modeCategory?.[targetKey(DUO)]).toBe('dual-screen');
  });

  it('matches the resolved window, safe area and hinge', () => {
    const e = resolveTarget(env, DUO);
    const k = targetKey(DUO);
    expect(val(d, 'window/width', k)).toBe(e.width);
    expect(val(d, 'safe-area/top', k)).toBe(e.safeArea.top);
    const fold = e.folds.find((f) => f.separating || f.occludes)!;
    expect(val(d, 'hinge/present', k)).toBe(true);
    expect(val(d, 'hinge/separating', k)).toBe(fold.separating);
    expect(val(d, 'hinge/x', k)).toBe(fold.rect.x);
    expect(val(d, 'hinge/width', k)).toBe(fold.rect.width);
  });

  it('gives a phone no hinge and zero positions', () => {
    const k = targetKey(PIXEL);
    expect(val(d, 'hinge/present', k)).toBe(false);
    expect([val(d, 'hinge/x', k), val(d, 'hinge/width', k)]).toEqual([0, 0]);
  });

  it('names the size class and media facts, iOS included', () => {
    expect(val(d, 'size-class/width', targetKey(PIXEL))).toBe('compact');
    expect(val(d, 'size-class/width', targetKey(IPHONE))).toBe('compact');
    expect(val(d, 'media/pointer', targetKey(PIXEL))).toBe('coarse');
    expect(val(d, 'window/width', targetKey(IPHONE))).toBe(resolveTarget(env, IPHONE).width);
  });

  it('resolves layout for the exact target, profile or default', () => {
    const k = targetKey(DUO);
    const e = resolveTarget(env, DUO);
    const withProfile = col(variableSpec(catalog, { profile, platforms: [], targets: [DUO] }), 'devices');
    expect(val(withProfile, 'layout/columns', k)).toBeGreaterThan(0);
    expect(val(d, 'layout/margin', k)).toBe(Math.max(24, e.safeArea.left, e.safeArea.right));
  });

  it('keeps keys stable across runs and omits the collection without targets', () => {
    expect(JSON.stringify(variableSpec(catalog, { platforms: ['android'], targets: [DUO] }))).toBe(JSON.stringify(variableSpec(catalog, { platforms: ['android'], targets: [DUO] })));
    expect(variableSpec(catalog, { platforms: ['android'], targets: [] }).collections.map((c) => c.key)).toEqual(['size-classes/android']);
  });
});

describe('review fixes', () => {
  it('keeps an empty device collection when devices are on but none is picked', () => {
    const spec = variableSpec(catalog, { platforms: [], targets: [], devices: true });
    expect(col(spec, 'devices').modes).toEqual([]);
    expect(variableSpec(catalog, { platforms: [], targets: [] }).collections).toEqual([]);
  });

  it('matches profile rules at windows taken from the catalog, including medium height', () => {
    const rule = { ...profile.layoutRules.find((r) => r.id === 'android-medium')!, id: 'medium-tall', match: { width: ['medium'], height: ['medium'] }, grid: { columns: 99, gutter: 7 } };
    const custom = { ...profile, layoutRules: [rule, ...profile.layoutRules] };
    const a = col(variableSpec(catalog, { profile: custom, platforms: ['android'], targets: [] }), 'size-classes/android');
    expect(val(a, 'layout/columns', 'medium')).toBe(99);
  });
});
