// A ZIP of preset artboards for designers without the plugin: plugin JSON plus one SVG per target.
import { strToU8, zipSync } from 'fflate';
import type { EnvConfig } from './engine/environment';
import { presetSpec } from './presets';
import { toPluginJSON, toSVG } from './presetSvg';
import { targetKey, type Target } from './targets';

export function presetZip(config: EnvConfig, targets: Target[]): Uint8Array {
  const frames = targets.map((t) => presetSpec(config, t));
  const files: Record<string, Uint8Array> = { 'presets.json': strToU8(toPluginJSON(frames)) };
  for (const [i, t] of targets.entries()) files[`svg/${targetKey(t).replaceAll('/', '__')}.svg`] = strToU8(toSVG(frames[i]));
  return zipSync(files, { level: 6 });
}
