// Turns the rendered sample screen into a Hinge Report that the web report can open. The findings
// come from core's geometry rules over what is on screen, not from the simulator's own layout checks.
import { loadCatalog } from '@hinge/core/catalog/load';
import type { Rect } from '@hinge/core/config/types';
import type { Target } from '@hinge/core/engine/checks';
import type { Environment } from '@hinge/core/engine/environment';
import type { GeoNode, GeoRole } from '@hinge/core/geo';
import { buildReport, type Report } from '@hinge/core/report';
import { envConfigOf, isKnownTarget, targetKey } from '@hinge/core/targets';

export interface NodeRecord {
  id: string;
  name: string;
  role: GeoRole;
  /** In window units, relative to the screen's top-left corner. */
  rect: Rect;
  fontSize?: number;
  chars?: number;
  scrollAxis?: 'x' | 'y' | 'none';
  clips?: boolean;
  parent: string | null;
}

export function toGeoTree(records: NodeRecord[]): GeoNode[] {
  const nodes = new Map<string, GeoNode>();
  for (const { parent: _parent, ...node } of records) nodes.set(node.id, { ...node, children: [] });
  const roots: GeoNode[] = [];
  for (const rec of records) {
    const node = nodes.get(rec.id)!;
    const parent = rec.parent ? nodes.get(rec.parent) : undefined;
    (parent ? parent.children! : roots).push(node);
  }
  return roots;
}

const catalog = loadCatalog();
const envConfig = envConfigOf(catalog);

export type Exportable = { ok: true } | { ok: false; reason: string };

/** Only catalog frames can be exported: other windows would come back as a size mismatch or no match. */
export function exportable(env: Pick<Environment, 'isFree' | 'window'>, target: Target): Exportable {
  if (env.isFree) return { ok: false, reason: 'Free resize is not a catalog target.' };
  if (env.window.mode !== 'fullscreen') return { ok: false, reason: 'Only full screen windows match a catalog frame.' };
  if (!isKnownTarget(envConfig, target)) return { ok: false, reason: 'This pose and orientation is not a catalog target.' };
  return { ok: true };
}

export function simulatorReport(target: Target, label: string, url: string, width: number, height: number, records: NodeRecord[], now = new Date()): Report {
  const key = targetKey(target);
  return buildReport(catalog, { kind: 'simulator', ref: url, name: label }, [{ ref: key, name: label, page: 'Simulator', width, height, tag: key, root: toGeoTree(records) }], now);
}

export const reportFileName = (target: Target) => `hinge-report-${targetKey(target).replaceAll('/', '_')}.json`;
