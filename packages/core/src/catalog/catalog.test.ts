import { describe, expect, it } from 'vitest';
import catalogJson from './catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { loadCatalog } from './load';
import { composeConfig, loadConfig } from '../config/load';
import { ConfigError } from '../config/schema';

const PROFILE_KEYS = ['components', 'scenes', 'typography', 'app', 'layoutRules', 'tabBar', 'screens', 'figmaFile'];

describe('catalog and profile', () => {
  it('loads the catalog on its own', () => {
    expect(loadCatalog().devices.length).toBeGreaterThan(0);
  });

  it('keeps app-specific keys out of the catalog', () => {
    for (const key of PROFILE_KEYS) expect(key in catalogJson).toBe(false);
    expect(() => loadCatalog({ ...catalogJson, screens: [] })).toThrow(ConfigError);
    expect(() => loadCatalog({ ...catalogJson, screens: [] })).toThrow(/screens/);
  });

  it('keeps device data out of the profile', () => {
    expect('devices' in profileJson).toBe(false);
  });

  it('composes the bundled catalog and sample profile', () => {
    expect(composeConfig(catalogJson, profileJson)).toEqual(loadConfig());
  });

  it('refuses a profile that would replace catalog data', () => {
    for (const key of ['devices', 'requirements', 'platforms', 'version']) {
      const profile = { ...profileJson, [key]: (catalogJson as Record<string, unknown>)[key] };
      expect(() => composeConfig(catalogJson, profile)).toThrow(new RegExp(`profile.*${key}`));
    }
  });

  it('lets a profile bring its own sources, without redefining the catalog ones', () => {
    expect(Object.keys(catalogJson.sources)).not.toContain('figma-ui');
    expect(profileJson.sources).toHaveProperty('figma-ui');
    expect(loadConfig().sources).toHaveProperty('figma-ui');
    const clash = { ...profileJson, sources: { ...profileJson.sources, estimated: 'mine' } };
    expect(() => composeConfig(catalogJson, clash)).toThrow(/profile\.sources\.estimated/);
  });
});
