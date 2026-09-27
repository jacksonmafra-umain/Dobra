// The v1 rules (spec §8) over a Subject's geometry tree. One engine for Figma frames, web pages
// and the simulator. Findings use the shared Finding shape and rule ids.
import type { Rect } from './config/types';
import { collisionZones, findCollisions, rectsOverlap } from './collisions';
import { kindOf } from './coverage';
import type { Finding, RuleId } from './engine/checks';
import type { EnvConfig, Environment } from './engine/environment';
import { outermost, walk, type GeoNode, type Placed, type Subject } from './geo';
import { resolveTarget, type Target } from './targets';

/** WindowSizeClass medium: side-by-side layouts start here. */
export const SIDE_BY_SIDE_MIN = 600;
/** Short windows where floating chrome eats the content (observed failure #3). Estimated. */
export const SHORT_WINDOW = 480;
/** Text narrower than this reads badly (observed failures #2 and #5). Estimated. */
export const MIN_LEGIBLE_WIDTH = 200;
/** Shorter text (labels, buttons) is exempt from the legible-width rule. */
export const MIN_TEXT_CHARS = 20;
/** Material 3 and Apple HIG minimum touch targets. */
export const TOUCH_TARGET = { android: 48, ios: 44 } as const;

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
    if (p.node.role !== 'container') continue;
    for (const f of folds) {
      // Panes sit side by side across the hinge: a horizontal layout for a vertical hinge, and the reverse.
      if (p.parent?.layout !== (f.axis === 'vertical' ? 'horizontal' : 'vertical')) continue;
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
  // Content cropped by a clipping ancestor, or scrolling sideways, does not overflow the frame.
  for (const p of outermost(placed.filter((q) => q.scrolls !== 'x' && !q.clipped), past)) {
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

/** A node whose rect misses some clipping ancestor entirely is cropped out of view. */
function croppedAway(p: Placed, byNode: Map<GeoNode, Placed>): boolean {
  for (let up = p.parent; up; up = byNode.get(up)?.parent ?? null) if (up.clips && !rectsOverlap(p.node.rect, up.rect)) return true;
  return false;
}

function touchTarget({ env, placed, add }: Ctx) {
  // Mouse and trackpad windows (desktop, or a fine-pointer override) have no touch-target minimum.
  if (env.media.pointer !== 'coarse') return;
  const min = TOUCH_TARGET[env.platform];
  const byNode = new Map(placed.map((p) => [p.node, p]));
  for (const p of outermost(placed, (n) => n.role === 'interactive')) {
    if (croppedAway(p, byNode)) continue;
    const r = p.node.rect;
    if (r.width < min || r.height < min) {
      add({
        ruleId: 'touch-target',
        severity: 'warn',
        nodeId: p.node.id,
        rect: r,
        message: `${p.node.name} is ${Math.round(r.width)}×${Math.round(r.height)}; touch targets need ${min} ${env.unit}.`,
        source: env.platform === 'android' ? 'material3' : 'apple-device',
        estimated: false,
      });
    }
  }
}

function minLegibleWidth({ env, placed, add }: Ctx) {
  for (const { node: n } of placed) {
    if (n.role === 'text' && (n.chars ?? 0) >= MIN_TEXT_CHARS && n.rect.width < MIN_LEGIBLE_WIDTH) {
      add({
        ruleId: 'min-legible-width',
        severity: 'warn',
        nodeId: n.id,
        rect: n.rect,
        message: `${n.name} is ${Math.round(n.rect.width)} ${env.unit} wide for ${n.chars} characters; text reads from about ${MIN_LEGIBLE_WIDTH} ${env.unit}.`,
        source: 'estimated',
        estimated: true,
      });
    }
  }
}

function landscapeNotWide({ subject, env, placed, add }: Ctx) {
  if (env.width >= SIDE_BY_SIDE_MIN) return;
  for (const p of placed) {
    // Panes are blocks of content that fill most of the row's height, not tabs or buttons.
    const panes = (p.node.children ?? []).filter((c) => (c.role === 'container' || c.role === 'media') && c.rect.height >= p.node.rect.height * 0.5);
    if (p.node.layout === 'horizontal' && panes.length >= 2 && panes.every((c) => c.rect.width >= subject.width * 0.3)) {
      add({
        ruleId: 'landscape-not-wide',
        severity: 'error',
        nodeId: p.node.id,
        rect: p.node.rect,
        message: `${p.node.name} puts ${panes.length} panes side by side in a ${env.width} ${env.unit} window (${env.orientation}); side by side needs ${SIDE_BY_SIDE_MIN} ${env.unit}.`,
        source: 'androidx-window',
        estimated: true,
      });
    }
  }
}

function chromeOverlap({ env, placed, add }: Ctx) {
  if (env.height >= SHORT_WINDOW) return;
  const content = placed.filter((p) => p.node.role !== 'chrome' && p.node.role !== 'container');
  for (const bar of placed.filter((p) => p.node.role === 'chrome')) {
    const own = new Set(walk(bar.node.children ?? []).map((q) => q.node));
    if (content.some((c) => !own.has(c.node) && rectsOverlap(c.node.rect, bar.node.rect))) {
      add({
        ruleId: 'chrome-overlap',
        severity: 'warn',
        nodeId: bar.node.id,
        rect: bar.node.rect,
        message: `${bar.node.name} covers content in a ${env.height} ${env.unit} tall window.`,
        source: 'estimated',
        estimated: true,
      });
    }
  }
}

const RULES: Partial<Record<RuleId, (ctx: Ctx) => void>> = {
  'hinge-content': hingeContent,
  'pane-split': paneSplit,
  'tabletop-controls': tabletopControls,
  'frame-size-mismatch': frameSize,
  'overflow-x': overflowX,
  'touch-target': touchTarget,
  'min-legible-width': minLegibleWidth,
  'landscape-not-wide': landscapeNotWide,
  'chrome-overlap': chromeOverlap,
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
