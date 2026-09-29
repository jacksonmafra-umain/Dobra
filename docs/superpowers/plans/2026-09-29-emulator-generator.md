# Emulator and Simulator Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a catalog device into an Android emulator (AVD) or iOS simulator, created by `dobra emulator create <device>` or by a script copied from the site's Generator page.

**Architecture:** `@dobra/core/emulator/*` builds a pure `EmulatorPlan` (steps, applied settings, limits) from the catalog. The CLI executes the plan through a `Runner` interface. `renderScript(plan)` in core turns the same plan into a POSIX `sh` script, which the site's Generator page and `dobra emulator script` print.

**Tech Stack:** TypeScript, zod (catalog schema), vitest, Node `child_process` (CLI), Astro (site).

**Spec:** `docs/superpowers/specs/2026-09-29-emulator-generator-design.md`

## Global Constraints

- Every device value comes from `packages/core/src/catalog/catalog.json`, with its `source`. The emulator code contains no device-specific constant. Platform vocabularies (Android density buckets, emulator posture ids and angle ranges) are constants with a source comment.
- Folds are a list: hinge settings come from the display's `hinges` array; two hinges are handled by count, not by a special case.
- Android and iOS are peer plans from the same catalog; no code or comment describes one as a copy of the other.
- `--json` output carries `"version": 1` and the fields `{ version, platform, device, name, id, image, applied, limits, start }` for `create`; `list` returns `{ version: 1, devices: [...] }`.
- Exit codes: 0 success; 2 invalid use (unknown device, no simulator for it, bad options); 1 when a platform tool is missing or fails.
- Default names: `dobra_<device-id>` for AVDs; `<Device name> (Dobra)` for simulators.
- Android image choice: the newest installed image for the host ABI (`arm64-v8a` on arm64, else `x86_64`), tags preferred in order `google_apis_playstore`, `google_apis`, `default`; `--api <n>` picks a level; none installed means stop and print `sdkmanager --install "system-images;android-<n>;google_apis_playstore;<abi>"`.
- The script is POSIX `sh` with `set -eu`; Windows is not supported by the script.
- Commits: English, microcommits, no `Co-Authored-By` or any assistant attribution. One issue per change is already open (#182); every PR says which issue it closes or is part of.
- Never merge to `main` directly; one PR per task group (see "PRs" below).

## Review Focus

1. **Host ABI mismatch** (only `x86_64` images on an arm64 Mac, or the reverse): `create` must exit 1 naming the installed images and the one to install, never create an AVD that won't boot. Test in Task 5.
2. **Non-default paths** (`ANDROID_AVD_HOME`, `ANDROID_SDK_ROOT`, a path with spaces): the CLI and the script must use them and quote them. Tests in Tasks 4 and 5.
3. **A catalog density that isn't an Android density bucket** (for example 2.4375 → 390): round to the nearest bucket and record the rounding in `applied`. Test in Task 2.
4. **Postures with no emulator equivalent** (`rear`, or a device with two hinges): no invented mapping; a `limits` line instead. Test in Task 2.
5. **Running `create` twice**: the second run exits 1 and changes nothing unless `--force`; with `--force`, the config is written only after `avdmanager` succeeds, through a temp file and a rename. Test in Task 5.

## PRs

- **PR 1 (Tasks 1–4):** core: catalog `simulator` field, Android settings, the plan and the script. Part of #182.
- **PR 2 (Tasks 5–7):** CLI `dobra emulator`, the launcher and the real-machine test. Part of #182.
- **PR 3 (Task 8):** the site's Generator page. Closes #182.

## File structure

- `packages/core/src/config/schema.ts` (modify): optional `simulator` on iOS devices.
- `packages/core/src/catalog/catalog.json` (modify): `simulator` for 11 iOS devices.
- `packages/core/src/emulator/android.ts` (create): `androidSettings(device)`: config keys, applied values, limits.
- `packages/core/src/emulator/plan.ts` (create): types, `emulatorPlan`, `emulationSupport`, `EmulatorPlanError`.
- `packages/core/src/emulator/script.ts` (create): `renderScript(plan)`.
- `packages/cli/src/emulator/args.ts` (create): `parseEmulatorArgs`.
- `packages/cli/src/emulator/runner.ts` (create): the `Runner` interface and the Node implementation.
- `packages/cli/src/emulator/android.ts` (create): SDK discovery, image choice, AVD creation.
- `packages/cli/src/emulator/ios.ts` (create): runtime choice, simulator creation.
- `packages/cli/src/emulator/command.ts` (create): `runEmulator(argv, io, runner)`: list, create, script, output.
- `packages/cli/src/main.ts` (modify): dispatch `emulator`.
- `scripts/dobra` (modify): forward `emulator`.
- `packages/cli/README.md` (modify): document the commands.
- `apps/site/src/pages/generator.astro` (create) and `apps/site/src/lib/generator.ts` (create): the page and its pure helpers.
- `apps/site/src/layouts/Base.astro`, `apps/site/src/pages/index.astro` (modify): links.

---

### Task 1: The `simulator` field on iOS devices

**Files:**
- Modify: `packages/core/src/config/schema.ts` (the `iosDevice` object, around line 198)
- Modify: `packages/core/src/catalog/catalog.json` (the 12 iOS devices)
- Test: `packages/core/src/config/schema.test.ts`

**Interfaces:**
- Produces: `IosDevice.simulator?: { deviceType: string; source: string; estimated?: boolean }` (inferred from the zod schema through the existing `types.ts` exports).

- [ ] **Step 1: Write the failing test** (append to `schema.test.ts`)

```ts
import { loadCatalog } from '../catalog/load';

describe('iOS simulator mapping', () => {
  const catalog = loadCatalog();
  const ios = catalog.devices.filter((d) => d.platform === 'ios');

  it('names an Apple simulator device type for every real iOS device', () => {
    for (const d of ios) {
      if (d.id === 'iphone-duo') expect(d.simulator, d.id).toBeUndefined();
      else expect(d.simulator?.deviceType, d.id).toMatch(/^com\.apple\.CoreSimulator\.SimDeviceType\.(iPhone|iPad)-[A-Za-z0-9-]+$/);
    }
  });

  it('marks the closest-model mappings as estimated', () => {
    const estimated = ios.filter((d) => d.simulator?.estimated).map((d) => d.id).sort();
    expect(estimated).toEqual(['ipad-11', 'iphone-mini', 'iphone-plus']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/config/schema.test.ts` in `packages/core`
Expected: FAIL (`simulator` is undefined for every device).

- [ ] **Step 3: Add the schema field**

In `schema.ts`, inside `const iosDevice = z.strictObject({ … })`, after `poses`:

```ts
  /** The Apple simulator that matches this device (`xcrun simctl list devicetypes`); absent for hypothetical devices. */
  simulator: z.strictObject({ deviceType: z.string(), source: sourceRef, estimated: z.boolean().optional() }).optional(),
```

- [ ] **Step 4: Add the catalog data**

Add a `"simulator"` object to each iOS device in `catalog.json` (keep key order: after `"poses"` when present, else after `"displays"`). The prefix is `com.apple.CoreSimulator.SimDeviceType.`:

| Device id | `deviceType` suffix | `estimated` |
|---|---|---|
| `iphone-se` | `iPhone-SE-3rd-generation` | — |
| `iphone-mini` | `iPhone-13-mini` | `true` (generic 5.4-inch; 375×812 pt) |
| `iphone-17` | `iPhone-17` | — |
| `iphone-plus` | `iPhone-16-Plus` | `true` (generic 6.7-inch; 430×932 pt) |
| `iphone-air` | `iPhone-Air` | — |
| `iphone-17-pro-max` | `iPhone-17-Pro-Max` | — |
| `ipad-mini` | `iPad-mini-A17-Pro` | — |
| `ipad-11` | `iPad-A16` | `true` (the entry covers iPad and iPad Air 11-inch) |
| `ipad-pro-11` | `iPad-Pro-11-inch-M5-12GB` | — |
| `ipad-air-13` | `iPad-Air-13-inch-M4` | — |
| `ipad-pro-13` | `iPad-Pro-13-inch-M5-12GB` | — |

Each object is `{ "deviceType": "<prefix><suffix>", "source": "apple-device" }`, plus `"estimated": true` where the table says so. `iphone-duo` gets none.

- [ ] **Step 5: Run the core tests**

Run: `npx vitest run` in `packages/core`
Expected: PASS, including the existing catalog validation tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/src/catalog/catalog.json packages/core/src/config/schema.test.ts
git commit -m "Name the Apple simulator for each iOS device in the catalog"
```

---

### Task 2: Android emulator settings from a catalog device

**Files:**
- Create: `packages/core/src/emulator/android.ts`
- Test: `packages/core/src/emulator/android.test.ts`

**Interfaces:**
- Consumes: `AndroidDevice` from `packages/core/src/config/types.ts` (check the exact exported name there; if the union member isn't exported, use `Extract<Device, { platform: 'android' }>`).
- Produces:

```ts
export interface AppliedSetting { label: string; value: string; source: string }
export interface AndroidSettings { settings: Record<string, string>; applied: AppliedSetting[]; limits: string[] }
export function androidSettings(device: AndroidDevice): AndroidSettings;
export const ANDROID_DENSITIES: readonly number[];
export function densityBucket(scale: number): number;
```

Rules (all from the spec):
- **Main display:** the display of the first posture with `kind: 'flat'`; else the first display with hinges; else the first display.
- **Pixels:** `display.pixels`, or `round(size × density)` with the applied source `derived`.
- **Density:** `densityBucket(display.density)` = the `ANDROID_DENSITIES` entry closest to `density × 160` (ties go to the larger). When it differs from `density × 160`, the applied value says so, for example `390 → 400`.
- **Cover region:** the display of the first posture with `kind: 'cover'`, when it differs from the main display, the device category isn't `foldable-flip`, and its pixels fit inside the main display's. It becomes `hw.displayRegion.0.1.*` at offset 0,0, with `hw.sensor.hinge.fold_to_displayRegion.0.1_at_posture=1`. For `foldable-flip`, add the limit `The cover display isn't emulated: the emulator has no separate outer screen.`
- **Hinges** (main display's `hinges`, in order):
  - `hw.sensor.hinge=yes`
  - `hw.sensor.hinge.count=<n>`
  - `hw.sensor.hinge.type`: `1` if every hinge is vertical, `0` if every hinge is horizontal; mixed axes add a limit and skip the hinges.
  - `hw.sensor.hinge.sub_type`: `1` if any hinge has `occlusion: 'FULL'` and `width > 0`, else `0`.
  - `hw.sensor.hinge.areas`: `x-y-width-height` per hinge in pixels, joined by `, `. A vertical hinge is `round(position×d)-0-round(width×d)-<main height px>`; a horizontal one is `0-round(position×d)-<main width px>-round(width×d)`.
  - `hw.sensor.hinge.ranges`: `0-180` per hinge, joined by `, `.
  - `hw.sensor.hinge.defaults`: `180` per hinge, joined by `, `.
- **Postures** (only when there is exactly one hinge; with two or more, add the limit `Postures aren't configured for more than one hinge: set the hinge angles in the emulator's extended controls.`):
  - Map each catalog posture `kind`: `cover` → 1, `flat` → 3, `book`, `tabletop` and `partial` → 2, `dual` → 3.
  - `rear` has no equivalent: add the limit `The <label> posture (rear display) isn't emulated.` A `windowArea` of `dual-screen` adds the limit `The <label> posture's dual-screen window area isn't emulated; it opens as the open posture.`
  - `hw.sensor.posture_list` = the sorted unique ids, joined by `, `.
  - `hw.sensor.hinge_angles_posture_definitions` = the angle range per id, in the same order: 1 → `0-30`, 2 → `30-150`, 3 → `150-180`. These are the emulator's own foldable profile values, so the constant needs a source comment naming the emulator's `hardware-properties.ini` and its foldable AVD.
- **Other displays:** a display that is neither the main display nor the cover region (for example Huawei Mate XT `dual`) adds the limit `The <label> isn't emulated as its own region.`
- **Base keys:** `hw.lcd.width`, `hw.lcd.height`, `hw.lcd.density`, and `hw.keyboard=yes`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { androidSettings, densityBucket } from './android';

const catalog = loadCatalog();
const device = (id: string) => {
  const d = catalog.devices.find((x) => x.id === id);
  if (!d || d.platform !== 'android') throw new Error(id);
  return d;
};

describe('densityBucket', () => {
  it('rounds to the nearest Android density bucket', () => {
    expect(densityBucket(2.625)).toBe(420);
    expect(densityBucket(2.4375)).toBe(400); // 390 sits between 360 and 400, nearer 400
    expect(densityBucket(3)).toBe(480);
    expect(densityBucket(1)).toBe(160);
  });
});

describe('androidSettings', () => {
  it('sets a single-display phone from its display', () => {
    const d = device('pixel-9');
    const main = Object.values(d.displays)[0];
    const s = androidSettings(d);
    expect(s.settings['hw.lcd.width']).toBe(String(main.pixels?.width ?? Math.round(main.size.width * main.density)));
    expect(s.settings['hw.sensor.hinge']).toBeUndefined();
    expect(s.limits).toEqual([]);
  });

  it('builds a book foldable from its inner and cover displays and one vertical crease', () => {
    const s = androidSettings(device('galaxy-z-fold-7'));
    expect(s.settings).toMatchObject({
      'hw.lcd.width': '1968',
      'hw.lcd.height': '2184',
      'hw.lcd.density': '420',
      'hw.displayRegion.0.1.xOffset': '0',
      'hw.displayRegion.0.1.yOffset': '0',
      'hw.displayRegion.0.1.width': '1080',
      'hw.displayRegion.0.1.height': '2520',
      'hw.sensor.hinge': 'yes',
      'hw.sensor.hinge.count': '1',
      'hw.sensor.hinge.type': '1',
      'hw.sensor.hinge.sub_type': '0',
      'hw.sensor.hinge.areas': '984-0-0-2184',
      'hw.sensor.hinge.ranges': '0-180',
      'hw.sensor.hinge.defaults': '180',
      'hw.sensor.posture_list': '1, 2, 3',
      'hw.sensor.hinge_angles_posture_definitions': '0-30, 30-150, 150-180',
      'hw.sensor.hinge.fold_to_displayRegion.0.1_at_posture': '1',
    });
  });

  it('says what a flip phone loses: its cover display', () => {
    const s = androidSettings(device('galaxy-z-flip-7'));
    expect(s.settings['hw.sensor.hinge.type']).toBe('0');
    expect(s.settings['hw.displayRegion.0.1.width']).toBeUndefined();
    expect(s.limits).toContain("The cover display isn't emulated: the emulator has no separate outer screen.");
  });

  it('gives a tri-fold two hinges and no posture list', () => {
    const s = androidSettings(device('galaxy-z-trifold'));
    expect(s.settings['hw.sensor.hinge.count']).toBe('2');
    expect(s.settings['hw.sensor.hinge.areas'].split(', ')).toHaveLength(2);
    expect(s.settings['hw.sensor.hinge.ranges']).toBe('0-180, 0-180');
    expect(s.settings['hw.sensor.posture_list']).toBeUndefined();
    expect(s.limits.join(' ')).toMatch(/more than one hinge/);
  });

  it('makes a dual-screen gap a physical hinge that hides content', () => {
    const s = androidSettings(device('surface-duo-2'));
    expect(s.settings['hw.sensor.hinge.sub_type']).toBe('1');
    expect(s.settings['hw.lcd.width']).toBe(String(Math.round(1100 * 2.5)));
    expect(s.applied.find((a) => a.label === 'Main display pixels')?.source).toBe('derived');
  });

  it('never maps a rear-display posture, and records a density that was rounded', () => {
    const s = androidSettings(device('pixel-9-pro-fold'));
    expect(s.limits.join(' ')).toMatch(/rear display/);
    expect(s.applied.find((a) => a.label === 'Density')?.value).toBe('390 → 400');
  });

  it('lists a display it cannot place', () => {
    expect(androidSettings(device('huawei-mate-xt')).limits.join(' ')).toMatch(/isn't emulated as its own region/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/emulator/android.test.ts` in `packages/core`
Expected: FAIL (`Cannot find module './android'`).

- [ ] **Step 3: Implement `android.ts`**

```ts
// Android emulator settings (an AVD's config.ini keys) for a catalog device. Every number comes
// from the catalog; the emulator vocabulary below comes from the emulator's hardware-properties.ini.
import type { AndroidDevice } from '../config/types';

export interface AppliedSetting { label: string; value: string; source: string }
export interface AndroidSettings { settings: Record<string, string>; applied: AppliedSetting[]; limits: string[] }

/** android.util.DisplayMetrics DENSITY_* buckets (developer.android.com/reference/android/util/DisplayMetrics). */
export const ANDROID_DENSITIES = [120, 140, 160, 180, 200, 213, 220, 240, 260, 280, 300, 320, 340, 360, 400, 420, 440, 450, 480, 560, 600, 640] as const;

/** Emulator posture ids and angle ranges (hardware-properties.ini `hw.sensor.posture_list`; the emulator's foldable AVD). */
const POSTURE_ID = { cover: 1, flat: 3, book: 2, tabletop: 2, partial: 2, dual: 3 } as const;
const POSTURE_ANGLES: Record<number, string> = { 1: '0-30', 2: '30-150', 3: '150-180' };

export function densityBucket(scale: number): number {
  const dpi = scale * 160;
  return ANDROID_DENSITIES.reduce((best, d) => (Math.abs(d - dpi) < Math.abs(best - dpi) || (Math.abs(d - dpi) === Math.abs(best - dpi) && d > best) ? d : best));
}

type Display = AndroidDevice['displays'][string];
const pixelsOf = (d: Display) => d.pixels ?? { width: Math.round(d.size.width * d.density), height: Math.round(d.size.height * d.density) };

export function androidSettings(device: AndroidDevice): AndroidSettings {
  const settings: Record<string, string> = {};
  const applied: AppliedSetting[] = [];
  const limits: string[] = [];
  const postures = device.postures ?? [];
  const ids = Object.keys(device.displays);
  const mainId =
    postures.find((p) => p.kind === 'flat')?.display ?? ids.find((id) => device.displays[id].hinges?.length) ?? ids[0];
  const main = device.displays[mainId];
  const px = pixelsOf(main);
  const density = densityBucket(main.density);
  const exact = Math.round(main.density * 160);

  settings['hw.lcd.width'] = String(px.width);
  settings['hw.lcd.height'] = String(px.height);
  settings['hw.lcd.density'] = String(density);
  settings['hw.keyboard'] = 'yes';
  applied.push({ label: 'Main display', value: main.label, source: main.source });
  applied.push({ label: 'Main display pixels', value: `${px.width}×${px.height}`, source: main.pixels ? main.source : 'derived' });
  applied.push({ label: 'Density', value: exact === density ? String(density) : `${exact} → ${density}`, source: main.source });

  const coverId = postures.find((p) => p.kind === 'cover')?.display;
  const used = new Set([mainId]);
  if (coverId && coverId !== mainId) {
    used.add(coverId);
    const cover = device.displays[coverId];
    const cpx = pixelsOf(cover);
    if (device.category === 'foldable-flip') {
      limits.push("The cover display isn't emulated: the emulator has no separate outer screen.");
    } else if (cpx.width <= px.width && cpx.height <= px.height) {
      settings['hw.displayRegion.0.1.xOffset'] = '0';
      settings['hw.displayRegion.0.1.yOffset'] = '0';
      settings['hw.displayRegion.0.1.width'] = String(cpx.width);
      settings['hw.displayRegion.0.1.height'] = String(cpx.height);
      settings['hw.sensor.hinge.fold_to_displayRegion.0.1_at_posture'] = '1';
      applied.push({ label: 'Folded region', value: `${cover.label}, ${cpx.width}×${cpx.height}`, source: cover.pixels ? cover.source : 'derived' });
    } else {
      limits.push(`The ${cover.label} is larger than the main display, so it isn't emulated.`);
    }
  }
  for (const id of ids) if (!used.has(id)) limits.push(`The ${device.displays[id].label} isn't emulated as its own region.`);

  const hinges = main.hinges ?? [];
  const axes = new Set(hinges.map((h) => h.axis));
  if (hinges.length && axes.size > 1) limits.push("Hinges on both axes can't be emulated together, so none are set.");
  else if (hinges.length) {
    const d = main.density;
    settings['hw.sensor.hinge'] = 'yes';
    settings['hw.sensor.hinge.count'] = String(hinges.length);
    settings['hw.sensor.hinge.type'] = hinges[0].axis === 'vertical' ? '1' : '0';
    settings['hw.sensor.hinge.sub_type'] = hinges.some((h) => h.occlusion === 'FULL' && h.width > 0) ? '1' : '0';
    settings['hw.sensor.hinge.areas'] = hinges
      .map((h) => (h.axis === 'vertical' ? `${Math.round(h.position * d)}-0-${Math.round(h.width * d)}-${px.height}` : `0-${Math.round(h.position * d)}-${px.width}-${Math.round(h.width * d)}`))
      .join(', ');
    settings['hw.sensor.hinge.ranges'] = hinges.map(() => '0-180').join(', ');
    settings['hw.sensor.hinge.defaults'] = hinges.map(() => '180').join(', ');
    applied.push({ label: 'Hinges', value: `${hinges.length} ${hinges[0].axis}`, source: hinges[0].source });

    if (hinges.length > 1) {
      limits.push("Postures aren't configured for more than one hinge: set the hinge angles in the emulator's extended controls.");
    } else {
      const list = new Set<number>();
      for (const p of postures) {
        if (p.kind === 'rear') {
          limits.push(`The ${p.label} posture (rear display) isn't emulated.`);
          continue;
        }
        if (p.windowArea === 'dual-screen') limits.push(`The ${p.label} posture's dual-screen window area isn't emulated; it opens as the open posture.`);
        list.add(POSTURE_ID[p.kind]);
      }
      const sorted = [...list].sort((a, b) => a - b);
      if (sorted.length) {
        settings['hw.sensor.posture_list'] = sorted.join(', ');
        settings['hw.sensor.hinge_angles_posture_definitions'] = sorted.map((id) => POSTURE_ANGLES[id]).join(', ');
      }
    }
  }
  return { settings, applied, limits };
}
```

Note for the implementer: check the exact postures of each test device in `catalog.json` before trusting a test expectation. If a catalog fact contradicts an expectation above (for example a different pixel count), fix the test to the catalog value, since the catalog is the source of truth, and record it as a ruling.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/emulator/android.test.ts` in `packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/emulator/android.ts packages/core/src/emulator/android.test.ts
git commit -m "Derive Android emulator settings from a catalog device"
```

---

### Task 3: The emulator plan

**Files:**
- Create: `packages/core/src/emulator/plan.ts`
- Test: `packages/core/src/emulator/plan.test.ts`

**Interfaces:**
- Consumes: `androidSettings`, `AppliedSetting` (Task 2); `IosDevice.simulator` (Task 1); `Catalog` from `../config/schema`.
- Produces:

```ts
export type Placeholder = '{image}' | '{runtime}' | '{udid}';
export type EmulatorStep =
  | { kind: 'find-image'; platform: 'android'; api: number | null }
  | { kind: 'find-image'; platform: 'ios'; runtime: string | null; deviceType: string }
  | { kind: 'run'; argv: string[]; input?: string } // argv may contain placeholders
  | { kind: 'write-config'; avd: string; settings: Record<string, string> }
  | { kind: 'print'; text: string };
export interface EmulatorPlan {
  version: 1;
  platform: 'android' | 'ios';
  device: { id: string; name: string; category: string };
  name: string;
  steps: EmulatorStep[];
  applied: AppliedSetting[];
  limits: string[];
  start: string[][]; // argv lists, may contain placeholders
}
export interface PlanOptions { api?: number; runtime?: string; name?: string; force?: boolean }
export class EmulatorPlanError extends Error { constructor(readonly code: 'unknown-device' | 'no-simulator', message: string) }
export function emulatorPlan(catalog: Catalog, deviceId: string, options?: PlanOptions): EmulatorPlan;
export type Support = 'full' | 'partial' | 'none';
export function emulationSupport(catalog: Catalog): { id: string; name: string; platform: 'android' | 'ios'; category: string; support: Support; limits: string[] }[];
export const avdName: (deviceId: string) => string; // `dobra_${id}` with anything outside [A-Za-z0-9._-] replaced by `_`
```

Plans:
- **Android steps:**
  1. `find-image` (android, `options.api ?? null`)
  2. `run` `['avdmanager', 'create', 'avd', '-n', name, '-k', '{image}', ...(force ? ['--force'] : [])]` with `input: 'no\n'` (answers the custom hardware profile prompt)
  3. `write-config` (`avd: name`, the settings)
  4. `print` `Created <name>.`

  `start` = `[['emulator', '-avd', name]]`.
- **iOS steps:**
  1. `find-image` (ios, `runtime ?? null`, `deviceType`)
  2. `run` `['xcrun', 'simctl', 'create', name, deviceType, '{runtime}']`
  3. `print`

  `applied` = the device type, with its source and estimated flag, and the display's points and scale. `start` = `[['xcrun', 'simctl', 'boot', '{udid}'], ['open', '-a', 'Simulator']]`. `--force` on iOS is handled by the CLI (deleting simulators of the same name), so it isn't a plan step.
- An unknown id throws `EmulatorPlanError('unknown-device', 'Unknown device "<id>". Try: <up to 3 ids that contain part of it, or dobra emulator list>')`.
- An iOS device without `simulator` throws `EmulatorPlanError('no-simulator', '<name> is hypothetical: Apple has no simulator for it.')`.
- **`emulationSupport`:** `full` when `limits` is empty; `partial` when the plan has limits; `none` for `no-simulator`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { avdName, emulationSupport, emulatorPlan, EmulatorPlanError } from './plan';

const catalog = loadCatalog();

describe('emulatorPlan', () => {
  it('creates an AVD, then writes the device settings', () => {
    const p = emulatorPlan(catalog, 'galaxy-z-fold-7');
    expect(p).toMatchObject({ version: 1, platform: 'android', name: 'dobra_galaxy-z-fold-7' });
    expect(p.steps.map((s) => s.kind)).toEqual(['find-image', 'run', 'write-config', 'print']);
    expect(p.steps[1]).toEqual({ kind: 'run', argv: ['avdmanager', 'create', 'avd', '-n', 'dobra_galaxy-z-fold-7', '-k', '{image}'], input: 'no\n' });
    expect(p.start).toEqual([['emulator', '-avd', 'dobra_galaxy-z-fold-7']]);
  });

  it('passes the API level, a custom name and --force through', () => {
    const p = emulatorPlan(catalog, 'pixel-9', { api: 34, name: 'my phone', force: true });
    expect(p.steps[0]).toEqual({ kind: 'find-image', platform: 'android', api: 34 });
    expect(p.name).toBe('my phone');
    expect((p.steps[1] as { argv: string[] }).argv).toContain('--force');
  });

  it('creates an iOS simulator from the catalog device type', () => {
    const p = emulatorPlan(catalog, 'iphone-17');
    expect(p).toMatchObject({ platform: 'ios', name: 'iPhone 17 (Dobra)' });
    expect(p.steps[1]).toEqual({ kind: 'run', argv: ['xcrun', 'simctl', 'create', 'iPhone 17 (Dobra)', 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', '{runtime}'] });
  });

  it('refuses a hypothetical iOS device and an unknown id', () => {
    expect(() => emulatorPlan(catalog, 'iphone-duo')).toThrow(EmulatorPlanError);
    try {
      emulatorPlan(catalog, 'galaxy-fold');
    } catch (e) {
      expect((e as EmulatorPlanError).code).toBe('unknown-device');
      expect((e as Error).message).toContain('galaxy-z-fold-7');
    }
  });
});

describe('emulationSupport', () => {
  it('rates every catalog device', () => {
    const rows = emulationSupport(catalog);
    expect(rows).toHaveLength(catalog.devices.length);
    expect(rows.find((r) => r.id === 'pixel-9')?.support).toBe('full');
    expect(rows.find((r) => r.id === 'galaxy-z-flip-7')?.support).toBe('partial');
    expect(rows.find((r) => r.id === 'iphone-duo')?.support).toBe('none');
  });
});

describe('avdName', () => {
  it('keeps only characters an AVD name allows', () => {
    expect(avdName('galaxy-z-fold-7')).toBe('dobra_galaxy-z-fold-7');
    expect(avdName('a b/c')).toBe('dobra_a_b_c');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/emulator/plan.test.ts` in `packages/core`
Expected: FAIL (`Cannot find module './plan'`).

- [ ] **Step 3: Implement `plan.ts`**

Write `plan.ts` with the types above and:

```ts
export class EmulatorPlanError extends Error {
  constructor(readonly code: 'unknown-device' | 'no-simulator', message: string) {
    super(message);
  }
}

export const avdName = (deviceId: string) => `dobra_${deviceId}`.replace(/[^A-Za-z0-9._-]/g, '_');

function suggest(catalog: Catalog, id: string): string {
  const parts = id.toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length > 2);
  const hits = catalog.devices.map((d) => d.id).filter((d) => parts.some((p) => d.includes(p))).slice(0, 3);
  return hits.length ? `Try: ${hits.join(', ')}.` : 'Run dobra emulator list to see them.';
}

export function emulatorPlan(catalog: Catalog, deviceId: string, options: PlanOptions = {}): EmulatorPlan {
  const device = catalog.devices.find((d) => d.id === deviceId);
  if (!device) throw new EmulatorPlanError('unknown-device', `Unknown device "${deviceId}". ${suggest(catalog, deviceId)}`);
  const base = { version: 1 as const, device: { id: device.id, name: device.name, category: device.category } };
  if (device.platform === 'android') {
    const name = options.name ?? avdName(device.id);
    const { settings, applied, limits } = androidSettings(device);
    return {
      ...base,
      platform: 'android',
      name,
      steps: [
        { kind: 'find-image', platform: 'android', api: options.api ?? null },
        { kind: 'run', argv: ['avdmanager', 'create', 'avd', '-n', name, '-k', '{image}', ...(options.force ? ['--force'] : [])], input: 'no\n' },
        { kind: 'write-config', avd: name, settings },
        { kind: 'print', text: `Created ${name}.` },
      ],
      applied,
      limits,
      start: [['emulator', '-avd', name]],
    };
  }
  if (!device.simulator) throw new EmulatorPlanError('no-simulator', `${device.name} is hypothetical: Apple has no simulator for it.`);
  const name = options.name ?? `${device.name} (Dobra)`;
  const display = Object.values(device.displays)[0];
  return {
    ...base,
    platform: 'ios',
    name,
    steps: [
      { kind: 'find-image', platform: 'ios', runtime: options.runtime ?? null, deviceType: device.simulator.deviceType },
      { kind: 'run', argv: ['xcrun', 'simctl', 'create', name, device.simulator.deviceType, '{runtime}'] },
      { kind: 'print', text: `Created ${name}.` },
    ],
    applied: [
      { label: 'Simulator', value: device.simulator.deviceType.split('.').pop()! + (device.simulator.estimated ? ' (closest model)' : ''), source: device.simulator.source },
      { label: 'Points', value: `${display.portraitSize.width}×${display.portraitSize.height} @${display.scale}x`, source: 'catalog' },
    ],
    limits: device.simulator.estimated ? [`${device.name} is a generic size; the simulator is the closest Apple model.`] : [],
    start: [['xcrun', 'simctl', 'boot', '{udid}'], ['open', '-a', 'Simulator']],
  };
}
```

Also write `emulationSupport(catalog)`, which maps every device through `emulatorPlan` in a try/catch. Don't let the "generic size" limit make an iOS device `partial`; only the Android limits count. A device that throws `no-simulator` is `none`, with its message as the only limit.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/emulator` in `packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/emulator/plan.ts packages/core/src/emulator/plan.test.ts
git commit -m "Plan an emulator or simulator for a catalog device"
```

---

### Task 4: Render a plan as a shell script

**Files:**
- Create: `packages/core/src/emulator/script.ts`
- Test: `packages/core/src/emulator/script.test.ts`

**Interfaces:**
- Consumes: `EmulatorPlan`, `EmulatorStep` (Task 3).
- Produces: `export function renderScript(plan: EmulatorPlan): string` and `export const shQuote: (s: string) => string`.

The rendered script:
- starts with `#!/bin/sh`, `set -eu`, and a comment naming the device and `dobra emulator script`.
- **Android `find-image`** sets `SDK` from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `$HOME/Library/Android/sdk` or `$HOME/Android/Sdk`, and `ABI` from `uname -m`. It loops over `"$SDK"/system-images/android-*`, keeping the highest numeric API that has a `google_apis_playstore`, `google_apis` or `default` folder for `$ABI`. A requested `api` narrows the loop. With no match it prints the other-ABI images it saw and the `sdkmanager` line, then exits 1. It sets `IMAGE` and `AVDMANAGER` (`$SDK/cmdline-tools/latest/bin/avdmanager`, else `avdmanager` on `PATH`) and `EMULATOR` (`$SDK/emulator/emulator`).
- **iOS `find-image`** checks `xcrun simctl` exists. It sets `RUNTIME` to the requested runtime, or the newest iOS runtime from `xcrun simctl list runtimes`: the last `com.apple.CoreSimulator.SimRuntime.iOS-*` identifier, found with `sed -n`.
- **`run`** renders each argv element with `shQuote`, except that `{image}`, `{runtime}` and `{udid}` become `"$IMAGE"`, `"$RUNTIME"` and `"$UDID"`. The first element `avdmanager` becomes `"$AVDMANAGER"`. The iOS create is captured as `UDID=$(...)`. `input` is piped with `printf`.
- **`write-config`** sets `CONFIG="${ANDROID_AVD_HOME:-${ANDROID_USER_HOME:-$HOME/.android}/avd}/<name>.avd/config.ini"` and calls a `set_key` function for each key, sorted. `set_key` drops the old key with `awk -v k="$1" 'index($0, k "=") != 1'` into `$CONFIG.tmp`, appends `key=value`, then `mv` it back.
- **`print`** becomes `printf '%s\n' <quoted text>`.
- It ends by printing the `limits` as `note:` lines and the start command. The emulator start uses `"$EMULATOR"`.

- [ ] **Step 1: Write the failing tests**

```ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { emulatorPlan } from './plan';
import { renderScript, shQuote } from './script';

const catalog = loadCatalog();

describe('shQuote', () => {
  it("single-quotes and escapes a single quote", () => {
    expect(shQuote("it's")).toBe("'it'\\''s'");
    expect(shQuote('a b')).toBe("'a b'");
  });
});

describe('renderScript', () => {
  const syntaxOk = (s: string) => execFileSync('sh', ['-n'], { input: s });

  it('writes a valid Android script that finds an image, creates the AVD and sets every key', () => {
    const s = renderScript(emulatorPlan(catalog, 'galaxy-z-fold-7'));
    syntaxOk(s);
    expect(s.startsWith('#!/bin/sh\nset -eu\n')).toBe(true);
    expect(s).toContain('"$SDK"/system-images/android-*');
    expect(s).toContain("printf 'no\\n' | \"$AVDMANAGER\" create avd -n 'dobra_galaxy-z-fold-7' -k \"$IMAGE\"");
    expect(s).toContain("set_key 'hw.sensor.hinge.areas' '984-0-0-2184'");
    expect(s).toContain('ANDROID_AVD_HOME');
    expect(s).toContain('"$EMULATOR" -avd \'dobra_galaxy-z-fold-7\'');
  });

  it('writes a valid iOS script', () => {
    const s = renderScript(emulatorPlan(catalog, 'ipad-pro-13'));
    syntaxOk(s);
    expect(s).toContain("UDID=$(xcrun simctl create 'iPad Pro 13-inch (Dobra)' 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB' \"$RUNTIME\")");
    expect(s).toContain('xcrun simctl boot "$UDID"');
  });

  it('quotes a name that needs it and lists the limits as notes', () => {
    const s = renderScript(emulatorPlan(catalog, 'galaxy-z-flip-7', { name: "Jo's flip" }));
    syntaxOk(s);
    expect(s).toContain("'Jo'\\''s flip'");
    expect(s).toMatch(/note: The cover display isn't emulated/);
  });

  it('narrows the image search to a requested API level', () => {
    expect(renderScript(emulatorPlan(catalog, 'pixel-9', { api: 34 }))).toContain('WANT_API=34');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/emulator/script.test.ts` in `packages/core`
Expected: FAIL (`Cannot find module './script'`).

- [ ] **Step 3: Implement `script.ts`**

```ts
// A plan as a POSIX sh script, for people without the Dobra repo. The same plan drives the CLI.
import type { EmulatorPlan, EmulatorStep } from './plan';

export const shQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

const VARS: Record<string, string> = { '{image}': '"$IMAGE"', '{runtime}': '"$RUNTIME"', '{udid}': '"$UDID"' };
const TOOLS: Record<string, string> = { avdmanager: '"$AVDMANAGER"', emulator: '"$EMULATOR"' };
/** Plain lowercase commands and flags (xcrun, simctl, create, -n, --force) stay bare; everything else is quoted. */
const BARE = /^-{0,2}[a-z][a-z-]*$/;
const word = (w: string, i: number): string => VARS[w] ?? ((i === 0 ? TOOLS[w] : undefined) ?? (BARE.test(w) ? w : shQuote(w)));
const command = (argv: string[]) => argv.map(word).join(' ');

const ANDROID_FIND = (api: number | null) => `WANT_API=${api ?? ''}
SDK="\${ANDROID_HOME:-\${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then for d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do if [ -d "$d" ]; then SDK="$d"; break; fi; done; fi
[ -n "$SDK" ] || { echo "No Android SDK: install Android Studio or set ANDROID_HOME." >&2; exit 1; }
case "$(uname -m)" in arm64 | aarch64) ABI=arm64-v8a ;; *) ABI=x86_64 ;; esac
IMAGE=""; BEST=0; OTHER=""
for dir in "$SDK"/system-images/android-*; do
  [ -d "$dir" ] || continue
  api=\${dir##*/android-}; api=\${api%%-*}
  case "$api" in '' | *[!0-9]*) continue ;; esac
  if [ -n "$WANT_API" ] && [ "$api" != "$WANT_API" ]; then continue; fi
  for tag in google_apis_playstore google_apis default; do
    if [ -d "$dir/$tag/$ABI" ]; then
      if [ "$api" -gt "$BEST" ]; then BEST=$api; IMAGE="system-images;\${dir##*/};$tag;$ABI"; fi
      break
    fi
    for other in "$dir/$tag"/*; do [ -d "$other" ] && OTHER="$OTHER \${dir##*/}/$tag/\${other##*/}"; done
  done
done
if [ -z "$IMAGE" ]; then
  [ -n "$OTHER" ] && echo "Installed images are for another processor:$OTHER" >&2
  echo "No $ABI system image\${WANT_API:+ for API $WANT_API}. Install one with:" >&2
  echo "  \\"$SDK/cmdline-tools/latest/bin/sdkmanager\\" --install \\"system-images;android-\${WANT_API:-36};google_apis_playstore;$ABI\\"" >&2
  exit 1
fi
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"; [ -x "$AVDMANAGER" ] || AVDMANAGER=$(command -v avdmanager) || { echo "avdmanager not found: install the Android SDK command-line tools." >&2; exit 1; }
EMULATOR="$SDK/emulator/emulator"
echo "Using $IMAGE"`;

const IOS_FIND = (runtime: string | null) => `command -v xcrun >/dev/null || { echo "Xcode is needed: install it from the App Store." >&2; exit 1; }
RUNTIME=${runtime ? shQuote(runtime) : '$(xcrun simctl list runtimes | sed -n \'s/.*\\(com\\.apple\\.CoreSimulator\\.SimRuntime\\.iOS-[0-9-]*\\).*/\\1/p\' | tail -n 1)'}
[ -n "$RUNTIME" ] || { echo "No iOS simulator runtime: install one in Xcode › Settings › Components." >&2; exit 1; }
echo "Using $RUNTIME"`;

const SET_KEY = `set_key() {
  awk -v k="$1" 'index($0, k "=") != 1' "$CONFIG" > "$CONFIG.tmp"
  printf '%s=%s\\n' "$1" "$2" >> "$CONFIG.tmp"
  mv "$CONFIG.tmp" "$CONFIG"
}`;

function step(s: EmulatorStep, plan: EmulatorPlan): string {
  switch (s.kind) {
    case 'find-image':
      return s.platform === 'android' ? ANDROID_FIND(s.api) : IOS_FIND(s.runtime);
    case 'run': {
      const line = (s.input ? `printf ${shQuote(s.input.replace(/\n/g, '\\n'))} | ` : '') + command(s.argv);
      return plan.platform === 'ios' && s.argv[1] === 'simctl' && s.argv[2] === 'create' ? `UDID=$(${line})` : line;
    }
    case 'write-config':
      return [
        `CONFIG="\${ANDROID_AVD_HOME:-\${ANDROID_USER_HOME:-$HOME/.android}/avd}/${s.avd}.avd/config.ini"`,
        SET_KEY,
        ...Object.keys(s.settings).sort().map((k) => `set_key ${shQuote(k)} ${shQuote(s.settings[k])}`),
      ].join('\n');
    case 'print':
      return `printf '%s\\n' ${shQuote(s.text)}`;
  }
}

export function renderScript(plan: EmulatorPlan): string {
  return [
    '#!/bin/sh',
    'set -eu',
    `# ${plan.device.name}: ${plan.platform === 'android' ? 'Android emulator' : 'iOS simulator'} from the Dobra catalog (dobra emulator script ${plan.device.id}).`,
    ...plan.steps.map((s) => step(s, plan)),
    ...plan.limits.map((l) => `printf '%s\\n' ${shQuote(`note: ${l}`)}`),
    // show prints a command with its variables filled in, one word after another.
    `show() { printf '  %s' "$1"; shift; for a in "$@"; do printf ' %s' "$a"; done; printf '\\n'; }`,
    `printf '%s\\n' ${shQuote('Start it with:')}`,
    ...plan.start.map((argv) => `show ${command(argv)}`),
    '',
  ].join('\n');
}
```

The start commands are printed through `show`, so the person sees the real paths and UDID: `show "$EMULATOR" -avd 'dobra_galaxy-z-fold-7'`, then `show xcrun simctl boot "$UDID"` and `show open -a 'Simulator'`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/emulator` in `packages/core`
Expected: PASS, with `sh -n` accepting every script.

- [ ] **Step 5: Commit, push and open PR 1**

```bash
git add packages/core/src/emulator/script.ts packages/core/src/emulator/script.test.ts
git commit -m "Render an emulator plan as a POSIX shell script"
git push -u origin feat/emulator-core
gh pr create --base main --title "Emulator generator: the plan and the script in core" --label enhancement --label area:core --body "Part of #182. Core: the iOS simulator field, Android emulator settings, the emulator plan and the shell script, with their tests."
```

---

### Task 5: `dobra emulator create` for Android

**Files:**
- Create: `packages/cli/src/emulator/runner.ts`, `packages/cli/src/emulator/android.ts`
- Test: `packages/cli/src/emulator/android.test.ts`

**Interfaces:**
- Consumes: `EmulatorPlan` (Task 3).
- Produces:

```ts
// runner.ts
export interface ExecResult { code: number; stdout: string; stderr: string }
export interface Runner {
  exec(file: string, args: string[], input?: string): Promise<ExecResult>;
  exists(path: string): boolean;
  list(dir: string): string[]; // entry names, [] when missing
  read(path: string): string;
  write(path: string, data: string): void;
  rename(from: string, to: string): void;
  env: Record<string, string | undefined>;
  arch: string; // process.arch
  platform: string; // process.platform
  home: string;
}
export const nodeRunner: Runner;
export class ToolError extends Error {} // exit 1

// android.ts
export interface AndroidPaths { sdk: string; avdHome: string; avdmanager: string; emulator: string }
export function androidPaths(r: Runner): AndroidPaths; // throws ToolError when no SDK
export function hostAbi(arch: string): 'arm64-v8a' | 'x86_64';
export function findImage(r: Runner, sdk: string, api: number | null): string; // throws ToolError naming other-ABI images and the sdkmanager line
export async function createAvd(r: Runner, plan: EmulatorPlan, force: boolean): Promise<{ id: string; image: string }>;
```

Behaviour:
- **`androidPaths`:** `sdk` is `ANDROID_HOME`, else `ANDROID_SDK_ROOT`, else `~/Library/Android/sdk` (darwin) or `~/Android/Sdk` (linux), whichever exists; none exists means `ToolError('No Android SDK: install Android Studio or set ANDROID_HOME.')`. `avdHome` is `ANDROID_AVD_HOME`, else `${ANDROID_USER_HOME ?? ~/.android}/avd`. `avdmanager` is `<sdk>/cmdline-tools/latest/bin/avdmanager` when it exists, else `avdmanager`. `emulator` is `<sdk>/emulator/emulator`.
- **`findImage`:** looks in `<sdk>/system-images` for `android-<digits>[-anything]` folders and applies the same tag, ABI and API rules as the script. It returns `system-images;<folder>;<tag>;<abi>`.
- **`createAvd`:**
  - An `<avdHome>/<name>.avd` that already exists without `force` raises `ToolError('An emulator named <name> already exists. Pass --force to replace it.')` before running anything.
  - It runs `avdmanager` with `{image}` replaced, and a non-zero exit raises `ToolError` with the tool's stderr.
  - Only then does it read `config.ini`, set each key by replacing its line or appending one, write `config.ini.tmp` and rename it over `config.ini`.
  - It returns `{ id: name, image }`.

- [ ] **Step 1: Write the failing tests** (with a fake runner)

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { emulatorPlan } from '@dobra/core/emulator/plan';
import { androidPaths, createAvd, findImage, hostAbi } from './android';
import type { Runner } from './runner';

function fakeRunner(files: Record<string, string | null>, env: Record<string, string> = {}, arch = 'arm64') {
  const calls: { file: string; args: string[]; input?: string }[] = [];
  const fs = new Map(Object.entries(files)); // value null = directory
  const r: Runner & { calls: typeof calls; fs: typeof fs } = {
    calls,
    fs,
    env,
    arch,
    platform: 'darwin',
    home: '/Users/me',
    exists: (p) => fs.has(p),
    list: (d) => [...new Set([...fs.keys()].filter((k) => k.startsWith(d + '/')).map((k) => k.slice(d.length + 1).split('/')[0]))],
    read: (p) => fs.get(p) ?? '',
    write: (p, data) => void fs.set(p, data),
    rename: (a, b) => {
      fs.set(b, fs.get(a) ?? '');
      fs.delete(a);
    },
    exec: async (file, args, input) => {
      calls.push({ file, args, input });
      if (file.endsWith('avdmanager')) fs.set(`/Users/me/.android/avd/${args[args.indexOf('-n') + 1]}.avd/config.ini`, 'hw.lcd.width=320\nimage.sysdir.1=x\n');
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  return r;
}
const SDK = '/Users/me/Library/Android/sdk';
const dir = (p: string) => ({ [p]: null });

describe('android emulator creation', () => {
  it('finds the SDK and the newest image for this processor', () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-34/google_apis/arm64-v8a`), ...dir(`${SDK}/system-images/android-36/google_apis_playstore/arm64-v8a`), ...dir(`${SDK}/system-images/android-36/google_apis/x86_64`) });
    expect(androidPaths(r).sdk).toBe(SDK);
    expect(findImage(r, SDK, null)).toBe('system-images;android-36;google_apis_playstore;arm64-v8a');
    expect(findImage(r, SDK, 34)).toBe('system-images;android-34;google_apis;arm64-v8a');
  });

  it('says so when the installed images are for another processor', () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis/x86_64`) });
    expect(() => findImage(r, SDK, null)).toThrow(/another processor.*android-36\/google_apis\/x86_64[\s\S]*sdkmanager/);
  });

  it('uses ANDROID_SDK_ROOT and ANDROID_AVD_HOME, spaces included', async () => {
    const sdk = '/opt/my sdk';
    const r = fakeRunner({ ...dir(sdk), ...dir(`${sdk}/system-images/android-35/default/arm64-v8a`) }, { ANDROID_SDK_ROOT: sdk, ANDROID_AVD_HOME: '/data/avds here' });
    expect(androidPaths(r)).toMatchObject({ sdk, avdHome: '/data/avds here' });
  });

  it('creates the AVD, then writes the settings through a temp file', async () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis_playstore/arm64-v8a`) });
    const plan = emulatorPlan(loadCatalog(), 'galaxy-z-fold-7');
    const out = await createAvd(r, plan, false);
    expect(out).toEqual({ id: 'dobra_galaxy-z-fold-7', image: 'system-images;android-36;google_apis_playstore;arm64-v8a' });
    expect(r.calls[0].args).toEqual(['create', 'avd', '-n', 'dobra_galaxy-z-fold-7', '-k', out.image]);
    expect(r.calls[0].input).toBe('no\n');
    const config = r.fs.get('/Users/me/.android/avd/dobra_galaxy-z-fold-7.avd/config.ini')!;
    expect(config).toContain('hw.lcd.width=1968\n');
    expect(config).not.toContain('hw.lcd.width=320');
    expect(config).toContain('image.sysdir.1=x');
    expect(r.fs.has('/Users/me/.android/avd/dobra_galaxy-z-fold-7.avd/config.ini.tmp')).toBe(false);
  });

  it('leaves an existing emulator alone unless forced', async () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/default/arm64-v8a`), ...dir('/Users/me/.android/avd/dobra_pixel-9.avd') });
    await expect(createAvd(r, emulatorPlan(loadCatalog(), 'pixel-9'), false)).rejects.toThrow(/already exists.*--force/);
    expect(r.calls).toHaveLength(0);
  });

  it('picks the ABI from the processor', () => {
    expect(hostAbi('arm64')).toBe('arm64-v8a');
    expect(hostAbi('x64')).toBe('x86_64');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/emulator/android.test.ts` in `packages/cli`
Expected: FAIL (`Cannot find module './android'`).

- [ ] **Step 3: Implement `runner.ts` and `android.ts`**

`nodeRunner` uses `execFile` (from `node:child_process`), writing `input` to the child's stdin. It uses `existsSync`, `readdirSync` (returning `[]` on error), `readFileSync`, `writeFileSync`, `renameSync`, `process.env`, `process.arch`, `process.platform` and `os.homedir()`. Write `android.ts` to the behaviour above. Use `node:path` `join` for paths, so spaces pass through untouched, and never build a shell string.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/emulator` in `packages/cli`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/emulator/runner.ts packages/cli/src/emulator/android.ts packages/cli/src/emulator/android.test.ts
git commit -m "Create an Android emulator from a plan"
```

---

### Task 6: iOS creation, the `emulator` command and the launcher

**Files:**
- Create: `packages/cli/src/emulator/ios.ts`, `packages/cli/src/emulator/args.ts`, `packages/cli/src/emulator/command.ts`
- Modify: `packages/cli/src/main.ts` (before `parseArgs`), `packages/cli/src/args.ts` (`USAGE`), `scripts/dobra` (the `case`), `packages/cli/README.md`
- Test: `packages/cli/src/emulator/ios.test.ts`, `packages/cli/src/emulator/command.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:

```ts
// ios.ts
export async function createSimulator(r: Runner, plan: EmulatorPlan, force: boolean): Promise<{ id: string; image: string }>; // id = UDID, image = runtime id
// args.ts
export type EmulatorArgs =
  | { command: 'list'; json: boolean }
  | { command: 'create' | 'script'; device: string; api: number | null; runtime: string | null; name: string | null; start: boolean; force: boolean; json: boolean }
  | { help: string; error?: string };
export function parseEmulatorArgs(argv: string[]): EmulatorArgs;
export const EMULATOR_USAGE: string;
// command.ts
export async function runEmulator(argv: string[], io: { out(s: string): void; err(s: string): void }, runner?: Runner): Promise<number>;
```

Behaviour:
- **`createSimulator`:**
  - Runtime: `xcrun simctl list runtimes -j`. It picks the requested runtime, or the newest available iOS runtime (highest `version`, `isAvailable: true`) whose `supportedDeviceTypes` includes the plan's device type. None means `ToolError` naming the device type and saying that a newer Xcode may be needed.
  - Existing name: `xcrun simctl list devices -j`. An existing device with the same name without `force` raises `ToolError`; with `force`, it runs `xcrun simctl delete <udid>` for each.
  - It runs create, and the trimmed stdout is the UDID.
- **`parseEmulatorArgs`:**
  - It parses `list [--json]`, `create <device> [options]` and `script <device> [--api] [--runtime] [--name]`. `--api` must be a positive integer.
  - A missing device or an unknown option returns `{ help }`; for bad values it also sets `error`.
- **`runEmulator`:**
  - **`list`:** `emulationSupport` as a table (`id  platform  category  support`), with the limits indented under partial devices; `--json` prints `{ version: 1, devices }`.
  - **`script`:** prints `renderScript(plan)`.
  - **`create`:** builds the plan, catching `EmulatorPlanError` as exit 2, then calls `createAvd` or `createSimulator`, catching `ToolError` as exit 1 with the message. With `--start`, it runs the start commands with placeholders filled in, spawning the Android emulator detached. It prints the human summary, or with `--json` the object `{ version: 1, platform, device: plan.device, name, id, image, applied, limits, start }`, where `start` has its placeholders filled.
  - Exit 0 on success.
- **`main.ts`:** `if (argv[0] === 'emulator') return runEmulator(argv.slice(1), io);` as the first line of `run`.
- **`args.ts` `USAGE`:** add a line `       dobra emulator list | create <device> | script <device>  (dobra emulator --help)`.
- **`scripts/dobra`:** add `emulator) exec node "$DOBRA_DIR/packages/cli/dist/dobra.mjs" "$@" ;;` next to `check)`, and a line in `usage`.
- **README:** a "Create an emulator or simulator" section with the three commands, the options and what `limits` means.

- [ ] **Step 1: Write the failing tests**

`command.test.ts`, using the fake runner from Task 5. Move the `fakeRunner`, `SDK` and `dir` helpers out of `android.test.ts` into `packages/cli/src/emulator/fakeRunner.ts`, export them, and import them in both tests:

```ts
import { describe, expect, it } from 'vitest';
import { runEmulator } from './command';
import { fakeRunner, SDK, dir } from './fakeRunner';

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out: (s: string) => void out.push(s), err: (s: string) => void err.push(s), outText: () => out.join('\n'), errText: () => err.join('\n') };
};

describe('dobra emulator', () => {
  it('lists every device with its support', async () => {
    const o = io();
    expect(await runEmulator(['list', '--json'], o, fakeRunner({}))).toBe(0);
    const json = JSON.parse(o.outText());
    expect(json.version).toBe(1);
    expect(json.devices.find((d: { id: string }) => d.id === 'iphone-duo').support).toBe('none');
  });

  it('prints the script', async () => {
    const o = io();
    expect(await runEmulator(['script', 'pixel-9'], o, fakeRunner({}))).toBe(0);
    expect(o.outText()).toMatch(/^#!\/bin\/sh/);
  });

  it('creates an Android emulator and reports it as JSON', async () => {
    const o = io();
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis_playstore/arm64-v8a`) });
    expect(await runEmulator(['create', 'galaxy-z-fold-7', '--json'], o, r)).toBe(0);
    const json = JSON.parse(o.outText());
    expect(json).toMatchObject({ version: 1, platform: 'android', name: 'dobra_galaxy-z-fold-7', id: 'dobra_galaxy-z-fold-7', start: [[`${SDK}/emulator/emulator`, '-avd', 'dobra_galaxy-z-fold-7']] });
  });

  it('exits 2 for an unknown device or a hypothetical one, and 1 without an SDK', async () => {
    expect(await runEmulator(['create', 'nope'], io(), fakeRunner({}))).toBe(2);
    expect(await runEmulator(['create', 'iphone-duo'], io(), fakeRunner({}))).toBe(2);
    const o = io();
    expect(await runEmulator(['create', 'pixel-9'], o, fakeRunner({}))).toBe(1);
    expect(o.errText()).toMatch(/No Android SDK/);
  });

  it('exits 2 with the usage for bad options', async () => {
    expect(await runEmulator(['create', 'pixel-9', '--api', 'x'], io(), fakeRunner({}))).toBe(2);
    expect(await runEmulator([], io(), fakeRunner({}))).toBe(2);
  });
});
```

`ios.test.ts`: a fake runner whose `exec` answers `xcrun simctl list runtimes -j` with two iOS runtimes, only the newer supporting `iPhone-17`, and `list devices -j` with one device named `iPhone 17 (Dobra)`. Assert that:
- it picks the newer runtime;
- it refuses without `force`;
- it deletes, then creates, with `force`;
- the UDID comes from stdout.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/emulator` in `packages/cli`
Expected: FAIL on the missing modules.

- [ ] **Step 3: Implement `ios.ts`, `args.ts`, `command.ts`, the `main.ts` dispatch, `USAGE`, `scripts/dobra` and the README**

Follow the behaviour above. In `command.ts`, resolve the Android emulator path through `androidPaths(runner).emulator` when filling `start`.

- [ ] **Step 4: Run the CLI tests and the typecheck**

Run: `npx vitest run` in `packages/cli`, then `npm run typecheck` at the root
Expected: PASS, exit 0 for both. Check the exit code, not the text: `tsc` prints coloured errors.

- [ ] **Step 5: Commit** (three commits)

```bash
git add packages/cli/src/emulator/ios.ts packages/cli/src/emulator/ios.test.ts packages/cli/src/emulator/fakeRunner.ts
git commit -m "Create an iOS simulator from a plan"
git add packages/cli/src/emulator/args.ts packages/cli/src/emulator/command.ts packages/cli/src/emulator/command.test.ts packages/cli/src/main.ts packages/cli/src/args.ts
git commit -m "Add dobra emulator list, create and script"
git add scripts/dobra packages/cli/README.md
git commit -m "Forward dobra emulator from the installed command and document it"
```

---

### Task 7: A real-machine test

**Files:**
- Create: `packages/cli/src/emulator/machine.test.ts`

**Interfaces:**
- Consumes: `runEmulator`, `nodeRunner`.

- [ ] **Step 1: Write the test** (it skips itself when the tools are missing, so CI never runs it)

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runEmulator } from './command';

const sdk = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const hasSdk = existsSync(join(sdk, 'system-images')) && !process.env.CI;
const hasXcode = (() => { try { execFileSync('xcrun', ['simctl', 'help'], { stdio: 'ignore' }); return !process.env.CI; } catch { return false; } })();
const quiet = { out: () => {}, err: () => {} };

describe.skipIf(!hasSdk)('on a machine with the Android SDK', () => {
  it('creates and removes a throwaway AVD', async () => {
    const name = `dobra_test_${process.pid}`;
    try {
      expect(await runEmulator(['create', 'galaxy-z-fold-7', '--name', name], quiet)).toBe(0);
      const avd = join(process.env.ANDROID_AVD_HOME ?? join(homedir(), '.android/avd'), `${name}.avd`, 'config.ini');
      expect(existsSync(avd)).toBe(true);
    } finally {
      execFileSync(join(sdk, 'cmdline-tools/latest/bin/avdmanager'), ['delete', 'avd', '-n', name], { stdio: 'ignore' });
    }
  }, 120_000);
});

describe.skipIf(!hasXcode)('on a Mac with Xcode', () => {
  it('creates and removes a throwaway simulator', async () => {
    const out: string[] = [];
    expect(await runEmulator(['create', 'iphone-17', '--name', `Dobra test ${process.pid}`, '--json'], { out: (s) => out.push(s), err: () => {} })).toBe(0);
    const { id } = JSON.parse(out.join('\n'));
    execFileSync('xcrun', ['simctl', 'delete', id]);
  }, 120_000);
});
```

- [ ] **Step 2: Run it on this machine**

Run: `npx vitest run src/emulator/machine.test.ts` in `packages/cli`
Expected: PASS here (the SDK and Xcode are installed); SKIPPED in CI.

- [ ] **Step 3: Commit, push and open PR 2**

```bash
git add packages/cli/src/emulator/machine.test.ts
git commit -m "Test emulator creation against the real SDK and Xcode when present"
git push -u origin feat/emulator-cli
gh pr create --base main --title "dobra emulator: list, create and script" --label enhancement --label area:cli --body "Part of #182. dobra emulator list, create and script; the installed dobra command forwards emulator; a real-machine test that CI skips."
```

---

### Task 8: The Generator page on the site

**Files:**
- Create: `apps/site/src/lib/generator.ts`, `apps/site/src/lib/generator.test.ts`, `apps/site/src/pages/generator.astro`
- Modify: `apps/site/package.json` (add `"@dobra/core": "*"` to `dependencies`), `apps/site/src/layouts/Base.astro` (header link after Guide), `apps/site/src/pages/index.astro` (a `tools` entry), `apps/site/src/styles/site.css` (page styles, brand tokens only), `apps/site/test/built/site.test.ts`

**Interfaces:**
- Consumes: `emulatorPlan`, `emulationSupport`, `EmulatorPlanError` (Task 3), `renderScript` (Task 4), `loadCatalog`.
- Produces:

```ts
// generator.ts
export interface GeneratorResult { script: string | null; cli: string; limits: string[]; error: string | null }
export function generate(deviceId: string, opts: { api?: number; runtime?: string }): GeneratorResult;
export function deviceOptions(): { category: string; devices: { id: string; name: string; platform: 'android' | 'ios'; support: 'full' | 'partial' | 'none' }[] }[];
```

`cli` is `dobra emulator create <id>` plus `--api <n>` or `--runtime <id>` when given. The site already tells people how to install the `dobra` command. `error` is set, and `script` is null, for `no-simulator`.

The page:
- **Picker:** a `<select>` grouped by category (from `deviceOptions`). A `none` device shows "(no simulator)".
- **Fields:** a number field "Android API level (optional)" and a text field "iOS runtime (optional)", showing only the one that fits the selected platform.
- **Output:**
  - a `<pre><code>` with the script and a "Copy script" button;
  - the `limits` as a list;
  - the CLI line in its own `<pre>`, with a "Copy command" button;
  - a note that the script is for macOS and Linux and needs Android Studio (the SDK) or Xcode.
- **Rendering:** the first device is rendered at build time, so the page works without JavaScript. A `<script>` re-renders on change, using `generate`.

- [ ] **Step 1: Write the failing tests**

`generator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deviceOptions, generate } from './generator';

describe('generator', () => {
  it('offers every catalog device, grouped by category', () => {
    const ids = deviceOptions().flatMap((g) => g.devices.map((d) => d.id));
    expect(ids).toContain('galaxy-z-fold-7');
    expect(ids).toContain('iphone-duo');
  });
  it('gives a script and the dobra line for an Android device', () => {
    const r = generate('galaxy-z-fold-7', { api: 35 });
    expect(r.script).toMatch(/^#!\/bin\/sh/);
    expect(r.cli).toBe('dobra emulator create galaxy-z-fold-7 --api 35');
  });
  it('explains a device with no simulator', () => {
    const r = generate('iphone-duo', {});
    expect(r.script).toBeNull();
    expect(r.error).toMatch(/no simulator/i);
  });
});
```

Append to `apps/site/test/built/site.test.ts`:

```ts
it('builds the Generator page with a script for the first device', () => {
  const html = readFileSync(join(dist, 'generator/index.html'), 'utf8');
  expect(html).toContain('#!/bin/sh');
  expect(html).toContain('dobra emulator create');
  expect(html).toContain('<optgroup');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run` in `apps/site`
Expected: FAIL (`Cannot find module './generator'`).

- [ ] **Step 3: Implement `generator.ts`, the page, the links and the styles**

Use the brand CSS tokens (`var(--dobra-…)`), never raw colours; the site's style tests reject them. Mirror the report's hand-off block (`.site-check__handoff`) for the code blocks and the copy buttons.

- [ ] **Step 4: Build and run every site test**

Run: `npm install` (for the new workspace dependency), `npm run build:site`, `npm run test -w @dobra/site`, then `npm run test:dist -w @dobra/site`
Expected: PASS. The built page contains a script.

- [ ] **Step 5: Check in the browser**

Serve `apps/site/dist` locally. Pick Galaxy Z Fold 7, then iPhone 17, then iPhone Duo. Check the script, the limits, the copy buttons and a 375 px width with no sideways scroll.

- [ ] **Step 6: Commit, push and open PR 3**

```bash
git add apps/site/package.json package-lock.json apps/site/src/lib/generator.ts apps/site/src/lib/generator.test.ts
git commit -m "Generate an emulator script for any catalog device on the site"
git add apps/site/src/pages/generator.astro apps/site/src/styles/site.css apps/site/src/layouts/Base.astro apps/site/src/pages/index.astro apps/site/test/built/site.test.ts
git commit -m "Add the Generator page and link it from the header and the landing page"
git push -u origin feat/emulator-site
gh pr create --base main --title "Site: the emulator Generator page" --label enhancement --label area:web --body "Closes #182. The /generator/ page: pick a catalog device, copy a script (or the dobra line), see what the emulator cannot reproduce."
```

After merging PR 3, confirm that the Production deploy of `dobra-five.vercel.app` is Ready and that `/generator/` returns 200.
