// The foldable rules on a Figma frame shown in the simulator: its layers, scaled to the window,
// checked for the simulated device. A frame drawn for another width is approximate, so says so.
import type { SimulatorConfig } from '@dobra/core/config/types';
import type { Finding, Target } from '@dobra/core/engine/checks';
import type { Environment } from '@dobra/core/engine/environment';
import type { GeoNode } from '@dobra/core/geo';
import { check } from '@dobra/core/rules';

export function scaleGeo(nodes: GeoNode[], factor: number): GeoNode[] {
  return nodes.map((n) => ({
    ...n,
    rect: { x: n.rect.x * factor, y: n.rect.y * factor, width: n.rect.width * factor, height: n.rect.height * factor },
    ...(n.fontSize !== undefined ? { fontSize: n.fontSize * factor } : {}),
    ...(n.children ? { children: scaleGeo(n.children, factor) } : {}),
  }));
}

export interface FigmaCheck {
  findings: Finding[];
  /** Window width over frame width: 1 when the frame was drawn for this window. */
  scale: number;
  note?: string;
}

export function figmaFindings(config: SimulatorConfig, env: Environment, target: Target, frame: { width: number; height: number; geo: GeoNode[] }): FigmaCheck {
  const scale = env.width / frame.width;
  if (env.isFree) return { findings: [], scale, note: 'Free resize is not a catalog target, so the foldable rules have no device to check against.' };
  const exact = Math.abs(frame.width - env.width) <= 1;
  const findings = check(
    { source: 'simulator', ref: 'figma', targets: [target], confidence: 'tag', width: env.width, height: frame.height * scale, root: exact ? frame.geo : scaleGeo(frame.geo, scale) },
    config,
  );
  return { findings: exact ? findings : findings.map((f) => ({ ...f, estimated: true })), scale: exact ? 1 : scale };
}
