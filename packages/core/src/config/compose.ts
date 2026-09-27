// Composes a catalog with an app profile. It imports no JSON, so the plugin can load a profile the
// designer supplies without bundling the sample profile.
import { CATALOG_KEYS, ConfigError, parseConfig, type SimulatorConfig } from './schema';

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
