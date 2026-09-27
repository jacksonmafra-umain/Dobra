// Which device targets a site check visits: explicit keys, else every target of the chosen
// categories, else one representative device per required coverage cell.
import type { Catalog } from '@dobra/core/config/schema';
import { representativeTarget } from '@dobra/core/coverage';
import { enumerateTargets, envConfigOf, isKnownTarget, parseTargetKey, targetKey, type Target } from '@dobra/core/targets';
import type { CliOptions } from './args';

export function chooseTargets(catalog: Catalog, opts: Pick<CliOptions, 'targets' | 'categories'>): Target[] {
  const config = envConfigOf(catalog);
  if (opts.targets) {
    return [...new Set(opts.targets)].map((key) => {
      const t = parseTargetKey(key);
      if (!t || !isKnownTarget(config, t)) throw new Error(`Unknown target ${key}`);
      return t;
    });
  }
  if (opts.categories.length) {
    const category = new Map(catalog.devices.map((d) => [d.id, d.category as string]));
    return enumerateTargets(config).filter((t) => opts.categories.includes(category.get(t.deviceId) ?? ''));
  }
  const seen = new Map<string, Target>();
  for (const r of catalog.requirements) {
    if (r.level !== 'required') continue;
    const t = representativeTarget(catalog, r);
    if (t) seen.set(targetKey(t), t);
  }
  return [...seen.values()];
}
