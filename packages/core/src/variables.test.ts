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
