# Size classes and devices as Figma variables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Dobra plugin writes Figma variable collections for the catalog's size classes and for the
devices and postures the designer picks. Values come from platform defaults or a loaded app profile.
It updates the collections safely when run again, and Adapt switches their modes.

**Architecture:**
- **Core (`packages/core`):**
  - adds platform `layoutDefaults` to the catalog;
  - moves `composeConfig` to a module without the sample profile, so the plugin can load a profile
    and not bundle the sample;
  - adds a pure `variableSpec()` that returns collections, modes and variables.
- **Plugin (`packages/figma-plugin`):**
  - a thin `applyVariables()` compares that description with the file (by Dobra keys in plugin
    data) and writes it with `figma.variables`;
  - a Variables tab drives it;
  - Adapt sets the device mode.

**Tech Stack:** TypeScript 7, zod 4, Vitest 4, React 19 (plugin UI), the Figma Plugin API
(`figma.variables`), esbuild and Vite.

**Spec:** `docs/superpowers/specs/2026-09-27-figma-variables-design.md` (every section applies).

## Global Constraints

- **Collections:**
  - `Dobra · Size classes · Android` has modes `Compact`, `Medium`, `Expanded`, `Large` and
    `ExtraLarge`;
  - `Dobra · Size classes · iOS` has modes `Compact` and `Regular`;
  - `Dobra · Devices` has one mode per target, named `<Device> · <Display> · <Posture> · <Orientation>`.
  - Mode names match size-class ids case-insensitively (spec §3.1, §6).
- **Variable names (spec §3):**
  - size classes: `layout/margin`, `layout/gutter`, `layout/columns`, `layout/panes`,
    `breakpoint/min-width` and `breakpoint/max-width` (0 when unbounded);
  - devices: `window/width` and `window/height`; `safe-area/top`, `/bottom`, `/left` and `/right`;
    `hinge/present`, `hinge/separating`, `hinge/x`, `/y`, `/width` and `/height`; `layout/margin`,
    `/gutter`, `/columns` and `/panes`; `size-class/width` and `size-class/height`; `media/pointer`,
    `/keyboard` and `/viewing-distance`.
- Every variable's description names its source and ends with " (estimated)" when estimated. Never
  present a guess as a fact.
- Updates match by Dobra keys in shared plugin data, namespace `dobra` (the plugin's `NAMESPACE`),
  never by name.
- **Update rules:**
  - designer edits are kept unless `overwrite`;
  - deselected modes are kept unless `removeStale`;
  - variables Dobra no longer produces are listed, never deleted.
- **Mode limit:** when `addMode` fails after at least one mode, split the device collection by
  category, then into numbered parts. Split a size-class collection into numbered parts. Report
  Figma's message verbatim.
- The plugin bundle must not contain the sample app profile. `bundle.test.ts` already checks this.
- `core` stays free of Figma, React and the DOM.
- Commits are in English, as microcommits, and never mention the assistant. Nothing is merged directly
  to `main`. There is one issue with labels `enhancement`, `area:plugin` and `area:core`, and two PRs:
  core, then plugin stacked on core.

## Review Focus

1. **Deselecting every device** after a previous run. Expected: nothing is removed without
   `removeStale`, and the summary lists the modes as no longer selected. With `removeStale`, the
   collection's last mode can't be removed (Figma needs one), so it is kept and reported (Task 6).
2. **A designer renames a Dobra collection or variable.** Expected: the next run still finds it by
   key, and keeps the designer's name (Task 6).
3. **A profile whose layout rules never match a size class** (only an iOS rule, with Android selected).
   Expected: that class keeps the defaults. The description says "Platform default (the profile has
   no rule for this class)" (Task 3).
4. **An iOS target in the device collection.** Expected: pt values, `size-class/width` `compact` or
   `regular`, and hinge 0 unless the device has a fold (Task 4).
5. **A mode limit of 1** (the smallest plan). Expected:
   - the size-class collections split into one-mode parts;
   - the device collections split into one mode each;
   - the summary explains it;
   - nothing throws (Task 7).

---

### Task 0: Branch, issue and plan

- [ ] **Step 1:** The spec is committed on local branch `docs/figma-variables-spec` (`a34eb19`). Rename
  that branch to carry the core work:

```bash
git switch docs/figma-variables-spec
git branch -m feat/figma-variables-core
npm ci && npm test
git add docs/superpowers/plans/2026-09-27-figma-variables.md
git commit -m "Add the implementation plan for size classes and devices as Figma variables"
gh issue create --title "Figma variables for size classes and devices" --label enhancement --label area:plugin --label area:core \
  --body "Spec: docs/superpowers/specs/2026-09-27-figma-variables-design.md. The plugin writes Figma variable collections for size classes (Android and iOS) and for chosen devices/postures, with values from platform defaults or a loaded app profile, updates them safely on re-run, splits on plan mode limits, and Adapt switches their modes."
```
Expected: every workspace passes: core 302, cli 42, plugin 48, report 16, simulator 100. Note the issue
number as `#N`.

### Task 1: Platform layout defaults in the catalog

**Files:**
- Modify: `packages/core/src/config/schema.ts`:
  - add `layoutDefaults` to `catalogShape` (~line 424);
  - validate it in `checkCatalog`.
- Modify: `packages/core/src/catalog/catalog.json`:
  - add the `apple-hig` source;
  - add a `layoutDefaults` block.
- Test: `packages/core/src/catalog/layoutDefaults.test.ts` (new) and `packages/core/src/config/schema.test.ts`.

**Interfaces:**
- Produces: `Catalog['layoutDefaults']`, of the form
  `{ android: Record<AndroidWidthId, LayoutDefault>; ios: { compact: LayoutDefault; regular: LayoutDefault } }`.
  `LayoutDefault = { margin: number; gutter: number; columns: number; panes: number; source: string; estimated: string[] }`.
  `estimated` lists the fields that are estimated, for example `['columns', 'gutter']`.

- [ ] **Step 1: Failing tests** (`layoutDefaults.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './load';

const catalog = loadCatalog();

describe('layout defaults', () => {
  it('covers every Android width class and both iOS classes', () => {
    const android = catalog.platforms.android.sizeClasses.width.map((w: { id: string }) => w.id);
    expect(Object.keys(catalog.layoutDefaults.android).sort()).toEqual([...android].sort());
    expect(Object.keys(catalog.layoutDefaults.ios).sort()).toEqual(['compact', 'regular']);
  });

  it('uses Material 3 margins on Android and marks what the guidance does not publish', () => {
    const a = catalog.layoutDefaults.android;
    expect([a.compact.margin, a.medium.margin, a.expanded.margin]).toEqual([16, 24, 24]);
    expect(a.compact.source).toBe('material3');
    expect(a.compact.estimated).toEqual(expect.arrayContaining(['columns', 'gutter']));
    expect(catalog.layoutDefaults.ios.compact.source).toBe('apple-hig');
  });
});
```
In `schema.test.ts`, using the file's existing `clone` and `issuesOf`:
- deleting `layoutDefaults.android.medium` reports `layoutDefaults.android` with "Missing default for medium";
- a `margin` of `-1` reports the path `layoutDefaults.android.compact.margin`;
- an unknown `source` reports "Unknown source".

Run: `npx vitest run src/catalog/layoutDefaults.test.ts src/config/schema.test.ts` (in `packages/core`).
Expected: FAIL, because `layoutDefaults` is undefined.

- [ ] **Step 2: Schema.** Near the other catalog pieces in `schema.ts`:

```ts
const layoutDefault = z.strictObject({
  margin: nonNeg,
  gutter: nonNeg,
  columns: z.number().int().positive(),
  panes: z.number().int().positive(),
  source: sourceRef,
  /** Fields the source does not publish, for this class. */
  estimated: z.array(z.enum(['margin', 'gutter', 'columns', 'panes'])),
});
```
In `catalogShape`, after `requirements`:

```ts
  /** Page layout per size class when no app profile says otherwise (Material 3, Apple). */
  layoutDefaults: z.strictObject({
    android: z.record(z.string(), layoutDefault),
    ios: z.strictObject({ compact: layoutDefault, regular: layoutDefault }),
  }),
```
In `checkCatalog`:
- Every Android width id in `platforms.android.sizeClasses.width` must have a default:
  `issue(['layoutDefaults', 'android'], \`Missing default for ${id}\`)`.
- Every key must be a width id: `issue(['layoutDefaults', 'android', key], \`Unknown width class ${key}\`)`.
- Run `checkSource` on every `source`.

- [ ] **Step 3: Data.** Add to `sources`:
`"apple-hig": "Apple Human Interface Guidelines, Layout (developer.apple.com/design/human-interface-guidelines/layout) and UIKit system layout margins"`.

Add `layoutDefaults`, but first verify every non-estimated value against its source page, and move any
value you cannot confirm into `estimated`. Material 3 publishes margins and pane counts per window size
class on m3.material.io/foundations/layout/applying-layout. It does not publish a column grid or
gutters.

```json
"layoutDefaults": {
  "$comment": "Page layout per size class when no app profile says otherwise. Material 3 publishes margins and pane counts; columns and gutters come from the earlier Material grid (estimated). Apple publishes no numbers for these: iOS values follow UIKit's system margins (estimated).",
  "android": {
    "compact":    { "margin": 16, "gutter": 16, "columns": 4,  "panes": 1, "source": "material3", "estimated": ["columns", "gutter"] },
    "medium":     { "margin": 24, "gutter": 16, "columns": 8,  "panes": 1, "source": "material3", "estimated": ["columns", "gutter"] },
    "expanded":   { "margin": 24, "gutter": 24, "columns": 12, "panes": 2, "source": "material3", "estimated": ["columns", "gutter"] },
    "large":      { "margin": 24, "gutter": 24, "columns": 12, "panes": 2, "source": "material3", "estimated": ["columns", "gutter"] },
    "extraLarge": { "margin": 24, "gutter": 24, "columns": 12, "panes": 2, "source": "material3", "estimated": ["columns", "gutter", "panes"] }
  },
  "ios": {
    "compact": { "margin": 16, "gutter": 16, "columns": 4, "panes": 1, "source": "apple-hig", "estimated": ["margin", "gutter", "columns", "panes"] },
    "regular": { "margin": 20, "gutter": 20, "columns": 8, "panes": 2, "source": "apple-hig", "estimated": ["margin", "gutter", "columns", "panes"] }
  }
}
```
If the schema's strictness rejects `$comment`, check how other catalog blocks allow `$comment` (for
example `z.strictObject` with `$comment: z.string().optional()`) and do the same. Record the choice in
the ledger.

- [ ] **Step 4:** Run `npm test -w @dobra/core && npm run typecheck`. Expected: PASS. The simulator, CLI
  and plugin still build, because they don't read the new block.
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/src/config/schema.test.ts packages/core/src/catalog/catalog.json packages/core/src/catalog/layoutDefaults.test.ts
git commit -m "Add platform layout defaults per size class to the catalog"
```

### Task 2: Compose a profile without bundling the sample

**Files:**
- Create: `packages/core/src/config/compose.ts`
- Modify: `packages/core/src/config/load.ts`:
  - `composeConfig` moves into `compose.ts`;
  - `load.ts` imports it from there and re-exports it.
- Test: `packages/core/src/config/compose.test.ts`

**Interfaces:**
- Produces: `composeConfig(catalog: unknown, profile: unknown): SimulatorConfig`. It has the same
  behaviour and errors as today, exported from `@dobra/core/config/compose`. That module imports no
  JSON.

- [ ] **Step 1: Failing test**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import catalogJson from '../catalog/catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { composeConfig } from './compose';

describe('composeConfig', () => {
  it('composes the catalog with a profile passed in', () => {
    expect(composeConfig(catalogJson, profileJson).layoutRules.length).toBeGreaterThan(0);
  });

  it('does not import the sample profile itself', () => {
    const src = readFileSync(fileURLToPath(new URL('./compose.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/sample\.profile|\.json['"]/);
  });
});
```
Run → FAIL (the module is missing).

- [ ] **Step 2:** Move `composeConfig` (the body from `load.ts` lines ~9-23) into `compose.ts`, which
  imports only from `./schema`. In `load.ts`, write
  `import { composeConfig } from './compose'; export { composeConfig };` and keep `rawConfig` and
  `loadConfig` as they are.
- [ ] **Step 3:** Run `npm test -w @dobra/core && npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/config/compose.ts packages/core/src/config/compose.test.ts packages/core/src/config/load.ts
git commit -m "Compose a catalog and profile without importing the sample profile"
```

### Task 3: Size-class variables

**Files:**
- Create: `packages/core/src/variables.ts` and `packages/core/src/variables.test.ts`

**Interfaces:**
- Consumes: `Catalog['layoutDefaults']` (Task 1); `SimulatorConfig` (a profile composed by Task 2);
  `resolveEnvironment` and `ruleMatches`.
- Produces:

```ts
export type VarType = 'FLOAT' | 'BOOLEAN' | 'STRING';
export type VarValue = number | boolean | string;
export interface SpecVariable { key: string; name: string; type: VarType; scopes: string[]; description: string; values: Record<string, VarValue> }
export interface SpecMode { key: string; name: string }
export interface SpecCollection { key: string; name: string; category?: string; modes: SpecMode[]; variables: SpecVariable[] }
export interface VariableSpec { collections: SpecCollection[] }
export interface VariableOptions { profile?: SimulatorConfig; profileName?: string; platforms: ('android' | 'ios')[]; targets: Target[] }
export function variableSpec(catalog: Catalog, opts: VariableOptions): VariableSpec;
```
- Collection keys are `size-classes/android`, `size-classes/ios` and `devices`. Mode keys are the
  size-class ids (`compact`, `extraLarge`). A variable key is its name (`layout/margin`). A variable
  that applies to only some modes still has a value for every mode, because Figma requires one.
- A variable's `category` lists the device categories of its modes, and is used for splitting
  (Task 7). Size-class collections have no category.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import catalogJson from './catalog/catalog.json';
import profileJson from './profiles/sample.profile.json';
import { loadCatalog } from './catalog/load';
import { composeConfig } from './config/compose';
import { variableSpec } from './variables';

const catalog = loadCatalog();
const profile = composeConfig(catalogJson, profileJson);
const col = (spec: ReturnType<typeof variableSpec>, key: string) => spec.collections.find((c) => c.key === key)!;
const val = (c: ReturnType<typeof col>, name: string, mode: string) => c.variables.find((v) => v.name === name)!.values[mode];

describe('size-class variables', () => {
  it('makes one collection per chosen platform with modes named after the size classes', () => {
    const spec = variableSpec(catalog, { platforms: ['android', 'ios'], targets: [] });
    expect(col(spec, 'size-classes/android')).toMatchObject({ name: 'Dobra · Size classes · Android' });
    expect(col(spec, 'size-classes/android').modes.map((m) => m.name)).toEqual(['Compact', 'Medium', 'Expanded', 'Large', 'ExtraLarge']);
    expect(col(spec, 'size-classes/ios').modes.map((m) => m.name)).toEqual(['Compact', 'Regular']);
    expect(variableSpec(catalog, { platforms: ['ios'], targets: [] }).collections.map((c) => c.key)).toEqual(['size-classes/ios']);
  });

  it('uses the platform defaults and says where they came from', () => {
    const a = col(variableSpec(catalog, { platforms: ['android'], targets: [] }), 'size-classes/android');
    expect(val(a, 'layout/margin', 'compact')).toBe(16);
    expect(val(a, 'layout/columns', 'expanded')).toBe(12);
    expect(val(a, 'breakpoint/min-width', 'medium')).toBe(600);
    expect(val(a, 'breakpoint/max-width', 'medium')).toBe(840);
    expect(val(a, 'breakpoint/max-width', 'extraLarge')).toBe(0);
    const columns = a.variables.find((v) => v.name === 'layout/columns')!;
    expect(columns.description).toMatch(/Material 3.*\(estimated\)/);
    expect(a.variables.find((v) => v.name === 'layout/margin')!.scopes).toEqual(['GAP']);
  });

  it('takes a loaded profile per class and keeps defaults where it has no rule', () => {
    const a = col(variableSpec(catalog, { profile, profileName: 'Sample', platforms: ['android'], targets: [] }), 'size-classes/android');
    const rule = profile.layoutRules.find((r) => r.id === 'android-expanded')!;
    expect(val(a, 'layout/columns', 'expanded')).toBe(rule.grid.columns);
    expect(val(a, 'layout/margin', 'expanded')).toBe(rule.pageMargin.base);
    expect(a.variables.find((v) => v.name === 'layout/columns')!.description).toMatch(/Profile: Sample/);
  });

  it('keeps the defaults for a class the profile cannot match', () => {
    const iosOnly = { ...profile, layoutRules: profile.layoutRules.filter((r) => r.platform === 'ios') };
    const a = col(variableSpec(catalog, { profile: iosOnly, profileName: 'iOS only', platforms: ['android'], targets: [] }), 'size-classes/android');
    expect(val(a, 'layout/margin', 'compact')).toBe(16);
    expect(a.variables.find((v) => v.name === 'layout/margin')!.description).toMatch(/Platform default \(the profile has no rule for this class\)/);
  });
});
```
Run: `npx vitest run src/variables.test.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 2: Implement** the size-class part of `variables.ts`:

```ts
// The Figma variables Dobra writes, as plain data (spec §3). The plugin applies them; nothing here
// knows Figma. Keys are stable across runs so an update finds what an earlier run wrote.
import type { Catalog, SimulatorConfig } from './config/schema';
import { resolveEnvironment } from './engine/environment';
import { matchRuleOrNull } from './engine/layout';
import { envConfigOf, type Target } from './targets';

const PLATFORM_LABEL = { android: 'Android', ios: 'iOS' } as const;
const capital = (id: string) => id[0].toUpperCase() + id.slice(1);
/** A window that sits in each class, for matching profile rules: the class's lower bound, regular height. */
const REPRESENTATIVE = { android: { compact: 360, medium: 600, expanded: 840, large: 1200, extraLarge: 1600 }, ios: { compact: 390, regular: 820 } } as const;
```
Implementation details:
- **Mode keys:** Android takes them from `catalog.platforms.android.sizeClasses.width` ids, in order.
  iOS uses `['compact', 'regular']`.
- **Breakpoints:** `min-width` is each Android width id's lower bound, and `max-width` the next class's
  lower bound, or 0 for the last. iOS uses `catalog.platforms.ios.sizeClasses.free.regularWidthMin`:
  compact is 0 to that minimum, regular is that minimum to 0.
- **Profile values:**
  - Build `resolveEnvironment(opts.profile, { deviceId: <first device of the platform>, displayId: '', orientation: 'portrait', free: { width: REPRESENTATIVE[p][id], height: 900 }, freePlatform: p })`.
  - Take `matchRuleOrNull(opts.profile, env)`. Add it to `engine/layout.ts` as
    `config.layoutRules.find((r) => ruleMatches(r, env)) ?? null`, and have `matchRule` call it.
  - A rule found gives `margin = rule.pageMargin.base`, `gutter = rule.grid.gutter`,
    `columns = rule.grid.columns` and `panes = rule.panes`.
  - No rule means the class uses the defaults, and the description says
    "Platform default (the profile has no rule for this class)".
- **Descriptions:**
  - from the defaults: `${sourceLabel} (estimated)` when the field is in `estimated`, else `sourceLabel`.
    `sourceLabel` is the catalog's `sources[source]` text up to its first `:` or `(`, for example
    "Material 3 adaptive guidance and component specs".
  - from a profile: `Profile: ${opts.profileName ?? 'app profile'} (rule ${rule.id})`.
  - Every mode shares one description string, so when modes differ, join the distinct ones with `; `.
- **Scopes:** `layout/margin` and `layout/gutter` get `['GAP']`; `layout/columns` and `layout/panes`
  get `['ALL_SCOPES']`; the breakpoints get `['WIDTH_HEIGHT']`.

- [ ] **Step 3:** Run `npx vitest run src/variables.test.ts && npx tsc --noEmit`, then `npm test -w @dobra/core`.
  Expected: PASS. Existing layout tests stay green after the `matchRuleOrNull` extraction.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/variables.ts packages/core/src/variables.test.ts packages/core/src/engine/layout.ts
git commit -m "Describe size-class variables from platform defaults or a profile"
```

### Task 4: Device variables

**Files:**
- Modify: `packages/core/src/variables.ts` and `packages/core/src/variables.test.ts`

**Interfaces:**
- Consumes: `resolveTarget` and `targetKey`; `presetSpec(config, t).name` for mode names (the preset
  name without its `Screen / ` prefix); `Environment.media` and `env.safeArea`; `env.folds`.
- Produces: the `devices` collection. Its mode keys are `targetKey(t)`, and each mode stores
  `category` (the device category) in a parallel `modeCategory: Record<string, string>` on
  `SpecCollection`. Add that optional field to the interface.

- [ ] **Step 1: Failing tests** (append to `variables.test.ts`):

```ts
import { envConfigOf, resolveTarget, targetKey } from './targets';

const env = envConfigOf(catalog);
const DUO = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;
const PIXEL = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' } as const;
const IPHONE = { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait' } as const;

describe('device variables', () => {
  const spec = variableSpec(catalog, { platforms: [], targets: [DUO, PIXEL, IPHONE] });
  const d = col(spec, 'devices');

  it('has one mode per target, keyed by target key', () => {
    expect(d.name).toBe('Dobra · Devices');
    expect(d.modes.map((m) => m.key)).toEqual([DUO, PIXEL, IPHONE].map(targetKey));
    expect(d.modes[0].name).toMatch(/Surface Duo 2/);
    expect(d.modeCategory?.[targetKey(DUO)]).toBe('dual-screen');
  });

  it('matches the resolved window, safe area and hinge', () => {
    const e = resolveTarget(env, DUO);
    const k = targetKey(DUO);
    expect(val(d, 'window/width', k)).toBe(e.width);
    expect(val(d, 'safe-area/top', k)).toBe(e.safeArea.top);
    const fold = e.folds.find((f) => f.separating || f.occludes)!;
    expect(val(d, 'hinge/present', k)).toBe(true);
    expect(val(d, 'hinge/x', k)).toBe(fold.rect.x);
    expect(val(d, 'hinge/width', k)).toBe(fold.rect.width);
  });

  it('gives a phone no hinge and zero positions', () => {
    const k = targetKey(PIXEL);
    expect(val(d, 'hinge/present', k)).toBe(false);
    expect([val(d, 'hinge/x', k), val(d, 'hinge/width', k)]).toEqual([0, 0]);
  });

  it('names the size class and media facts, iOS included', () => {
    expect(val(d, 'size-class/width', targetKey(PIXEL))).toBe('compact');
    expect(val(d, 'size-class/width', targetKey(IPHONE))).toBe('compact');
    expect(val(d, 'media/pointer', targetKey(PIXEL))).toBe('coarse');
  });

  it('resolves layout for the exact target, profile or default', () => {
    const k = targetKey(DUO);
    const withProfile = col(variableSpec(catalog, { profile, platforms: [], targets: [DUO] }), 'devices');
    expect(val(withProfile, 'layout/columns', k)).toBeGreaterThan(0);
    expect(val(d, 'layout/margin', k)).toBeGreaterThanOrEqual(24);
  });

  it('keeps keys stable across runs', () => {
    expect(JSON.stringify(variableSpec(catalog, { platforms: ['android'], targets: [DUO] }))).toBe(JSON.stringify(variableSpec(catalog, { platforms: ['android'], targets: [DUO] })));
  });
});
```
Run → FAIL (there is no `devices` collection).

- [ ] **Step 2: Implement.**
- Build the `devices` collection only when `targets.length > 0`, using `const config = opts.profile ?? envConfigOf(catalog)`.
- For each target:
  - resolve it with `const e = resolveTarget(config, t)`;
  - take the first fold that separates or occludes: `const fold = e.folds.find((f) => f.separating || f.occludes)`;
  - the width class is `e.sizeClass.system === 'window' ? e.sizeClass.width : e.sizeClass.horizontal`,
    and the height class is `e.sizeClass.system === 'window' ? e.sizeClass.height : e.sizeClass.vertical`.
- **Layout:**
  - with a profile, the rule is `matchRuleOrNull(opts.profile, e)` and gives `base`, `mode`,
    `gutter`, `columns` and `panes`;
  - otherwise use `catalog.layoutDefaults[e.platform][widthClass]` with `mode: 'max'`;
  - then `inset = Math.max(e.safeArea.left, e.safeArea.right)` and
    `margin = mode === 'max' ? Math.max(base, inset) : inset + base`.
- **Values:**
  - `window/*` come from `e.width` and `e.height`; `safe-area/*` from `e.safeArea`;
  - `hinge/present` is `!!fold` and `hinge/separating` is `!!fold?.separating`;
  - `hinge/x`, `y`, `width` and `height` are `fold?.rect.*` or 0;
  - `media/*` come from `e.media.pointer`, `e.media.keyboard` and `e.media.viewingDistance`.
- **Descriptions:**
  - device values: "Dobra catalog (resolveTarget)", with " (estimated)" when `e.estimated` for window
    and safe area, or `fold.estimated` for the hinge;
  - layout: as in Task 3.
- **Scopes:**
  - numbers get `['WIDTH_HEIGHT']` for window and hinge, and `['GAP']` for safe area, margin and
    gutter;
  - booleans get `['ALL_SCOPES']`;
  - strings get `['TEXT_CONTENT']`.
- **Mode names:** `presetSpec(config, t).name.replace(/^Screen \/ /, '')` with ` / ` replaced by ` · `.
  Check the real preset name format first, and ledger it.

- [ ] **Step 3:** Run `npm test -w @dobra/core && npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit and open PR 1**

```bash
git add packages/core/src/variables.ts packages/core/src/variables.test.ts
git commit -m "Describe device variables: window, safe area, hinge, layout, size class and media"
git push -u origin feat/figma-variables-core
gh pr create --base main --head feat/figma-variables-core --title "Core: platform layout defaults and the Figma variables description" --label enhancement --label area:core --body "Part of #N (core half). Adds layoutDefaults to the catalog, composeConfig without the sample profile, and variableSpec() for size-class and device collections. Test plan: counts, typecheck, builds."
```

### Task 5: FakeFigma variables

**Files:**
- Modify: `packages/figma-plugin/src/api.ts`: add `'commitUndo' | 'editorType'` to the `FigmaApi` pick.
- Modify: `packages/figma-plugin/src/test/fakeFigma.ts`
- Test: `packages/figma-plugin/src/test/fakeFigma.test.ts` (new)

Start a new branch first:
`git switch -c feat/figma-variables-plugin feat/figma-variables-core`.

**Interfaces:**
- Produces, on the fake:
  - `api.variables.createVariableCollection(name)` gives a `FakeVariableCollection`, which has:
    - `id`, `name`, `modes` and `defaultModeId`;
    - `addMode(name)` returning a modeId, which throws `new Error('in addMode: Limited to ${limit} modes only')`
      when `modes.length >= api.modeLimit`;
    - `renameMode`, `removeMode` (it throws when only one mode is left), `variableIds` and `remove()`;
    - `setSharedPluginData` and `getSharedPluginData`.
  - `api.variables.createVariable(name, collection, type)` gives a `FakeVariable`, which has:
    - `id`, `name`, `resolvedType`, `scopes`, `description` and `valuesByMode`;
    - `setValueForMode(modeId, value)`, `remove()` and the shared plugin data methods.
  - `api.variables.getLocalVariableCollectionsAsync()` and `getVariableByIdAsync(id)`.
  - `api.modeLimit`: a number, default 40, that tests change.
  - `api.readOnly`: when true, `createVariableCollection` throws `new Error('Cannot write in read-only mode')`.
  - `api.commitUndo()` counts calls in `api.undoCommits`. `api.editorType` defaults to `'figma'`.
  - A new collection starts with one mode, `Mode 1`, as Figma's do.
- The existing `api.collections` stays: the variable collections are the same array, and existing
  Adapt tests that push plain `{ id, name, modes }` keep working.

- [ ] **Step 1: Failing test** (`fakeFigma.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { createFakeFigma } from './fakeFigma';

describe('fake variables', () => {
  it('creates collections with a first mode, adds modes up to the limit and stores values', async () => {
    const api = createFakeFigma();
    api.modeLimit = 2;
    const c = api.variables.createVariableCollection('X');
    expect(c.modes.map((m) => m.name)).toEqual(['Mode 1']);
    const m2 = c.addMode('B');
    expect(() => c.addMode('C')).toThrow(/Limited to 2 modes/);
    const v = api.variables.createVariable('a', c, 'FLOAT');
    v.setValueForMode(m2, 5);
    expect((await api.variables.getVariableByIdAsync(v.id))!.valuesByMode[m2]).toBe(5);
    expect(await api.variables.getLocalVariableCollectionsAsync()).toContain(c);
  });
});
```
Run: `npx vitest run src/test/fakeFigma.test.ts` (in `packages/figma-plugin`). Expected: FAIL.

- [ ] **Step 2: Implement** the fake per the Interfaces block. Keep ids sequential (`vc1`, `v1`, `m1`),
  and store plugin data in a `Map` keyed `namespace:key`, as nodes already do.
- [ ] **Step 3:** Run `npm test -w @dobra/figma-plugin && npm run typecheck -w @dobra/figma-plugin`.
  Expected: PASS, with the existing Adapt tests unchanged.
- [ ] **Step 4: Commit**

```bash
git add packages/figma-plugin/src/api.ts packages/figma-plugin/src/test/fakeFigma.ts packages/figma-plugin/src/test/fakeFigma.test.ts
git commit -m "Give the fake Figma variable collections, variables and a mode limit"
```

### Task 6: Apply variables: create, update, keep edits, remove stale

**Files:**
- Create: `packages/figma-plugin/src/variables.ts` and `packages/figma-plugin/src/variables.test.ts`

**Interfaces:**
- Consumes: `VariableSpec` (Task 3 and 4); the fake (Task 5); `NAMESPACE` from `./presets`.
- Produces:

```ts
export interface VariablesOptions { overwrite: boolean; removeStale: boolean }
export interface CollectionSummary { key: string; name: string; modes: number; variables: number; created: number; updated: number; keptEdits: { variable: string; mode: string; dobra: VarValue; current: VarValue }[]; stale: string[]; removed: string[]; orphanVariables: string[] }
export interface VariablesSummary { collections: CollectionSummary[]; warnings: string[]; errors: { collection: string; message: string }[] }
export async function applyVariables(api: FigmaApi, spec: VariableSpec, opts: VariablesOptions): Promise<VariablesSummary>;
```
- **Plugin data** (namespace `NAMESPACE`):
  - collection: `var-collection` = collection key, and `var-modes` = JSON `{ [modeKey]: modeId }`;
  - variable: `var-key` = variable key, and `var-written` = JSON `{ [modeKey]: value }`.

- [ ] **Step 1: Failing tests** (`variables.test.ts`). Use a small hand-written `VariableSpec`, with
  one collection, two modes and two variables, so the tests don't depend on the catalog:

```ts
import { describe, expect, it } from 'vitest';
import type { VariableSpec } from '@dobra/core/variables';
import { createFakeFigma } from './test/fakeFigma';
import { applyVariables } from './variables';

const spec = (margin = 16): VariableSpec => ({
  collections: [{
    key: 'size-classes/android', name: 'Dobra · Size classes · Android',
    modes: [{ key: 'compact', name: 'Compact' }, { key: 'medium', name: 'Medium' }],
    variables: [
      { key: 'layout/margin', name: 'layout/margin', type: 'FLOAT', scopes: ['GAP'], description: 'Material 3', values: { compact: margin, medium: 24 } },
      { key: 'layout/columns', name: 'layout/columns', type: 'FLOAT', scopes: ['ALL_SCOPES'], description: 'Material 3 (estimated)', values: { compact: 4, medium: 8 } },
    ],
  }],
});
const OFF = { overwrite: false, removeStale: false };

describe('applyVariables', () => {
  it('creates the collection, renames the first mode and writes every value', async () => {
    const api = createFakeFigma();
    const s = await applyVariables(api, spec(), OFF);
    const [c] = await api.variables.getLocalVariableCollectionsAsync();
    expect(c.name).toBe('Dobra · Size classes · Android');
    expect(c.modes.map((m) => m.name)).toEqual(['Compact', 'Medium']);
    expect(s.collections[0]).toMatchObject({ modes: 2, variables: 2, created: 2, updated: 0 });
  });

  it('changes nothing on an unchanged second run', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    expect((await applyVariables(api, spec(), OFF)).collections[0]).toMatchObject({ created: 0, updated: 0, removed: [] });
  });

  it('updates a value the catalog changed', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(16), OFF);
    expect((await applyVariables(api, spec(20), OFF)).collections[0].updated).toBe(1);
  });

  it('keeps a value the designer edited, unless told to overwrite', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(16), OFF);
    const [c] = await api.variables.getLocalVariableCollectionsAsync();
    const margin = (await Promise.all(c.variableIds.map((id) => api.variables.getVariableByIdAsync(id)))).find((v) => v!.name === 'layout/margin')!;
    margin.setValueForMode(c.modes[0].modeId, 12);
    const kept = await applyVariables(api, spec(20), OFF);
    expect(kept.collections[0].keptEdits).toEqual([{ variable: 'layout/margin', mode: 'Compact', dobra: 20, current: 12 }]);
    expect(margin.valuesByMode[c.modes[0].modeId]).toBe(12);
    await applyVariables(api, spec(20), { overwrite: true, removeStale: false });
    expect(margin.valuesByMode[c.modes[0].modeId]).toBe(20);
  });

  it('finds renamed collections and variables by key and keeps the new names', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    const [c] = await api.variables.getLocalVariableCollectionsAsync();
    c.name = 'My layout';
    const s = await applyVariables(api, spec(), OFF);
    expect((await api.variables.getLocalVariableCollectionsAsync()).length).toBe(1);
    expect(c.name).toBe('My layout');
    expect(s.collections[0].created).toBe(0);
  });

  it('keeps modes no longer selected unless told to remove them, and never removes the last mode', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    const fewer: VariableSpec = { collections: [{ ...spec().collections[0], modes: [{ key: 'compact', name: 'Compact' }] }] };
    expect((await applyVariables(api, fewer, OFF)).collections[0].stale).toEqual(['Medium']);
    expect((await applyVariables(api, fewer, { overwrite: false, removeStale: true })).collections[0].removed).toEqual(['Medium']);
    const none: VariableSpec = { collections: [{ ...spec().collections[0], modes: [] }] };
    const s = await applyVariables(api, none, { overwrite: false, removeStale: true });
    expect(s.collections[0].removed).toEqual([]);
    expect(s.warnings.join('\n')).toMatch(/needs at least one mode/);
  });

  it('lists variables Dobra no longer writes without deleting them', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    const one: VariableSpec = { collections: [{ ...spec().collections[0], variables: [spec().collections[0].variables[0]] }] };
    const s = await applyVariables(api, one, OFF);
    expect(s.collections[0].orphanVariables).toEqual(['layout/columns']);
  });
});
```
Run: `npx vitest run src/variables.test.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 2: Implement `applyVariables`** in this order:
1. Read the local collections, and index the ones with `var-collection` by key.
2. For each spec collection, find it by key or create it with its name. A new collection's first mode
   is renamed to the first spec mode.
3. Read `var-modes`. For each spec mode that is missing, `addMode`. For each stored mode that isn't in
   the spec:
   - add it to `stale`;
   - if `removeStale` and the collection keeps at least one mode, `removeMode` it and add it to
     `removed`;
   - otherwise, when every mode would go, warn
     `"<collection> needs at least one mode; kept <mode>"`.
4. Write `var-modes` back.
5. Index the collection's variables by `var-key`. Create the missing ones with type, scopes and
   description. For existing ones, update scopes and description, and never rename them.
6. For each value:
   - `written = var-written[mode]` and `current = valuesByMode[modeId]`;
   - when the variable is new, or `current === written`, or `overwrite` is on, set it if it differs,
     and count it as updated when it existed;
   - otherwise, when `current !== written`, the designer edited it: add it to `keptEdits` and don't
     set it.
   - Then store `var-written[mode] = spec value`, but only when it was written.
7. Variables with `var-key` that the spec doesn't contain go to `orphanVariables`.

`created` counts variables created (collections count as created when new). `updated` counts
variables whose values changed.

- [ ] **Step 3:** Run `npx vitest run src/variables.test.ts && npm run typecheck -w @dobra/figma-plugin`.
  Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/figma-plugin/src/variables.ts packages/figma-plugin/src/variables.test.ts
git commit -m "Write Dobra variables to the file, keeping designer edits and stale modes"
```

### Task 7: Mode limits, name clashes, read-only files and one undo step

**Files:**
- Modify: `packages/figma-plugin/src/variables.ts` and `packages/figma-plugin/src/variables.test.ts`

**Interfaces:**
- Consumes: `SpecCollection.modeCategory` (Task 4); fake `modeLimit`, `readOnly`, `editorType`,
  `commitUndo` (Task 5).
- Split collection keys:
  - `devices/<category>` named `Dobra · Devices · <Category label>`;
  - `devices/<category>/<n>` named `… <n>`, and `<key>/<n>` for size-class parts.
- Category labels come from the category id, dashes becoming spaces and the first letter capitalised:
  `foldable-book` becomes `Foldable book`.

- [ ] **Step 1: Failing tests** (append):

```ts
const devices = (n: number, categories: string[]): VariableSpec => ({
  collections: [{
    key: 'devices', name: 'Dobra · Devices',
    modes: Array.from({ length: n }, (_, i) => ({ key: `t${i}`, name: `Target ${i}` })),
    modeCategory: Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, categories[i % categories.length]])),
    variables: [{ key: 'window/width', name: 'window/width', type: 'FLOAT', scopes: ['WIDTH_HEIGHT'], description: 'Dobra catalog', values: Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, 300 + i])) }],
  }],
});

describe('limits and errors', () => {
  it('splits devices by category, then into numbered parts, and explains it', async () => {
    const api = createFakeFigma();
    api.modeLimit = 4;
    const s = await applyVariables(api, devices(10, ['foldable-book', 'foldable-flip']), OFF);
    const names = (await api.variables.getLocalVariableCollectionsAsync()).map((c) => c.name).sort();
    expect(names).toEqual(['Dobra · Devices · Foldable book', 'Dobra · Devices · Foldable book 2', 'Dobra · Devices · Foldable flip', 'Dobra · Devices · Foldable flip 2']);
    expect(s.warnings.join('\n')).toMatch(/Limited to 4 modes/);
  });

  it('survives a limit of one mode', async () => {
    const api = createFakeFigma();
    api.modeLimit = 1;
    const s = await applyVariables(api, { collections: [...spec().collections, ...devices(2, ['phone']).collections] }, OFF);
    expect(s.errors).toEqual([]);
    expect((await api.variables.getLocalVariableCollectionsAsync()).every((c) => c.modes.length === 1)).toBe(true);
  });

  it('leaves a collection it did not create alone and makes its own next to it', async () => {
    const api = createFakeFigma();
    api.variables.createVariableCollection('Dobra · Size classes · Android');
    const s = await applyVariables(api, spec(), OFF);
    expect((await api.variables.getLocalVariableCollectionsAsync()).map((c) => c.name)).toContain('Dobra · Size classes · Android (Dobra)');
    expect(s.warnings.join('\n')).toMatch(/already has a collection/);
  });

  it('writes nothing without edit access', async () => {
    const api = createFakeFigma();
    api.editorType = 'dev';
    const s = await applyVariables(api, spec(), OFF);
    expect(s.errors[0].message).toBe('You need edit access to create variables');
    expect(await api.variables.getLocalVariableCollectionsAsync()).toEqual([]);
  });

  it('keeps writing other collections when one fails, and commits one undo step', async () => {
    const api = createFakeFigma();
    const broken: VariableSpec = { collections: [{ ...spec().collections[0], key: 'bad', variables: [{ ...spec().collections[0].variables[0], type: 'BROKEN' as never }] }, spec().collections[0]] };
    const s = await applyVariables(api, broken, OFF);
    expect(s.errors.map((e) => e.collection)).toEqual(['bad']);
    expect(s.collections.map((c) => c.key)).toContain('size-classes/android');
    expect(api.undoCommits).toBe(1);
  });
});
```
To make the broken case throw, make the fake's `createVariable` throw on an unknown type:
`new Error('Unknown variable type')`. Add that to Task 5's fake if it isn't there, and ledger it.
Run → FAIL.

- [ ] **Step 2: Implement.**
- **Edit access:** `if (api.editorType === 'dev')`, return `{ collections: [], warnings: [], errors: [{ collection: '*', message: 'You need edit access to create variables' }] }`.
  Also catch a first `createVariableCollection` failure and return that message.
- **Per collection:** wrap each collection's apply in `try/catch`, pushing to `errors` with the
  collection key. Call `api.commitUndo()` once at the end, whatever happened.
- **Name clash:** an existing collection with the spec name and no `var-collection` data gets a
  warning `'The file already has a collection named "<name>"; Dobra wrote "<name> (Dobra)"'`. Use
  `<name> (Dobra)`.
- **Limit:**
  - Wrap `addMode`. On failure, when the collection already has at least one mode, treat it as the
    limit: `limit = collection.modes.length`, and keep Figma's message.
  - Then remove the partially filled collection, but only if this run created it. Otherwise keep it
    and use its current modes as part 1.
  - **Device split:** a collection with `modeCategory` is split into one spec collection per category,
    with the same variables and values filtered to that category's modes. A category with more modes
    than the limit is split into chunks of `limit`, part 1 unnumbered and later parts numbered from 2.
  - **Size-class split:** only numbered chunks.
  - Apply the resulting specs recursively, and warn once:
    `'<name>: <Figma message>; split into <n> collections'`.
- A later run finds the split collections by their split keys. The device list then goes straight to
  the split form when any `devices/<category>` collection exists.

- [ ] **Step 3:** Run `npm test -w @dobra/figma-plugin && npm run typecheck -w @dobra/figma-plugin`.
  Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/figma-plugin/src/variables.ts packages/figma-plugin/src/variables.test.ts packages/figma-plugin/src/test/fakeFigma.ts
git commit -m "Split collections at the plan's mode limit and handle clashes, read-only files and failures"
```

### Task 8: The variables command, the menu entry and Adapt's device mode

**Files:**
- Modify:
  - `packages/figma-plugin/src/messages.ts`;
  - `packages/figma-plugin/src/handlers.ts`;
  - `packages/figma-plugin/src/route.ts`;
  - `packages/figma-plugin/manifest.json`;
  - `packages/figma-plugin/src/manifest.test.ts`;
  - `packages/figma-plugin/src/adapt.ts`.
- Test: `packages/figma-plugin/src/handlers.test.ts`, `packages/figma-plugin/src/route.test.ts`,
  `packages/figma-plugin/src/adapt.test.ts`

**Interfaces:**
- `ToMain` gains `{ type: 'variables'; platforms: ('android' | 'ios')[]; keys: string[]; profile: string | null; overwrite: boolean; removeStale: boolean }`
  and `{ type: 'variables-status' }`.
- `ToUi` gains `{ type: 'variables-done'; summary: VariablesSummary; source: string }` and
  `{ type: 'variables-status'; exists: boolean }`.
- `Command` gains `'variables'`.
- The menu gains `{ "name": "Variables", "command": "variables" }` after Adapt.
- `OPENING.variables` is `{ type: 'list-targets' }`. The panel sends `variables-status` itself once
  targets arrive.

- [ ] **Step 1: Failing tests:**
- **`manifest.test.ts`:** the command list is `['presets', 'tag', 'coverage', 'check', 'adapt', 'variables']`.
- **`route.test.ts`:** `commandOf('variables')` is `'variables'`.
- **`handlers.test.ts`:**
  - `{ type: 'variables', platforms: ['android'], keys: ['surface-duo-2/spanned/spanned/landscape'], profile: null, overwrite: false, removeStale: false }`
    gives `variables-done`, with collections `size-classes/android` and `devices`, and
    `source: 'Platform defaults'`;
  - with `profile: JSON.stringify(sampleProfileJson)` (import the JSON in the test only), `source`
    starts with `'Profile'`;
  - with `profile: '{"layoutRules": 3}'`, the reply is an `error` whose message contains `layoutRules`;
  - an unknown key gives an `error` naming the key;
  - `variables-status` answers `exists: false`, then `true` after a run.
- **`adapt.test.ts`:** after applying the variables for the Duo target, adapting a frame to that target
  sets the device collection's Duo mode on the frame (`frame.explicitModes[collection.id] === modeId`).
  Keep the existing size-class mode test green.

Run → FAIL.

- [ ] **Step 2: Implement.**
- **Handler `variables`:**
  - Parse the keys as `create-presets` does.
  - When `msg.profile` is set, `profile = composeConfig(catalogJson, JSON.parse(msg.profile))`, with
    `catalogJson` imported from `@dobra/core/catalog/catalog.json` and `composeConfig` from
    `@dobra/core/config/compose` (Task 2). A `ConfigError` becomes an `error` with its
    `message`/paths, and a `SyntaxError` becomes `"That is not JSON: <message>"`.
  - `profileName` is the profile's `$comment` up to 40 chars, else `'app profile'`.
  - Call `applyVariables(api, variableSpec(catalog, {...}), {...})`.
  - `source` is `profile ? \`Profile: ${profileName}\` : 'Platform defaults'`.
- **Handler `variables-status`:** `exists` is true when any local collection has `var-collection`.
- **`adaptFrame`:** after the size-class loop, for each local collection whose `var-collection`
  starts with `devices`, read `var-modes`. When it has `targetKey(target)`, call
  `frame.setExplicitVariableModeForCollection(collection, modeId)`.
- **Route and manifest:** as in the Interfaces block.

- [ ] **Step 3:** Run `npm run build -w @dobra/figma-plugin && npm test -w @dobra/figma-plugin && npm run typecheck`.
  Expected: PASS. `bundle.test.ts` must still show no sample profile in `dist/code.js`. If it fails,
  the handler imported `config/load` instead of `config/compose`.
- [ ] **Step 4: Commit**

```bash
git add packages/figma-plugin/src/messages.ts packages/figma-plugin/src/handlers.ts packages/figma-plugin/src/handlers.test.ts packages/figma-plugin/src/route.ts packages/figma-plugin/src/route.test.ts packages/figma-plugin/manifest.json packages/figma-plugin/src/manifest.test.ts packages/figma-plugin/src/adapt.ts packages/figma-plugin/src/adapt.test.ts
git commit -m "Add the variables command and let Adapt switch the device mode"
```

### Task 9: The Variables tab

**Files:**
- Modify: `packages/figma-plugin/src/ui/App.tsx` and `packages/figma-plugin/src/ui/app.css`
- Create: `packages/figma-plugin/src/ui/variablesSummary.ts` and `packages/figma-plugin/src/ui/variablesSummary.test.ts`

**Interfaces:**
- Produces: `summaryLines(summary: VariablesSummary): string[]`, pure. It turns the summary into
  display lines, for example:
  - `"Dobra · Size classes · Android: 5 modes, 6 variables · 6 created, 0 updated"`;
  - `"Kept your edit: layout/margin in Compact (Dobra value: 20)"`;
  - `"No longer selected: Medium"`;
  - each warning and error.

- [ ] **Step 1: Failing test** for `summaryLines`. Cover these cases:
  - a created-only summary;
  - a summary with kept edits, stale and removed modes;
  - a summary with a warning and an error.

  Assert the exact strings from the Interfaces block. Run it and expect FAIL.
- [ ] **Step 2: Implement `summaryLines`**, then the tab in `App.tsx`:
  - `TAB_LABEL.variables = 'Variables'`, and `OPEN.variables = { type: 'list-targets' }`.
  - `onMessage` handles `variables-done` (store the summary and source) and `variables-status`
    (store `exists`). When `targets` arrive while on the Variables tab, post `variables-status`.
  - A `Variables` component:
    - a Size classes checkbox and Android/iOS checkboxes, all on;
    - a Devices checkbox, with `useTargetPicker(targets)` reused;
    - buttons "Required coverage", "All foldables" and "Clear". "Required coverage" asks the main
      thread through a new `ToMain` `{ type: 'required-targets' }` answered with `targets-picked`
      keys, via `representativeTarget` for every required requirement. Add it to `messages.ts` and
      `handlers.ts` with a handler test.
    - the mode count;
    - a profile `<textarea>` with a file `<input accept=".json">` that fills it, and a "Clear
      profile" button;
    - a source line;
    - Overwrite and Remove checkboxes, both off;
    - the primary button: `exists ? 'Update variables' : 'Create variables'`. It posts `variables`,
      and is disabled when nothing is chosen.
    - The summary lines, then a short "How to use" note: "Bind width, padding, gap or grids to these
      variables, then pick a mode for the frame in the right panel."
  - `useTargetPicker` needs `setChecked` exposed so the shortcuts can set the selection. Return it,
    and keep its existing callers unchanged.
- [ ] **Step 3:** Run `npm run build -w @dobra/figma-plugin && npm test -w @dobra/figma-plugin`.
  Then open `packages/figma-plugin/dist/ui.html` in the built-in browser, posting simulated messages
  as the earlier plugin slices did:
  - `targets`, then `variables-status`, then a `variables-done` summary with a kept edit and a split
    warning.

  Check:
  - the tab renders;
  - the button label switches between Create and Update;
  - the summary lines show;
  - there are no console errors.
- [ ] **Step 4: Commit**

```bash
git add packages/figma-plugin/src/ui packages/figma-plugin/src/messages.ts packages/figma-plugin/src/handlers.ts packages/figma-plugin/src/handlers.test.ts
git commit -m "Add the Variables tab to the plugin"
```

### Task 10: README and PR 2

- [ ] **Step 1:** In `packages/figma-plugin/README.md`, add a "Variables" section covering:
  - what the collections and variables are (as in the spec §3), and where the values come from:
    defaults, or a profile;
  - how to use them: bind, then pick a mode, and Adapt switches the modes;
  - the update rules: edits kept, stale modes kept, the two options;
  - mode limits and splitting;
  - the manual smoke test from spec §7.

  Commit it: `git commit -m "Document the plugin's Variables tab"`.
- [ ] **Step 2:** Push, and open PR 2:
  - base `feat/figma-variables-core`, head `feat/figma-variables-plugin`;
  - labels `enhancement,area:plugin`;
  - body `Closes #N`, a Summary, and a Test plan with the counts, typecheck, the plugin build with
    `bundle.test`, the browser check of the tab, and an unticked "Manual smoke test in Figma desktop"
    checkbox with the spec §7 steps.

  No assistant mention. PR 2 stays open until that manual test is ticked.
