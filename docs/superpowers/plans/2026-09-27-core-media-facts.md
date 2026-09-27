# Core media facts, media match keys, touch targets and the simulator source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Core resolves a window's media facts (pointer, keyboard, viewing distance, camera, microphone) on
the `Environment`, layout rules can match on them, `touch-target` only runs where people touch and skips
controls a clipping container hides, and a report can say it came from the simulator (issue #29).

**Architecture:** `resolveEnvironment` adds `media` to every environment it returns. The value comes
from `mediaFacts(device)` (catalog/media.ts), then from an optional `Selection.media` override. Free windows
use the phone defaults. `ruleMatches` reads three new optional match keys against `env.media`.
The geometry rule `touch-target` in `rules.ts` returns early for a fine pointer and skips nodes that a
clipping ancestor crops out entirely. `Report.source.kind` gains `'simulator'`.

**Tech Stack:** TypeScript 7, zod 4, Vitest 4. `packages/core` only.

**Spec:** `docs/superpowers/specs/2026-09-25-android-adaptive-model-design.md` §3.3 (media-query facts,
`UiMediaScope`) and delivery step 4 (media-fact consumers: overrides and rule matching);
`docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §8 (`touch-target`: 48 dp Android /
44 pt iOS, Material 3 accessibility and Apple HIG). Issue #29 is the contract.

## Global Constraints

- `packages/core` only. Do not edit `apps/simulator`: the simulator's switch-over is agent/01's Task 4 of
  `docs/superpowers/plans/2026-09-27-media-facts-simulator.md`, written against the API this plan lands.
- Values follow `catalog/media.ts`: `pointer: 'coarse' | 'fine'`, `keyboard: 'virtual' | 'physical'`,
  `viewingDistance: 'near' | 'medium' | 'far'`, `hasCamera`, `hasMicrophone`.
- Existing rules resolve exactly as before: a rule without the new keys matches whatever the media facts are.
- Touch target minimum stays `TOUCH_TARGET = { android: 48, ios: 44 }` (Material 3 accessibility, Apple HIG).
- Old reports (`source.kind` `'figma'` or `'web'`) still parse.
- Commits in English, microcommits, never mention the assistant. PR against `main`, labels
  `enhancement` and `area:core`, body `Closes #29`.
- Work branch `feat/core-media-facts` from `origin/main`.

## Review Focus

1. A free-resize window (no device) — expected: it still gets media facts (phone defaults: coarse,
   virtual, near), so `touch-target` keeps running for free windows as it does today (Task 1).
2. An override of one key (`Selection.media = { pointer: 'fine' }`) — expected: only that key changes; the
   other four keep the device's values (Task 1).
3. A rule keyed only on a media fact (`match: { pointer: 'fine' }`) — expected: it is not treated as the
   platform fallback (`match: {}`), so rules after it are not flagged as unreachable, and a rule placed
   after the fallback is still flagged (Task 2).
4. A size-only (`confidence: 'size'`) subject — expected: `worstCase` keeps the environment's media, so a
   phone-sized untagged frame still gets `touch-target` findings (Task 3).
5. A button inside a clipping container but only partly cropped — expected: still checked; only a node
   with no overlap with some clipping ancestor is skipped (Task 3).

---

### Task 0: Branch and plan

- [ ] **Step 1**

```bash
git fetch origin
git switch -c feat/core-media-facts origin/main
npm install && npm test
git add docs/superpowers/plans/2026-09-27-core-media-facts.md
git commit -m "Add the implementation plan for core media facts"
```
Expected: every workspace passes (core 284, cli 35, plugin 48, report 14, simulator 91 at the time of writing).

### Task 1: Media facts on the environment

**Files:**
- Modify: `packages/core/src/engine/environment.ts` (the `Selection` and `Environment` interfaces, `resolveEnvironment`, `freeEnvironment`)
- Modify: `packages/core/src/engine/ios.ts` and `packages/core/src/engine/android.ts` only if typecheck
  requires it (see Step 3)
- Test: create `packages/core/src/engine/media.test.ts`

**Interfaces:**
- Produces: `Environment.media: MediaFacts` (from `../catalog/media`), and
  `Selection.media?: Partial<MediaFacts>`. It is applied after the device facts and ignored for keys set
  to `undefined`.

- [ ] **Step 1: Failing test** `media.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { DEFAULT_MEDIA } from '../catalog/media';
import { envConfigOf } from '../targets';
import { resolveEnvironment, type Selection } from './environment';

const config = envConfigOf(loadCatalog());
const phone: Selection = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait', free: null };
const desktop: Selection = { deviceId: 'chromebook', displayId: 'main', orientation: 'landscape', free: null };

describe('environment media facts', () => {
  it('takes the device category defaults', () => {
    expect(resolveEnvironment(config, phone).media).toEqual(DEFAULT_MEDIA.phone);
    expect(resolveEnvironment(config, desktop).media).toMatchObject({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium' });
  });

  it('applies a selection override key by key', () => {
    const env = resolveEnvironment(config, { ...phone, media: { pointer: 'fine', keyboard: undefined } });
    expect(env.media).toEqual({ ...DEFAULT_MEDIA.phone, pointer: 'fine' });
  });

  it('gives a free window the phone defaults', () => {
    expect(resolveEnvironment(config, { ...phone, free: { width: 500, height: 700 } }).media).toEqual(DEFAULT_MEDIA.phone);
  });
});
```
If `chromebook` has no `main` display in `landscape`, pick the first `enumerateTargets(config)` entry
whose device category is `desktop`, and ledger it.
Run: `npx vitest run src/engine/media.test.ts` (in `packages/core`) → FAIL (`media` is undefined).

- [ ] **Step 2: Implement** in `environment.ts`:

```ts
import { DEFAULT_MEDIA, mediaFacts, type MediaFacts } from '../catalog/media';

// Selection gains:
  /** Media-query facts the user overrides (pointer, keyboard, …). Unset keys keep the device's value. */
  media?: Partial<MediaFacts>;

// Environment gains:
  /** Media-query facts for this window: the device's (catalog/media.ts), then the selection's overrides. */
  media: MediaFacts;

function withMedia(base: MediaFacts, override: Partial<MediaFacts> | undefined): MediaFacts {
  const out = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

export function resolveEnvironment(config: EnvConfig, sel: Selection): Environment {
  if (sel.free) {
    const platform = sel.freePlatform ?? findDevice(config, sel.deviceId).platform;
    // A free window has no device: it gets the phone defaults, touch first.
    return { ...freeEnvironment(config, sel.free, platform), media: withMedia(DEFAULT_MEDIA.phone, sel.media) };
  }
  const device = findDevice(config, sel.deviceId);
  const env = device.platform === 'ios' ? resolveIosDevice(config, device, sel) : resolveAndroidDevice(config, device, sel);
  return { ...env, media: withMedia(mediaFacts(device), sel.media) };
}
```
`freeEnvironment` returns `Omit<Environment, 'media'>`.

- [ ] **Step 3:** In `packages/core`, run `npx vitest run src/engine/media.test.ts && npx tsc --noEmit`,
  and expect PASS. If `resolveIosDevice` or `resolveAndroidDevice` fail typecheck because they return
  `Environment`, change their return type to `Omit<Environment, 'media'>`. Do not add media inside them;
  `resolveEnvironment` is the only place that sets it.
- [ ] **Step 4:** `npm test && npm run typecheck` (repo root) → PASS; the simulator and CLI still build.
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine
git commit -m "Resolve media facts on every environment, with per-selection overrides"
```

### Task 2: Media match keys on layout rules

**Files:**
- Modify: `packages/core/src/config/schema.ts` (the `layoutRule.match` object, lines ~327-336)
- Modify: `packages/core/src/engine/layout.ts` (`ruleMatches`, ~line 59)
- Test: add to `packages/core/src/engine/media.test.ts`

**Interfaces:**
- Consumes: `Environment.media` (Task 1).
- Produces: `match.pointer?: 'coarse' | 'fine'`, `match.keyboard?: 'virtual' | 'physical'`,
  `match.viewingDistance?: 'near' | 'medium' | 'far'`, valid on both platforms.

- [ ] **Step 1: Failing tests** (append to `media.test.ts`):

```ts
import { ruleMatches } from './layout';
import type { LayoutRule } from '../config/types';
import { loadConfig } from '../config/load';

const rule = (match: LayoutRule['match']): LayoutRule => ({ ...simConfig.layoutRules.find((r) => r.platform === 'android')!, match });
const simConfig = loadConfig();

describe('media match keys', () => {
  it('matches a rule keyed on pointer only where the pointer fits', () => {
    const fine = rule({ pointer: 'fine' });
    expect(ruleMatches(fine, resolveEnvironment(config, desktop))).toBe(true);
    expect(ruleMatches(fine, resolveEnvironment(config, phone))).toBe(false);
    expect(ruleMatches(fine, resolveEnvironment(config, { ...phone, media: { pointer: 'fine' } }))).toBe(true);
  });

  it('matches keyboard and viewing distance', () => {
    expect(ruleMatches(rule({ keyboard: 'physical' }), resolveEnvironment(config, desktop))).toBe(true);
    expect(ruleMatches(rule({ viewingDistance: 'far' }), resolveEnvironment(config, desktop))).toBe(false);
  });

  it('keeps rules without media keys matching as before', () => {
    expect(ruleMatches(rule({}), resolveEnvironment(config, desktop))).toBe(true);
  });
});
```
Check how the simulator config is loaded in existing engine tests (for example
`grep -rn "layoutRules" packages/core/src/engine/*.test.ts`) and use the same loader in place of
`loadConfig` if the name differs. Ledger the name. Add a schema test to `packages/core/src/config/schema.test.ts`
(or the file that tests `layoutRules` validation) that:
- a profile rule with `match: { pointer: 'fine' }` placed before the fallback parses without issues;
- `match: { pointer: 'hover' }` fails with the path `layoutRules.<i>.match.pointer`.

Run → FAIL.

- [ ] **Step 2: Implement.** In the `match` object of `layoutRule`, after `orientation`:

```ts
    // Either platform: media-query facts (catalog/media.ts), for rules that differ by input or distance.
    pointer: z.enum(['coarse', 'fine']).optional(),
    keyboard: z.enum(['virtual', 'physical']).optional(),
    viewingDistance: z.enum(['near', 'medium', 'far']).optional(),
```
In `ruleMatches`, after the orientation check:

```ts
  if (m.pointer && m.pointer !== env.media.pointer) return false;
  if (m.keyboard && m.keyboard !== env.media.keyboard) return false;
  if (m.viewingDistance && m.viewingDistance !== env.media.viewingDistance) return false;
```
The fallback check (`Object.keys(m).length === 0`) needs no change: a media-keyed rule is not a fallback.

- [ ] **Step 3:** `npm test -w @dobra/core && npm run typecheck` → PASS (existing profile rules resolve the same:
  the sample profile's layout tests stay green).
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/src/engine/layout.ts packages/core/src/engine/media.test.ts packages/core/src/config/schema.test.ts
git commit -m "Let layout rules match on pointer, keyboard and viewing distance"
```

### Task 3: touch-target for coarse pointers, skipping cropped controls

**Files:**
- Modify: `packages/core/src/rules.ts` (`touchTarget`, ~line 138)
- Test: `packages/core/src/rules.test.ts`

**Interfaces:**
- Consumes: `Environment.media.pointer` (Task 1); `Placed.parent`, `GeoNode.clips` (geo.ts);
  `rectsOverlap` (collisions.ts, already imported by rules.ts).

- [ ] **Step 1: Failing tests** in `rules.test.ts` (reuse its `node`, `subject`, `ids` helpers):

```ts
describe('touch-target', () => {
  const small = () => node('x', 'interactive', { x: 10, y: 10, width: 30, height: 30 });

  it('skips windows with a fine pointer', () => {
    const desk = enumerateTargets(config).find((t) => config.devices.find((d) => d.id === t.deviceId)?.category === 'desktop')!;
    expect(ids(subject([small()], [desk], { width: 1280, height: 800 }), 'touch-target')).toEqual([]);
  });

  it('skips a control a clipping container crops out entirely', () => {
    const clip = node('clip', 'container', { x: 0, y: 0, width: 1, height: 1 }, {
      clips: true,
      children: [node('hidden', 'interactive', { x: 5, y: 5, width: 30, height: 18 })],
    });
    expect(ids(subject([clip]), 'touch-target')).toEqual([]);
  });

  it('still checks a control that a clip only partly crops', () => {
    const clip = node('clip', 'container', { x: 0, y: 0, width: 20, height: 20 }, {
      clips: true,
      children: [node('partial', 'interactive', { x: 10, y: 10, width: 30, height: 18 })],
    });
    expect(ids(subject([clip]), 'touch-target')).toEqual(['partial']);
  });

  it('still runs on a size-only match', () => {
    expect(ids(subject([small()], [DUO], { confidence: 'size' }), 'touch-target')).toEqual(['x']);
  });
});
```
Import `enumerateTargets` from `./targets`. If `subject`'s default width and height don't fit the Duo,
pass them explicitly, as the existing `touch-target` tests (~line 81) do. Run
`npx vitest run src/rules.test.ts` and expect FAIL on the first two cases; the last two already pass,
because they pin behaviour that must not change.

- [ ] **Step 2: Implement** in `rules.ts`:

```ts
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
    // … unchanged from here
```
Check `rectsOverlap` treats rects that only touch at an edge as not overlapping, and ledger what it does.
- [ ] **Step 3:** `npm test -w @dobra/core && npm test -w @dobra/cli && npm run typecheck` → PASS. If a CLI or
  report test expected `touch-target` on a desktop target, that expectation was the old behaviour:
  update it and ledger it.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/rules.ts packages/core/src/rules.test.ts
git commit -m "Check touch targets only for coarse pointers and skip controls a clip hides"
```

### Task 4: The simulator as a report source

**Files:**
- Modify: `packages/core/src/report.ts` (the `Report.source.kind` type and `reportSchema.source.kind`)
- Test: `packages/core/src/report.test.ts`

- [ ] **Step 1: Failing test** (append to the `report` describe):

```ts
  it('accepts a report from the simulator', () => {
    const sim = buildReport(catalog, { kind: 'simulator', ref: 'http://localhost:5173/?d=pixel-9', name: 'Simulator' }, []);
    expect(parseReport(JSON.parse(JSON.stringify(sim))).source.kind).toBe('simulator');
  });
```
Use the catalog variable the file already defines. Run → FAIL (a type error in `tsc`, and a zod error in `parseReport`).
- [ ] **Step 2: Implement:** `kind: 'figma' | 'web' | 'simulator'` in the `Report` interface, and
  `kind: z.enum(['figma', 'web', 'simulator'])` in the schema. `buildReport` passes `source.kind` to
  `check()` as `Subject.source`, which already allows `'simulator'`.
- [ ] **Step 3:** `npm test -w @dobra/core && npm run typecheck` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/report.ts packages/core/src/report.test.ts
git commit -m "Accept reports made by the simulator"
```

### Task 5: PR and hand-off

- [ ] **Step 1:** `git push -u origin feat/core-media-facts`, then open a PR against `main`:
  - title "Core: media facts, media match keys, coarse-pointer touch targets and the simulator source";
  - labels `enhancement,area:core`;
  - body `Closes #29`, a Summary and a Test plan (counts, typecheck, every workspace build). No assistant mention.
- [ ] **Step 2:** Message agent/01 with the landed API, so their media-facts Task 4 and #28 can be written against it:
  - `Selection.media?: Partial<MediaFacts>`;
  - `Environment.media: MediaFacts`;
  - the `match.pointer` / `keyboard` / `viewingDistance` keys;
  - `Report.source.kind` now includes `'simulator'`.

  Also tell them that `runLayoutChecks` has no control geometry, so it does not emit `touch-target`. The
  simulator gets `touch-target` by running core `check()` on the GeoNodes it harvests from the DOM for
  #28. This corrects their plan's assumption that touch-target findings "reach the Checks list through
  `runLayoutChecks`".
