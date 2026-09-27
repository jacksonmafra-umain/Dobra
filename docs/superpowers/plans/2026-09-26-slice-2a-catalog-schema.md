# Slice 2a — Catalog schema and profile split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single config into a generic device catalog (public, plugin-safe) and an app
profile (the sample app), and give the catalog device categories, posture kinds, a cover-screen
policy, media-query facts and a coverage `requirements` block.

**Architecture:** `simulator.config.json` becomes `catalog/catalog.json` (version, sources,
platforms, devices, requirements) and `profiles/sample.profile.json` (components, layoutRules,
tabBar, screens). One schema file keeps both shapes: `catalogSchema` validates a catalog alone,
`configSchema` validates catalog + profile together, exactly as today. `loadConfig()` still
returns the same `SimulatorConfig`, so the engine and the app do not change. New catalog facts
come with small pure helpers (`categoryOf`, `postureKinds`, `mediaFacts`).

**Tech Stack:** TypeScript 7, zod 4, Vitest 4, npm workspaces (`@dobra/core`, `@dobra/simulator`).

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §2 (coverage decision),
§3.1, §3.2 (`loadCatalog`, `Category`, `categoryOf`), §4, §12 slice 2. Device additions and the
Galaxy Z Fold size check are slice 2b (separate plan, needs sourced data).

## Global Constraints

- Categories, verbatim from spec §3.2: `'phone' | 'foldable-book' | 'foldable-flip' | 'dual-screen' | 'multi-fold' | 'tablet' | 'desktop'`.
- Required coverage is a subset defined in the catalog's `requirements` block; default is one
  device per category × posture × orientation; teams can edit it (spec §2).
- The plugin bundles only the generic catalog; the profile is optional (spec §3.1). Nothing in
  `catalog/` may reference screens, components, layout rules or the tab bar.
- Every value keeps a `source`; guesses stay `estimated` (spec §1 success criteria).
- `core` stays free of React and the DOM (enforced by `boundary.test.ts`).
- Commits in English, microcommits, never mention the assistant. Never push to or merge into
  `main`; the PR closes a labeled issue (`enhancement`, `area:catalog`).
- Base branch: `feat/android-window-states-clean` (PR #10) after it is rebased onto
  `refactor/extract-core`. Work branch: `feat/catalog-schema`.
- Keep the old-path shims in `apps/simulator/src/{engine,config}` (removal is slice 1 Task 5).

## Review Focus

1. A team edits `catalog.json` and adds a screen-only key there by mistake — expected:
   `loadCatalog` rejects it with the path (`strictObject`), test in Task 1.
2. A requirement names a category no device has yet (for example `dual-screen` before the
   Surface Duo 2 lands) — expected: validation fails with a message naming category and kind, so
   coverage never demands the impossible (test in Task 6).
3. A device without postures (a phone) is matched by a `flat` requirement — expected:
   `postureKinds` returns `{flat}` for it (test in Task 3).
4. A desktop-class device gets phone defaults for pointer and keyboard — expected: `mediaFacts`
   defaults by category, desktop → fine pointer, physical keyboard (test in Task 5).
5. The simulator shows a different config after the split — expected: `loadConfig()` deep-equals
   the pre-split parse (one-off equivalence test in Task 1, before the old file is deleted).

---

### Task 0: Base the branch

- [ ] **Step 1:** Wait until agent/01 reports that PR #10 is rebased onto `refactor/extract-core`
  (its engine modules under `packages/core/src/engine`). Then:

```bash
git fetch origin
git switch -c feat/catalog-schema origin/feat/android-window-states-clean
git merge-base --is-ancestor origin/refactor/extract-core HEAD && echo stacked
npm install && npm test && npm run typecheck
git add docs/superpowers/plans/2026-09-26-slice-2a-catalog-schema.md
git commit -m "Add the implementation plan for the catalog schema"
```
Expected: `stacked`; tests and typecheck pass. Record the test counts in the ledger. (The plan
file is written before the branch exists, so it is committed here, not on `refactor/extract-core`.)

- [ ] **Step 2:** Re-read `packages/core/src/config/schema.ts` and
  `packages/core/src/config/simulator.config.json` on this base. PR #10 adds keys (window modes,
  typography, app manifest, font scale). Classify each new top-level key as catalog (about
  devices or platforms) or profile (about the app), and write the list into the ledger as a
  ruling before Task 1. Default: platform behaviour → catalog; the app's own manifest,
  typography and screens → profile.

### Task 1: Split the config into catalog and profile

**Files:**
- Create: `packages/core/src/catalog/catalog.json`, `packages/core/src/profiles/sample.profile.json`,
  `packages/core/src/catalog/load.ts`, `packages/core/src/catalog/catalog.test.ts`
- Modify: `packages/core/src/config/schema.ts`, `packages/core/src/config/load.ts`, every importer
  of `simulator.config.json` (listed in Step 6)
- Delete: `packages/core/src/config/simulator.config.json`

**Interfaces:**
- Produces:
  - `catalogSchema` and `type Catalog = z.infer<typeof catalogSchema>` (schema.ts)
  - `loadCatalog(json?: unknown): Catalog` (catalog/load.ts; default = the bundled catalog)
  - `composeConfig(catalog: unknown, profile: unknown): SimulatorConfig` (config/load.ts)
  - `rawConfig: Record<string, unknown>` — the merged raw JSON for tests (config/load.ts)
  - `loadConfig(): SimulatorConfig` — unchanged signature and result

- [ ] **Step 1: Split the JSON mechanically**

```bash
cd packages/core/src
mkdir -p catalog profiles
python3 - <<'EOF'
import json
src = json.load(open('config/simulator.config.json'))
CATALOG = ['$comment', 'version', 'sources', 'platforms', 'devices']   # plus the catalog keys ruled in Task 0 Step 2
catalog = {k: src[k] for k in CATALOG if k in src}
profile = {k: v for k, v in src.items() if k not in catalog}
catalog['$comment'] = 'Generic device catalog: devices, displays, postures, folds and platform profiles. Sizes are in the unit of the device platform (pt on iOS, dp on Android). App-specific screens and layout rules live in a profile.'
profile['$comment'] = 'Sample app profile: components, layout rules, tab bar and screens for the neutral sample app.'
json.dump(catalog, open('catalog/catalog.json', 'w'), indent=2, ensure_ascii=False); open('catalog/catalog.json', 'a').write('\n')
json.dump(profile, open('profiles/sample.profile.json', 'w'), indent=2, ensure_ascii=False); open('profiles/sample.profile.json', 'a').write('\n')
print(sorted(catalog), sorted(profile))
EOF
```
Expected: two key lists that together equal the original top-level keys.

- [ ] **Step 2: Write the failing tests** `packages/core/src/catalog/catalog.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import catalogJson from './catalog.json';
import profileJson from '../profiles/sample.profile.json';
import old from '../config/simulator.config.json';
import { loadCatalog } from './load';
import { composeConfig, loadConfig } from '../config/load';
import { ConfigError, parseConfig } from '../config/schema';

const PROFILE_KEYS = ['components', 'layoutRules', 'tabBar', 'screens', 'figmaFile'];

describe('catalog and profile', () => {
  it('loads the catalog on its own', () => {
    expect(loadCatalog().devices.length).toBeGreaterThan(0);
  });

  it('keeps app-specific keys out of the catalog', () => {
    for (const key of PROFILE_KEYS) expect(key in catalogJson).toBe(false);
    expect(() => loadCatalog({ ...catalogJson, screens: [] })).toThrow(ConfigError);
    expect(() => loadCatalog({ ...catalogJson, screens: [] })).toThrow(/screens/);
  });

  it('keeps device data out of the profile', () => {
    expect('devices' in profileJson).toBe(false);
  });

  it('composes to the same config as before the split', () => {
    expect(loadConfig()).toEqual(parseConfig(old));
    expect(composeConfig(catalogJson, profileJson)).toEqual(loadConfig());
  });
});
```
Run: `npm test -w @dobra/core -- src/catalog/catalog.test.ts` → FAIL (`./load` missing).

- [ ] **Step 3: Split the schema** in `packages/core/src/config/schema.ts`
  - Replace the single `configSchema = z.strictObject({...}).superRefine(fn)` with:

```ts
const catalogShape = {
  version: z.string(),
  sources: z.record(z.string(), z.string()),
  platforms: z.strictObject({ ios: iosProfile, android: androidProfile }),
  devices: z.array(z.discriminatedUnion('platform', [iosDevice, androidDevice])).min(1),
  // …plus the catalog keys ruled in Task 0 Step 2, moved here unchanged
};

const profileShape = {
  /** Figma file key the screens' frame ids live in. Required only when a screen names a frame. */
  figmaFile: z.string().optional(),
  components: z.record(z.string(), componentSpec),
  layoutRules: z.array(layoutRule).min(1),
  tabBar: z.strictObject({ component: z.string(), items: z.array(tabItem).min(1) }),
  screens: z.array(screen).min(1),
  // …plus the profile keys ruled in Task 0 Step 2, moved here unchanged
};

type Issue = (path: (string | number)[], message: string) => void;
type CatalogShape = z.infer<z.ZodObject<typeof catalogShape>>;

export const catalogSchema = z.strictObject(catalogShape).superRefine((cat, ctx) => {
  checkCatalog(cat, (path, message) => ctx.addIssue({ code: 'custom', path, message }));
});

export const configSchema = z.strictObject({ ...catalogShape, ...profileShape }).superRefine((cfg, ctx) => {
  const issue: Issue = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  checkCatalog(cfg, issue);
  checkProfile(cfg, issue);
});
```
  - Move the body of the old `superRefine` into two functions, keeping every check and message
    exactly as it is today:
    - `function checkCatalog(cat: CatalogShape, issue: Issue)` — `unique(devices)`, the Android
      size-class and navigation checks, and the whole `cfg.devices.forEach(...)` block.
    - `function checkProfile(cfg: z.infer<typeof configSchema>, issue: Issue)` — `unique(screens)`,
      `unique(layoutRules)`, the components loop, the layout-rules loop, the fallback check and the
      screens/tab bar loop.
    Both need `checkSource`, `unique` and `checkClasses`; lift them to module-level helpers that
    take `issue` and the known-source set as arguments (`const sources = new Set([...Object.keys(cfg.sources), 'free-resize'])`).
  - Add `export type Catalog = z.infer<typeof catalogSchema>;` and export a generic parser:

```ts
function parseWith<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(stripComments(raw));
  if (!result.success) throw new ConfigError(result.error.issues.map((i) => `${formatPath(i.path) || '(root)'}: ${i.message}`));
  return result.data;
}

/** Validates raw config JSON and throws a ConfigError listing every problem with its path. */
export function parseConfig(raw: unknown): SimulatorConfig {
  return parseWith(configSchema, raw);
}

/** Validates a catalog on its own (no app profile). */
export function parseCatalog(raw: unknown): Catalog {
  return parseWith(catalogSchema, raw);
}
```
  - Change `ConfigError`'s message prefix from `simulator.config.json is invalid` to
    `Config is invalid`, and update the header comment of the file to name both files.

- [ ] **Step 4: Loaders**

`packages/core/src/catalog/load.ts`:
```ts
import catalogJson from './catalog.json';
import { parseCatalog, type Catalog } from '../config/schema';

/** The validated device catalog. Pass other catalog JSON to validate it instead of the bundled one. */
export function loadCatalog(json: unknown = catalogJson): Catalog {
  return parseCatalog(json);
}
```

`packages/core/src/config/load.ts`:
```ts
import catalogJson from '../catalog/catalog.json';
import profileJson from '../profiles/sample.profile.json';
import { parseConfig, type SimulatorConfig } from './schema';

/** Catalog and profile merged into one raw object, for tests that mutate a copy. */
export const rawConfig: Record<string, unknown> = { ...catalogJson, ...profileJson };

/** Validates a catalog and an app profile together. */
export function composeConfig(catalog: unknown, profile: unknown): SimulatorConfig {
  return parseConfig({ ...(catalog as object), ...(profile as object) });
}

/** The bundled catalog with the sample app profile. Throws a ConfigError (with paths) when either is invalid. */
export const loadConfig = (): SimulatorConfig => composeConfig(catalogJson, profileJson);
```
Merging keeps the profile's `$comment` over the catalog's; comments are stripped before
validation, so this is harmless.

- [ ] **Step 5: Run the new tests**

Run: `npm test -w @dobra/core -- src/catalog/catalog.test.ts` → PASS (4 tests).

- [ ] **Step 6: Move every importer off the old file, then delete it**

```bash
grep -rln "simulator.config.json" packages/core/src apps/simulator/src
```
For each hit:
- core tests (`schema.test.ts`, `engine/*.test.ts`, any PR #10 test): replace
  `import raw from '../config/simulator.config.json';` (or `'./simulator.config.json'`) with
  `import { rawConfig as raw } from '../config/load';` (or `'./load'`).
- `apps/simulator/src/core.test.ts`: replace the JSON import with
  `import catalogJson from '@dobra/core/catalog/catalog.json';` and compare
  `loadConfig().devices.length` with `catalogJson.devices.length`.
- `apps/simulator/src/sample/art.test.ts`: import `raw` from
  `'@dobra/core/profiles/sample.profile.json'` (it only reads `raw.tabBar`).
- Comments and UI strings that name the file (`ConfigErrorPage.tsx`, `environment.ts`
  "Unknown device … in simulator.config.json"): say `the catalog` or `the config` instead.

Then drop the one-off equivalence line from `catalog.test.ts` (`import old …` and
`expect(loadConfig()).toEqual(parseConfig(old))`) and `git rm packages/core/src/config/simulator.config.json`.
Check: `grep -rn "simulator.config.json" packages apps --exclude-dir=node_modules` → no output.

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS; test counts equal Task 0's plus 4.

- [ ] **Step 8: Commit** (two microcommits)

```bash
git add packages/core/src/catalog packages/core/src/profiles packages/core/src/config/schema.ts packages/core/src/config/load.ts
git commit -m "Split the config into a device catalog and a sample app profile"
git add -A packages apps
git commit -m "Read the catalog and profile instead of the combined config file"
```
The first commit must still pass tests: keep `simulator.config.json` and its importers in the
first commit and delete them in the second.

### Task 2: Device categories

**Files:**
- Create: `packages/core/src/catalog/categories.ts`, `packages/core/src/catalog/categories.test.ts`
- Modify: `packages/core/src/config/schema.ts` (ios and android device schemas),
  `packages/core/src/catalog/catalog.json`, every reader of Android `class`
  (`grep -rn "\.class\b" packages/core/src apps/simulator/src`)

**Interfaces:**
- Produces: `CATEGORIES` (readonly tuple, spec order), `type Category`,
  `categoryOf(d: DeviceSpec): Category`; `category` required on every device in the schema.
  Android `class` is removed.

- [ ] **Step 1: Write the failing test** `categories.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './load';
import { CATEGORIES, categoryOf } from './categories';

const cat = loadCatalog();
const byId = (id: string) => cat.devices.find((d) => d.id === id)!;

describe('categories', () => {
  it('lists the spec categories in order', () => {
    expect(CATEGORIES).toEqual(['phone', 'foldable-book', 'foldable-flip', 'dual-screen', 'multi-fold', 'tablet', 'desktop']);
  });

  it.each([
    ['iphone-17', 'phone'],
    ['iphone-duo', 'foldable-book'],
    ['pixel-9', 'phone'],
    ['pixel-tablet', 'tablet'],
    ['pixel-9-pro-fold', 'foldable-book'],
    ['galaxy-z-fold-7', 'foldable-book'],
    ['galaxy-z-flip-7', 'foldable-flip'],
    ['galaxy-z-trifold', 'multi-fold'],
    ['huawei-mate-xt', 'multi-fold'],
  ])('%s is %s', (id, category) => {
    expect(categoryOf(byId(id))).toBe(category);
  });

  it('gives every device a category', () => {
    for (const d of cat.devices) expect(CATEGORIES).toContain(categoryOf(d));
  });
});
```
Run: `npm test -w @dobra/core -- src/catalog/categories.test.ts` → FAIL.

- [ ] **Step 2: Implement**

`categories.ts`:
```ts
import type { DeviceSpec } from '../config/types';

/** Device categories, from duoresponsive.com's device list plus multi-fold and desktop. */
export const CATEGORIES = ['phone', 'foldable-book', 'foldable-flip', 'dual-screen', 'multi-fold', 'tablet', 'desktop'] as const;
export type Category = (typeof CATEGORIES)[number];

export function categoryOf(d: DeviceSpec): Category {
  return d.category;
}
```
Before writing it, confirm `DeviceSpec` is exported from `config/types.ts` (it is imported by
`engine/environment.ts`). In `schema.ts`, import nothing from `catalog/` (to avoid a cycle);
declare `const category = z.enum(['phone', 'foldable-book', 'foldable-flip', 'dual-screen', 'multi-fold', 'tablet', 'desktop']);`
and add `category` to `iosDevice`; in `androidDevice` replace the `class` line with `category`.
Add a test assertion that the enum and `CATEGORIES` agree:
`expect(configSchemaCategories).toEqual(CATEGORIES)` by exporting
`export const DEVICE_CATEGORIES = category.options;` from schema.ts and importing it in the test.

- [ ] **Step 3: Migrate the data**

```bash
python3 - <<'EOF'
import json
p = 'packages/core/src/catalog/catalog.json'
c = json.load(open(p))
CLASS = {'phone': 'phone', 'book-foldable': 'foldable-book', 'clamshell': 'foldable-flip', 'tri-fold': 'multi-fold', 'tablet': 'tablet', 'desktop': 'desktop'}
IOS = {'iphone-se': 'phone', 'iphone-17': 'phone', 'iphone-17-pro-max': 'phone', 'iphone-duo': 'foldable-book'}
out = []
for d in c['devices']:
    cat = IOS[d['id']] if d['platform'] == 'ios' else CLASS[d.pop('class')]
    # keep key order: id, platform, name, enabled, category, …
    keys = list(d.keys()); i = keys.index('enabled') + 1
    out.append({**{k: d[k] for k in keys[:i]}, 'category': cat, **{k: d[k] for k in keys[i:]}})
c['devices'] = out
json.dump(c, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
EOF
```
Any device PR #10 added that is not in the maps makes the script raise `KeyError`: add it to the
right map by its displays and hinges, and ledger the choice.
Replace remaining `.class` readers with `.category` and the new values.

- [ ] **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit**

```bash
git add -A packages apps
git commit -m "Give every device a category from the spec's category list"
```

### Task 3: Posture kinds

**Files:**
- Create: `packages/core/src/catalog/postures.ts`, `packages/core/src/catalog/postures.test.ts`
- Modify: `schema.ts` (`iosPose`, `posture`), `catalog.json`

**Interfaces:**
- Produces: `POSTURE_KINDS = ['cover', 'flat', 'book', 'tabletop', 'partial', 'dual', 'rear'] as const`,
  `type PostureKind`, `postureKinds(d: DeviceSpec): Set<PostureKind>` (a device with no poses or
  postures returns `{'flat'}`); `kind` required on every iOS pose and Android posture.

- [ ] **Step 1: Write the failing test** `postures.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './load';
import { postureKinds } from './postures';

const cat = loadCatalog();
const kinds = (id: string) => [...postureKinds(cat.devices.find((d) => d.id === id)!)].sort();

describe('posture kinds', () => {
  it('treats a device without postures as flat', () => {
    expect(kinds('pixel-9')).toEqual(['flat']);
    expect(kinds('iphone-17')).toEqual(['flat']);
  });

  it('names what each foldable can do', () => {
    expect(kinds('galaxy-z-fold-7')).toEqual(['book', 'cover', 'dual', 'flat', 'tabletop']);
    expect(kinds('pixel-9-pro-fold')).toEqual(['book', 'cover', 'dual', 'flat', 'rear', 'tabletop']);
    expect(kinds('galaxy-z-flip-7')).toEqual(['book', 'cover', 'flat', 'tabletop']);
    expect(kinds('iphone-duo')).toEqual(['book', 'cover', 'flat', 'tabletop']);
    expect(kinds('huawei-mate-xt')).toEqual(['book', 'cover', 'flat', 'partial']);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `postures.ts`

```ts
import type { DeviceSpec } from '../config/types';

/**
 * What a posture offers a layout, whatever the device calls it. `partial` is a multi-fold with
 * some panels folded away; `dual` and `rear` are WindowAreaController presentation modes.
 */
export const POSTURE_KINDS = ['cover', 'flat', 'book', 'tabletop', 'partial', 'dual', 'rear'] as const;
export type PostureKind = (typeof POSTURE_KINDS)[number];

export function postureKinds(d: DeviceSpec): Set<PostureKind> {
  const list = d.platform === 'ios' ? (d.poses ?? []) : (d.postures ?? []);
  return new Set(list.length ? list.map((p) => p.kind) : ['flat']);
}
```
In `schema.ts` add `const postureKind = z.enum(['cover', 'flat', 'book', 'tabletop', 'partial', 'dual', 'rear']);`,
export `POSTURE_KIND_VALUES = postureKind.options`, and add `kind: postureKind` to `iosPose` and
`posture`. Add to the test: `expect(POSTURE_KIND_VALUES).toEqual(POSTURE_KINDS)`.

- [ ] **Step 3: Migrate the data**

```bash
python3 - <<'EOF'
import json
p = 'packages/core/src/catalog/catalog.json'
c = json.load(open(p))
KIND = {
  'iphone-duo': {'closed': 'cover', 'open': 'flat', 'book': 'book', 'flat': 'flat', 'stand': 'tabletop'},
  'pixel-9-pro-fold': {'closed': 'cover', 'open': 'flat', 'book': 'book', 'tabletop': 'tabletop', 'rear-display': 'rear', 'dual-screen': 'dual'},
  'galaxy-z-fold-7': {'closed': 'cover', 'open': 'flat', 'book': 'book', 'tabletop': 'tabletop', 'dual-screen': 'dual'},
  'galaxy-z-flip-7': {'closed': 'cover', 'open': 'flat', 'flex': 'tabletop', 'flex-rotated': 'book'},
  'galaxy-z-trifold': {'closed': 'cover', 'open': 'flat', 'left-half': 'partial', 'both-half': 'partial'},
  'huawei-mate-xt': {'single': 'cover', 'dual': 'partial', 'triple': 'flat', 'triple-half': 'book'},
}
for d in c['devices']:
    for key in ('poses', 'postures'):
        for pose in d.get(key, []):
            pose['kind'] = KIND[d['id']][pose['id']]
json.dump(c, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
EOF
```
Check the Z TriFold `both-half` and Mate XT `triple-half` against each posture's `label` and
`note` in the catalog before committing; if a label says tabletop, use `tabletop` and update the
expected sets in the test. Ledger any change.

- [ ] **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit**

```bash
git add -A packages
git commit -m "Tag every posture with the kind of space it offers"
```

### Task 4: Cover-screen policy and continuity

**Files:** `schema.ts` (`androidDisplay.coverScreen`), `engine/environment.ts` (the
`coverScreen` type), `engine/postures.test.ts`, `catalog.json`,
`apps/simulator/src/ui/Inspector.tsx`, plus any PR #10 reader
(`grep -rn "userGranted\|coverScreen" packages/core/src apps/simulator/src`).

**Interfaces:**
- Produces: `coverScreen?: { policy: 'user-granted' | 'any-app' | 'allow-list'; continuity: boolean; note: string }`
  on Android displays, and the same shape on `env.android.coverScreen`. `userGranted` is removed.

- [ ] **Step 1: Write the failing test** — in `engine/postures.test.ts` replace
  `expect(env.android?.coverScreen?.userGranted).toBe(true);` with:

```ts
expect(env.android?.coverScreen).toMatchObject({ policy: 'user-granted', continuity: false });
```
and add to `schema.test.ts`:

```ts
it('rejects an unknown cover-screen policy', () => {
  const cfg = clone();
  const flip = cfg.devices.find((d: { id: string }) => d.id === 'galaxy-z-flip-7');
  flip.displays.cover.coverScreen.policy = 'sometimes';
  expect(issuesOf(cfg).join('\n')).toMatch(/coverScreen\.policy/);
});
```
Run: `npm test -w @dobra/core` → FAIL on both.

- [ ] **Step 2: Implement**
  - schema: `coverScreen: z.strictObject({ policy: z.enum(['user-granted', 'any-app', 'allow-list']), continuity: z.boolean(), note: z.string() }).optional(),`
    with a doc comment: `/** Who decides whether an app runs on this outer display, and whether it stays there when the device closes. */`
  - `environment.ts`: `coverScreen: { policy: 'user-granted' | 'any-app' | 'allow-list'; continuity: boolean; note: string } | null;`
  - data: on `galaxy-z-flip-7` cover, replace `"userGranted": true` with
    `"policy": "user-granted", "continuity": false` (Samsung keeps continuity off by default).
  - Inspector: where it renders `env.android.coverScreen.note`, prefix the policy:
    `{POLICY_LABEL[env.android.coverScreen.policy]} · {env.android.coverScreen.note}` with
    `const POLICY_LABEL = { 'user-granted': 'User must allow it', 'any-app': 'Any app', 'allow-list': 'Allow-listed apps only' } as const;`
- [ ] **Step 3:** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 4: Commit**

```bash
git add -A packages apps
git commit -m "Describe cover screens by policy and continuity"
```

### Task 5: Media-query facts

**Files:**
- Create: `packages/core/src/catalog/media.ts`, `packages/core/src/catalog/media.test.ts`
- Modify: `schema.ts` (`iosDevice`, `androidDevice`)

**Interfaces:**
- Produces: `interface MediaFacts { pointer: 'coarse' | 'fine'; keyboard: 'virtual' | 'physical'; viewingDistance: 'near' | 'medium' | 'far'; hasCamera: boolean; hasMicrophone: boolean }`,
  `DEFAULT_MEDIA: Record<Category, MediaFacts>`, `mediaFacts(d: DeviceSpec): MediaFacts`
  (device overrides win over the category default); optional `media` on every device:
  `{ pointer?, keyboard?, viewingDistance?, hasCamera?, hasMicrophone?, source }`.

- [ ] **Step 1: Write the failing test** `media.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { DeviceSpec } from '../config/types';
import { loadCatalog } from './load';
import { mediaFacts } from './media';

const cat = loadCatalog();
const byId = (id: string) => cat.devices.find((d) => d.id === id)!;

describe('media facts', () => {
  it('defaults phones and foldables to touch, a virtual keyboard and near viewing', () => {
    for (const id of ['pixel-9', 'galaxy-z-fold-7', 'galaxy-z-flip-7', 'iphone-17']) {
      expect(mediaFacts(byId(id))).toEqual({ pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', hasCamera: true, hasMicrophone: true });
    }
  });

  it('defaults desktop-class devices to a fine pointer, a physical keyboard and medium viewing', () => {
    const desktop = { ...byId('pixel-tablet'), category: 'desktop' } as DeviceSpec;
    expect(mediaFacts(desktop)).toMatchObject({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium' });
  });

  it('lets a device override its category', () => {
    const tablet = { ...byId('pixel-tablet'), media: { keyboard: 'physical', source: 'estimated' } } as DeviceSpec;
    expect(mediaFacts(tablet)).toMatchObject({ pointer: 'coarse', keyboard: 'physical' });
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `media.ts`

```ts
// CSS media features a device reports (pointer, any-pointer) and the facts Android's UI media
// scope exposes. Defaults are per category; a device's `media` block overrides them.
import type { DeviceSpec } from '../config/types';
import type { Category } from './categories';

export interface MediaFacts {
  pointer: 'coarse' | 'fine';
  keyboard: 'virtual' | 'physical';
  viewingDistance: 'near' | 'medium' | 'far';
  hasCamera: boolean;
  hasMicrophone: boolean;
}

const TOUCH: MediaFacts = { pointer: 'coarse', keyboard: 'virtual', viewingDistance: 'near', hasCamera: true, hasMicrophone: true };

export const DEFAULT_MEDIA: Record<Category, MediaFacts> = {
  phone: TOUCH,
  'foldable-book': TOUCH,
  'foldable-flip': TOUCH,
  'dual-screen': TOUCH,
  'multi-fold': TOUCH,
  tablet: TOUCH,
  desktop: { pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium', hasCamera: true, hasMicrophone: true },
};

export function mediaFacts(d: DeviceSpec): MediaFacts {
  const { source: _source, ...overrides } = d.media ?? { source: '' };
  return { ...DEFAULT_MEDIA[d.category], ...overrides };
}
```
schema: add to both device schemas
`media: z.strictObject({ pointer: z.enum(['coarse', 'fine']).optional(), keyboard: z.enum(['virtual', 'physical']).optional(), viewingDistance: z.enum(['near', 'medium', 'far']).optional(), hasCamera: z.boolean().optional(), hasMicrophone: z.boolean().optional(), source: sourceRef }).optional(),`
and in `checkCatalog` call `checkSource(d.media?.source, ['devices', di, 'media', 'source'])` for
both platforms. If `noUnusedLocals` flags `_source`, rewrite the destructure as
`const overrides = { ...d.media }; delete overrides.source;` with a typed copy.

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 4: Commit**

```bash
git add -A packages
git commit -m "Add media-query facts per device with category defaults"
```

### Task 6: Coverage requirements

**Files:**
- Create: `packages/core/src/catalog/requirements.test.ts`
- Modify: `schema.ts` (`catalogShape`, `checkCatalog`), `catalog.json`

**Interfaces:**
- Consumes: `postureKinds` (Task 3), category values (Task 2).
- Produces: `requirements: Requirement[]` on the catalog, with
  `Requirement = { category: Category; kind: PostureKind; orientation: 'portrait' | 'landscape'; level: 'required' | 'optional'; note?: string }`;
  validation that every `required` (category, kind) is offered by at least one enabled device.

- [ ] **Step 1: Write the failing test** `requirements.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import catalogJson from './catalog.json';
import { loadCatalog } from './load';

const clone = () => JSON.parse(JSON.stringify(catalogJson));

describe('coverage requirements', () => {
  it('ships a default requirement for every category that has devices', () => {
    const cat = loadCatalog();
    const covered = new Set(cat.requirements.filter((r) => r.level === 'required').map((r) => r.category));
    for (const d of cat.devices) expect(covered).toContain(d.category);
  });

  it('rejects a required cell no device can offer', () => {
    const raw = clone();
    raw.requirements.push({ category: 'dual-screen', kind: 'dual', orientation: 'landscape', level: 'required' });
    expect(() => loadCatalog(raw)).toThrow(/requirements\[\d+\].*dual-screen.*dual/);
  });

  it('rejects duplicate requirements', () => {
    const raw = clone();
    raw.requirements.push({ ...raw.requirements[0] });
    expect(() => loadCatalog(raw)).toThrow(/Duplicate requirement/);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**
  schema, in `catalogShape`:
  `requirements: z.array(z.strictObject({ category, kind: postureKind, orientation, level: z.enum(['required', 'optional']), note: z.string().optional() })).min(1),`
  in `checkCatalog`:

```ts
const offered = new Set<string>();
for (const d of cat.devices) {
  if (!d.enabled) continue;
  const list = d.platform === 'ios' ? (d.poses ?? []) : (d.postures ?? []);
  for (const kind of list.length ? list.map((p) => p.kind) : ['flat']) offered.add(`${d.category}/${kind}`);
}
const seen = new Set<string>();
cat.requirements.forEach((r, ri) => {
  const key = `${r.category}/${r.kind}/${r.orientation}`;
  if (seen.has(key)) issue(['requirements', ri], `Duplicate requirement ${key}`);
  seen.add(key);
  if (r.level === 'required' && !offered.has(`${r.category}/${r.kind}`))
    issue(['requirements', ri], `Required ${r.category} ${r.kind} cannot be met: no enabled ${r.category} device has a ${r.kind} posture`);
});
```
  (This duplicates `postureKinds` because `schema.ts` must not import from `catalog/`; keep the two
  in step by testing `postureKinds` against the same devices in Task 3.)

- [ ] **Step 3: Seed the defaults** — append to `catalog.json`:

```json
"requirements": [
  { "category": "phone", "kind": "flat", "orientation": "portrait", "level": "required" },
  { "category": "phone", "kind": "flat", "orientation": "landscape", "level": "optional" },
  { "category": "foldable-book", "kind": "cover", "orientation": "portrait", "level": "required" },
  { "category": "foldable-book", "kind": "flat", "orientation": "portrait", "level": "required" },
  { "category": "foldable-book", "kind": "flat", "orientation": "landscape", "level": "required" },
  { "category": "foldable-book", "kind": "book", "orientation": "portrait", "level": "required" },
  { "category": "foldable-book", "kind": "tabletop", "orientation": "landscape", "level": "required" },
  { "category": "foldable-flip", "kind": "cover", "orientation": "portrait", "level": "required", "note": "The Flip cover is wider than tall yet compact width; landscape is not wide." },
  { "category": "foldable-flip", "kind": "flat", "orientation": "portrait", "level": "required" },
  { "category": "foldable-flip", "kind": "tabletop", "orientation": "portrait", "level": "required" },
  { "category": "multi-fold", "kind": "cover", "orientation": "portrait", "level": "required" },
  { "category": "multi-fold", "kind": "partial", "orientation": "portrait", "level": "required" },
  { "category": "multi-fold", "kind": "flat", "orientation": "landscape", "level": "required" },
  { "category": "tablet", "kind": "flat", "orientation": "portrait", "level": "required" },
  { "category": "tablet", "kind": "flat", "orientation": "landscape", "level": "required" }
]
```
No `dual-screen` or `desktop` rows yet: no enabled device offers them until slice 2b. Slice 2b
adds them with the Surface Duo 2 and a desktop entry.

- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 5: Commit**

```bash
git add -A packages
git commit -m "Add default coverage requirements to the catalog and validate them"
```

### Task 7: Issue, push and PR

- [ ] **Step 1:** `gh issue create -R jacksonmafra-umain/Dobra --title "Catalog schema: categories, posture kinds, cover policy, media facts and requirements" --label enhancement --label area:catalog --body "Slice 2a of docs/superpowers/specs/2026-09-25-foldable-artboards-design.md. Splits the config into catalog/catalog.json (devices, platforms, requirements) and profiles/sample.profile.json (the sample app); adds a category to every device, a kind to every posture, a cover-screen policy with continuity, media-query facts with category defaults, and validated coverage requirements. New devices and the Galaxy Z Fold size check follow in slice 2b."`
- [ ] **Step 2:** `git push -u origin feat/catalog-schema`
- [ ] **Step 3:** PR targeting `feat/android-window-states-clean`, labels `enhancement,area:catalog`,
  body `Closes #N`, Summary, Test plan (counts, typecheck, both builds, equivalence check). No
  assistant mention.
- [ ] **Step 4:** Tell agent/01: the catalog now lives in `catalog/catalog.json` and the app
  profile in `profiles/sample.profile.json`; `class` became `category`; `coverScreen.userGranted`
  became `policy` + `continuity`; `mediaFacts(d)` is in `@dobra/core/catalog/media`.
