import catalogJson from '../catalog/catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { parseConfig, type SimulatorConfig } from './schema';

/** Catalog and profile merged into one raw object, for tests that mutate a copy. */
export const rawConfig = { ...catalogJson, ...profileJson };

/** Validates a catalog and an app profile together. */
export function composeConfig(catalog: unknown, profile: unknown): SimulatorConfig {
  return parseConfig({ ...(catalog as object), ...(profile as object) });
}

/** The bundled catalog with the sample app profile. Throws a ConfigError (with paths) when either is invalid. */
export const loadConfig = (): SimulatorConfig => composeConfig(catalogJson, profileJson);
