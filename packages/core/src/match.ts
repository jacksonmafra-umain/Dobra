// Which catalog targets a Figma frame (or a web page capture) stands for: by tag, then by a key in
// its name, then by size. Size matches keep every candidate: coverage treats them as low confidence.
import type { EnvConfig, Environment } from './engine/environment';
import { enumerateTargets, parseTargetKey, resolveTarget, targetKey, type Target } from './targets';

export interface FrameInput {
  tag?: string;
  /** Every target the frame is known to stand for, such as one window several targets share. All must resolve. */
  tags?: string[];
  name: string;
  width: number;
  height: number;
}

export interface FrameMatch {
  targets: Target[];
  by: 'tag' | 'name' | 'size' | 'none';
  nearest?: { key: string; width: number; height: number };
}

const KEY_IN_NAME = /[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+\/(portrait|landscape)/;
const TOLERANCE = 1;

function resolvable(config: EnvConfig, t: Target | null): t is Target {
  if (!t) return false;
  try {
    resolveTarget(config, t);
    return true;
  } catch {
    return false;
  }
}

const sizedCache = new WeakMap<EnvConfig, { t: Target; env: Environment }[]>();

function sizedTargets(config: EnvConfig) {
  let list = sizedCache.get(config);
  if (!list) {
    list = enumerateTargets(config).map((t) => ({ t, env: resolveTarget(config, t) }));
    sizedCache.set(config, list);
  }
  return list;
}

export function matchFrame(input: FrameInput, config: EnvConfig): FrameMatch {
  const many = (input.tags ?? []).map(parseTargetKey);
  if (many.length && many.every((t) => resolvable(config, t))) return { targets: many as Target[], by: 'tag' };
  const tagged = input.tag ? parseTargetKey(input.tag) : null;
  if (resolvable(config, tagged)) return { targets: [tagged], by: 'tag' };
  const named = input.name.match(KEY_IN_NAME);
  const fromName = named ? parseTargetKey(named[0]) : null;
  if (resolvable(config, fromName)) return { targets: [fromName], by: 'name' };

  const sized = sizedTargets(config);
  const hits = sized.filter(({ env }) => Math.abs(env.width - input.width) <= TOLERANCE && Math.abs(env.height - input.height) <= TOLERANCE);
  if (hits.length) return { targets: hits.map((h) => h.t), by: 'size' };
  const distance = ({ env }: { env: Environment }) => Math.hypot(env.width - input.width, env.height - input.height);
  const nearest = sized.reduce((best, cur) => (distance(cur) < distance(best) ? cur : best));
  return { targets: [], by: 'none', nearest: { key: targetKey(nearest.t), width: nearest.env.width, height: nearest.env.height } };
}
