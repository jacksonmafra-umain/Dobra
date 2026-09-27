# Media facts in the simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every device's media-query facts in the simulator, let the user override them per device, and keep the overrides in the URL.

**Architecture:** The catalog already stores the facts (`media` block, category defaults), and `mediaFacts(d)` in `@hinge/core/catalog/media` resolves them. The simulator adds one small module (`ui/media.ts`) that layers the user's overrides on top and derives `windowPosture` from the resolved folds. `UrlState` gets a `media` field, `App` gets a Media control group, and `Inspector` gets a Media row. Nothing in `packages/core` changes.

**Tech Stack:** TypeScript, React 19, Vitest; `@hinge/core` read-only.

**Spec:** `docs/superpowers/specs/2026-09-25-android-adaptive-model-design.md` §3.3 and delivery step 4. This plan replaces Task 11 of `docs/superpowers/plans/2026-09-25-android-adaptive-model.md`, which assumed fields that the Catalog slice named differently.

## Global Constraints

- Scope is `apps/simulator` only. Do not edit `packages/core`. If a core change is needed, open a labeled issue (`area:core`) and message agent/02.
- Use the catalog's names and values as they are: `pointer: 'coarse' | 'fine'`, `keyboard: 'virtual' | 'physical'`, `viewingDistance: 'near' | 'medium' | 'far'`, `hasCamera`, `hasMicrophone` (`packages/core/src/catalog/media.ts`).
- The URL keys are `ptr`, `kbd`, `dist`, `cam` (`0`/`1`) and `mic` (`0`/`1`). Write a key only when it overrides the device value.
- Defaults per category are estimated. The inspector says so.
- Use English throughout, microcommits, and no assistant mention in commits or PRs. Work from a labeled issue, on branch `feat/media-facts-ui` from `main`, with a PR that closes the issue.

## Scope ruling: rule matching and `touch-target`

The spec also asks for rules that match on media facts, and for a `touch-target` check that runs only for coarse pointers. Both need core changes:
- `ruleMatches` in `packages/core/src/engine/layout.ts` and the rule `match` schema in `packages/core/src/config/schema.ts` would need `pointer`, `keyboard` and `viewingDistance` keys.
- `Environment` would need a `media` field.
- `packages/core/src/engine/checks.ts` would need the `touch-target` check.

These are out of scope here. They go to agent/02 as a labeled `area:core` issue (Task 0). This plan builds the simulator side so that, once core resolves `env.media`, the simulator only has to switch its source (Task 4, blocked).

## Review Focus

- An unknown URL value (`?ptr=blunt`) is ignored rather than crashing, and does not become an override.
- An override equal to the device value is not written back to the URL, so a link stays minimal.
- Switching device keeps the overrides. A mouse on a tablet stays a mouse when the user picks another tablet, and "Reset" clears the overrides.
- The desktop category shows fine/physical/medium without an override (Chromebook).
- `windowPosture` is `Flat` for a device without a separating fold, even in a "tabletop" pose on a device whose fold does not separate.

---

### Task 0: Core follow-up issue

- [ ] **Step 1: Open the issue**

```bash
gh issue create --label enhancement --label area:core \
  --title "Resolve media facts into Environment, match rules on them, and add the touch-target check" \
  --body "The simulator shows and overrides media facts in apps/simulator (see docs/superpowers/plans/2026-09-27-media-facts-simulator.md). Three parts need core:
- Environment.media, resolved from mediaFacts(device) plus an optional Selection.media override.
- Rule match keys pointer, keyboard and viewingDistance in the rule schema and in ruleMatches. Existing rules resolve exactly as before.
- A touch-target check that runs only for coarse pointers: 48 dp on Android and 44 pt on iOS (Material 3 accessibility, Apple HIG).
Values follow catalog/media.ts."
```

- [ ] **Step 2: Message agent/02 with the issue number.**

### Task 1: Media overrides and posture

**Files:**
- Create: `apps/simulator/src/ui/media.ts`
- Test: `apps/simulator/src/ui/media.test.ts`

**Interfaces:**
- Consumes: `mediaFacts(d: DeviceSpec): MediaFacts` and `DEFAULT_MEDIA` from `@hinge/core/catalog/media`; `Environment.folds: FoldFeature[]`; `findDevice(config, id)`.
- Produces:
  - `type MediaOverrides = Partial<MediaFacts>`
  - `type WindowPosture = 'Flat' | 'Book' | 'Tabletop'`
  - `interface ResolvedMedia extends MediaFacts { windowPosture: WindowPosture; overridden: (keyof MediaFacts)[]; estimated: boolean }`
  - `resolveMedia(device: DeviceSpec, env: Environment, overrides: MediaOverrides): ResolvedMedia`

- [ ] **Step 1: Write the failing test**

```ts
// apps/simulator/src/ui/media.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '@hinge/core/config/load';
import { parseConfig } from '@hinge/core/config/schema';
import { findDevice, resolveEnvironment, type Selection } from '@hinge/core/engine/environment';
import { resolveMedia } from './media';

const config = parseConfig(raw);
const sel = (deviceId: string, extra: Partial<Selection> = {}): Selection => ({ deviceId, displayId: '', orientation: 'portrait', free: null, ...extra });
const media = (s: Selection, o = {}) => resolveMedia(findDevice(config, s.deviceId), resolveEnvironment(config, s), o);

describe('resolveMedia', () => {
  it('uses the touch defaults on a phone', () => {
    expect(media(sel('pixel-9'))).toMatchObject({ pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', overridden: [], estimated: true });
  });
  it('uses the desktop defaults on a Chromebook', () => {
    expect(media(sel('chromebook'))).toMatchObject({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium' });
  });
  it('applies an override and names it', () => {
    const m = media(sel('pixel-tablet'), { pointer: 'fine' });
    expect(m.pointer).toBe('fine');
    expect(m.overridden).toEqual(['pointer']);
  });
  it('does not count an override equal to the device value', () => {
    expect(media(sel('pixel-9'), { pointer: 'coarse' }).overridden).toEqual([]);
  });
  it('derives the posture from separating folds', () => {
    expect(media(sel('pixel-9-pro-fold', { displayId: 'inner', pose: 'tabletop' })).windowPosture).toBe('Tabletop');
    expect(media(sel('pixel-9-pro-fold', { displayId: 'inner', pose: 'book' })).windowPosture).toBe('Book');
    expect(media(sel('pixel-9')).windowPosture).toBe('Flat');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -w @hinge/simulator -- src/ui/media.test.ts`
Expected: FAIL, `Cannot find module './media'`.

- [ ] **Step 3: Implement**

```ts
// apps/simulator/src/ui/media.ts
// The simulator's view of a device's media-query facts: the catalog value, then the user's override.
import { mediaFacts, type MediaFacts } from '@hinge/core/catalog/media';
import type { DeviceSpec } from '@hinge/core/config/types';
import type { Environment } from '@hinge/core/engine/environment';

export type MediaOverrides = Partial<MediaFacts>;
export type WindowPosture = 'Flat' | 'Book' | 'Tabletop';

export interface ResolvedMedia extends MediaFacts {
  windowPosture: WindowPosture;
  overridden: (keyof MediaFacts)[];
  /** True when the device has no media block, so the facts are category defaults. */
  estimated: boolean;
}

const KEYS: (keyof MediaFacts)[] = ['pointer', 'keyboard', 'viewingDistance', 'hasCamera', 'hasMicrophone'];

export function resolveMedia(device: DeviceSpec, env: Environment, overrides: MediaOverrides): ResolvedMedia {
  const base = mediaFacts(device);
  const facts = { ...base, ...overrides };
  const sep = env.folds.find((f) => f.separating);
  return {
    ...facts,
    windowPosture: !sep ? 'Flat' : sep.axis === 'horizontal' ? 'Tabletop' : 'Book',
    overridden: KEYS.filter((k) => overrides[k] !== undefined && overrides[k] !== base[k]),
    estimated: !device.media,
  };
}
```

The `estimated` flag is true only when the device has no `media` block. A block with a `source` counts as sourced. Both the iOS and Android device schemas carry `media`.

- [ ] **Step 4: Run and pass**

Run: `npm test -w @hinge/simulator -- src/ui/media.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add apps/simulator/src/ui/media.ts apps/simulator/src/ui/media.test.ts
git commit -m "Resolve media facts with overrides and window posture in the simulator"
```

### Task 2: Media overrides in the URL

**Files:**
- Modify: `apps/simulator/src/ui/urlState.ts`
- Test: `apps/simulator/src/ui/urlState.test.ts`

**Interfaces:**
- Consumes: `MediaOverrides`, `resolveMedia` from Task 1.
- Produces: `UrlState.media: MediaOverrides`; `writeUrlState(state, env, device)`, which takes the device so it can drop overrides equal to the device value.

- [ ] **Step 1: Write the failing tests** (append to `urlState.test.ts`)

```ts
  it('round-trips media overrides', () => {
    const state = readUrlState('?device=pixel-tablet&ptr=fine&kbd=physical&dist=medium&cam=0&mic=0&screen=home');
    expect(state.media).toEqual({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium', hasCamera: false, hasMicrophone: false });
    const env = resolveEnvironment(config, state.selection);
    const device = findDevice(config, 'pixel-tablet');
    expect(readUrlState(writeUrlState(state, env, device)).media).toEqual(state.media);
  });

  it('ignores unknown media values', () => {
    expect(readUrlState('?device=pixel-9&ptr=blunt&dist=far-away&cam=yes').media).toEqual({});
  });

  it('does not write an override equal to the device value', () => {
    const state = readUrlState('?device=pixel-9&ptr=coarse&screen=home');
    const env = resolveEnvironment(config, state.selection);
    expect(writeUrlState(state, env, findDevice(config, 'pixel-9'))).not.toContain('ptr=');
  });
```

Import `findDevice` next to `resolveEnvironment`. Update the three existing `writeUrlState(state, env)` calls to pass the device too.

- [ ] **Step 2: Run and fail**

Run: `npm test -w @hinge/simulator -- src/ui/urlState.test.ts`
Expected: FAIL; `state.media` is undefined.

- [ ] **Step 3: Implement**

In `urlState.ts`:

```ts
import { mediaFacts } from '@hinge/core/catalog/media';
import type { DeviceSpec } from '@hinge/core/config/types';
import type { MediaOverrides } from './media';

const pick = <T extends string>(v: string | null, values: readonly T[]): T | undefined => values.find((x) => x === v);
const flag = (v: string | null) => (v === '1' ? true : v === '0' ? false : undefined);

function readMedia(q: URLSearchParams): MediaOverrides {
  const m: MediaOverrides = {
    pointer: pick(q.get('ptr'), ['coarse', 'fine'] as const),
    keyboard: pick(q.get('kbd'), ['virtual', 'physical'] as const),
    viewingDistance: pick(q.get('dist'), ['near', 'medium', 'far'] as const),
    hasCamera: flag(q.get('cam')),
    hasMicrophone: flag(q.get('mic')),
  };
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined)) as MediaOverrides;
}

const MEDIA_KEYS = [['pointer', 'ptr'], ['keyboard', 'kbd'], ['viewingDistance', 'dist'], ['hasCamera', 'cam'], ['hasMicrophone', 'mic']] as const;
```

Add `media: MediaOverrides` to `UrlState` and `media: readMedia(q)` to the object `readUrlState` returns. Change the signature to `writeUrlState(state: UrlState, env: Environment, device: DeviceSpec)`, and before `q.set('screen', …)` add:

```ts
  const base = mediaFacts(device);
  for (const [key, token] of MEDIA_KEYS) {
    const v = state.media[key];
    if (v === undefined || v === base[key]) continue;
    q.set(token, typeof v === 'boolean' ? (v ? '1' : '0') : v);
  }
```

- [ ] **Step 4: Run and pass**

Run: `npm test -w @hinge/simulator -- src/ui/urlState.test.ts`
Expected: PASS, 7/7. `npm run typecheck` fails in `App.tsx` on the new `writeUrlState` argument; Task 3 fixes it in the same PR. To keep this commit buildable, pass `device` in `App.tsx`'s one `writeUrlState` call in this commit, and add `media: {}` to the object literal there.

- [ ] **Step 5: Commit**

```bash
git add apps/simulator/src/ui/urlState.ts apps/simulator/src/ui/urlState.test.ts apps/simulator/src/ui/App.tsx
git commit -m "Keep media-fact overrides in the URL as ptr, kbd, dist, cam and mic"
```

### Task 3: Media controls and inspector row

**Files:**
- Modify: `apps/simulator/src/ui/App.tsx` (state, control group, `writeUrlState` call, `Inspector` prop)
- Modify: `apps/simulator/src/ui/Inspector.tsx` (a `media: ResolvedMedia` prop and a Media row)
- Test: `apps/simulator/src/ui/Inspector.test.tsx` (create; tests the pure `formatMedia`, since no DOM test library is installed)

**Interfaces:**
- Consumes: `resolveMedia`, `ResolvedMedia`, `MediaOverrides` (Task 1); `UrlState.media` (Task 2).
- Produces: `formatMedia(m: ResolvedMedia): string`, exported from `Inspector.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/simulator/src/ui/Inspector.test.tsx
import { describe, expect, it } from 'vitest';
import { formatMedia } from './Inspector';

const base = { pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', hasCamera: true, hasMicrophone: true, windowPosture: 'Flat' } as const;

describe('formatMedia', () => {
  it('lists every fact and marks category defaults as estimated', () => {
    expect(formatMedia({ ...base, overridden: [], estimated: true })).toBe('Coarse pointer · virtual keyboard · near · camera · mic · Flat (category default, estimated)');
  });
  it('marks overrides', () => {
    expect(formatMedia({ ...base, pointer: 'fine', overridden: ['pointer'], estimated: true })).toBe('Fine pointer (override) · virtual keyboard · near · camera · mic · Flat (category default, estimated)');
  });
  it('says when there is no camera or microphone', () => {
    expect(formatMedia({ ...base, hasCamera: false, hasMicrophone: false, overridden: [], estimated: false })).toBe('Coarse pointer · virtual keyboard · near · no camera · no mic · Flat');
  });
});
```

- [ ] **Step 2: Run and fail**

Run: `npm test -w @hinge/simulator -- src/ui/Inspector.test.tsx`
Expected: FAIL, `formatMedia` is not exported.

- [ ] **Step 3: Implement**

In `Inspector.tsx`:

```ts
import type { ResolvedMedia } from './media';

export function formatMedia(m: ResolvedMedia): string {
  const o = (k: keyof ResolvedMedia, s: string) => (m.overridden.includes(k as never) ? `${s} (override)` : s);
  return [
    o('pointer', `${capitalize(m.pointer)} pointer`),
    o('keyboard', `${m.keyboard} keyboard`),
    o('viewingDistance', m.viewingDistance),
    o('hasCamera', m.hasCamera ? 'camera' : 'no camera'),
    o('hasMicrophone', m.hasMicrophone ? 'mic' : 'no mic'),
    `${m.windowPosture}${m.estimated ? ' (category default, estimated)' : ''}`,
  ].join(' · ');
}
```

Add `media: ResolvedMedia` to `InspectorProps`, and after the `Orientation` row push `['Media', formatMedia(media)]`.

In `App.tsx`:
- Add `const [mediaOverrides, setMediaOverrides] = useState<MediaOverrides>(initial.media);` and `const media = resolveMedia(device, env, mediaOverrides);`.
- Pass `media` to `Inspector`.
- Pass `media: mediaOverrides` and `device` to `writeUrlState`, and add `mediaOverrides` to that effect's dependency list.
- Add a "Media" control group next to "Keyboard", in the existing `.control` markup:
  - three segmented controls: Pointer (Coarse | Fine), Keyboard (Virtual | Physical) and Distance (Near | Medium | Far). Each button's `aria-pressed` reads `media[key] === value`, and a click calls `setMediaOverrides((o) => ({ ...o, [key]: value }))`.
  - two checkboxes, Camera and Mic.
  - a Reset button, shown only when `media.overridden.length > 0`, that calls `setMediaOverrides({})`.

The overrides live in `App` state, not per device, so switching device keeps them (Review Focus 3).

- [ ] **Step 4: Run tests, typecheck and check in the browser**

Run: `npm test && npm run typecheck`
Expected: every workspace passes.
Then, on the dev server on port 5199:
- `/?device=chromebook&screen=home`: the inspector reads `Fine pointer · physical keyboard · medium · camera · mic · Flat (category default, estimated)`.
- `/?device=pixel-tablet&ptr=fine&screen=home`: the Pointer control shows Fine and the row says `Fine pointer (override)`. Switching to another tablet keeps `ptr=fine`, and Reset removes it from the URL.
- `/?device=pixel-9-pro-fold&display=inner&pose=tabletop`: the row ends in `Tabletop`.
- The browser console shows no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/simulator/src/ui/Inspector.tsx apps/simulator/src/ui/Inspector.test.tsx
git commit -m "Show media facts, overrides and window posture in the inspector"
git add apps/simulator/src/ui/App.tsx
git commit -m "Add pointer, keyboard, distance, camera and mic overrides to the controls"
```

### Task 4 (blocked on the Task 0 issue): Switch to core's `env.media`

Once core resolves `Environment.media` from `Selection.media`, the simulator stops layering overrides itself:
- Move `mediaOverrides` into `Selection.media`.
- Have `resolveMedia` read `env.media` and keep only `overridden`, `estimated` and, if core does not derive it, `windowPosture`.
- The `touch-target` findings then reach the Checks list through `runLayoutChecks` with no simulator change.

Write this task's steps against the API that the core issue actually lands. Do not guess them here.
