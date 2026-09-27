// resize-vs-reload (spec §8, CLI only): unfolding a foldable resizes the window without reloading.
// A page that lays itself out only on load looks different from a fresh load at the new size.
import type { Finding, Target } from './engine/checks';
import { walk, type GeoNode } from './geo';

export function resizeVsReload(
  afterResize: GeoNode[],
  afterReload: GeoNode[],
  target: Target,
  { tolerance = 4, minMoved = 3 }: { tolerance?: number; minMoved?: number } = {},
): Finding[] {
  const before = new Map(walk(afterResize).map((p) => [p.node.id, p.node]));
  const moved: GeoNode[] = [];
  for (const { node } of walk(afterReload)) {
    const b = before.get(node.id);
    if (!b) continue;
    const r = node.rect;
    const edges = [b.rect.x - r.x, b.rect.y - r.y, b.rect.x + b.rect.width - (r.x + r.width), b.rect.y + b.rect.height - (r.y + r.height)];
    if (edges.some((d) => Math.abs(d) > tolerance)) moved.push(node);
  }
  if (moved.length < minMoved) return [];
  const names = moved.slice(0, 5).map((m) => m.name).join(', ');
  return [
    {
      ruleId: 'resize-vs-reload',
      severity: 'warn',
      target,
      nodeId: moved[0].id,
      rect: moved[0].rect,
      message: `${moved.length} elements sit differently after unfolding than after a reload at the same size (${names}${moved.length > 5 ? ', …' : ''}); the page lays itself out only on load.`,
      // The 4 px tolerance and the 3-element minimum are this design's choice, not a platform value.
      source: 'estimated',
      estimated: true,
    },
  ];
}
