// src/engine/scenes.ts
// Pane strategies modelled on Navigation 3's SceneStrategy (Android) and NavigationSplitView (iOS).
import type { Rect, SimulatorConfig } from '../config/types';

export type SceneStrategy = 'single' | 'list-detail' | 'two-pane' | 'supporting-pane';
export type PaneRole = 'main' | 'list' | 'detail' | 'primary' | 'secondary' | 'supporting' | 'spare';
export type SceneSpec = NonNullable<SimulatorConfig['scenes']>[string];

export interface ScenePane {
  role: PaneRole;
  rect: Rect;
}

export interface SceneLayout {
  id: string;
  strategy: SceneStrategy;
  fellBack: boolean;
  reason: string | null;
  panes: ScenePane[];
}

const ROLES: Record<SceneStrategy, PaneRole[]> = {
  single: ['main'],
  'list-detail': ['list', 'detail'],
  'two-pane': ['primary', 'secondary'],
  'supporting-pane': ['main', 'supporting'],
};

interface SceneInput {
  id: string;
  spec: SceneSpec | null;
  /** Content box in window coordinates (page margins removed). */
  content: Rect;
  /** Logical areas after separating folds; one or none when nothing separates. */
  regions: Rect[];
  forceSingle: boolean;
  unit: string;
}

export function resolveScene({ id, spec, content, regions, forceSingle, unit }: SceneInput): SceneLayout {
  const strategy: SceneStrategy = spec?.strategy ?? 'single';
  const roles = ROLES[strategy];
  const single = (reason: string | null, fellBack: boolean): SceneLayout => ({
    id,
    strategy,
    fellBack,
    reason,
    // Navigation 3 shows the top of the back stack: the detail over the list.
    panes: [{ role: roles[roles.length - 1], rect: content }],
  });

  if (forceSingle) return single('The layout rule forces a single pane', true);

  // A separating fold splits every scene at the hinge bounds, a single-pane one included.
  if (regions.length > 1) {
    return {
      id,
      strategy,
      fellBack: false,
      reason: null,
      // Regions span the whole window; panes keep the page margins and stay clear of rails.
      panes: regions.map((region, i) => ({ role: roles[i] ?? 'spare', rect: clip(region, content) })),
    };
  }
  if (strategy === 'single') return single(null, false);

  const w = content.width;
  const at = (x: number, width: number): Rect => ({ x: content.x + x, y: content.y, width, height: content.height });
  let mins: number[];
  let first: number;
  switch (strategy) {
    case 'list-detail': {
      mins = [spec!.listMinWidth ?? 0, spec!.detailMinWidth ?? 0];
      first = Math.min(Math.max(w * (spec!.listFraction ?? 0.4), mins[0]), w - mins[1]);
      break;
    }
    case 'two-pane': {
      const m = spec!.paneMinWidth ?? 0;
      mins = [m, m];
      first = w * (spec!.ratio ?? 0.5);
      break;
    }
    case 'supporting-pane': {
      const sw = spec!.supportingWidth ?? 360;
      mins = [spec!.mainMinWidth ?? 0, sw];
      first = w - sw;
      break;
    }
  }
  if (mins[0] + mins[1] > w) {
    return single(`${strategy} → single: ${mins[0]} + ${mins[1]} ${unit} minimum does not fit ${Math.round(w)} ${unit}`, true);
  }
  return {
    id,
    strategy,
    fellBack: false,
    reason: null,
    panes: [
      { role: roles[0], rect: at(0, first) },
      { role: roles[1], rect: at(first, w - first) },
    ],
  };
}

function clip(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
