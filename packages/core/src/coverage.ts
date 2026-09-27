// Which required cells (category × posture kind × orientation) the frames on a page cover.
import type { Catalog } from './config/schema';
import type { EnvConfig } from './engine/environment';
import { enumerateTargets, envConfigOf, type Target } from './targets';

type Requirement = Catalog['requirements'][number];

export interface PresentFrame {
  frameId: string;
  targets: Target[];
  confidence: 'tag' | 'name' | 'size';
}

export interface CoverageCell {
  requirement: Requirement;
  status: 'present' | 'present-by-size' | 'missing';
  frames: string[];
}

export interface CoverageMatrix {
  cells: CoverageCell[];
  byCategory: Record<string, { required: number; present: number }>;
}

/** The posture kind a target shows; a target without a posture is flat. */
export function kindOf(config: EnvConfig, t: Target): string {
  const d = config.devices.find((x) => x.id === t.deviceId);
  if (!d || !t.pose) return 'flat';
  const list = d.platform === 'ios' ? (d.poses ?? []) : (d.postures ?? []);
  return list.find((p) => p.id === t.pose)?.kind ?? 'flat';
}

function satisfies(config: EnvConfig, t: Target, r: Requirement): boolean {
  const d = config.devices.find((x) => x.id === t.deviceId);
  return !!d && d.category === r.category && kindOf(config, t) === r.kind && t.orientation === r.orientation;
}

export function coverage(catalog: Catalog, present: PresentFrame[]): CoverageMatrix {
  const config = envConfigOf(catalog);
  const cells = catalog.requirements.map((requirement): CoverageCell => {
    const hits = present.filter((f) => f.targets.some((t) => satisfies(config, t, requirement)));
    const confident = hits.filter((f) => f.confidence !== 'size');
    const status = confident.length ? 'present' : hits.length ? 'present-by-size' : 'missing';
    return { requirement, status, frames: (confident.length ? confident : hits).map((f) => f.frameId) };
  });
  const byCategory: CoverageMatrix['byCategory'] = {};
  for (const c of cells) {
    if (c.requirement.level !== 'required') continue;
    const row = (byCategory[c.requirement.category] ??= { required: 0, present: 0 });
    row.required += 1;
    if (c.status === 'present') row.present += 1;
  }
  return { cells, byCategory };
}

/** The first target, in catalog order, that can show a requirement's cell. */
export function representativeTarget(catalog: Catalog, r: Requirement): Target | null {
  const config = envConfigOf(catalog);
  return enumerateTargets(config).find((t) => satisfies(config, t, r)) ?? null;
}
