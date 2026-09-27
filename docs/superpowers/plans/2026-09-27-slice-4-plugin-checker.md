# Slice 4 — Figma plugin: checker and Adapt & flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check Figma frames against the foldable rules and adapt an existing frame to other
devices and postures, doing the mechanical work and flagging everything that needs a design
decision.

**Architecture:** Core gains a platform-neutral geometry tree (`GeoNode`, `Subject`) and one rule
engine, `check(subject, config)`, that runs every v1 rule against every candidate target of a
frame (worst-case folds for size-only matches). It also gains a pure `adaptPlan` that decides what
an adaptation does and what it must flag. The plugin adds a Figma → `GeoNode` adapter, a Check
command with results that select and zoom to nodes, and an Adapt command that clones, resizes,
re-decorates, optionally splits at the hinge, swaps size/posture component properties, switches
variable modes, tags, and then checks the result.

**Tech Stack:** TypeScript 7, Vitest 4, `@figma/plugin-typings` 1.139, esbuild, Vite + React 19.

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §3.2 (`GeoNode`,
`Subject`, `Finding`, `check`), §3.3, §5.4 (Adapt & flag), §5.5 (Checker), §8 (rules), §8.1
(untagged frames: every candidate, worst-case hinge), §8.2 (observed failures), §12 slice 4.

## Global Constraints

- Rule ids (spec §8), and only these in this slice: `hinge-content`, `pane-split`,
  `landscape-not-wide`, `min-legible-width`, `chrome-overlap`, `touch-target`, `overflow-x`,
  `tabletop-controls`, `frame-size-mismatch`. (`resize-vs-reload` is CLI-only, slice 6.)
- Thresholds, verbatim or as the spec marks them: side-by-side needs **600** (WindowSizeClass
  medium); short window **< 480** (estimated); touch target **48 dp** Android / **44 pt** iOS;
  minimum legible width **estimated** — use **200** and mark findings `estimated: true`.
- `pane-split` and `tabletop-controls` infer panes from auto-layout children and are reported as
  heuristics (`estimated: true`) (spec §8).
- A frame matched by size runs against every candidate target, findings grouped per target;
  hinge rules assume the fold separates and occludes (spec §8.1).
- Adapt & flag does automatically only: duplicate and resize, split at the hinge (opt-in),
  reapply grid and overlay, tag, swap component properties named `Size` or `Posture`, switch
  variable modes named after a size class. It flags, never does: choosing pane content,
  reflowing absolutely positioned children without constraints, bar-to-rail swaps, text
  truncation, aspect-ratio crops (spec §5.4).
- Checker scope: selection, current page, or all pages (opt-in, `figma.loadAllPagesAsync()`);
  `figma.skipInvisibleInstanceChildren = true`; yield every ~500 nodes; clicking a result selects
  the node and calls `scrollAndZoomIntoView` (spec §5.5). Canvas annotations are out of scope for
  this slice (spec marks them optional).
- `core` stays free of React and the DOM. Commits in English, microcommits, never mention the
  assistant. Never push to or merge into `main`; the PR closes a labeled issue
  (`enhancement`, `area:plugin`).
- Base branch: `feat/figma-plugin-presets` (PR #18). Work branch: `feat/figma-plugin-checker`.

## Review Focus

1. A large page (thousands of nodes) — expected: the adapter yields to the event loop every 500
   nodes and posts progress; the check never blocks the UI for the whole walk (test with a
   2 000-node fake tree that counts yields, Task 4).
2. A button nested inside a card that sits on the hinge — expected: one `hinge-content` finding
   for the outermost important node, not one per descendant (Task 2).
3. A text layer inside a vertically scrolling container next to a vertical hinge — expected: only
   its x span is compared with the hinge (the simulator's rule), so scrolling does not make a
   finding appear or disappear (Task 2).
4. Adapting a frame that contains no auto layout and no constraints — expected: the frame is
   resized, and every child that now extends past the new width, or kept its MIN/MIN constraint
   while the width changed by more than 20%, is flagged by name (Task 6).
5. Adapting to a target whose hinge does not separate (a flat Pixel Fold inner) — expected:
   "Split at hinge" is offered only for separating hinges and is a no-op otherwise, with a note
   (Task 6 and Task 7).

---

### Task 0: Branch

- [ ] **Step 1**

```bash
git fetch origin
git switch -c feat/figma-plugin-checker origin/feat/figma-plugin-presets
npm install && npm test
git add docs/superpowers/plans/2026-09-27-slice-4-plugin-checker.md
git commit -m "Add the implementation plan for the Figma plugin checker"
```
Expected: tests pass (core 240, plugin 22, simulator 72 at the time of writing).

### Task 1: Geometry tree and subjects

**Files:** Create `packages/core/src/geo.ts`, `packages/core/src/geo.test.ts`; modify
`packages/core/src/engine/checks.ts` (`RuleId` gains `overflow-x` and `frame-size-mismatch`).

**Interfaces:**
- Produces:

```ts
export type GeoRole = 'text' | 'interactive' | 'media' | 'container' | 'chrome';
export interface GeoNode {
  id: string;
  name: string;
  role: GeoRole;
  rect: Rect;                                // in the frame's coordinates
  fontSize?: number;
  chars?: number;                            // text length, for text nodes
  scrollAxis?: 'x' | 'y' | 'none';           // this node scrolls its children
  layout?: 'horizontal' | 'vertical' | 'none';
  children?: GeoNode[];
}
export interface Subject {
  source: 'figma' | 'web' | 'simulator';
  ref: string;
  targets: Target[];
  confidence: 'tag' | 'name' | 'size';
  width: number;
  height: number;
  root: GeoNode[];
}
export interface Placed { node: GeoNode; depth: number; scrolls: 'x' | 'y' | 'none'; parent: GeoNode | null }
export function walk(root: GeoNode[]): Placed[];                // depth-first, with the nearest scrolling ancestor
export function outermost(placed: Placed[], pick: (n: GeoNode) => boolean): Placed[]; // drops picks nested in a pick
```

- [ ] **Step 1: Failing test** `geo.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { outermost, walk, type GeoNode } from './geo';

const n = (id: string, role: GeoNode['role'], x: number, children: GeoNode[] = [], extra: Partial<GeoNode> = {}): GeoNode => ({
  id, name: id, role, rect: { x, y: 0, width: 50, height: 50 }, children, ...extra,
});

describe('geometry tree', () => {
  const tree = [n('list', 'container', 0, [n('card', 'interactive', 0, [n('button', 'interactive', 10), n('label', 'text', 10)])], { scrollAxis: 'y' })];

  it('walks depth first and remembers the nearest scrolling ancestor', () => {
    const placed = walk(tree);
    expect(placed.map((p) => [p.node.id, p.depth, p.scrolls])).toEqual([
      ['list', 0, 'none'],
      ['card', 1, 'y'],
      ['button', 2, 'y'],
      ['label', 2, 'y'],
    ]);
  });

  it('keeps only the outermost node of a nested pick', () => {
    expect(outermost(walk(tree), (g) => g.role === 'interactive').map((p) => p.node.id)).toEqual(['card']);
  });
});
```
Run: `npm test -w @hinge/core -- src/geo.test.ts` → FAIL.

- [ ] **Step 2: Implement** `geo.ts`

```ts
// A platform-neutral tree of what is drawn in a frame. Figma nodes, DOM elements and the
// simulator's layout all become GeoNodes, so one rule engine checks all three.
import type { Rect } from './config/types';
import type { Target } from './engine/checks';

export type GeoRole = 'text' | 'interactive' | 'media' | 'container' | 'chrome';

export interface GeoNode {
  id: string;
  name: string;
  role: GeoRole;
  /** In the frame's coordinates. */
  rect: Rect;
  fontSize?: number;
  /** Text length, for text nodes. */
  chars?: number;
  /** This node scrolls its children along this axis. */
  scrollAxis?: 'x' | 'y' | 'none';
  layout?: 'horizontal' | 'vertical' | 'none';
  children?: GeoNode[];
}

export interface Subject {
  source: 'figma' | 'web' | 'simulator';
  ref: string;
  /** More than one when the frame was matched by size only. */
  targets: Target[];
  confidence: 'tag' | 'name' | 'size';
  width: number;
  height: number;
  root: GeoNode[];
}

export interface Placed {
  node: GeoNode;
  depth: number;
  /** Axis of the nearest scrolling ancestor. */
  scrolls: 'x' | 'y' | 'none';
  parent: GeoNode | null;
}

export function walk(root: GeoNode[]): Placed[] {
  const out: Placed[] = [];
  const visit = (nodes: GeoNode[], depth: number, scrolls: Placed['scrolls'], parent: GeoNode | null) => {
    for (const node of nodes) {
      out.push({ node, depth, scrolls, parent });
      const inner = node.scrollAxis && node.scrollAxis !== 'none' ? node.scrollAxis : scrolls;
      visit(node.children ?? [], depth + 1, inner, node);
    }
  };
  visit(root, 0, 'none', null);
  return out;
}

/** Keeps each picked node unless an ancestor was picked too: report the card, not every button in it. */
export function outermost(placed: Placed[], pick: (n: GeoNode) => boolean): Placed[] {
  const out: Placed[] = [];
  const picked = new Set<GeoNode>();
  const parentOf = new Map<GeoNode, GeoNode | null>(placed.map((p) => [p.node, p.parent]));
  for (const p of placed) {
    if (!pick(p.node)) continue;
    let up = p.parent;
    let nested = false;
    while (up) {
      if (picked.has(up)) {
        nested = true;
        break;
      }
      up = parentOf.get(up) ?? null;
    }
    if (!nested) out.push(p);
    picked.add(p.node);
  }
  return out;
}
```
In `engine/checks.ts` extend `RuleId` with `| 'overflow-x' | 'frame-size-mismatch'`.

- [ ] **Step 3:** `npm test -w @hinge/core && npm run typecheck -w @hinge/core` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/geo.ts packages/core/src/geo.test.ts packages/core/src/engine/checks.ts
git commit -m "Add a platform-neutral geometry tree for checking frames"
```

### Task 2: Spatial rules — hinge, panes, tabletop, frame size, overflow

**Files:** Create `packages/core/src/rules.ts`, `packages/core/src/rules.test.ts`

**Interfaces:**
- Consumes: `walk`, `outermost`, `Subject`, `GeoNode` (Task 1); `resolveTarget`, `kindOf`
  (slice 3); `collisionZones`, `findCollisions` (slice 1).
- Produces: `check(subject: Subject, config: EnvConfig, rules?: RuleId[]): Finding[]` and
  `worstCase(env: Environment): Environment` (every fold separating and occluding).
  Task 3 adds the size rules to the same `check`.

- [ ] **Step 1: Failing test** `rules.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import type { GeoNode, Subject } from './geo';
import { check } from './rules';
import { envConfigOf, type Target } from './targets';

const config = envConfigOf(loadCatalog());
const DUO: Target = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' };
const node = (id: string, role: GeoNode['role'], rect: GeoNode['rect'], extra: Partial<GeoNode> = {}): GeoNode => ({ id, name: id, role, rect, ...extra });
const subject = (root: GeoNode[], targets: Target[] = [DUO], extra: Partial<Subject> = {}): Subject => ({
  source: 'figma', ref: '1:1', targets, confidence: 'tag', width: 1100, height: 756, root, ...extra,
});
const ids = (s: Subject, rule: string) => check(s, config).filter((f) => f.ruleId === rule).map((f) => f.nodeId);

describe('spatial rules', () => {
  it('flags the outermost important node on the hinge, once', () => {
    const card = node('card', 'interactive', { x: 500, y: 100, width: 100, height: 80 }, {
      children: [node('buy', 'interactive', { x: 520, y: 120, width: 60, height: 40 })],
    });
    expect(ids(subject([card]), 'hinge-content')).toEqual(['card']);
  });

  it('compares only the x span inside a vertical scroller', () => {
    const list = node('list', 'container', { x: 0, y: 0, width: 1100, height: 756 }, {
      scrollAxis: 'y',
      children: [node('title', 'text', { x: 520, y: 2000, width: 60, height: 20 }, { chars: 12 })],
    });
    expect(ids(subject([list]), 'hinge-content')).toEqual(['title']);
  });

  it('flags a pane that straddles a separating hinge, as a heuristic', () => {
    const row = node('row', 'container', { x: 0, y: 0, width: 1100, height: 756 }, {
      layout: 'horizontal',
      children: [node('left', 'container', { x: 0, y: 0, width: 700, height: 756 }), node('right', 'container', { x: 700, y: 0, width: 400, height: 756 })],
    });
    const f = check(subject([row]), config).filter((x) => x.ruleId === 'pane-split');
    expect(f.map((x) => x.nodeId)).toEqual(['left']);
    expect(f[0].estimated).toBe(true);
  });

  it('flags a frame whose size differs from its tagged target', () => {
    expect(ids(subject([], [DUO], { width: 1000 }), 'frame-size-mismatch')).toEqual(['1:1']);
    expect(ids(subject([]), 'frame-size-mismatch')).toEqual([]);
  });

  it('flags content wider than the frame, but not inside a horizontal scroller', () => {
    const wide = node('banner', 'media', { x: 0, y: 0, width: 1300, height: 100 });
    const carousel = node('carousel', 'container', { x: 0, y: 200, width: 1100, height: 100 }, {
      scrollAxis: 'x',
      children: [node('slide', 'media', { x: 900, y: 200, width: 400, height: 100 })],
    });
    expect(ids(subject([wide, carousel]), 'overflow-x')).toEqual(['banner']);
  });

  it('flags controls above the hinge in tabletop posture', () => {
    const tabletop: Target = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'tabletop', orientation: 'landscape' };
    const env = { width: 832, height: 750 };
    const top = node('play', 'interactive', { x: 100, y: 100, width: 120, height: 48 });
    const bottom = node('seek', 'interactive', { x: 100, y: 600, width: 120, height: 48 });
    const f = check(subject([top, bottom], [tabletop], env), config).filter((x) => x.ruleId === 'tabletop-controls');
    expect(f.map((x) => x.nodeId)).toEqual(['play']);
  });

  it('checks a size-matched frame against every candidate, assuming the worst hinge', () => {
    const t1: Target = { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' };
    const onCrease = node('cta', 'interactive', { x: 400, y: 300, width: 60, height: 48 });
    const findings = check(subject([onCrease], [t1], { confidence: 'size', width: 851, height: 883 }), config);
    // The open posture's crease does not separate, but a size-only match assumes it could.
    expect(findings.some((f) => f.ruleId === 'hinge-content' && f.nodeId === 'cta')).toBe(true);
    expect(check(subject([onCrease], [t1], { confidence: 'tag', width: 851, height: 883 }), config).some((f) => f.ruleId === 'hinge-content')).toBe(false);
  });
});
```
Before running, check the Fold 7 tabletop target key exists (`enumerateTargets`) and that its
resolved size is 832×750 in landscape; if it is not, use the size `resolveTarget` returns for the
subject and ledger it. Run → FAIL.

- [ ] **Step 3: Implement** `rules.ts` (spatial part)

```ts
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

type Ctx = { subject: Subject; target: Target; env: Environment; placed: Placed[]; add: (f: Omit<Finding, 'target'>) => void; config: EnvConfig };

const whole = (s: Subject): Rect => ({ x: 0, y: 0, width: s.width, height: s.height });

function hingeContent({ env, placed, add }: Ctx) {
  const zones = collisionZones(env);
  const picks = outermost(placed, IMPORTANT);
  const hits = findCollisions(
    picks.map((p, i) => ({ id: String(i), rect: p.node.rect, scrolls: p.scrolls === 'y' })),
    zones,
  );
  for (const h of hits) {
    const p = picks[Number(h.id)];
    add({
      ruleId: 'hinge-content', severity: 'error', nodeId: p.node.id, rect: p.node.rect,
      message: `${p.node.name} sits in the ${h.zone.toLowerCase()}.`,
      source: env.platform === 'android' ? 'androidx-window' : 'estimated', estimated: env.folds.some((f) => f.estimated),
    });
  }
}

function paneSplit({ env, placed, add }: Ctx) {
  const folds = env.folds.filter((f) => f.separating);
  for (const p of placed) {
    if (p.node.role !== 'container' || !p.parent || p.parent.layout === undefined || p.parent.layout === 'none') continue;
    for (const f of folds) {
      const at = f.axis === 'vertical' ? f.rect.x : f.rect.y;
      const r = p.node.rect;
      const [start, end] = f.axis === 'vertical' ? [r.x, r.x + r.width] : [r.y, r.y + r.height];
      if (start < at && end > at + (f.axis === 'vertical' ? f.rect.width : f.rect.height)) {
        add({
          ruleId: 'pane-split', severity: 'warn', nodeId: p.node.id, rect: r,
          message: `${p.node.name} is a pane that crosses the ${f.axis} hinge; split the panes at the hinge.`,
          source: env.platform === 'android' ? 'androidx-window' : 'estimated', estimated: true,
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
        ruleId: 'tabletop-controls', severity: 'info', nodeId: p.node.id, rect: p.node.rect,
        message: `${p.node.name} is above the fold in tabletop posture; controls usually belong on the bottom half.`,
        source: 'material3', estimated: true,
      });
    }
  }
}

function frameSize({ subject, env, add }: Ctx) {
  if (subject.confidence === 'size') return;
  if (Math.abs(subject.width - env.width) > SIZE_TOLERANCE || Math.abs(subject.height - env.height) > SIZE_TOLERANCE) {
    add({
      ruleId: 'frame-size-mismatch', severity: 'error', nodeId: subject.ref, rect: whole(subject),
      message: `The frame is ${subject.width}×${subject.height} but its target is ${env.width}×${env.height} ${env.unit}.`,
      source: 'estimated', estimated: false,
    });
  }
}

function overflowX({ subject, placed, add }: Ctx) {
  const past = (n: GeoNode) => n.rect.x < -SIZE_TOLERANCE || n.rect.x + n.rect.width > subject.width + SIZE_TOLERANCE;
  // Report the outermost overflowing node once; its children overflow because it does.
  for (const p of outermost(placed.filter((q) => q.scrolls !== 'x'), past)) {
    add({
      ruleId: 'overflow-x', severity: 'warn', nodeId: p.node.id, rect: p.node.rect,
      message: `${p.node.name} runs past the ${subject.width} wide frame.`,
      source: 'estimated', estimated: false,
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

export function check(subject: Subject, config: EnvConfig, rules?: RuleId[]): Finding[] {
  const out: Finding[] = [];
  const placed = walk(subject.root);
  for (const target of subject.targets) {
    const resolved = resolveTarget(config, target);
    const env = subject.confidence === 'size' ? worstCase(resolved) : resolved;
    const add = (f: Omit<Finding, 'target'>) => out.push({ ...f, target });
    for (const [id, rule] of Object.entries(RULES)) {
      if (!rules || rules.includes(id as RuleId)) rule!({ subject, target, env, placed, add, config });
    }
  }
  return out;
}
```
`rectsOverlap` is imported for Task 3's `chromeOverlap`; until then `noUnusedLocals` flags it, so
leave it out of this task's import line and add it in Task 3.

- [ ] **Step 4:** `npm test -w @hinge/core -- src/rules.test.ts` → PASS; `npm run typecheck -w @hinge/core` → PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules.ts packages/core/src/rules.test.ts
git commit -m "Check frames for hinge content, pane splits, tabletop controls, size and overflow"
```

### Task 3: Size rules — touch targets, legible width, landscape-not-wide, chrome overlap

**Files:** Modify `packages/core/src/rules.ts`, `packages/core/src/rules.test.ts`

**Interfaces:**
- Produces: exported thresholds `SIDE_BY_SIDE_MIN = 600`, `SHORT_WINDOW = 480`,
  `MIN_LEGIBLE_WIDTH = 200`, `MIN_TEXT_CHARS = 20`, `TOUCH_TARGET = { android: 48, ios: 44 }`;
  four more entries in `RULES`.

- [ ] **Step 1: Failing tests** (append to `rules.test.ts`)

```ts
describe('size rules', () => {
  const FLIP_COVER: Target = { deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape' };
  const IPHONE: Target = { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait' };
  const flip = (root: GeoNode[]) => subject(root, [FLIP_COVER], { width: 352, height: 339 });

  it('flags touch targets under 48 dp on Android and 44 pt on iOS', () => {
    const small = node('x', 'interactive', { x: 10, y: 10, width: 46, height: 46 });
    expect(ids(flip([small]), 'touch-target')).toEqual(['x']);
    expect(ids(subject([small], [IPHONE], { width: 402, height: 874 }), 'touch-target')).toEqual([]);
  });

  it('flags long text narrower than the legible width, as an estimate', () => {
    const narrow = node('body', 'text', { x: 0, y: 0, width: 141, height: 200 }, { chars: 80 });
    const label = node('ok', 'text', { x: 0, y: 300, width: 40, height: 20 }, { chars: 2 });
    const f = check(flip([narrow, label]), config).filter((x) => x.ruleId === 'min-legible-width');
    expect(f.map((x) => x.nodeId)).toEqual(['body']);
    expect(f[0].estimated).toBe(true);
  });

  it('flags side-by-side panes below 600 wide even in a landscape window (observed failure #1)', () => {
    const row = node('hero', 'container', { x: 0, y: 0, width: 352, height: 200 }, {
      layout: 'horizontal',
      children: [node('image', 'media', { x: 0, y: 0, width: 176, height: 200 }), node('copy', 'container', { x: 176, y: 0, width: 176, height: 200 })],
    });
    expect(ids(flip([row]), 'landscape-not-wide')).toEqual(['hero']);
  });

  it('flags floating chrome over content in a short window (observed failure #3)', () => {
    const bar = node('Tab bar', 'chrome', { x: 16, y: 270, width: 320, height: 60 });
    const card = node('card', 'interactive', { x: 16, y: 200, width: 320, height: 100 });
    expect(ids(flip([card, bar]), 'chrome-overlap')).toEqual(['Tab bar']);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** (add to `rules.ts` and register in `RULES`)

```ts
export const SIDE_BY_SIDE_MIN = 600;
export const SHORT_WINDOW = 480;
export const MIN_LEGIBLE_WIDTH = 200;
export const MIN_TEXT_CHARS = 20;
export const TOUCH_TARGET = { android: 48, ios: 44 } as const;

function touchTarget({ env, placed, add }: Ctx) {
  const min = TOUCH_TARGET[env.platform];
  for (const p of outermost(placed, (n) => n.role === 'interactive')) {
    const r = p.node.rect;
    if (r.width < min || r.height < min) {
      add({
        ruleId: 'touch-target', severity: 'warn', nodeId: p.node.id, rect: r,
        message: `${p.node.name} is ${Math.round(r.width)}×${Math.round(r.height)}; touch targets need ${min} ${env.unit}.`,
        source: env.platform === 'android' ? 'material3' : 'apple-device', estimated: false,
      });
    }
  }
}

function minLegibleWidth({ env, placed, add }: Ctx) {
  for (const p of placed) {
    const n = p.node;
    if (n.role === 'text' && (n.chars ?? 0) >= MIN_TEXT_CHARS && n.rect.width < MIN_LEGIBLE_WIDTH) {
      add({
        ruleId: 'min-legible-width', severity: 'warn', nodeId: n.id, rect: n.rect,
        message: `${n.name} is ${Math.round(n.rect.width)} ${env.unit} wide for ${n.chars} characters; text reads from about ${MIN_LEGIBLE_WIDTH} ${env.unit}.`,
        source: 'estimated', estimated: true,
      });
    }
  }
}

function landscapeNotWide({ subject, env, placed, add }: Ctx) {
  if (env.width >= SIDE_BY_SIDE_MIN) return;
  for (const p of placed) {
    const kids = (p.node.children ?? []).filter((c) => c.role !== 'text');
    if (p.node.layout === 'horizontal' && kids.length >= 2 && kids.every((c) => c.rect.width >= subject.width * 0.3)) {
      add({
        ruleId: 'landscape-not-wide', severity: 'error', nodeId: p.node.id, rect: p.node.rect,
        message: `${p.node.name} puts ${kids.length} panes side by side in a ${env.width} ${env.unit} window (${env.orientation}); side by side needs ${SIDE_BY_SIDE_MIN} ${env.unit}.`,
        source: 'androidx-window', estimated: true,
      });
    }
  }
}

function chromeOverlap({ env, placed, add }: Ctx) {
  if (env.height >= SHORT_WINDOW) return;
  const content = placed.filter((p) => p.node.role !== 'chrome' && p.node.role !== 'container');
  for (const bar of placed.filter((p) => p.node.role === 'chrome')) {
    if (content.some((c) => rectsOverlap(c.node.rect, bar.node.rect))) {
      add({
        ruleId: 'chrome-overlap', severity: 'warn', nodeId: bar.node.id, rect: bar.node.rect,
        message: `${bar.node.name} covers content in a ${env.height} ${env.unit} tall window.`,
        source: 'estimated', estimated: true,
      });
    }
  }
}
```
Register: `'touch-target': touchTarget, 'min-legible-width': minLegibleWidth, 'landscape-not-wide': landscapeNotWide, 'chrome-overlap': chromeOverlap`.
Add `rectsOverlap` to the `./collisions` import line.

- [ ] **Step 3:** `npm test -w @hinge/core && npm run typecheck -w @hinge/core` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/rules.ts packages/core/src/rules.test.ts
git commit -m "Check touch targets, legible width, landscape-not-wide and chrome overlap"
```

### Task 4: Figma → GeoNode adapter

**Files:** Create `packages/figma-plugin/src/geo.ts`, `packages/figma-plugin/src/geo.test.ts`;
modify `packages/figma-plugin/src/test/fakeFigma.ts`

**Interfaces:**
- Consumes: `GeoNode` (Task 1), `OVERLAY_NAME` (slice 3).
- Produces: `INTERACTIVE_NAME`, `CHROME_NAME` (RegExp, editable lists), `roleOf(node: SceneNode): GeoRole`,
  `toGeo(frame: FrameNode, onProgress?: (visited: number) => void, yieldEvery?: number): Promise<GeoNode[]>`.
- Fake additions: `createText()` (type `TEXT`, `characters`, `fontSize`), `createInstance()`
  (type `INSTANCE`, `componentProperties`, `setProperties`), `absoluteBoundingBox` getter on every
  node (walks parents summing x/y), `overflowDirection`, `layoutMode`, `clone()`, `remove()`,
  `setRelaunchData()`.

- [ ] **Step 1: Failing test** `geo.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { OVERLAY_NAME } from './presets';
import { roleOf, toGeo } from './geo';
import { createFakeFigma } from './test/fakeFigma';

describe('toGeo', () => {
  it('maps text, buttons, chrome and containers with frame-relative rects', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    frame.resize(400, 800);
    frame.x = 1000;
    const bar = api.createFrame();
    bar.name = 'Bottom navigation';
    bar.resize(400, 80);
    frame.appendChild(bar);
    bar.y = 720;
    const title = api.createText();
    title.characters = 'Welcome back to your account';
    title.fontSize = 24;
    frame.appendChild(title);
    title.x = 16;
    title.y = 40;
    const overlay = api.createFrame();
    overlay.name = OVERLAY_NAME;
    frame.appendChild(overlay);
    const geo = await toGeo(frame as never);
    expect(geo.map((g) => [g.name, g.role])).toEqual([
      ['Bottom navigation', 'chrome'],
      [title.name, 'text'],
    ]);
    expect(geo[1]).toMatchObject({ rect: { x: 16, y: 40 }, fontSize: 24, chars: 28 });
  });

  it('treats instances and button-like names as interactive', () => {
    const api = createFakeFigma();
    const btn = api.createFrame();
    btn.name = 'Primary CTA';
    expect(roleOf(btn as never)).toBe('interactive');
    expect(roleOf(api.createInstance() as never)).toBe('interactive');
  });

  it('skips hidden layers and yields on big trees', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    const hidden = api.createFrame();
    hidden.visible = false;
    frame.appendChild(hidden);
    for (let i = 0; i < 2000; i++) frame.appendChild(api.createRectangle());
    let progress = 0;
    const geo = await toGeo(frame as never, () => progress++, 500);
    expect(geo.find((g) => g.id === hidden.id)).toBeUndefined();
    expect(progress).toBeGreaterThanOrEqual(4);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Extend the fake** as listed in Interfaces. `absoluteBoundingBox` returns
  `{ x, y, width, height }` with `x`/`y` summed up the parent chain (page is the origin). `clone()`
  deep-copies the node and its children with new ids, appends the copy to the original's parent,
  and copies shared plugin data. `remove()` detaches. Instances default to
  `componentProperties = {}`; `setProperties(p)` merges `{ value }` into matching keys.

- [ ] **Step 3: Implement** `src/geo.ts`

```ts
// Figma nodes → the core geometry tree. Rects are relative to the frame being checked.
import type { GeoNode, GeoRole } from '@hinge/core/geo';
import { OVERLAY_NAME } from './presets';

/** Layer names treated as tappable. Edit to match a design system's naming. */
export const INTERACTIVE_NAME = /\b(button|btn|cta|link|chip|tab(?! ?bar)|toggle|switch|checkbox|radio|input|field|fab|card)\b/i;
/** Layer names treated as system or app chrome. */
export const CHROME_NAME = /\b(nav(igation)?|tab ?bar|tool ?bar|app ?bar|bottom ?bar|status ?bar|header|footer)\b/i;

export function roleOf(node: SceneNode): GeoRole {
  if (node.type === 'TEXT') return 'text';
  if (CHROME_NAME.test(node.name)) return 'chrome';
  if (node.type === 'INSTANCE' || INTERACTIVE_NAME.test(node.name)) return 'interactive';
  const fills = 'fills' in node && Array.isArray(node.fills) ? (node.fills as readonly Paint[]) : [];
  if (fills.some((f) => f.type === 'IMAGE' || f.type === 'VIDEO')) return 'media';
  return 'container';
}

const scrollOf = (n: SceneNode): GeoNode['scrollAxis'] =>
  'overflowDirection' in n ? (n.overflowDirection === 'HORIZONTAL' ? 'x' : n.overflowDirection === 'VERTICAL' || n.overflowDirection === 'BOTH' ? 'y' : 'none') : 'none';
const layoutOf = (n: SceneNode): GeoNode['layout'] =>
  'layoutMode' in n ? (n.layoutMode === 'HORIZONTAL' ? 'horizontal' : n.layoutMode === 'VERTICAL' ? 'vertical' : 'none') : 'none';

export async function toGeo(frame: FrameNode, onProgress?: (visited: number) => void, yieldEvery = 500): Promise<GeoNode[]> {
  const origin = frame.absoluteBoundingBox ?? { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  let visited = 0;
  const convert = async (nodes: readonly SceneNode[]): Promise<GeoNode[]> => {
    const out: GeoNode[] = [];
    for (const n of nodes) {
      if (!n.visible || n.name === OVERLAY_NAME) continue;
      if (++visited % yieldEvery === 0) {
        onProgress?.(visited);
        await new Promise((r) => setTimeout(r, 0));
      }
      const box = n.absoluteBoundingBox ?? { x: n.x, y: n.y, width: n.width, height: n.height };
      const g: GeoNode = {
        id: n.id,
        name: n.name,
        role: roleOf(n),
        rect: { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height },
        scrollAxis: scrollOf(n),
        layout: layoutOf(n),
      };
      if (n.type === 'TEXT') {
        g.chars = n.characters.length;
        if (typeof n.fontSize === 'number') g.fontSize = n.fontSize;
      }
      if ('children' in n && n.type !== 'INSTANCE') g.children = await convert(n.children);
      out.push(g);
    }
    return out;
  };
  return convert(frame.children);
}
```
Instances are leaves (their inside is the component's business, and `skipInvisibleInstanceChildren`
keeps traversal cheap).

- [ ] **Step 4:** `npm test -w @hinge/figma-plugin && npm run typecheck -w @hinge/figma-plugin` → PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/figma-plugin/src
git commit -m "Convert Figma frames into the core geometry tree"
```

### Task 5: Check command

**Files:** Modify `packages/figma-plugin/{manifest.json,src/messages.ts,src/handlers.ts,src/route.ts,src/presets.ts,src/code.ts}`,
`src/manifest.test.ts`, `src/handlers.test.ts`

**Interfaces:**
- Messages: ToMain `{ type: 'check'; scope: 'selection' | 'page' | 'all-pages' }`,
  `{ type: 'select-node'; nodeId: string }`; ToUi
  `{ type: 'findings'; frames: { frameId: string; name: string; confidence: string; findings: Finding[] }[] }`,
  `{ type: 'progress'; visited: number }`. `Command` gains `'check'`.
- Manifest: menu adds `{ "name": "Check", "command": "check" }`; `"relaunchButtons": [{ "command": "check", "name": "Re-check" }]`.
- `applyPreset` calls `frame.setRelaunchData({ check: '' })`.
- `FigmaApi` gains `'loadAllPagesAsync' | 'root' | 'skipInvisibleInstanceChildren'` in its `Pick`.

- [ ] **Step 1: Failing tests**
  - `manifest.test.ts`: commands `['presets', 'tag', 'coverage', 'check']`; `relaunchButtons`
    equals `[{ command: 'check', name: 'Re-check' }]`.
  - `handlers.test.ts`:

```ts
it('checks the page and groups findings per frame', async () => {
  const api = createFakeFigma();
  await handle(api, { type: 'create-presets', keys: ['surface-duo-2/spanned/spanned/landscape'] });
  const frame = api.currentPage.children[0] as FrameNode;
  const button = api.createFrame();
  button.name = 'Buy button';
  button.resize(80, 48);
  frame.appendChild(button);
  button.x = 530;
  button.y = 300;
  const reply = await handle(api, { type: 'check', scope: 'page' });
  if (reply?.type !== 'findings') throw new Error('findings expected');
  expect(reply.frames[0].findings.map((f) => [f.ruleId, f.nodeId])).toContainEqual(['hinge-content', button.id]);
});

it('checks only the selected frames when asked', async () => {
  const api = createFakeFigma();
  await handle(api, { type: 'create-presets', keys: ['pixel-9/main/-/portrait', 'pixel-9/main/-/landscape'] });
  api.currentPage.selection = [api.currentPage.children[1] as never];
  const reply = await handle(api, { type: 'check', scope: 'selection' });
  if (reply?.type !== 'findings') throw new Error('findings expected');
  expect(reply.frames).toHaveLength(1);
});

it('selects and zooms to a node', async () => {
  const api = createFakeFigma();
  const f = api.createFrame();
  await handle(api, { type: 'select-node', nodeId: f.id });
  expect(api.currentPage.selection).toEqual([f]);
  expect(api.zoomedTo).toEqual([f]);
});

it('sets a Re-check button on created presets', async () => {
  const api = createFakeFigma();
  await handle(api, { type: 'create-presets', keys: ['pixel-9/main/-/portrait'] });
  expect((api.currentPage.children[0] as unknown as { relaunch: unknown }).relaunch).toEqual({ check: '' });
});
```
  (`relaunch` is where the fake's `setRelaunchData` stores its argument.) Run → FAIL.

- [ ] **Step 2: Implement**
  - `handlers.ts` `check`: frames = `selection` → selected nodes that `topLevelFrames` would
    return (a selected child selects its artboard: walk up `parent` to the nearest artboard);
    `page` → `topLevelFrames(api)`; `all-pages` → `await api.loadAllPagesAsync()` then
    `topLevelFrames` for each page in `api.root.children`. For each frame: match
    (`matchFrame` as in `presentFrames`), skip `by: 'none'`, `toGeo(frame, (v) => api.ui.postMessage({ type: 'progress', visited: v }))`,
    build a `Subject` (`source: 'figma'`, `ref: frame.id`, `targets`, `confidence`, size), and
    `check(subject, config)`. Reply `findings`.
    To keep `handle` testable without `figma.ui`, pass the progress callback in: change
    `handle(api, msg, onProgress?)` and let `route`/`code.ts` pass one that posts `progress`.
  - `select-node`: `getNodeByIdAsync`, then `currentPage.selection = [node]` and
    `viewport.scrollAndZoomIntoView([node])`; reply `null`.
  - `code.ts`: set `figma.skipInvisibleInstanceChildren = true` before `showUI`.
  - `route.ts`: `OPENING.check = { type: 'check', scope: 'selection' }` falling back to `page`
    when the selection is empty (decide inside the `check` handler: empty selection → page).
- [ ] **Step 3:** `npm run build -w @hinge/figma-plugin && npm test -w @hinge/figma-plugin && npm run typecheck -w @hinge/figma-plugin` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/figma-plugin
git commit -m "Check frames on the canvas and jump to the flagged layers"
```

### Task 6: Adapt & flag — plan in core, apply in the plugin

**Files:**
- Create: `packages/core/src/adapt.ts`, `packages/core/src/adapt.test.ts`,
  `packages/figma-plugin/src/adapt.ts`, `packages/figma-plugin/src/adapt.test.ts`
- Modify: `packages/figma-plugin/src/presets.ts` (extract `decorate(api, frame, preset, catalogVersion)`
  from `applyPreset`; `applyPreset` = create frame + `decorate`)

**Interfaces:**
- Core produces:

```ts
export interface AdaptFlag { nodeId: string; name: string; reason: 'past-new-edge' | 'fixed-position' | 'bar-to-rail' | 'image-aspect' | 'choose-pane-content'; message: string }
export interface AdaptPlan {
  target: Target;
  width: number;
  height: number;
  split: { axis: 'vertical' | 'horizontal'; at: number; gutter: number } | null;  // only when a hinge separates
  splitNote: string | null;                                                        // why no split
  flags: AdaptFlag[];
}
export function adaptPlan(config: EnvConfig, source: { width: number; height: number; root: GeoNode[]; fixed: string[] }, target: Target, opts: { split: boolean }): AdaptPlan;
```
  (`fixed` lists child ids with MIN/MIN constraints outside auto layout — the plugin collects it.)
- Plugin produces: `adaptFrame(api, frameId, target, opts: { split: boolean }): Promise<{ frame: FrameNode; plan: AdaptPlan; findings: Finding[] }>`.

- [ ] **Step 1: Failing core test** `adapt.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import type { GeoNode } from './geo';
import { adaptPlan } from './adapt';
import { envConfigOf } from './targets';

const config = envConfigOf(loadCatalog());
const n = (id: string, role: GeoNode['role'], x: number, width: number, extra: Partial<GeoNode> = {}): GeoNode => ({ id, name: id, role, rect: { x, y: 0, width, height: 100 }, ...extra });

describe('adaptPlan', () => {
  const phone = { width: 411, height: 923 };

  it('resizes to the target and splits at a separating hinge when asked', () => {
    const p = adaptPlan(config, { ...phone, root: [], fixed: [] }, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' }, { split: true });
    expect(p).toMatchObject({ width: 1100, height: 756, split: { axis: 'vertical', at: 537, gutter: 26 }, splitNote: null });
    expect(p.flags.map((f) => f.reason)).toContain('choose-pane-content');
  });

  it('does not split at a crease that does not separate, and says why', () => {
    const p = adaptPlan(config, { ...phone, root: [], fixed: [] }, { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' }, { split: true });
    expect(p.split).toBeNull();
    expect(p.splitNote).toMatch(/does not separate/);
  });

  it('flags children past the new edge and fixed children when the width changes a lot', () => {
    const root = [n('hero', 'media', 0, 411), n('badge', 'container', 380, 30)];
    const p = adaptPlan(config, { ...phone, root, fixed: ['badge'] }, { deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape' }, { split: false });
    expect(p.flags.map((f) => [f.nodeId, f.reason])).toEqual(expect.arrayContaining([['hero', 'past-new-edge'], ['badge', 'fixed-position']]));
  });

  it('flags a bottom bar when the new width calls for a rail', () => {
    const root = [n('Tab bar', 'chrome', 0, 411)];
    const p = adaptPlan(config, { ...phone, root, fixed: [] }, { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'landscape' }, { split: false });
    expect(p.flags.map((f) => f.reason)).toContain('bar-to-rail');
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `packages/core/src/adapt.ts`

```ts
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
  const aspectChange = Math.abs(env.width / env.height - source.width / source.height) / (source.width / source.height);
  const byId = new Map(source.root.map((n) => [n.id, n]));
  for (const n of source.root) {
    if (n.rect.x + n.rect.width > env.width + 1)
      flags.push({ nodeId: n.id, name: n.name, reason: 'past-new-edge', message: `${n.name} ends past the new ${env.width} ${env.unit} edge; resize or reflow it.` });
    if (n.role === 'chrome' && BOTTOM_BAR.test(n.name) && env.width >= RAIL_FROM)
      flags.push({ nodeId: n.id, name: n.name, reason: 'bar-to-rail', message: `${n.name}: at ${env.width} ${env.unit} navigation usually becomes a rail.` });
    if (n.role === 'media' && aspectChange > BIG_CHANGE)
      flags.push({ nodeId: n.id, name: n.name, reason: 'image-aspect', message: `${n.name}: the frame's shape changed; check how the image is cropped.` });
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
```

- [ ] **Step 3:** `npm test -w @hinge/core` → PASS. Commit:

```bash
git add packages/core/src/adapt.ts packages/core/src/adapt.test.ts
git commit -m "Plan frame adaptations and the decisions they leave to the designer"
```

- [ ] **Step 4: Failing plugin test** `adapt.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { adaptFrame } from './adapt';
import { NAMESPACE, OVERLAY_NAME } from './presets';
import { createFakeFigma } from './test/fakeFigma';

const DUO = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;

function source(api: ReturnType<typeof createFakeFigma>) {
  const f = api.createFrame();
  f.name = 'Home';
  f.resize(411, 923);
  const title = api.createText();
  title.characters = 'Hello';
  f.appendChild(title);
  return f;
}

describe('adaptFrame', () => {
  it('clones, resizes, decorates and tags, leaving the source alone', async () => {
    const api = createFakeFigma();
    const src = source(api);
    const { frame } = await adaptFrame(api, src.id, DUO, { split: false });
    expect(frame.id).not.toBe(src.id);
    expect(src).toMatchObject({ width: 411, height: 923 });
    expect(frame).toMatchObject({ width: 1100, height: 756 });
    expect(frame.getSharedPluginData(NAMESPACE, 'target')).toBe('surface-duo-2/spanned/spanned/landscape');
    expect(frame.children.filter((c) => c.name === OVERLAY_NAME)).toHaveLength(1);
  });

  it('splits into two panes at the hinge when asked', async () => {
    const api = createFakeFigma();
    const { frame } = await adaptFrame(api, source(api).id, DUO, { split: true });
    const panes = frame.children.find((c) => c.name === 'Panes') as FrameNode;
    expect(panes).toMatchObject({ layoutMode: 'HORIZONTAL', itemSpacing: 26 });
    expect(panes.children.map((c) => c.name)).toEqual(['Pane 1', 'Pane 2']);
  });

  it('swaps a Size or Posture component property when the new value exists', async () => {
    const api = createFakeFigma();
    const src = source(api);
    const inst = api.createInstance();
    inst.componentProperties = { Size: { type: 'VARIANT', value: 'Compact' } } as never;
    (inst as unknown as { variantOptions: Record<string, string[]> }).variantOptions = { Size: ['Compact', 'Medium', 'Expanded'] };
    src.appendChild(inst);
    const { frame } = await adaptFrame(api, src.id, DUO, { split: false });
    const copy = frame.children.find((c) => c.type === 'INSTANCE') as InstanceNode;
    expect(copy.componentProperties.Size.value).toBe('Expanded');
  });
});
```
  The fake needs `variantOptions` on instances (read by the plugin through
  `instance.mainComponent?.parent` in real Figma — see Step 5) and `layoutMode`, `itemSpacing`,
  `primaryAxisSizingMode`, `counterAxisSizingMode`, `layoutGrow` on frames. Run → FAIL.

- [ ] **Step 5: Implement** `packages/figma-plugin/src/adapt.ts`
  1. `const src = await api.getNodeByIdAsync(frameId)`; must be a FRAME; `frame = src.clone()`;
     place it right of the source (`frame.x = src.x + src.width + 80`, same `y`).
  2. Collect `fixed`: children of the clone that are not in an auto-layout parent and whose
     `constraints` are `MIN`/`MIN`.
  3. `plan = adaptPlan(config, { width: src.width, height: src.height, root: await toGeo(frame), fixed }, target, opts)`.
  4. Remove the old `⎔ hinge-overlay` child if present; `frame.resize(plan.width, plan.height)`;
     `decorate(api, frame, presetSpec(config, target), catalog.version)` (grids, overlay, tag,
     relaunch data).
  5. If `plan.split`: create a frame `Panes` with `layoutMode` = `HORIZONTAL` (vertical hinge) or
     `VERTICAL`, `itemSpacing = plan.split.gutter`, sized to the frame, and two child frames
     `Pane 1`/`Pane 2` with `layoutGrow = 1`; move each original child (except the overlay) into
     the pane its centre falls in. Insert `Panes` below the overlay so the overlay stays on top.
  6. Size class names for this target: Android `env.sizeClass.width` (`compact`/`medium`/`expanded`…),
     iOS `env.sizeClass.horizontal` (`compact`/`regular`). For each instance in the clone whose
     main component set has a `Size` or `Posture` variant property: if an option equals the
     size class (case-insensitive) or the posture kind, `setProperties({ [prop]: option })`.
     Real Figma: options come from `(await instance.getMainComponentAsync())?.parent` when it is a
     `COMPONENT_SET` (`componentPropertyDefinitions[prop].variantOptions`); the fake exposes
     `variantOptions` directly — hide the difference behind one helper `variantOptionsOf(instance)`.
  7. Variable modes: `await figma.variables.getLocalVariableCollectionsAsync()`; for each
     collection with a mode whose name equals the size class (case-insensitive), call
     `frame.setExplicitVariableModeForCollection(collection, mode.modeId)`. Add `'variables'` to
     `FigmaApi`'s `Pick`; the fake returns `[]` by default and a test-provided list otherwise.
  8. `findings = check(subject of the clone, config)`; return `{ frame, plan, findings }`.
- [ ] **Step 6:** `npm test -w @hinge/figma-plugin && npm run typecheck -w @hinge/figma-plugin` → PASS.
- [ ] **Step 7: Commit**

```bash
git add packages/figma-plugin/src
git commit -m "Adapt a frame to other devices and flag what needs a designer"
```

### Task 7: Adapt and Check panels

**Files:** Modify `packages/figma-plugin/{manifest.json,src/messages.ts,src/handlers.ts,src/route.ts,src/ui/App.tsx}`,
`src/manifest.test.ts`, `src/handlers.test.ts`

**Interfaces:**
- Messages: ToMain `{ type: 'adapt'; frameId: string; keys: string[]; split: boolean }`;
  ToUi `{ type: 'adapted'; results: { key: string; frameId: string; plan: AdaptPlan; findings: Finding[] }[] }`
  and `{ type: 'selection'; frames: { id: string; name: string }[] }` (sent on selection change).
- Manifest menu adds `{ "name": "Adapt frame", "command": "adapt" }` (commands now
  `presets, tag, coverage, check, adapt`).

- [ ] **Step 1: Failing tests** — manifest commands include `adapt`; handler test: `adapt` with
  two keys returns two results, each with a new frame id and a `plan`, and an unknown key returns
  an `error` message without creating anything (validate every key first, as `create-presets` does).
- [ ] **Step 2: Implement** the handler (loop `adaptFrame`), `code.ts` posting `selection` on
  `figma.on('selectionchange')`, and the panels:
  - **Check**: scope buttons (Selection · Page · All pages, the last with "loads every page"
    hint), a progress line from `progress` messages, then findings grouped by frame → rule, each
    row clickable (`select-node`), severity icon, `estimated` badge, message.
  - **Adapt**: the selected frame's name (or "Select one frame"), target checkboxes grouped by
    category (reuse the Artboards list component), a "Split at hinge" checkbox, and an "Adapt"
    button. Results list each new frame with its flags (reason + message) and its findings count,
    each clickable.
- [ ] **Step 3:** `npm run build -w @hinge/figma-plugin && npm test && npm run typecheck && npm run build` → PASS.
  Serve `packages/figma-plugin/dist/ui.html` locally and drive it with simulated messages in the
  built-in browser (as in slice 3) to see both panels render with no console errors.
- [ ] **Step 4: Commit** (two microcommits: handler + manifest; panels)

```bash
git add packages/figma-plugin/manifest.json packages/figma-plugin/src/messages.ts packages/figma-plugin/src/handlers.ts packages/figma-plugin/src/handlers.test.ts packages/figma-plugin/src/manifest.test.ts packages/figma-plugin/src/route.ts packages/figma-plugin/src/code.ts
git commit -m "Handle adapting frames from the plugin"
git add packages/figma-plugin/src/ui
git commit -m "Add the plugin panels for checking and adapting frames"
```

### Task 8: README, manual smoke test, issue and PR

- [ ] **Step 1:** README: the Check and Adapt frame commands, the rule list with thresholds and
  which are estimates, how size-only frames are checked (every candidate, worst-case hinge), the
  editable layer-name patterns, and what Adapt does versus what it flags.
- [ ] **Step 2: Manual smoke test** — ask the user to rebuild, re-import and try: Check on a
  preset with a button dragged onto the hinge; Adapt a phone frame to Surface Duo 2 spanned with
  "Split at hinge". Record the outcome in the PR; leave the box unticked until they report.
- [ ] **Step 3:** Issue:

```bash
gh issue create -R jacksonmafra-umain/SizeClassSimulator \
  --title "Figma plugin: checker and Adapt & flag" --label enhancement --label area:plugin \
  --body "Slice 4 of docs/superpowers/specs/2026-09-25-foldable-artboards-design.md. Checks frames against the foldable rules (hinge content, pane split, landscape-not-wide, legible width, chrome overlap, touch targets, overflow, tabletop controls, frame size) and adapts a frame to other devices, doing the mechanical work and flagging the design decisions."
```
- [ ] **Step 4:** `git push -u origin feat/figma-plugin-checker`; PR targeting
  `feat/figma-plugin-presets`, labels `enhancement,area:plugin`, body `Closes #N`, Summary, Test
  plan (counts, typecheck, builds, panel check, manual smoke). No assistant mention.
