// The v1 rules (spec §8) over a Subject's geometry tree. One engine for Figma frames, web pages
// and the simulator. Findings use the shared Finding shape and rule ids.
import type { Rect } from './config/types';
import { collisionZones, findCollisions } from './collisions';
import { kindOf } from './coverage';
import type { Finding, RuleId } from './engine/checks';
import type { EnvConfig, Environment } from './engine/environment';
import { outermost, walk, type GeoNode, type Placed, type Subject } from './geo';
import { resolveTarget, type Target } from './targets';

const IMPORTANT = (n: GeoNode) => n.role === 'interactive' || n.role === 'text';
const SIZE_TOLERANCE = 1;

/** A size-only match might be any posture of that display: assume the fold splits and hides content. */
export function worstCase(env: Environment): Environment {
  return { ...env, folds: env.folds.map((f) => ({ ...f, separating: true, occludes: true })) };
}

interface Ctx {
  subject: Subject;
  target: Target;
  env: Environment;
  placed: Placed[];
  config: EnvConfig;
  add: (f: Omit<Finding, 'target'>) => void;
}

const whole = (s: Subject): Rect => ({ x: 0, y: 0, width: s.width, height: s.height });
const foldSource = (env: Environment) => (env.platform === 'android' ? 'androidx-window' : 'estimated');

function hingeContent({ env, placed, add }: Ctx) {
  const picks = outermost(placed, IMPORTANT);
  const hits = findCollisions(
    picks.map((p, i) => ({ id: String(i), rect: p.node.rect, scrolls: p.scrolls === 'y' })),
    collisionZones(env),
  );
  for (const h of hits) {
    const p = picks[Number(h.id)];
    add({
      ruleId: 'hinge-content',
      severity: 'error',
      nodeId: p.node.id,
      rect: p.node.rect,
      message: `${p.node.name} sits in the ${h.zone.toLowerCase()}.`,
      source: foldSource(env),
      estimated: env.folds.some((f) => f.estimated),
    });
  }
}

function paneSplit({ env, placed, add }: Ctx) {
  const folds = env.folds.filter((f) => f.separating);
  for (const p of placed) {
    const parentLayout = p.parent?.layout;
    if (p.node.role !== 'container' || !parentLayout || parentLayout === 'none') continue;
    for (const f of folds) {
      const r = p.node.rect;
      const [at, thickness] = f.axis === 'vertical' ? [f.rect.x, f.rect.width] : [f.rect.y, f.rect.height];
      const [start, end] = f.axis === 'vertical' ? [r.x, r.x + r.width] : [r.y, r.y + r.height];
      if (start < at && end > at + thickness) {
        add({
          ruleId: 'pane-split',
          severity: 'warn',
          nodeId: p.node.id,
          rect: r,
          message: `${p.node.name} is a pane that crosses the ${f.axis} hinge; split the panes at the hinge.`,
          source: foldSource(env),
          estimated: true,
        });
      }
    }
  }
}

function tabletopControls({ config, target, env, placed, add }: Ctx) {
  if (kindOf(config, target) !== 'tabletop') return;
  const fold = env.folds.find((f) => f.axis === 'horizontal' && f.separating);
  if (!fold) return;
  for (const p of outermost(placed, (n) => n.role === 'interactive')) {
    if (p.node.rect.y + p.node.rect.height <= fold.rect.y) {
      add({
        ruleId: 'tabletop-controls',
        severity: 'info',
        nodeId: p.node.id,
        rect: p.node.rect,
        message: `${p.node.name} is above the fold in tabletop posture; controls usually belong on the bottom half.`,
        source: 'material3',
        estimated: true,
      });
    }
  }
}

function frameSize({ subject, env, add }: Ctx) {
  if (subject.confidence === 'size') return;
  if (Math.abs(subject.width - env.width) > SIZE_TOLERANCE || Math.abs(subject.height - env.height) > SIZE_TOLERANCE) {
    add({
      ruleId: 'frame-size-mismatch',
      severity: 'error',
      nodeId: subject.ref,
      rect: whole(subject),
      message: `The frame is ${subject.width}×${subject.height} but its target is ${env.width}×${env.height} ${env.unit}.`,
      source: 'estimated',
      estimated: false,
    });
  }
}

function overflowX({ subject, placed, add }: Ctx) {
  const past = (n: GeoNode) => n.rect.x < -SIZE_TOLERANCE || n.rect.x + n.rect.width > subject.width + SIZE_TOLERANCE;
  // Report the outermost overflowing node once; its children overflow because it does.
  for (const p of outermost(placed.filter((q) => q.scrolls !== 'x'), past)) {
    add({
      ruleId: 'overflow-x',
      severity: 'warn',
      nodeId: p.node.id,
      rect: p.node.rect,
      message: `${p.node.name} runs past the ${subject.width} wide frame.`,
      source: 'estimated',
      estimated: false,
    });
  }
}

const RULES: Partial<Record<RuleId, (ctx: Ctx) => void>> = {
  'hinge-content': hingeContent,
  'pane-split': paneSplit,
  'tabletop-controls': tabletopControls,
  'frame-size-mismatch': frameSize,
  'overflow-x': overflowX,
};

/** Runs the rules against every candidate target of a subject; findings carry their target. */
export function check(subject: Subject, config: EnvConfig, rules?: RuleId[]): Finding[] {
  const out: Finding[] = [];
  const placed = walk(subject.root);
  for (const target of subject.targets) {
    const resolved = resolveTarget(config, target);
    const env = subject.confidence === 'size' ? worstCase(resolved) : resolved;
    const add = (f: Omit<Finding, 'target'>) => out.push({ ...f, target });
    for (const [id, rule] of Object.entries(RULES) as [RuleId, (ctx: Ctx) => void][]) {
      if (!rules || rules.includes(id)) rule({ subject, target, env, placed, config, add });
    }
  }
  return out;
}
