// What adapting a frame to another target does, and which decisions it leaves to the designer.
import type { EnvConfig } from './engine/environment';
import type { GeoNode } from './geo';
import { resolveTarget, type Target } from './targets';

export interface AdaptFlag {
  nodeId: string;
  name: string;
  reason: 'past-new-edge' | 'fixed-position' | 'bar-to-rail' | 'image-aspect' | 'choose-pane-content';
  message: string;
}

export interface AdaptPlan {
  target: Target;
  width: number;
  height: number;
  /** Only when a hinge separates the window and the designer asked for a split. */
  split: { axis: 'vertical' | 'horizontal'; at: number; gutter: number } | null;
  /** Why there is no split although one was asked for. */
  splitNote: string | null;
  flags: AdaptFlag[];
}

/** Material 3 moves navigation from a bottom bar to a rail from this width. */
const RAIL_FROM = 600;
/** A width or aspect change beyond this fraction is big enough to check pinned layers and crops. */
const BIG_CHANGE = 0.2;
const BOTTOM_BAR = /tab ?bar|bottom ?(bar|nav)/i;

export function adaptPlan(
  config: EnvConfig,
  source: { width: number; height: number; root: GeoNode[]; fixed: string[] },
  target: Target,
  opts: { split: boolean },
): AdaptPlan {
  const env = resolveTarget(config, target);
  const fold = env.folds.find((f) => f.separating) ?? null;
  const split =
    opts.split && fold
      ? { axis: fold.axis, at: fold.axis === 'vertical' ? fold.rect.x : fold.rect.y, gutter: fold.axis === 'vertical' ? fold.rect.width : fold.rect.height }
      : null;
  const splitNote = opts.split && !fold ? "This posture's hinge does not separate the window, so there is nothing to split at." : null;

  const flags: AdaptFlag[] = [];
  const widthChange = Math.abs(env.width - source.width) / source.width;
  const sourceAspect = source.width / source.height;
  const aspectChange = Math.abs(env.width / env.height - sourceAspect) / sourceAspect;
  const byId = new Map(source.root.map((n) => [n.id, n]));
  for (const n of source.root) {
    if (n.rect.x + n.rect.width > env.width + 1)
      flags.push({ nodeId: n.id, name: n.name, reason: 'past-new-edge', message: `${n.name} ends past the new ${env.width} ${env.unit} edge; resize or reflow it.` });
    if (n.role === 'chrome' && BOTTOM_BAR.test(n.name) && env.width >= RAIL_FROM)
      flags.push({ nodeId: n.id, name: n.name, reason: 'bar-to-rail', message: `${n.name}: at ${env.width} ${env.unit} navigation usually becomes a rail.` });
    if (n.role === 'media' && aspectChange > BIG_CHANGE)
      flags.push({ nodeId: n.id, name: n.name, reason: 'image-aspect', message: `${n.name}: the frame changed shape; check how the image is cropped.` });
  }
  if (widthChange > BIG_CHANGE) {
    for (const id of source.fixed) {
      const n = byId.get(id);
      if (n) flags.push({ nodeId: id, name: n.name, reason: 'fixed-position', message: `${n.name} is pinned top-left with no auto layout; check where it lands.` });
    }
  }
  if (split) flags.push({ nodeId: '', name: 'Panes', reason: 'choose-pane-content', message: 'Decide which content goes in each pane.' });
  return { target, width: env.width, height: env.height, split, splitNote, flags };
}
