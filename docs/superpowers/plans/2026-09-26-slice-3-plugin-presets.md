# Slice 3 — Figma plugin: presets, Tag frames and coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A development Figma plugin (`packages/figma-plugin`) that creates tagged foldable
artboards with hinge overlays and grids, tags existing frames, and shows a coverage matrix
against the catalog's requirements — all driven by pure, tested modules in `@dobra/core`.

**Architecture:** Core gains four pure modules: `targets` (Target keys, enumeration, resolving a
target to an Environment from the catalog alone), `presets` (a declarative `PresetFrame` per
target), `match` (frame → candidate targets by tag, name or size) and `coverage` (requirements ×
present frames). The plugin is a thin adapter: a typed message protocol, a `FigmaApi` interface
the real `figma` global and an in-memory fake both satisfy, and handlers that turn core output
into nodes. The engine's config parameter narrows to the fields it reads, so the plugin never
bundles an app profile.

**Tech Stack:** TypeScript 7, zod 4, Vitest 4, esbuild 0.28 (plugin main thread), Vite 8 +
`vite-plugin-singlefile` + React 19 (plugin UI), `@figma/plugin-typings` 1.139.

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §2, §3.1, §3.2
(`targetKey`, `parseTargetKey`, `enumerateTargets`, `resolveTarget`, `hingeSafeZone`,
`matchFrame`, `coverage`, `presetSpec`), §5.1–§5.3, §5.6, §8.1, §12 slice 3.

## Global Constraints

- Manifest (spec §5.1): `editorType: ["figma", "dev"]`, `documentAccess: "dynamic-page"`,
  `networkAccess: { allowedDomains: ["none"] }`. Commands this slice: `presets`, `tag`,
  `coverage` (the checker's `adapt`/`check` commands and relaunch button arrive in slice 4).
- Identity (spec §5.2): `setSharedPluginData('dobra', 'target', targetKey)` and
  `('dobra', 'catalogVersion', catalog.version)`; human name
  `Screen / <Device> · <display> · <posture> · <orientation>`.
- Overlay (spec §5.2): a locked child frame named `⎔ hinge-overlay` holding the hinge (red, 20%
  opacity), safe zones, insets and reserved regions; toggled with `visible`.
- `layoutGrids` (spec §5.2): columns for the size class, plus a two-pane grid whose gutter equals
  the hinge width when a fold separates the window.
- Untagged frames fall back to name, then size ±1px, marked low confidence (spec §2, §8.1).
- The plugin bundles only the generic catalog — no app profile (spec §3.1). A build test enforces it.
- Distribution now: development plugin imported from `manifest.json` (spec §2).
- `core` stays free of React and the DOM (`boundary.test.ts`).
- Commits in English, microcommits, never mention the assistant. Never push to or merge into
  `main`; the PR closes a labeled issue (`enhancement`, `area:plugin`; core-only commits are
  fine inside it).
- Base branch: `feat/catalog-devices` (PR #16). Work branch: `feat/figma-plugin-presets`.

## Review Focus

1. A frame whose size matches several devices (412×915-class) — expected: `matchFrame` returns
   every candidate with `by: 'size'` and coverage counts it as low confidence, never as tagged
   (test in Task 4 and Task 5).
2. A frame rotated by the designer (landscape frame of a portrait-first device) — expected: size
   matching tries both orientations (test in Task 4).
3. Running the plugin twice on the same page — expected: "Create missing" skips cells already
   present, and `applyPreset` places new frames to the right of existing ones instead of on top
   (test in Task 7).
4. A tag written by an older catalog whose device no longer exists — expected: `matchFrame`
   reports `by: 'none'` for it and Tag frames lists it as unknown instead of throwing (Task 4 and
   Task 8).
5. A target key containing an unknown pose or display — expected: `resolveTarget` throws a
   readable error naming the key, and the handler turns it into an error message for the UI
   (Task 1 and Task 9).

---

### Task 0: Branch

- [ ] **Step 1**

```bash
git fetch origin
git switch -c feat/figma-plugin-presets origin/feat/catalog-devices
npm install && npm test
git add docs/superpowers/plans/2026-09-26-slice-3-plugin-presets.md
git commit -m "Add the implementation plan for the Figma plugin presets"
```
Expected: tests pass (core 207, simulator 72 at the time of writing).

### Task 1: Targets and resolving them from the catalog alone

**Files:**
- Create: `packages/core/src/config/orientations.ts`, `packages/core/src/targets.ts`,
  `packages/core/src/targets.test.ts`
- Modify: `packages/core/src/config/schema.ts` (requirement check uses `orientations.ts`),
  `packages/core/src/engine/environment.ts`, `engine/android.ts`, `engine/ios.ts` (config
  parameter type)

**Interfaces:**
- Produces:
  - `offeredOrientations(device: DeviceSpec, displayId: string, postureRotation?: 0 | 90): Orientation[]` (config/orientations.ts)
  - `type EnvConfig = Pick<SimulatorConfig, 'platforms' | 'devices' | 'app'>` (engine/environment.ts);
    `resolveEnvironment(config: EnvConfig, sel: Selection)`
  - `DEFAULT_APP: SimulatorConfig['app']` — neutral Android manifest defaults
  - `type Target` (re-exported from `engine/checks`), `targetKey(t): string`,
    `parseTargetKey(s): Target | null`, `enumerateTargets(config: EnvConfig): Target[]`,
    `resolveTarget(config: EnvConfig, t: Target): Environment`, `envConfigOf(catalog: Catalog, app?): EnvConfig`

- [ ] **Step 1: Write the failing test** `packages/core/src/targets.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { enumerateTargets, envConfigOf, parseTargetKey, resolveTarget, targetKey, type Target } from './targets';

const config = envConfigOf(loadCatalog());

describe('targets', () => {
  it('round-trips keys, with or without a posture', () => {
    const withPose: Target = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'book', orientation: 'landscape' };
    const flat: Target = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' };
    expect(targetKey(withPose)).toBe('galaxy-z-fold-7/inner/book/landscape');
    expect(targetKey(flat)).toBe('pixel-9/main/-/portrait');
    expect(parseTargetKey(targetKey(withPose))).toEqual(withPose);
    expect(parseTargetKey(targetKey(flat))).toEqual(flat);
    expect(parseTargetKey('not a key')).toBeNull();
    expect(parseTargetKey('a/b/c/sideways')).toBeNull();
  });

  it('enumerates every posture and orientation a device offers', () => {
    const keys = enumerateTargets(config).map(targetKey);
    expect(keys).toContain('galaxy-z-flip-7/cover/closed/landscape');
    expect(keys).not.toContain('galaxy-z-flip-7/cover/closed/portrait');
    expect(keys).toContain('pixel-9/main/-/portrait');
    expect(keys).toContain('pixel-9/main/-/landscape');
    expect(keys).toContain('surface-duo-2/spanned/spanned/landscape');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves a target without an app profile', () => {
    const env = resolveTarget(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });
    expect(env).toMatchObject({ width: 1100, height: 756 });
    expect(env.folds[0]).toMatchObject({ separating: true, occludes: true });
  });

  it('names the key when a target cannot be resolved', () => {
    expect(() => resolveTarget(config, { deviceId: 'pixel-9', displayId: 'main', pose: 'nope', orientation: 'portrait' })).toThrow(
      /pixel-9\/main\/nope\/portrait/,
    );
  });
});
```
Run: `npm test -w @dobra/core -- src/targets.test.ts` → FAIL (`./targets` missing).

- [ ] **Step 2: Share the orientation logic** — create `config/orientations.ts`:

```ts
// Which orientations a display can be shown in. Shared by the requirement check and target enumeration.
import type { DeviceSpec, Orientation } from './types';

export function offeredOrientations(device: DeviceSpec, displayId: string, postureRotation?: 0 | 90): Orientation[] {
  if (device.platform === 'ios') {
    const disp = device.displays[displayId];
    return disp ? (Object.keys(disp.orientations) as Orientation[]) : [];
  }
  const disp = device.displays[displayId];
  if (!disp) return [];
  if (disp.rotation.supported) return ['portrait', 'landscape'];
  const natural: Orientation = disp.size.width > disp.size.height ? 'landscape' : 'portrait';
  return [postureRotation === 90 ? (natural === 'landscape' ? 'portrait' : 'landscape') : natural];
}
```
`types.ts` imports from `schema.ts`, and `schema.ts` must not import `types.ts` back through
this module at runtime: `orientations.ts` imports types only (`import type`), so there is no
cycle. In `schema.ts`'s `checkCatalog`, replace the inline `shapes` helper and the iOS branch of
the offered-set loop with `offeredOrientations` (iOS poses keep using `p.orientations`, which is
the pose's own list). Run `npm test -w @dobra/core -- src/catalog/requirements.test.ts` → PASS
unchanged.

- [ ] **Step 3: Narrow the engine's config type** — in `engine/environment.ts` add
  `export type EnvConfig = Pick<SimulatorConfig, 'platforms' | 'devices' | 'app'>;` and change the
  `config` parameter of `findDevice`, `resolveEnvironment`, `resolveAndroidDevice` and
  `resolveIosDevice` from `SimulatorConfig` to `EnvConfig`. Callers that pass a full
  `SimulatorConfig` keep compiling (it is a supertype). If another engine function they call
  needs more than these fields, widen `EnvConfig` with that field and ledger it.

- [ ] **Step 4: Implement** `packages/core/src/targets.ts`

```ts
// One artboard = one Target: a device display, an optional posture and an orientation.
import type { Catalog, SimulatorConfig } from './config/schema';
import type { Orientation } from './config/types';
import { offeredOrientations } from './config/orientations';
import type { Target } from './engine/checks';
import { resolveEnvironment, type EnvConfig, type Environment } from './engine/environment';

export type { Target };

/** Neutral Android manifest values for resolving windows without an app profile. */
export const DEFAULT_APP: SimulatorConfig['app'] = {
  android: {
    targetSdk: 36,
    screenOrientation: 'unspecified',
    configChanges: ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize', 'keyboardHidden'],
    source: 'android-docs',
  },
};

export function envConfigOf(catalog: Catalog, app: SimulatorConfig['app'] = DEFAULT_APP): EnvConfig {
  return { platforms: catalog.platforms, devices: catalog.devices, app };
}

const ORIENTATIONS: Orientation[] = ['portrait', 'landscape'];

export function targetKey(t: Target): string {
  return `${t.deviceId}/${t.displayId}/${t.pose ?? '-'}/${t.orientation}`;
}

export function parseTargetKey(s: string): Target | null {
  const parts = s.split('/');
  if (parts.length !== 4 || parts.some((p) => !p)) return null;
  const [deviceId, displayId, pose, orientation] = parts;
  if (!ORIENTATIONS.includes(orientation as Orientation)) return null;
  return { deviceId, displayId, ...(pose === '-' ? {} : { pose }), orientation: orientation as Orientation };
}

export function enumerateTargets(config: EnvConfig): Target[] {
  const out: Target[] = [];
  for (const d of config.devices) {
    if (!d.enabled) continue;
    const poses = d.platform === 'ios' ? (d.poses ?? []) : (d.postures ?? []);
    if (poses.length) {
      for (const p of poses) {
        const rotation = d.platform === 'android' ? (p as { rotation?: 0 | 90 }).rotation : undefined;
        const orientations = d.platform === 'ios' ? (p as { orientations: Orientation[] }).orientations : offeredOrientations(d, p.display, rotation);
        for (const orientation of orientations) out.push({ deviceId: d.id, displayId: p.display, pose: p.id, orientation });
      }
    } else {
      for (const displayId of Object.keys(d.displays)) {
        for (const orientation of offeredOrientations(d, displayId)) out.push({ deviceId: d.id, displayId, orientation });
      }
    }
  }
  return out;
}

/** The window a target describes. Android targets rotate away from the display's natural shape when needed. */
export function resolveTarget(config: EnvConfig, t: Target): Environment {
  const device = config.devices.find((d) => d.id === t.deviceId);
  const known =
    device &&
    device.displays[t.displayId] &&
    (!t.pose || (device.platform === 'ios' ? device.poses : device.postures)?.some((p) => p.id === t.pose));
  if (!known) throw new Error(`Unknown target ${targetKey(t)}`);
  let rotation = t.rotation;
  if (device.platform === 'android' && rotation === undefined) {
    const disp = device.displays[t.displayId];
    const natural: Orientation = disp.size.width > disp.size.height ? 'landscape' : 'portrait';
    rotation = natural === t.orientation ? 0 : 90;
  }
  return resolveEnvironment(config, {
    deviceId: t.deviceId,
    displayId: t.displayId,
    orientation: t.orientation,
    free: null,
    ...(t.pose ? { pose: t.pose } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
  });
}
```
If a posture fixes its own `rotation` (tabletop, 90), the engine applies it; check that the
Surface Duo 2 `spanned-landscape` target resolves to 756×1100 and add that assertion to the test.

- [ ] **Step 5:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 6: Commit** (two microcommits)

```bash
git add packages/core/src/config/orientations.ts packages/core/src/config/schema.ts
git commit -m "Share which orientations a display offers"
git add packages/core/src/targets.ts packages/core/src/targets.test.ts packages/core/src/engine
git commit -m "Add target keys and resolve targets from the catalog alone"
```

### Task 2: Preset frames

**Files:** Create `packages/core/src/presets.ts`, `packages/core/src/presets.test.ts`

**Interfaces:**
- Consumes: `resolveTarget`, `targetKey` (Task 1).
- Produces:

```ts
export interface PresetFrame {
  key: string;
  name: string;
  width: number;
  height: number;
  unit: string;
  cornerRadius: number;
  hinges: { rect: Rect; separating: boolean; occludes: boolean }[];
  safeZones: Rect[];
  insets: { top: number; right: number; bottom: number; left: number };
  reserved: { label: string; rect: Rect }[];
  grid: { columns: number; gutter: number; margin: number };
  twoPane: { axis: 'vertical' | 'horizontal'; gutter: number; offset: number } | null;
  estimated: boolean;
}
export const SAFE_ZONE_PADDING = 16;
export function hingeSafeZone(env: Environment, padding?: number): Rect[];
export function defaultGrid(env: Environment): { columns: number; gutter: number; margin: number };
export function presetSpec(config: EnvConfig, t: Target): PresetFrame;
```

- [ ] **Step 1: Write the failing test** `presets.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { envConfigOf } from './targets';
import { presetSpec } from './presets';

const config = envConfigOf(loadCatalog());

describe('preset frames', () => {
  it('sizes and names a frame after its target', () => {
    const p = presetSpec(config, { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'book', orientation: 'portrait' });
    expect(p).toMatchObject({ key: 'galaxy-z-fold-7/inner/book/portrait', width: 750, height: 832, unit: 'dp' });
    expect(p.name).toBe('Screen / Galaxy Z Fold 7 · Inner display · Half-open, book · portrait');
  });

  it('draws a separating hinge, a padded safe zone and a two-pane grid split at it', () => {
    const p = presetSpec(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });
    expect(p.hinges).toEqual([{ rect: { x: 537, y: 0, width: 26, height: 756 }, separating: true, occludes: true }]);
    expect(p.safeZones).toEqual([{ x: 521, y: 0, width: 58, height: 756 }]);
    expect(p.twoPane).toEqual({ axis: 'vertical', gutter: 26, offset: 0 });
  });

  it('has no two-pane grid when the crease does not separate', () => {
    const p = presetSpec(config, { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' });
    expect(p.hinges).toHaveLength(1);
    expect(p.hinges[0].separating).toBe(false);
    expect(p.twoPane).toBeNull();
    expect(p.safeZones).toEqual([]);
  });

  it('uses Material grid defaults by width class', () => {
    expect(presetSpec(config, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' }).grid).toEqual({ columns: 4, gutter: 16, margin: 16 });
    expect(presetSpec(config, { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'landscape' }).grid).toEqual({ columns: 12, gutter: 24, margin: 24 });
  });
});
```
Before running, read `displayLabel` and the pose label the Fold 7 book posture resolves to
(`resolveTarget(...).displayLabel`, `.pose.label`) and adjust the expected name if the catalog
labels differ; the format stays `Screen / <device> · <display> · <posture> · <orientation>`,
with `flat` when there is no posture. Run → FAIL.

- [ ] **Step 2: Implement** `presets.ts`

```ts
// A declarative artboard for one target: size, hinge overlay, safe zones, insets and grids.
// The plugin turns it into Figma nodes; the web app turns it into SVG.
import type { Rect } from './config/types';
import type { EnvConfig, Environment } from './engine/environment';
import { resolveTarget, targetKey, type Target } from './targets';

export interface PresetFrame {
  key: string;
  name: string;
  width: number;
  height: number;
  unit: string;
  cornerRadius: number;
  hinges: { rect: Rect; separating: boolean; occludes: boolean }[];
  safeZones: Rect[];
  insets: { top: number; right: number; bottom: number; left: number };
  reserved: { label: string; rect: Rect }[];
  grid: { columns: number; gutter: number; margin: number };
  twoPane: { axis: 'vertical' | 'horizontal'; gutter: number; offset: number } | null;
  estimated: boolean;
}

/** Keep-out padding either side of a separating hinge. Estimated: no platform publishes one. */
export const SAFE_ZONE_PADDING = 16;

export function hingeSafeZone(env: Environment, padding = SAFE_ZONE_PADDING): Rect[] {
  return env.folds
    .filter((f) => f.separating || f.occludes)
    .map((f) =>
      f.axis === 'vertical'
        ? { x: Math.max(0, f.rect.x - padding), y: 0, width: Math.min(env.width, f.rect.x + f.rect.width + padding) - Math.max(0, f.rect.x - padding), height: env.height }
        : { x: 0, y: Math.max(0, f.rect.y - padding), width: env.width, height: Math.min(env.height, f.rect.y + f.rect.height + padding) - Math.max(0, f.rect.y - padding) },
    );
}

/** Material 3 layout grid by window width: 4/8/12 columns, 16/24 margins. Used when no app profile supplies rules. */
export function defaultGrid(env: Environment): { columns: number; gutter: number; margin: number } {
  if (env.width < 600) return { columns: 4, gutter: 16, margin: 16 };
  if (env.width < 840) return { columns: 8, gutter: 24, margin: 24 };
  return { columns: 12, gutter: 24, margin: 24 };
}

export function presetSpec(config: EnvConfig, t: Target): PresetFrame {
  const env = resolveTarget(config, t);
  const split = env.folds.find((f) => f.separating || f.occludes) ?? null;
  const posture = env.pose?.label ?? 'flat';
  return {
    key: targetKey(t),
    name: `Screen / ${env.deviceName} · ${env.displayLabel} · ${posture} · ${t.orientation}`,
    width: env.width,
    height: env.height,
    unit: env.unit,
    cornerRadius: env.cornerRadius,
    hinges: env.folds.map((f) => ({ rect: f.rect, separating: f.separating, occludes: f.occludes })),
    safeZones: hingeSafeZone(env),
    insets: { top: env.safeArea.top, right: env.safeArea.right, bottom: env.safeArea.bottom, left: env.safeArea.left },
    reserved: env.reservedRegions.map((r) => ({ label: r.label, rect: r.rect })),
    grid: defaultGrid(env),
    twoPane: split ? { axis: split.axis, gutter: split.axis === 'vertical' ? split.rect.width : split.rect.height, offset: 0 } : null,
    estimated: env.estimated,
  };
}
```
Check `SafeArea`'s field names in `engine/environment.ts` before writing `insets`; if Android
exposes insets through `env.android` instead of `safeArea`, read them from where the Overlays
component in the simulator reads them.

- [ ] **Step 3:** `npm test -w @dobra/core && npm run typecheck` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/core/src/presets.ts packages/core/src/presets.test.ts
git commit -m "Describe preset artboards with hinges, safe zones and grids"
```

### Task 3: SVG export of a preset (for the web app and for designers without the plugin)

**Files:** Create `packages/core/src/presetSvg.ts`, `packages/core/src/presetSvg.test.ts`

**Interfaces:** Produces `toSVG(p: PresetFrame): string` and `toPluginJSON(p: PresetFrame[]): string`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { envConfigOf } from './targets';
import { presetSpec } from './presets';
import { toPluginJSON, toSVG } from './presetSvg';

const p = presetSpec(envConfigOf(loadCatalog()), { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });

describe('preset export', () => {
  it('writes an SVG with named groups Figma turns into layers', () => {
    const svg = toSVG(p);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1100" height="756"/);
    expect(svg).toContain('<g id="hinge">');
    expect(svg).toContain('<g id="safe-zone">');
    expect(svg).toContain('<rect x="537" y="0" width="26" height="756"');
  });

  it('writes JSON the plugin can import', () => {
    expect(JSON.parse(toPluginJSON([p]))).toEqual({ version: 1, frames: [p] });
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

```ts
import type { PresetFrame } from './presets';

const rect = (r: { x: number; y: number; width: number; height: number }, fill: string, opacity: number) =>
  `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${fill}" fill-opacity="${opacity}"/>`;

/** An SVG of the frame with its overlay as named groups; pasting it into Figma gives editable layers. */
export function toSVG(p: PresetFrame): string {
  const i = p.insets;
  const insets = [
    { x: 0, y: 0, width: p.width, height: i.top },
    { x: 0, y: p.height - i.bottom, width: p.width, height: i.bottom },
    { x: 0, y: 0, width: i.left, height: p.height },
    { x: p.width - i.right, y: 0, width: i.right, height: p.height },
  ].filter((r) => r.width > 0 && r.height > 0);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}">`,
    `<title>${p.name}</title>`,
    `<rect id="frame" width="${p.width}" height="${p.height}" rx="${p.cornerRadius}" fill="#ffffff"/>`,
    `<g id="insets">${insets.map((r) => rect(r, '#3b82f6', 0.12)).join('')}</g>`,
    `<g id="reserved">${p.reserved.map((r) => rect(r.rect, '#f59e0b', 0.3)).join('')}</g>`,
    `<g id="safe-zone">${p.safeZones.map((r) => rect(r, '#ef4444', 0.08)).join('')}</g>`,
    `<g id="hinge">${p.hinges.map((h) => rect(h.rect, '#ef4444', 0.2)).join('')}</g>`,
    '</svg>',
  ].join('');
}

export function toPluginJSON(frames: PresetFrame[]): string {
  return JSON.stringify({ version: 1, frames }, null, 2);
}
```
Escape `&`, `<` and `>` in `p.name` for the `<title>` (a device name could contain `&`); add a
test with a name containing `&` if any catalog name does, otherwise a unit test on the escaper.

- [ ] **Step 3:** `npm test -w @dobra/core` → PASS. **Step 4: Commit**

```bash
git add packages/core/src/presetSvg.ts packages/core/src/presetSvg.test.ts
git commit -m "Export preset artboards as SVG and plugin JSON"
```

### Task 4: Matching frames to targets

**Files:** Create `packages/core/src/match.ts`, `packages/core/src/match.test.ts`

**Interfaces:**
- Consumes: `enumerateTargets`, `parseTargetKey`, `resolveTarget` (Task 1).
- Produces: `matchFrame(input: { tag?: string; name: string; width: number; height: number }, config: EnvConfig): { targets: Target[]; by: 'tag' | 'name' | 'size' | 'none'; nearest?: { key: string; width: number; height: number } }`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { envConfigOf, targetKey } from './targets';
import { matchFrame } from './match';

const config = envConfigOf(loadCatalog());

describe('matchFrame', () => {
  it('trusts a valid tag first', () => {
    const m = matchFrame({ tag: 'galaxy-z-fold-7/inner/book/portrait', name: 'Anything', width: 1, height: 1 }, config);
    expect(m.by).toBe('tag');
    expect(m.targets.map(targetKey)).toEqual(['galaxy-z-fold-7/inner/book/portrait']);
  });

  it('ignores a tag for a device the catalog no longer has', () => {
    const m = matchFrame({ tag: 'gone-device/main/-/portrait', name: 'Frame 1', width: 3, height: 3 }, config);
    expect(m.by).toBe('none');
  });

  it('reads a key written in the frame name', () => {
    const m = matchFrame({ name: 'Home — pixel-9/main/-/portrait', width: 10, height: 10 }, config);
    expect(m.by).toBe('name');
  });

  it('matches by size within 1px, in either orientation, and keeps every candidate', () => {
    const m = matchFrame({ name: 'Frame 12', width: 1100.4, height: 756 }, config);
    expect(m.by).toBe('size');
    expect(m.targets.map(targetKey)).toContain('surface-duo-2/spanned/spanned/landscape');
    const rotated = matchFrame({ name: 'Frame 13', width: 780, height: 360 }, config);
    expect(rotated.targets.map((t) => t.deviceId)).toContain('galaxy-s25');
  });

  it('reports the nearest size when nothing matches', () => {
    const m = matchFrame({ name: 'Odd', width: 399, height: 801 }, config);
    expect(m.by).toBe('none');
    expect(m.nearest).toBeDefined();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

```ts
import type { EnvConfig } from './engine/environment';
import { enumerateTargets, parseTargetKey, resolveTarget, targetKey, type Target } from './targets';

export interface FrameInput {
  tag?: string;
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

export function matchFrame(input: FrameInput, config: EnvConfig): FrameMatch {
  const tagged = input.tag ? parseTargetKey(input.tag) : null;
  if (resolvable(config, tagged)) return { targets: [tagged], by: 'tag' };
  const named = input.name.match(KEY_IN_NAME);
  const fromName = named ? parseTargetKey(named[0]) : null;
  if (resolvable(config, fromName)) return { targets: [fromName], by: 'name' };

  const sized = enumerateTargets(config).map((t) => ({ t, env: resolveTarget(config, t) }));
  const hits = sized.filter(({ env }) => Math.abs(env.width - input.width) <= TOLERANCE && Math.abs(env.height - input.height) <= TOLERANCE);
  if (hits.length) return { targets: hits.map((h) => h.t), by: 'size' };
  const nearest = sized.reduce((best, cur) =>
    Math.hypot(cur.env.width - input.width, cur.env.height - input.height) < Math.hypot(best.env.width - input.width, best.env.height - input.height) ? cur : best,
  );
  return { targets: [], by: 'none', nearest: { key: targetKey(nearest.t), width: nearest.env.width, height: nearest.env.height } };
}
```
Orientation is already covered: `enumerateTargets` lists landscape targets separately, so a
rotated frame matches the landscape target. If `resolveTarget` over all targets is slow in the
test (hundreds of targets), memoise the sized list per `config` object with a `WeakMap`.

- [ ] **Step 3:** `npm test -w @dobra/core` → PASS. **Step 4: Commit**

```bash
git add packages/core/src/match.ts packages/core/src/match.test.ts
git commit -m "Match frames to targets by tag, name or size"
```

### Task 5: Coverage

**Files:** Create `packages/core/src/coverage.ts`, `packages/core/src/coverage.test.ts`

**Interfaces:**
- Consumes: `Catalog` requirements, `postureKinds`-style lookup, `offeredOrientations`, `Target`.
- Produces:

```ts
export interface PresentFrame { frameId: string; targets: Target[]; confidence: 'tag' | 'name' | 'size' }
export interface CoverageCell {
  requirement: Catalog['requirements'][number];
  status: 'present' | 'present-by-size' | 'missing';
  frames: string[];
}
export interface CoverageMatrix { cells: CoverageCell[]; byCategory: Record<string, { required: number; present: number }> }
export function kindOf(config: EnvConfig, t: Target): string;              // posture kind, 'flat' without a posture
export function coverage(catalog: Catalog, present: PresentFrame[]): CoverageMatrix;
export function representativeTarget(catalog: Catalog, r: Catalog['requirements'][number]): Target | null;
```

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { coverage, representativeTarget } from './coverage';
import { targetKey } from './targets';

const cat = loadCatalog();
const req = (category: string, kind: string, orientation: string) =>
  cat.requirements.find((r) => r.category === category && r.kind === kind && r.orientation === orientation)!;

describe('coverage', () => {
  it('marks every required cell missing on an empty page', () => {
    const m = coverage(cat, []);
    expect(m.cells.filter((c) => c.requirement.level === 'required').every((c) => c.status === 'missing')).toBe(true);
  });

  it('counts a tagged frame for its category, posture kind and orientation', () => {
    const m = coverage(cat, [{ frameId: '1:1', confidence: 'tag', targets: [{ deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'book', orientation: 'portrait' }] }]);
    const cell = m.cells.find((c) => c.requirement === req('foldable-book', 'book', 'portrait'))!;
    expect(cell).toMatchObject({ status: 'present', frames: ['1:1'] });
  });

  it('keeps size-only matches at low confidence and never upgrades them', () => {
    const m = coverage(cat, [{ frameId: '2:2', confidence: 'size', targets: [{ deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' }] }]);
    expect(m.cells.find((c) => c.requirement === req('phone', 'flat', 'portrait'))!.status).toBe('present-by-size');
  });

  it('picks a device that can show a missing cell', () => {
    const t = representativeTarget(cat, req('dual-screen', 'book', 'landscape'))!;
    expect(targetKey(t)).toBe('surface-duo-2/spanned/spanned/landscape');
  });

  it('summarises by category', () => {
    const m = coverage(cat, []);
    expect(m.byCategory['dual-screen']).toEqual({ required: 3, present: 0 });
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `coverage.ts`

```ts
// Which required cells (category × posture kind × orientation) the frames on a page cover.
import type { Catalog } from './config/schema';
import type { EnvConfig } from './engine/environment';
import { enumerateTargets, envConfigOf, type Target } from './targets';

type Requirement = Catalog['requirements'][number];

export interface PresentFrame {
  frameId: string;
  targets: Target[];
  confidence: 'tag' | 'name' | 'size';
}

export interface CoverageCell {
  requirement: Requirement;
  status: 'present' | 'present-by-size' | 'missing';
  frames: string[];
}

export interface CoverageMatrix {
  cells: CoverageCell[];
  byCategory: Record<string, { required: number; present: number }>;
}

/** The posture kind a target shows; a target without a posture is flat. */
export function kindOf(config: EnvConfig, t: Target): string {
  const d = config.devices.find((x) => x.id === t.deviceId);
  if (!d || !t.pose) return 'flat';
  const list = d.platform === 'ios' ? (d.poses ?? []) : (d.postures ?? []);
  return list.find((p) => p.id === t.pose)?.kind ?? 'flat';
}

function satisfies(config: EnvConfig, t: Target, r: Requirement): boolean {
  const d = config.devices.find((x) => x.id === t.deviceId);
  return !!d && d.category === r.category && kindOf(config, t) === r.kind && t.orientation === r.orientation;
}

export function coverage(catalog: Catalog, present: PresentFrame[]): CoverageMatrix {
  const config = envConfigOf(catalog);
  const cells = catalog.requirements.map((requirement): CoverageCell => {
    const hits = present.filter((f) => f.targets.some((t) => satisfies(config, t, requirement)));
    const confident = hits.filter((f) => f.confidence !== 'size');
    const status = confident.length ? 'present' : hits.length ? 'present-by-size' : 'missing';
    return { requirement, status, frames: (confident.length ? confident : hits).map((f) => f.frameId) };
  });
  const byCategory: CoverageMatrix['byCategory'] = {};
  for (const c of cells) {
    if (c.requirement.level !== 'required') continue;
    const row = (byCategory[c.requirement.category] ??= { required: 0, present: 0 });
    row.required += 1;
    if (c.status === 'present') row.present += 1;
  }
  return { cells, byCategory };
}

/** The first target, in catalog order, that can show a requirement's cell. */
export function representativeTarget(catalog: Catalog, r: Requirement): Target | null {
  const config = envConfigOf(catalog);
  return enumerateTargets(config).find((t) => satisfies(config, t, r)) ?? null;
}
```

- [ ] **Step 3:** `npm test -w @dobra/core` → PASS. **Step 4: Commit**

```bash
git add packages/core/src/coverage.ts packages/core/src/coverage.test.ts
git commit -m "Compute coverage of the catalog requirements from present frames"
```

### Task 6: Plugin package, manifest and builds

**Files:**
- Create: `packages/figma-plugin/{package.json,manifest.json,tsconfig.json,tsconfig.ui.json,build.mjs,vite.config.ts,vitest.config.ts}`,
  `packages/figma-plugin/src/{messages.ts,api.ts,code.ts}`,
  `packages/figma-plugin/src/ui/{index.html,main.tsx,App.tsx}`,
  `packages/figma-plugin/src/manifest.test.ts`, `packages/figma-plugin/src/bundle.test.ts`

**Interfaces:**
- Produces:
  - `type PluginMsg` (messages.ts): UI→main `{ type: 'list-targets' } | { type: 'create-presets'; keys: string[] } | { type: 'scan-tags' } | { type: 'apply-tag'; frameId: string; key: string } | { type: 'coverage' } | { type: 'create-missing' }`;
    main→UI `{ type: 'targets'; items: { key: string; name: string; category: string }[] } | { type: 'created'; frameIds: string[] } | { type: 'tag-candidates'; frames: { id: string; name: string; by: string; candidates: string[]; nearest?: string }[] } | { type: 'coverage'; matrix: CoverageMatrix } | { type: 'error'; message: string }`
  - `interface FigmaApi` (api.ts): the subset of the plugin API used — `createFrame()`,
    `createRectangle()`, `currentPage` (`children`, `findAllWithCriteria`, `appendChild`,
    `selection`), `viewport.scrollAndZoomIntoView(nodes)`, `getNodeByIdAsync(id)`, `ui.postMessage`,
    and on nodes `name`, `x`, `y`, `width`, `height`, `resize`, `appendChild`, `fills`,
    `locked`, `visible`, `layoutGrids`, `cornerRadius`, `clipsContent`, `constraints`,
    `setSharedPluginData`, `getSharedPluginData`. Type it with `@figma/plugin-typings`
    (`Pick<PluginAPI, …>`, `FrameNode`, `RectangleNode`) so the real `figma` global satisfies it.

- [ ] **Step 1: Failing tests**

`manifest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';

describe('manifest', () => {
  it('is a network-free, dynamic-page plugin with the slice 3 commands', () => {
    expect(manifest).toMatchObject({
      name: 'Dobra',
      api: '1.0.0',
      editorType: ['figma', 'dev'],
      main: 'dist/code.js',
      ui: 'dist/ui.html',
      documentAccess: 'dynamic-page',
      networkAccess: { allowedDomains: ['none'] },
    });
    expect(manifest.menu.map((m: { command: string }) => m.command)).toEqual(['presets', 'tag', 'coverage']);
  });
});
```
`bundle.test.ts` (runs after the build; skipped when `dist/` is missing so `npm test` alone
still works, and the build script runs it explicitly):
```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = (f: string) => fileURLToPath(new URL(`../dist/${f}`, import.meta.url));

describe.skipIf(!existsSync(dist('code.js')))('bundle', () => {
  it('ships the catalog and no app profile', () => {
    const code = readFileSync(dist('code.js'), 'utf8');
    expect(code).toContain('surface-duo-2');
    expect(code).not.toContain('layoutRules');
    expect(code).not.toContain('Sample design system');
  });

  it('builds one self-contained UI file', () => {
    const html = readFileSync(dist('ui.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});
```
Run: `npm test -w @dobra/figma-plugin` → FAIL (workspace missing).

- [ ] **Step 2: Package files**

`packages/figma-plugin/package.json`:
```json
{
  "name": "@dobra/figma-plugin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "node build.mjs && vite build && vitest run src/bundle.test.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.ui.json",
    "test": "vitest run"
  },
  "dependencies": { "@dobra/core": "*", "react": "^19.3.0", "react-dom": "^19.3.0" },
  "devDependencies": {
    "@figma/plugin-typings": "^1.139.0",
    "@types/node": "^26.6.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "esbuild": "^0.28.2",
    "typescript": "^7.0.2",
    "vite": "^8.3.1",
    "vite-plugin-singlefile": "^2.3.3",
    "vitest": "^4.1.11"
  }
}
```
`manifest.json`:
```json
{
  "name": "Dobra",
  "id": "dobra-foldable-artboards-dev",
  "api": "1.0.0",
  "editorType": ["figma", "dev"],
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] },
  "menu": [
    { "name": "Artboards", "command": "presets" },
    { "name": "Tag frames", "command": "tag" },
    { "name": "Coverage", "command": "coverage" }
  ]
}
```
(A development plugin imported from its manifest can use any id; Figma assigns a real one when
the plugin is published.)
`tsconfig.json` (main thread: no DOM): `"lib": ["ES2022"]`, `"types": ["@figma/plugin-typings", "node"]`,
`"include": ["src"]`, `"exclude": ["src/ui"]`, plus the core options (`strict`, `moduleResolution: bundler`,
`resolveJsonModule`, `noEmit`, `skipLibCheck`).
`tsconfig.ui.json`: `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"`, `"include": ["src/ui", "src/messages.ts"]`.
`build.mjs`:
```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  format: 'iife',
  target: 'es2017',
  logLevel: 'info',
});
```
If esbuild cannot lower a construct zod uses to es2017 (for example BigInt literals), raise the
target to `es2020` — the plugin sandbox supports it — and ledger the change.
`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src/ui',
  plugins: [react(), viteSingleFile()],
  build: { outDir: '../../dist', emptyOutDir: false, rollupOptions: { input: 'src/ui/index.html' } },
});
```
Adjust `input` to the path Vite expects relative to `root` (`index.html`) if the build cannot
find it, and rename the output to `ui.html` (`build.rollupOptions.output` or a rename step in
`build.mjs` after Vite runs).
`vitest.config.ts`: `test: { include: ['src/**/*.test.ts'], environment: 'node' }`.

- [ ] **Step 3: Minimal sources**

`src/messages.ts` — the `PluginMsg` union from the Interfaces block, split into
`ToMain` and `ToUi`, with `CoverageMatrix` imported as a type from `@dobra/core/coverage`.
`src/api.ts` — `export type FigmaApi = Pick<PluginAPI, 'createFrame' | 'createRectangle' | 'currentPage' | 'viewport' | 'getNodeByIdAsync' | 'ui'>;`
`src/code.ts`:
```ts
import type { ToMain } from './messages';
import { handle } from './handlers';

figma.showUI(__html__, { width: 360, height: 560, themeColors: true });
figma.ui.onmessage = async (msg: ToMain) => {
  const reply = await handle(figma, msg);
  if (reply) figma.ui.postMessage(reply);
};
if (figma.command) void handle(figma, { type: figma.command === 'coverage' ? 'coverage' : figma.command === 'tag' ? 'scan-tags' : 'list-targets' }).then((r) => r && figma.ui.postMessage(r));
```
`src/handlers.ts` in this task: `export async function handle(api: FigmaApi, msg: ToMain): Promise<ToUi | null> { return { type: 'error', message: `Not implemented: ${msg.type}` }; }` (Tasks 7–9 fill it in).
`src/ui/index.html`: a `<div id="root">` and `<script type="module" src="./main.tsx">`.
`src/ui/main.tsx`: `createRoot(document.getElementById('root')!).render(<App />)`.
`src/ui/App.tsx`: three tabs (Artboards, Tag frames, Coverage) that post `list-targets`,
`scan-tags` and `coverage` on open and render the replies as plain lists; Task 9 fills in the
panels.

- [ ] **Step 4:** `npm install && npm test -w @dobra/figma-plugin && npm run build -w @dobra/figma-plugin && npm run typecheck -w @dobra/figma-plugin`
  Expected: manifest test PASS; build writes `dist/code.js` and `dist/ui.html`; the bundle test
  runs inside the build and PASSES; typecheck PASS. Add `packages/figma-plugin/dist/` is covered
  by the root `.gitignore` (`dist/`); confirm with `git status`.
- [ ] **Step 5: Commit**

```bash
git add packages/figma-plugin package-lock.json
git commit -m "Scaffold the Figma plugin with its manifest, message types and builds"
```

### Task 7: Applying presets to the canvas

**Files:**
- Create: `packages/figma-plugin/src/test/fakeFigma.ts`, `packages/figma-plugin/src/presets.ts`,
  `packages/figma-plugin/src/presets.test.ts`

**Interfaces:**
- Consumes: `PresetFrame`, `presetSpec` (Task 2), `FigmaApi` (Task 6).
- Produces: `NAMESPACE = 'dobra'`, `OVERLAY_NAME = '⎔ hinge-overlay'`,
  `applyPreset(api: FigmaApi, p: PresetFrame, catalogVersion: string): FrameNode`,
  `nextFreeX(api: FigmaApi, gap?: number): number`; `createFakeFigma(): FigmaApi & { page: FakeNode }`.

- [ ] **Step 1: Write the fake** `src/test/fakeFigma.ts` — an in-memory node tree implementing
  exactly the members `FigmaApi` and `applyPreset` use: nodes with `id` (incrementing `"1:n"`),
  `type` (`'FRAME' | 'RECTANGLE'`), `name`, `x`, `y`, `width`, `height`, `resize(w, h)`,
  `children`, `appendChild(child)` (sets `parent`), `fills`, `locked`, `visible`, `layoutGrids`,
  `cornerRadius`, `clipsContent`, `constraints`, `setSharedPluginData(ns, key, value)` /
  `getSharedPluginData(ns, key)` (a `Map`, returning `''` when unset like Figma), and a page with
  `children`, `appendChild`, `selection`, `findAllWithCriteria({ types, sharedPluginData })`
  (depth-first over descendants, filtering by type and by a non-empty shared plugin data value
  for every key listed). `createFrame()` and `createRectangle()` append to the page, as Figma
  does. `viewport.scrollAndZoomIntoView` records its argument; `getNodeByIdAsync` searches the
  tree. Cast the object to `FigmaApi` once at the end (`as unknown as FigmaApi & { page: … }`)
  and keep the fake's own types structural.

- [ ] **Step 2: Failing test** `src/presets.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { presetSpec } from '@dobra/core/presets';
import { envConfigOf } from '@dobra/core/targets';
import { applyPreset, NAMESPACE, OVERLAY_NAME } from './presets';
import { createFakeFigma } from './test/fakeFigma';

const catalog = loadCatalog();
const config = envConfigOf(catalog);
const duo = presetSpec(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });

describe('applyPreset', () => {
  it('creates a sized, named, tagged frame', () => {
    const api = createFakeFigma();
    const frame = applyPreset(api, duo, catalog.version);
    expect(frame).toMatchObject({ name: duo.name, width: 1100, height: 756 });
    expect(frame.getSharedPluginData(NAMESPACE, 'target')).toBe(duo.key);
    expect(frame.getSharedPluginData(NAMESPACE, 'catalogVersion')).toBe(catalog.version);
  });

  it('adds a locked overlay with the hinge and its safe zone', () => {
    const frame = applyPreset(createFakeFigma(), duo, catalog.version);
    const overlay = frame.children.find((c) => c.name === OVERLAY_NAME) as FrameNode;
    expect(overlay.locked).toBe(true);
    const names = overlay.children.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Hinge', 'Hinge safe zone']));
    const hinge = overlay.children.find((c) => c.name === 'Hinge')!;
    expect(hinge).toMatchObject({ x: 537, y: 0, width: 26, height: 756 });
  });

  it('adds a column grid and a two-pane grid split at the hinge', () => {
    const frame = applyPreset(createFakeFigma(), duo, catalog.version);
    expect(frame.layoutGrids).toEqual([
      expect.objectContaining({ pattern: 'COLUMNS', count: 12, gutterSize: 24, offset: 24 }),
      expect.objectContaining({ pattern: 'COLUMNS', count: 2, gutterSize: 26, offset: 0 }),
    ]);
  });

  it('places each new frame to the right of what is already on the page', () => {
    const api = createFakeFigma();
    const a = applyPreset(api, duo, catalog.version);
    const b = applyPreset(api, duo, catalog.version);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width + 80);
  });
});
```
Run: `npm test -w @dobra/figma-plugin -- src/presets.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/presets.ts`

```ts
import type { PresetFrame } from '@dobra/core/presets';
import type { FigmaApi } from './api';

export const NAMESPACE = 'dobra';
export const OVERLAY_NAME = '⎔ hinge-overlay';
const GAP = 80;
const RED = { r: 0.94, g: 0.27, b: 0.27 };
const BLUE = { r: 0.23, g: 0.51, b: 0.96 };
const AMBER = { r: 0.96, g: 0.62, b: 0.04 };

export function nextFreeX(api: FigmaApi, gap = GAP): number {
  return api.currentPage.children.reduce((x, n) => Math.max(x, n.x + n.width + gap), 0);
}

function box(api: FigmaApi, parent: FrameNode, name: string, r: { x: number; y: number; width: number; height: number }, color: RGB, opacity: number) {
  if (r.width <= 0 || r.height <= 0) return;
  const rect = api.createRectangle();
  rect.name = name;
  rect.resize(r.width, r.height);
  rect.x = r.x;
  rect.y = r.y;
  rect.fills = [{ type: 'SOLID', color, opacity }];
  parent.appendChild(rect);
}

export function applyPreset(api: FigmaApi, p: PresetFrame, catalogVersion: string): FrameNode {
  const x = nextFreeX(api);
  const frame = api.createFrame();
  frame.name = p.name;
  frame.resize(p.width, p.height);
  frame.x = x;
  frame.y = 0;
  frame.cornerRadius = p.cornerRadius;
  frame.clipsContent = true;
  frame.setSharedPluginData(NAMESPACE, 'target', p.key);
  frame.setSharedPluginData(NAMESPACE, 'catalogVersion', catalogVersion);
  frame.layoutGrids = [
    { pattern: 'COLUMNS', alignment: 'STRETCH', count: p.grid.columns, gutterSize: p.grid.gutter, offset: p.grid.margin, visible: true, color: { ...BLUE, a: 0.08 } },
    ...(p.twoPane
      ? [{ pattern: p.twoPane.axis === 'vertical' ? 'COLUMNS' : 'ROWS', alignment: 'STRETCH', count: 2, gutterSize: p.twoPane.gutter, offset: p.twoPane.offset, visible: true, color: { ...RED, a: 0.1 } } as LayoutGrid]
      : []),
  ];

  const overlay = api.createFrame();
  overlay.name = OVERLAY_NAME;
  overlay.resize(p.width, p.height);
  overlay.fills = [];
  overlay.clipsContent = false;
  frame.appendChild(overlay);
  overlay.x = 0;
  overlay.y = 0;
  overlay.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
  const i = p.insets;
  box(api, overlay, 'Inset top', { x: 0, y: 0, width: p.width, height: i.top }, BLUE, 0.12);
  box(api, overlay, 'Inset bottom', { x: 0, y: p.height - i.bottom, width: p.width, height: i.bottom }, BLUE, 0.12);
  box(api, overlay, 'Inset left', { x: 0, y: 0, width: i.left, height: p.height }, BLUE, 0.12);
  box(api, overlay, 'Inset right', { x: p.width - i.right, y: 0, width: i.right, height: p.height }, BLUE, 0.12);
  for (const r of p.reserved) box(api, overlay, r.label, r.rect, AMBER, 0.3);
  for (const z of p.safeZones) box(api, overlay, 'Hinge safe zone', z, RED, 0.08);
  for (const h of p.hinges) box(api, overlay, 'Hinge', h.rect, RED, 0.2);
  // A crease with no width still gets a hairline so designers can see it.
  for (const h of p.hinges.filter((h) => h.rect.width === 0 || h.rect.height === 0)) {
    box(api, overlay, 'Crease', h.rect.width === 0 ? { ...h.rect, x: h.rect.x - 0.5, width: 1 } : { ...h.rect, y: h.rect.y - 0.5, height: 1 }, RED, 0.5);
  }
  overlay.locked = true;
  return frame;
}
```
`box` skips zero-size rects, so a zero-width crease only draws the `Crease`
hairline — add a test for `pixel-9-pro-fold` open that expects one `Crease` child and no `Hinge`.

- [ ] **Step 4:** `npm test -w @dobra/figma-plugin && npm run typecheck -w @dobra/figma-plugin` → PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/figma-plugin/src
git commit -m "Create tagged artboards with hinge overlays and grids"
```

### Task 8: Tag frames

**Files:** Create `packages/figma-plugin/src/tagging.ts`, `packages/figma-plugin/src/tagging.test.ts`

**Interfaces:**
- Consumes: `matchFrame` (Task 4), `NAMESPACE` (Task 7), the fake (Task 7).
- Produces: `topLevelFrames(api): FrameNode[]`,
  `tagCandidates(api, config): { id; name; by; candidates: string[]; nearest?: string }[]`
  (untagged or stale-tagged frames only), `applyTag(api, frameId, key, catalogVersion): Promise<void>`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { envConfigOf } from '@dobra/core/targets';
import { NAMESPACE } from './presets';
import { applyTag, tagCandidates } from './tagging';
import { createFakeFigma } from './test/fakeFigma';

const catalog = loadCatalog();
const config = envConfigOf(catalog);

function frame(api: ReturnType<typeof createFakeFigma>, name: string, w: number, h: number, tag = '') {
  const f = api.createFrame();
  f.name = name;
  f.resize(w, h);
  if (tag) f.setSharedPluginData(NAMESPACE, 'target', tag);
  return f;
}

describe('Tag frames', () => {
  it('lists untagged frames with their size candidates and skips tagged ones', () => {
    const api = createFakeFigma();
    frame(api, 'Home', 1100, 756);
    frame(api, 'Done', 750, 832, 'galaxy-z-fold-7/inner/book/portrait');
    const list = tagCandidates(api, config);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Home', by: 'size' });
    expect(list[0].candidates).toContain('surface-duo-2/spanned/spanned/landscape');
  });

  it('lists a frame whose tag points at a device the catalog no longer has', () => {
    const api = createFakeFigma();
    frame(api, 'Old', 10, 10, 'gone/main/-/portrait');
    expect(tagCandidates(api, config)[0]).toMatchObject({ name: 'Old', by: 'none' });
  });

  it('writes the chosen tag and catalog version', async () => {
    const api = createFakeFigma();
    const f = frame(api, 'Home', 1100, 756);
    await applyTag(api, f.id, 'surface-duo-2/spanned/spanned/landscape', catalog.version);
    expect(f.getSharedPluginData(NAMESPACE, 'target')).toBe('surface-duo-2/spanned/spanned/landscape');
    expect(f.getSharedPluginData(NAMESPACE, 'catalogVersion')).toBe(catalog.version);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `tagging.ts`: `topLevelFrames` returns `api.currentPage.children`
  filtered to `type === 'FRAME'`. `tagCandidates` runs `matchFrame({ tag, name, width, height }, config)`
  per frame and keeps frames whose result is not `by: 'tag'`, mapping targets through
  `targetKey` and `nearest?.key`. `applyTag` loads the node with `api.getNodeByIdAsync`, throws
  `Frame <id> not found` when missing, rejects a key `parseTargetKey` cannot read, and writes
  both shared plugin data keys.

- [ ] **Step 3:** `npm test -w @dobra/figma-plugin` → PASS. **Step 4: Commit**

```bash
git add packages/figma-plugin/src/tagging.ts packages/figma-plugin/src/tagging.test.ts
git commit -m "Suggest and write tags for existing frames"
```

### Task 9: Coverage, "Create missing" and the message handlers

**Files:** Create `packages/figma-plugin/src/handlers.test.ts`; modify `src/handlers.ts`,
`src/ui/App.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `handle(api, msg)` for every `ToMain` message; `presentFrames(api, config): PresentFrame[]`.

- [ ] **Step 1: Failing test** `handlers.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { handle } from './handlers';
import { NAMESPACE } from './presets';
import { createFakeFigma } from './test/fakeFigma';

describe('plugin handlers', () => {
  it('lists every target with a name and category', async () => {
    const reply = await handle(createFakeFigma(), { type: 'list-targets' });
    expect(reply?.type).toBe('targets');
    if (reply?.type !== 'targets') return;
    expect(reply.items.find((i) => i.key === 'surface-duo-2/spanned/spanned/landscape')).toMatchObject({ category: 'dual-screen' });
  });

  it('creates presets for the chosen keys and tags them', async () => {
    const api = createFakeFigma();
    const reply = await handle(api, { type: 'create-presets', keys: ['pixel-9/main/-/portrait'] });
    expect(reply).toMatchObject({ type: 'created' });
    expect(api.currentPage.children[0].getSharedPluginData(NAMESPACE, 'target')).toBe('pixel-9/main/-/portrait');
  });

  it('reports an unknown key as an error message, not a crash', async () => {
    expect(await handle(createFakeFigma(), { type: 'create-presets', keys: ['pixel-9/main/nope/portrait'] })).toMatchObject({
      type: 'error',
      message: expect.stringContaining('pixel-9/main/nope/portrait'),
    });
  });

  it('creates only the missing required cells, and nothing on a second run', async () => {
    const api = createFakeFigma();
    const first = await handle(api, { type: 'create-missing' });
    expect(first?.type).toBe('created');
    const count = api.currentPage.children.length;
    expect(count).toBeGreaterThan(0);
    const second = await handle(api, { type: 'create-missing' });
    expect(second).toMatchObject({ type: 'created', frameIds: [] });
    expect(api.currentPage.children.length).toBe(count);
  });

  it('reports coverage with tagged frames present', async () => {
    const api = createFakeFigma();
    await handle(api, { type: 'create-presets', keys: ['surface-duo-2/spanned/spanned/landscape'] });
    const reply = await handle(api, { type: 'coverage' });
    if (reply?.type !== 'coverage') throw new Error('coverage expected');
    expect(reply.matrix.byCategory['dual-screen']).toEqual({ required: 3, present: 1 });
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `handlers.ts`: load the catalog once (`loadCatalog()`) and
  `envConfigOf(catalog)`; wrap every branch in `try/catch` returning
  `{ type: 'error', message: e instanceof Error ? e.message : String(e) }`.
  - `list-targets`: `enumerateTargets` → `{ key, name: presetSpec(...).name, category }`.
  - `create-presets`: `presetSpec` for each key (throws on unknown) then `applyPreset`; select
    the new frames and `viewport.scrollAndZoomIntoView` them; reply `created` with their ids.
  - `scan-tags`: `tagCandidates`. `apply-tag`: `applyTag`, then reply with a fresh `scan-tags`.
  - `coverage`: `presentFrames` (tagged frames → confidence `tag`, others through `matchFrame`
    → `name`/`size`; `none` is skipped) then `coverage(catalog, present)`.
  - `create-missing`: coverage, then for each `required` cell with status `missing`,
    `representativeTarget` → `presetSpec` → `applyPreset`; reply `created`.
- [ ] **Step 3: UI** — `App.tsx` panels:
  - Artboards: targets grouped by category, each a checkbox; a "Create" button posts
    `create-presets` with the checked keys.
  - Tag frames: each candidate frame with a `<select>` of its candidate keys (or "unknown size —
    nearest …"), and an "Apply" button posting `apply-tag`.
  - Coverage: a table of `cells` (category · kind · orientation · status with ✓ / ~ / ✗ and a
    legend: ✓ tagged, ~ size only, ✗ missing) plus per-category counts, and a "Create missing"
    button.
  - Errors from any reply show in a banner at the top.
  Keep the UI in plain React with CSS variables from Figma's theme (`themeColors: true` gives
  `--figma-color-*`).
- [ ] **Step 4:** `npm test && npm run typecheck && npm run build` (root runs every workspace)
  → PASS, and `npm run build -w @dobra/figma-plugin` → PASS including the bundle test.
- [ ] **Step 5: Commit** (two microcommits)

```bash
git add packages/figma-plugin/src/handlers.ts packages/figma-plugin/src/handlers.test.ts
git commit -m "Handle plugin messages for presets, tagging and coverage"
git add packages/figma-plugin/src/ui
git commit -m "Add the plugin panels for artboards, tagging and coverage"
```

### Task 10: README, manual smoke test, issue and PR

- [ ] **Step 1:** `packages/figma-plugin/README.md`: build (`npm run build -w @dobra/figma-plugin`),
  import (Figma desktop › Plugins › Development › Import plugin from manifest… ›
  `packages/figma-plugin/manifest.json`), the three commands, what the tag stores
  (`dobra` / `target`, `catalogVersion`), and that the plugin makes no network requests.
- [ ] **Step 2: Manual smoke test** — the Figma desktop connection is not available to the agent,
  so ask the user to import the plugin and run: Artboards → create Surface Duo 2 spanned and
  Galaxy Z Flip 7 cover; Tag frames on a hand-drawn 412×915 frame; Coverage → Create missing.
  Record what they report in the PR's test plan. Do not mark the manual check done without it.
- [ ] **Step 3:** Issue:

```bash
gh issue create -R jacksonmafra-umain/Dobra \
  --title "Figma plugin: artboard presets, Tag frames and coverage" \
  --label enhancement --label area:plugin \
  --body "Slice 3 of docs/superpowers/specs/2026-09-25-foldable-artboards-design.md. A development plugin that creates tagged artboards with hinge overlays and grids, tags existing frames, and reports coverage against the catalog requirements. Core gains target keys, preset specs, SVG export, frame matching and coverage."
```
- [ ] **Step 4:** `git push -u origin feat/figma-plugin-presets`; PR targeting
  `feat/catalog-devices`, labels `enhancement,area:plugin`, body `Closes #N`, Summary, Test plan
  (counts, typecheck, both plugin builds, bundle test, manual smoke result). No assistant mention.
