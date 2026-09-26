import catalogJson from '../catalog/catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { CATALOG_KEYS, ConfigError, parseConfig, type SimulatorConfig } from './schema';

/** Catalog and profile merged into one raw object, for tests that mutate a copy. */
export const rawConfig = { ...catalogJson, ...profileJson, sources: { ...catalogJson.sources, ...profileJson.sources } };

/** Validates a catalog and an app profile together. */
export function composeConfig(catalog: unknown, profile: unknown): SimulatorConfig {
  // A profile describes an app; letting it set devices or platforms would silently replace the catalog.
  const cat = catalog as { sources?: Record<string, string> };
  const { sources: profileSources = {}, ...rest } = profile as { sources?: Record<string, string> };
  const problems = [
    ...CATALOG_KEYS.filter((key) => key !== 'sources' && Object.hasOwn(rest, key)).map((key) => `profile.${key}: belongs to the catalog, not an app profile`),
    ...Object.keys(profileSources)
      .filter((id) => Object.hasOwn(cat.sources ?? {}, id))
      .map((id) => `profile.sources.${id}: already defined by the catalog`),
  ];
  if (problems.length) throw new ConfigError(problems);
  // Profiles add sources for their own components and screens; the rest of the catalog stays as it is.
  return parseConfig({ ...cat, ...rest, sources: { ...cat.sources, ...profileSources } });
}

/** The bundled catalog with the sample app profile. Throws a ConfigError (with paths) when either is invalid. */
export const loadConfig = (): SimulatorConfig => composeConfig(catalogJson, profileJson);
