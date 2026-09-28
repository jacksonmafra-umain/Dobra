// Which device targets a site check visits: explicit keys, else every target of the chosen
// categories, else one representative device per required coverage cell. Targets the browser
// would emulate identically share one window, and each window is checked once.
import type { Catalog } from '@dobra/core/config/schema';
import type { EnvConfig } from '@dobra/core/engine/environment';
import { representativeTarget } from '@dobra/core/coverage';
import { enumerateTargets, envConfigOf, isKnownTarget, parseTargetKey, targetKey, type Target } from '@dobra/core/targets';
import type { SiteOptions } from './args';
import { deviceProfile } from './emulate';

export function chooseTargets(catalog: Catalog, opts: Pick<SiteOptions, 'targets' | 'categories'>): Target[] {
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

/**
 * Groups targets whose windows the page cannot tell apart, in first-seen order. Two targets share a
 * window when they are on the same device and get the same emulation: size, device scale, user
 * agent, mobile and touch flags, and fold. The device is part of the key because the unfold pass
 * starts from that device's cover display.
 */
export function groupByWindow(config: EnvConfig, targets: Target[]): Target[][] {
  const groups = new Map<string, Target[]>();
  for (const t of targets) {
    const key = `${t.deviceId} ${JSON.stringify(deviceProfile(config, t))}`;
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.values()];
}

/** A target's key, or for a shared window the key parts its targets have in common, then what differs. */
export function windowName(group: Target[]): string {
  const parts = group.map((t) => targetKey(t).split('/'));
  if (parts.length === 1) return parts[0].join('/');
  let common = 0;
  while (common < parts[0].length - 1 && parts.every((p) => p[common] === parts[0][common])) common += 1;
  return `${parts[0].slice(0, common).join('/')} (${parts.map((p) => p.slice(common).join('/')).join(', ')})`;
}
