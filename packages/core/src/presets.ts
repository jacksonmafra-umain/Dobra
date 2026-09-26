// A declarative artboard for one target: size, hinge overlay, safe zones, insets and grids.
// The plugin turns it into Figma nodes; the web app turns it into SVG.
import type { Rect } from './config/types';
import type { EnvConfig, Environment } from './engine/environment';
import { resolveTarget, targetKey, type Target } from './targets';

export interface PresetFrame {
  key: string;
  name: string;
  width: number;
  height: number;
  unit: string;
  cornerRadius: number;
  hinges: { rect: Rect; separating: boolean; occludes: boolean }[];
  safeZones: Rect[];
  insets: { top: number; right: number; bottom: number; left: number };
  reserved: { label: string; rect: Rect }[];
  grid: { columns: number; gutter: number; margin: number };
  twoPane: { axis: 'vertical' | 'horizontal'; gutter: number; offset: number } | null;
  estimated: boolean;
}

/** Keep-out padding either side of a separating hinge. Estimated: no platform publishes one. */
export const SAFE_ZONE_PADDING = 16;

/** Bands around every fold that splits or hides content, padded and clipped to the window. */
export function hingeSafeZone(env: Environment, padding = SAFE_ZONE_PADDING): Rect[] {
  return env.folds
    .filter((f) => f.separating || f.occludes)
    .map((f) => {
      if (f.axis === 'vertical') {
        const start = Math.max(0, f.rect.x - padding);
        return { x: start, y: 0, width: Math.min(env.width, f.rect.x + f.rect.width + padding) - start, height: env.height };
      }
      const start = Math.max(0, f.rect.y - padding);
      return { x: 0, y: start, width: env.width, height: Math.min(env.height, f.rect.y + f.rect.height + padding) - start };
    });
}

/** Material 3 layout grid by window width: 4/8/12 columns, 16/24 margins. Used when no app profile supplies rules. */
export function defaultGrid(env: Environment): { columns: number; gutter: number; margin: number } {
  if (env.width < 600) return { columns: 4, gutter: 16, margin: 16 };
  if (env.width < 840) return { columns: 8, gutter: 24, margin: 24 };
  return { columns: 12, gutter: 24, margin: 24 };
}

export function presetSpec(config: EnvConfig, t: Target): PresetFrame {
  const env = resolveTarget(config, t);
  const split = env.folds.find((f) => f.separating || f.occludes) ?? null;
  const { top, right, bottom, left } = env.safeArea;
  return {
    key: targetKey(t),
    name: `Screen / ${env.deviceName} · ${env.displayLabel} · ${env.pose?.label ?? 'flat'} · ${t.orientation}`,
    width: env.width,
    height: env.height,
    unit: env.unit,
    cornerRadius: env.cornerRadius,
    hinges: env.folds.map((f) => ({ rect: f.rect, separating: f.separating, occludes: f.occludes })),
    safeZones: hingeSafeZone(env),
    insets: { top, right, bottom, left },
    reserved: env.reservedRegions.map((r) => ({ label: r.label, rect: r.rect })),
    grid: defaultGrid(env),
    twoPane: split ? { axis: split.axis, gutter: split.axis === 'vertical' ? split.rect.width : split.rect.height, offset: 0 } : null,
    estimated: env.estimated,
  };
}
