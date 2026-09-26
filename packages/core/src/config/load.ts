import catalogJson from '../catalog/catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { CATALOG_KEYS, ConfigError, parseConfig, type SimulatorConfig } from './schema';

/** Catalog and profile merged into one raw object, for tests that mutate a copy. */
export const rawConfig = { ...catalogJson, ...profileJson };

/** Validates a catalog and an app profile together. */
export function composeConfig(catalog: unknown, profile: unknown): SimulatorConfig {
  // A profile describes an app; letting it set devices or platforms would silently replace the catalog.
  const clashes = CATALOG_KEYS.filter((key) => Object.hasOwn(profile as object, key));
  if (clashes.length) throw new ConfigError(clashes.map((key) => `profile.${key}: belongs to the catalog, not an app profile`));
  return parseConfig({ ...(catalog as object), ...(profile as object) });
}

/** The bundled catalog with the sample app profile. Throws a ConfigError (with paths) when either is invalid. */
export const loadConfig = (): SimulatorConfig => composeConfig(catalogJson, profileJson);
