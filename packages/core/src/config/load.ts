import catalogJson from '../catalog/catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { composeConfig } from './compose';
import type { SimulatorConfig } from './schema';

export { composeConfig };

/** Catalog and profile merged into one raw object, for tests that mutate a copy. */
export const rawConfig = { ...catalogJson, ...profileJson, sources: { ...catalogJson.sources, ...profileJson.sources } };

/** The bundled catalog with the sample app profile. Throws a ConfigError (with paths) when either is invalid. */
export const loadConfig = (): SimulatorConfig => composeConfig(catalogJson, profileJson);
