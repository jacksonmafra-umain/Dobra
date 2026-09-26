// src/engine/typography.ts
// Type scales with the user's text size: sp through Android's non-linear FontScaleConverter, pt
// linearly on iOS. Spacing (dp, pt) never scales with it.
import type { Platform, SimulatorConfig } from '../config/types';

type FontScaleSpec = NonNullable<SimulatorConfig['platforms']['android']['fontScale']>;

/** Android 14+ applies the non-linear tables from this scale up. */
const MIN_NON_LINEAR = 1.03;

export interface TextSettings {
  fontScale: number;
  bold: boolean;
  reducedMotion: boolean;
}

export function scaledTextSize(scale: FontScaleSpec | undefined, size: number, fontScale: number): number {
  const f = Math.min(scale?.max ?? fontScale, Math.max(scale?.min ?? fontScale, fontScale));
  const nl = scale?.nonLinear;
  if (!nl || f < MIN_NON_LINEAR) return size * f;
  const keys = Object.keys(nl.tables)
    .map(Number)
    .sort((a, b) => a - b);
  const lookup = (key: number) => (key === 1 ? size : interpolate(nl.fromSp, nl.tables[String(key)] ?? nl.tables[key.toFixed(2)], size));
  if (f >= keys[keys.length - 1]) return lookup(keys[keys.length - 1]);
  const upperIndex = keys.findIndex((k) => k >= f);
  const hi = keys[upperIndex];
  const lo = upperIndex === 0 ? 1 : keys[upperIndex - 1];
  if (hi === f) return lookup(hi);
  const t = (f - lo) / (hi - lo);
  return lookup(lo) + (lookup(hi) - lookup(lo)) * t;
}

function interpolate(from: number[], to: number[], sp: number): number {
  if (sp <= from[0]) return (sp * to[0]) / from[0];
  const last = from.length - 1;
  if (sp >= from[last]) return (sp * to[last]) / from[last];
  const i = from.findIndex((v) => v >= sp);
  if (from[i] === sp) return to[i];
  const t = (sp - from[i - 1]) / (from[i] - from[i - 1]);
  return to[i - 1] + (to[i] - to[i - 1]) * t;
}

export function typeScaleVars(config: SimulatorConfig, platform: Platform, fontScale: number): Record<string, string> {
  const scale = config.platforms[platform].fontScale;
  const vars: Record<string, string> = {};
  for (const [name, style] of Object.entries(config.typography)) {
    const size = scaledTextSize(scale, style.size, fontScale);
    vars[`--t-${name}-size`] = `${size}px`;
    vars[`--t-${name}-lh`] = `${(style.lineHeight * size) / style.size}px`;
  }
  return vars;
}
