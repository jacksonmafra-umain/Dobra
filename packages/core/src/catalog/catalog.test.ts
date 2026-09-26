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
});
