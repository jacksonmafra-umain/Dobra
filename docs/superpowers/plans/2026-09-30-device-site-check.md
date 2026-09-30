# Website Checks in Real Android Chrome: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dobra check site <url> --on <serial>` (and `dobra check device <serial> <url>`) checks a website in Chrome on an Android emulator or a real phone, with the same rules, report and ZIP as `dobra check site`.

**Architecture:**
- **CLI:** new code in `packages/cli/src/device/`:
  - `adb.ts`: list devices and read their state;
  - `identify.ts`: which catalog device and posture this is;
  - `chrome.ts`: open Chrome and forward DevTools;
  - `checkDevice.ts`: the posture loop.
- **Core:** the catalog gains `models` and a Galaxy Z Flip 6. Report frames gain optional `runtime` and `signals`. The new `signals.ts` holds the two fold-API rules.
- **Wiring:** `dobra check site` gets `--on` and `--hold`, and `check device` is another way into the same engine.

**Tech Stack:** TypeScript, zod, vitest, Playwright `chromium.connectOverCDP`, adb.

**Spec:** `docs/superpowers/specs/2026-09-30-device-site-check-design.md`

## Global Constraints

- **Phones are read-only.** On a real phone Dobra only runs `am start` (open a Chrome tab), `adb forward`, `getprop`, `dumpsys` and `wm`. It never writes settings and never installs anything. Rotation and posture changes happen only on emulators, through part B (`emulatorPosture` plus `adb emu posture`).
- **The DevTools forward is always removed:** after success, after failure, and on SIGINT.
- **Report compatibility:** `runtime` and `signals` are optional on report frames, so older reports parse unchanged, and `parseReport` keeps them (it must not strip them).
- **Fold-API rules** run only on frames whose Chrome major version is 138 or newer. Older ones get a single report note: `Chrome <version> on <device> doesn't report viewport segments or posture (they need Chrome 138), so fold APIs weren't checked there.`
- **`frame-size-mismatch` is skipped on device frames.** A real window is the display minus the system bars and Chrome's toolbar, so it never equals the catalog size.
- **Options:** `--targets` and `--category` exit 2 with `--on`. `--hold` exits 2 on an emulator.
- **Exit codes:** 0 clean; 1 for findings at `--fail-on`, a target that couldn't load, a lost device, no Chrome, or no DevTools; 2 for invalid use.
- **Catalog values** carry a `source`. The Flip 6 values come from the connected phone (`wm size`, `wm density`, `dumpsys display`), with the source `device-measured`. The hinge position is `estimated`.
- **Commits:** English microcommits, with no `Co-Authored-By` or any assistant attribution. One PR per task group (see "PRs"), and never a direct merge to main.

## Rulings made while planning

- **The fold-edge tolerance** (8 CSS px) is an exported constant in `signals.ts`, following `rules.ts` (for example `SIDE_BY_SIDE_MIN`, `MIN_LEGIBLE_WIDTH`). The spec asked for a profile setting, but the app profile has no rule settings, and every other rule threshold is a commented constant. The cost if this is wrong: moving one constant.
- **The fold-API rules run in `buildReport`,** on inputs that carry `signals`, rather than inside `check()`. `check()` sees only the geometry Subject, and signals are per frame. The cost if this is wrong: one function moves.

## Review Focus

1. **A locked phone, USB debugging off, or Chrome never opening a page:** exit 1 with the fix within 20 s, never a hang. Tested in Task 6 (the `chrome.ts` wait times out).
2. **Two devices with the same model, or an `unauthorized` device in `adb devices`:** listed and never picked silently. `--on` with an unauthorized serial exits 1 with "allow USB debugging on the phone". Tested in Task 4.
3. **A leftover forward from an earlier run:** a new run picks its own port (`tcp:0`) and removes only its own forward. Tested in Task 6.
4. **Nothing changes on a phone except a Chrome tab:** a fake-runner test fails if any command sent to a non-emulator serial is `settings put`, `emu`, `install` or `pm`. Tested in Task 7.
5. **Chrome older than 138:** the fold-API rules are skipped with the note, never passed. Tested in Task 3.

## PRs

- **PR 1 (Tasks 1–3):** core: catalog `models` and the Flip 6, report `runtime` and `signals`, and the fold-API rules. Part of #198.
- **PR 2 (Tasks 4–9):** CLI device checks, `--on`, `check device`, the report app header, and the real-device tests. Closes #198.

## File structure

- `packages/core/src/config/schema.ts` (modify): optional `models` on Android devices.
- `packages/core/src/catalog/catalog.json` (modify): `galaxy-z-flip-6`, and `models` on devices with a sourced model id.
- `packages/core/src/catalog/models.ts` (create): `deviceForModel(catalog, model)`.
- `packages/core/src/report.ts` (modify): `runtime`, `signals` and `skipRules` on inputs and frames; the schema; the fold-API note.
- `packages/core/src/engine/checks.ts` (modify): two `RuleId` values.
- `packages/core/src/signals.ts` (create): the `FrameSignals` type, `signalFindings`, `FOLD_EDGE_TOLERANCE`, `chromeMajor`.
- `packages/cli/src/device/adb.ts` (create): `listDevices`, `deviceState`, `adbFor`.
- `packages/cli/src/device/identify.ts` (create): `identify`, `phonePosture`.
- `packages/cli/src/device/chrome.ts` (create): `openChrome`.
- `packages/cli/src/device/signals.ts` (create): `readSignals(page)`, run in the page.
- `packages/cli/src/device/checkDevice.ts` (create): `checkDevice`.
- `packages/cli/src/args.ts` and `packages/cli/src/main.ts` (modify): `--on`, `--hold`, `check device`, the device list.
- `packages/cli/README.md` (modify).
- `apps/report/src/FindingsView.tsx` (modify): the runtime and signals in the frame detail.
- `packages/cli/src/device/machine.test.ts` (create): the opt-in real-emulator and real-phone tests.

---

### Task 1: Catalog `models`, and the Galaxy Z Flip 6

**Files:**
- Modify: `packages/core/src/config/schema.ts` (`androidDevice`)
- Modify: `packages/core/src/catalog/catalog.json`
- Create: `packages/core/src/catalog/models.ts`
- Test: `packages/core/src/catalog/models.test.ts`

**Interfaces:**
- Produces: `AndroidDevice.models?: { id: string; source: string }[]` and `deviceForModel(catalog: Catalog, model: string): string | null`, which returns a device id. It matches an entry id that equals the model or is a prefix of it (`SM-F741` matches `SM-F741B`). With several matches, the longest id wins.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './load';
import { deviceForModel } from './models';

const catalog = loadCatalog();

describe('deviceForModel', () => {
  it('finds a phone by its model id, ignoring the region suffix', () => {
    expect(deviceForModel(catalog, 'SM-F741B')).toBe('galaxy-z-flip-6');
    expect(deviceForModel(catalog, 'SM-F741U1')).toBe('galaxy-z-flip-6');
    expect(deviceForModel(catalog, 'Pixel 9 Pro Fold')).toBe('pixel-9-pro-fold');
  });
  it('returns null for a model the catalog does not know', () => {
    expect(deviceForModel(catalog, 'SM-T510')).toBeNull();
  });
});

describe('Galaxy Z Flip 6', () => {
  const flip6 = catalog.devices.find((d) => d.id === 'galaxy-z-flip-6');
  it('has the measured displays', () => {
    if (!flip6 || flip6.platform !== 'android') throw new Error('missing');
    expect(flip6.displays.inner).toMatchObject({ size: { width: 360, height: 880 }, pixels: { width: 1080, height: 2640 }, density: 3, source: 'device-measured' });
    expect(flip6.displays.cover).toMatchObject({ size: { width: 352, height: 339 }, pixels: { width: 748, height: 720 }, density: 2.125, source: 'device-measured' });
    expect(flip6.postures?.map((p) => p.id)).toEqual(['closed', 'open', 'flex', 'flex-rotated']);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/catalog/models.test.ts` in `packages/core`
Expected: FAIL (`Cannot find module './models'`).

- [ ] **Step 3: Implement**

- **Schema:** in `androidDevice`, after `displays`, add `models: z.array(z.strictObject({ id: z.string(), source: sourceRef })).optional(),` with the comment `/** ro.product.model values, or their prefix before a region suffix, that identify this device on a connected phone. */`.
- **`models.ts`:**

```ts
// Which catalog device a connected phone is, from its ro.product.model.
import type { Catalog } from '../config/schema';

export function deviceForModel(catalog: Catalog, model: string): string | null {
  let best: { id: string; length: number } | null = null;
  for (const d of catalog.devices) {
    if (d.platform !== 'android') continue;
    for (const m of d.models ?? []) {
      if ((model === m.id || model.startsWith(m.id)) && (!best || m.id.length > best.length)) best = { id: d.id, length: m.id.length };
    }
  }
  return best?.id ?? null;
}
```

- **The Flip 6 entry:** copy the whole `galaxy-z-flip-7` object in `catalog.json` to a new entry right before it, then set:
  - `id` `galaxy-z-flip-6` and `name` `Galaxy Z Flip 6`;
  - `displays.inner`: `size` `{360, 880}`, `pixels` `{1080, 2640}`, `density` `3`, `source` `device-measured`, `estimated` `false`, `$note` `Measured on SM-F741B, Android 16: wm size 1080x2640, wm density 480.`;
  - `displays.cover`: `size` `{352, 339}`, `pixels` `{748, 720}`, `density` `2.125`, `source` `device-measured`, `estimated` `false`, `$note` `Measured on SM-F741B: dumpsys display 748 x 720, density 340.`;
  - the inner hinge: `position` `440` (half of 880), with `source` `estimated`;
  - `models`: `[{ "id": "SM-F741", "source": "device-measured" }]`.

  Keep the Flip 7's insets, postures and window modes as copied, with their `estimated` flags.
- **`models` on other devices:**
  - `pixel-9-pro-fold`: `[{ "id": "Pixel 9 Pro Fold", "source": "google-device" }]`;
  - `pixel-fold`: `[{ "id": "Pixel Fold", "source": "google-device" }]`;
  - `pixel-10-pro-fold`: `[{ "id": "Pixel 10 Pro Fold", "source": "google-device" }]`.

  Pixels report their marketing name as `ro.product.model`. Before adding a Samsung model id to `galaxy-z-fold-7` (`SM-F966`) or `galaxy-z-flip-7` (`SM-F766`), check it on samsung.com with WebFetch. Add it only if the page states it, with the source `device-spec`; otherwise leave the device without `models`, and record a ruling either way.

- [ ] **Step 4: Run the core tests**

Run: `npx vitest run` in `packages/core`
Expected: PASS. The catalog validation also passes: the Flip 6's dp must match pixels divided by density, so 1080/3 = 360, 2640/3 = 880, 748/2.125 = 352, and 720/2.125 ≈ 338.8, which is within the 1.5 dp tolerance.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/src/catalog/catalog.json packages/core/src/catalog/models.ts packages/core/src/catalog/models.test.ts
git commit -m "Add catalog model ids and the Galaxy Z Flip 6, measured on the device"
```

---

### Task 2: `runtime`, `signals` and `skipRules` on report frames

**Files:**
- Modify: `packages/core/src/report.ts`
- Create: `packages/core/src/signals.ts` (types only in this task)
- Test: `packages/core/src/report.test.ts`

**Interfaces:**
- Produces, in `signals.ts`:

```ts
export interface FrameRuntime { kind: 'android-chrome'; serial: string; model: string; android: string; chrome: string; emulator: boolean }
export interface FrameSignals {
  viewport: { width: number; height: number; dpr: number };
  devicePosture: 'continuous' | 'folded' | null;
  segments: { x: number; y: number; width: number; height: number }[] | null;
  mq: { horizontalSegments2: boolean; verticalSegments2: boolean; postureFolded: boolean };
  /** The committed device state when the frame was read, for fold-posture-mismatch. */
  deviceState: 'CLOSED' | 'HALF_OPENED' | 'OPENED' | null;
}
```

- Produces, in `report.ts`:
  - `ReportFrame.runtime?: FrameRuntime` and `ReportFrame.signals?: FrameSignals`;
  - on `ReportInput`: `runtime?`, `signals?` and `skipRules?: RuleId[]`;
  - `reportSchema` gains both fields as optional objects.
- **`buildReport`:** it copies `runtime` and `signals` onto the frame, passes the rules without `skipRules` to `check()` through its third argument, and does so for unmatched frames too, where `runtime` and `signals` are still copied.

- [ ] **Step 1: Write the failing tests** (append to `report.test.ts`)

```ts
describe('device frames', () => {
  const runtime = { kind: 'android-chrome', serial: 'emulator-5554', model: 'sdk_gphone64_arm64', android: '16', chrome: '133.0.6943.137', emulator: true } as const;
  const signals = { viewport: { width: 750, height: 680, dpr: 2.625 }, devicePosture: 'continuous', segments: null, mq: { horizontalSegments2: false, verticalSegments2: false, postureFolded: false }, deviceState: 'OPENED' } as const;
  const input = { ref: 'u#1', name: 'galaxy-z-fold-7/inner/open/portrait', page: 'u', width: 750, height: 680, tag: 'galaxy-z-fold-7/inner/open/portrait', root: [], runtime, signals, skipRules: ['frame-size-mismatch' as const] };

  it('keeps runtime and signals on the frame, and through parseReport', () => {
    const r = buildReport(catalog, { kind: 'web', ref: 'u', name: 'u' }, [input]);
    expect(r.frames[0]).toMatchObject({ runtime, signals });
    expect(parseReport(JSON.parse(JSON.stringify(r))).frames[0]).toMatchObject({ runtime, signals });
  });

  it('skips the rules a device frame asks it to', () => {
    const r = buildReport(catalog, { kind: 'web', ref: 'u', name: 'u' }, [input]);
    expect(r.frames[0].findings.map((f) => f.ruleId)).not.toContain('frame-size-mismatch');
    const without = buildReport(catalog, { kind: 'web', ref: 'u', name: 'u' }, [{ ...input, skipRules: undefined }]);
    expect(without.frames[0].findings.map((f) => f.ruleId)).toContain('frame-size-mismatch');
  });

  it('still parses a report from before these fields', () => {
    const r = buildReport(catalog, { kind: 'web', ref: 'u', name: 'u' }, [{ ...input, runtime: undefined, signals: undefined }]);
    expect(parseReport(JSON.parse(JSON.stringify(r))).frames[0].runtime).toBeUndefined();
  });
});
```

(`catalog` and `parseReport` are already imported in `report.test.ts`. Add whatever is missing.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/report.test.ts` in `packages/core`
Expected: FAIL (`runtime` missing, and `frame-size-mismatch` present).

- [ ] **Step 3: Implement**

- **`signals.ts`:** add the two interfaces.
- **`report.ts`:**
  - Import the two types and `RuleId`. Add the optional fields to both interfaces.
  - Schema: `runtime: z.object({ kind: z.literal('android-chrome'), serial: z.string(), model: z.string(), android: z.string(), chrome: z.string(), emulator: z.boolean() }).optional()` and `signals: z.object({ viewport: z.object({ width: z.number(), height: z.number(), dpr: z.number() }), devicePosture: z.enum(['continuous', 'folded']).nullable(), segments: z.array(rect).nullable(), mq: z.object({ horizontalSegments2: z.boolean(), verticalSegments2: z.boolean(), postureFolded: z.boolean() }), deviceState: z.enum(['CLOSED', 'HALF_OPENED', 'OPENED']).nullable() }).optional()`.
  - In `buildReport`, build `const extra = { ...(f.runtime ? { runtime: f.runtime } : {}), ...(f.signals ? { signals: f.signals } : {}) }`, spread it into both `frames.push` calls, and compute `const rules = f.skipRules?.length ? ALL_RULES.filter((r) => !f.skipRules!.includes(r)) : undefined` for `check(..., config, rules)`.
  - Export `ALL_RULES` from `rules.ts` as `Object.keys(RULES) as RuleId[]`.

- [ ] **Step 4: Run the core tests**

Run: `npx vitest run` in `packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/report.ts packages/core/src/signals.ts packages/core/src/rules.ts packages/core/src/report.test.ts
git commit -m "Carry a device frame's runtime and signals in the report, and let it skip rules"
```

---

### Task 3: The fold-API rules and the Chrome note

**Files:**
- Modify: `packages/core/src/signals.ts`, `packages/core/src/engine/checks.ts` (`RuleId`), `packages/core/src/report.ts` (`buildReport`)
- Test: `packages/core/src/signals.test.ts`

**Interfaces:**
- Produces:

```ts
export const FOLD_EDGE_TOLERANCE = 8; // CSS px; this design's choice, like rules.ts thresholds
export const FOLD_API_CHROME = 138;
export const chromeMajor: (version: string) => number; // "133.0.6943.137" → 133, garbage → 0
export function signalFindings(signals: FrameSignals, runtime: FrameRuntime, root: GeoNode[], target: Target): Finding[];
```

- **`RuleId`** gains `'fold-layout-missing' | 'fold-posture-mismatch'`.
- **`buildReport`:** for a matched input with `signals` and `runtime`, it appends `signalFindings(…)` for the first target. Then, over all inputs, it adds the Chrome note once per device serial whose `chromeMajor(runtime.chrome) < FOLD_API_CHROME`.

**The rules:**
- **When they run:** only when `chromeMajor(runtime.chrome) >= FOLD_API_CHROME`.
- **`fold-layout-missing` (warn):**
  - It fires when `segments` has exactly 2 entries and no node in `walk(root)` has an edge within `FOLD_EDGE_TOLERANCE` of the gap, while spanning at least half the segment's length along the fold.
  - The gap is side by side when `segments[1].x > segments[0].x`, with its edges at `x = segments[0].x + segments[0].width` and at `segments[1].x`. Otherwise it's stacked, at the same `y` values.
  - The finding has `nodeId: 'page'`, the gap as its `rect`, the message `Chrome reports the window as two segments, but nothing on the page lines up with the fold: the layout ignores it.`, `source: 'estimated'` and `estimated: true`.
- **`fold-posture-mismatch` (info):**
  - It fires when `deviceState === 'HALF_OPENED'` and `devicePosture !== 'folded'`.
  - The message is `The device is half-open, but navigator.devicePosture says "<value>": the page may be overriding it, or the API is off.`
  - The finding has `nodeId: 'page'` and the viewport as its `rect`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import type { GeoNode } from './geo';
import { chromeMajor, signalFindings, type FrameRuntime, type FrameSignals } from './signals';

const target = { deviceId: 'galaxy-z-flip-6', displayId: 'inner', pose: 'flex-rotated', orientation: 'landscape' } as const;
const runtime = (chrome: string): FrameRuntime => ({ kind: 'android-chrome', serial: 's', model: 'SM-F741B', android: '16', chrome, emulator: false });
const two: FrameSignals = {
  viewport: { width: 880, height: 360, dpr: 3 },
  devicePosture: 'folded',
  segments: [{ x: 0, y: 0, width: 440, height: 360 }, { x: 440, y: 0, width: 440, height: 360 }],
  mq: { horizontalSegments2: true, verticalSegments2: false, postureFolded: true },
  deviceState: 'HALF_OPENED',
};
const node = (id: string, x: number, width: number): GeoNode => ({ id, name: id, role: 'container', rect: { x, y: 0, width, height: 360 }, children: [] }) as unknown as GeoNode;

describe('chromeMajor', () => {
  it('reads the major version', () => {
    expect(chromeMajor('154.0.8037.57')).toBe(154);
    expect(chromeMajor('')).toBe(0);
  });
});

describe('fold-layout-missing', () => {
  it('warns when nothing lines up with the fold', () => {
    expect(signalFindings(two, runtime('154.0'), [node('a', 0, 880)], target).map((f) => f.ruleId)).toEqual(['fold-layout-missing']);
  });
  it('is quiet when a pane edge sits on the fold', () => {
    expect(signalFindings(two, runtime('154.0'), [node('left', 0, 436), node('right', 446, 434)], target)).toEqual([]);
  });
  it('never runs on Chrome older than 138', () => {
    expect(signalFindings(two, runtime('133.0'), [node('a', 0, 880)], target)).toEqual([]);
  });
});

describe('fold-posture-mismatch', () => {
  it('notes a half-open device whose page does not see the fold posture', () => {
    const f = signalFindings({ ...two, segments: null, devicePosture: 'continuous' }, runtime('154.0'), [], target);
    expect(f.map((x) => [x.ruleId, x.severity])).toEqual([['fold-posture-mismatch', 'info']]);
  });
});
```

Then add to `report.test.ts`: two inputs for serial `emulator-5554` on Chrome `133.0.6943.137` produce **one** note, which contains `Chrome 133.0.6943.137` and `need Chrome 138`, and no `fold-*` findings.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/signals.test.ts src/report.test.ts` in `packages/core`
Expected: FAIL (`signalFindings` is not exported).

- [ ] **Step 3: Implement** `chromeMajor`, `signalFindings` (with the two rules exactly as above), the `RuleId` values, and the `buildReport` wiring.

- [ ] **Step 4: Run the core tests and the typecheck**

Run: `npx vitest run` in `packages/core`, then `npm run typecheck` at the root
Expected: PASS, exit 0.

- [ ] **Step 5: Commit, push and open PR 1**

```bash
git add packages/core/src/signals.ts packages/core/src/signals.test.ts packages/core/src/engine/checks.ts packages/core/src/report.ts packages/core/src/report.test.ts
git commit -m "Check a page against the fold Chrome reports, on Chrome 138 and newer"
git push -u origin feat/device-check-core
gh pr create --base main --title "Device checks, core: catalog models, the Flip 6, device frames and fold-API rules" --label enhancement --label area:core --body "Part of #198. Plan Tasks 1 to 3: catalog models and a measured Galaxy Z Flip 6, runtime and signals on report frames, and fold-layout-missing and fold-posture-mismatch on Chrome 138 or newer, with a note for older Chrome."
```

---

### Task 4: Listing devices and reading their state

**Files:**
- Create: `packages/cli/src/device/adb.ts`
- Test: `packages/cli/src/device/adb.test.ts`

**Interfaces:**
- Consumes: `Runner`, `ToolError`, `androidPaths` and `adbPath` from `../emulator/runner` and `../emulator/android`; `fakeRunner` from `../emulator/fakeRunner`.
- Produces:

```ts
export interface ConnectedDevice { serial: string; state: 'device' | 'unauthorized' | 'offline'; emulator: boolean; model: string; android: string; chrome: string | null }
export function adbFor(r: Runner): string; // adbPath(r, androidPaths(r))
export async function listDevices(r: Runner): Promise<ConnectedDevice[]>;
export async function deviceState(r: Runner, serial: string): Promise<{ state: 'CLOSED' | 'HALF_OPENED' | 'OPENED' | null; rotation: 0 | 1 | 2 | 3 }>;
export async function requireDevice(r: Runner, serial: string): Promise<ConnectedDevice>; // ToolError (exit 1) for missing, unauthorized or offline
```

**Behaviour:**
- **`listDevices`:** it parses the `adb devices -l` lines `<serial>\s+<state>`. For each `device`, it reads:
  - `getprop ro.product.model`;
  - `getprop ro.build.version.release`;
  - `getprop ro.kernel.qemu`, where `1` means an emulator;
  - `dumpsys package com.android.chrome`, taking `versionName=` or `null` when it's absent.

  Unauthorized and offline devices are listed with empty fields.
- **`requireDevice`:** a serial that isn't listed raises `No device <serial>: connect it, or check adb devices.`; an `unauthorized` one raises `<serial> hasn't allowed USB debugging from this computer: unlock it and accept the prompt.`; an `offline` one raises `<serial> is offline: reconnect it.`
- **`deviceState`:** it runs `dumpsys device_state`, taking `/mCommittedState=Optional\[DeviceState\{identifier=\d+, name='([A-Z_]+)'/`, where `CLOSED`, `HALF_OPENED` and `OPENED` count and anything else is `null`. It also runs `dumpsys window displays`, taking `/mCurrentRotation=ROTATION_(\d+)/`, where 90 is 1, 180 is 2 and 270 is 3.

- [ ] **Step 1: Write the failing tests.** Use a fake runner whose `exec` answers:
  - `adb devices -l` with three lines: `emulator-5554 device product:sdk…`, `RZCXA15YFEJ device usb:… model:SM_F741B`, and `R3GL70KLKAR unauthorized`;
  - the `getprop` and `dumpsys` calls per serial.

  Assert that:
  - the parsed list has the emulator flag, the model, the Android version and the Chrome version;
  - `requireDevice` gives the three messages;
  - `deviceState` returns `HALF_OPENED` with rotation `1` for the canned output `mCommittedState=Optional[DeviceState{identifier=2, name='HALF_OPENED', …` and `mCurrentRotation=ROTATION_90`, and `null` for unrecognised output.

- [ ] **Step 2: Run them and watch them fail.** `npx vitest run src/device/adb.test.ts` in `packages/cli`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `adb.ts`.** Every adb call is `r.exec(adbFor(r), ['-s', serial, 'shell', …])`, apart from `devices -l`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "List connected Android devices and read their fold state"`

---

### Task 5: Identify the catalog device and the posture

**Files:**
- Create: `packages/cli/src/device/identify.ts`
- Test: `packages/cli/src/device/identify.test.ts`

**Interfaces:**
- Consumes: `ConnectedDevice` (Task 4), `deviceForModel` (Task 1), `posturesOf` and `emulatorPosture` (`@dobra/core/emulator/posture`), and `offeredOrientations` if needed.
- Produces:

```ts
export interface Identified { deviceId: string | null; how: 'avd-name' | 'model' | 'unknown' }
export async function identify(r: Runner, adb: string, d: ConnectedDevice, catalog: Catalog): Promise<Identified>;
/** The catalog posture and orientation for a phone's state and rotation; null when none matches. */
export function phonePosture(catalog: Catalog, deviceId: string, state: 'CLOSED' | 'HALF_OPENED' | 'OPENED', rotation: 0 | 1 | 2 | 3): { posture: string; orientation: 'portrait' | 'landscape' } | null;
```

**Behaviour:**
- **Emulators:** `adb -s <serial> emu avd name` gives the first line. When it's `dobra_<id>` and `<id>` is a catalog device, the result is `{ deviceId: id, how: 'avd-name' }`. Otherwise the model is tried.
- **Phones:** `deviceForModel(catalog, d.model)` gives `{ deviceId, how: 'model' }`, or `{ null, 'unknown' }`.
- **`phonePosture`:**
  - `CLOSED` maps to the device's `cover` posture, and `OPENED` to `flat`.
  - `HALF_OPENED` maps to the half-open posture (`book` or `tabletop` kind) whose hinge axis, in the current rotation, matches:
    - the hinge axis in the natural orientation comes from the posture display's `hinges[0].axis`;
    - rotation 1 or 3 swaps it;
    - a vertical axis now means `book`, and a horizontal one means `tabletop`.
  - The orientation is `portrait` when the rotated display is taller than wide.
  - Nothing matching gives `null`.

- [ ] **Step 1: Write the failing tests:**
  - an emulator named `dobra_galaxy-z-fold-7` identifies by AVD name;
  - a phone with the model `SM-F741B` identifies as `galaxy-z-flip-6`;
  - `SM-T510` is unknown;
  - `phonePosture(catalog, 'galaxy-z-flip-6', 'HALF_OPENED', 0)` is `{ posture: 'flex', orientation: 'portrait' }` (a horizontal hinge, so tabletop kind);
  - `…, 'HALF_OPENED', 1)` is `{ posture: 'flex-rotated', orientation: 'landscape' }`;
  - `…, 'CLOSED', 0)` has `posture: 'closed'`;
  - `phonePosture(catalog, 'galaxy-z-fold-7', 'HALF_OPENED', 0)` is `book` (a vertical hinge);
  - `pixel-9`, which has no postures, gives `null`.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Identify a connected device and its posture from the catalog"`

---

### Task 6: Open Chrome and forward DevTools

**Files:**
- Create: `packages/cli/src/device/chrome.ts`
- Test: `packages/cli/src/device/chrome.test.ts`

**Interfaces:**
- Consumes: `Runner` and `adbFor`.
- Produces:

```ts
export interface ChromeSession { port: number; close(): Promise<void> }
/** Opens url in Chrome on the device and forwards its DevTools to a free local port. */
export async function openChrome(r: Runner, serial: string, url: string, opts?: { waitMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<ChromeSession>;
```

**Behaviour:**
1. `adb -s S shell am start -a android.intent.action.VIEW -d <url> com.android.chrome`. `Error` in its output means Chrome isn't installed: `ToolError('Chrome isn't installed on <serial>.')`.
2. `adb -s S forward tcp:0 localabstract:chrome_devtools_remote` prints the port adb picked. Parse the integer, and record it.
3. Poll `adb -s S shell cat /proc/net/unix` for `@chrome_devtools_remote`, every 500 ms up to `waitMs` (20 000 by default). The HTTP check happens in Task 7 through Playwright; here, only the socket is watched. On timeout, remove the forward, then raise `ToolError('Chrome on <serial> didn't open DevTools: unlock the phone and keep Chrome in front, and check that USB debugging is on.')`.
4. **`close()`:** `adb -s S forward --remove tcp:<port>`. It's idempotent. Remove only your own port, never `--remove-all`.

- [ ] **Step 1: Write the failing tests.** With a fake runner, assert that:
  - the port is parsed from `forward tcp:0` output such as `41817\n`;
  - `close()` removes exactly `tcp:41817`, and a second `close()` sends nothing;
  - a socket that never appears raises the DevTools message **and** has already removed the forward (with an injected `sleep` that resolves at once, and `waitMs: 1000`);
  - `am start` output with `Error: Activity class … does not exist` raises "Chrome isn't installed".
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Test Playwright's `_android` against the emulator (evaluation only, no code kept).** Boot a created Fold 7 AVD (as in the machine tests), then run a scratch script outside the repo. Find out whether `(await import('playwright'))._android.devices()` lists it, and whether `device.launchBrowser()` or `device.screenshot()` gives something the forward-plus-`connectOverCDP` path doesn't, for example screenshots that include the system bars. Record `Task 6: Ruling: _android adopted for <what> | not adopted — <evidence>` in the ledger. If it's adopted, add it behind `openChrome`'s interface in this task, with its own test.
- [ ] **Step 6: Commit.** `git commit -m "Open Chrome on a device and forward its DevTools to a free port"`

---

### Task 7: The device check loop

**Files:**
- Create: `packages/cli/src/device/signals.ts`, `packages/cli/src/device/checkDevice.ts`
- Test: `packages/cli/src/device/checkDevice.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 6; `collectLayout` (`../collect`); `emulatorPosture`; `buildReport`, `ReportInput`, `FrameSignals` and `FrameRuntime`.
- Produces:

```ts
// signals.ts (runs in the page)
export async function readSignals(page: Page, deviceState: FrameSignals['deviceState']): Promise<FrameSignals>;
// checkDevice.ts
export interface DeviceCheckDeps {
  runner: Runner;
  connect(port: number): Promise<{ page: Page; close(): Promise<void> }>; // chromium.connectOverCDP(`http://127.0.0.1:${port}`), then the page whose url matches
  collect(page: Page): Promise<{ root: GeoNode[] }>;
  signals(page: Page, deviceState: FrameSignals['deviceState']): Promise<FrameSignals>;
  waitForEnter(prompt: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
}
export interface DeviceCheckOptions { wait: number; transitions: boolean; hold: boolean; onProgress?(m: string): void; capture?: { images: Map<string, Uint8Array>; missing: Record<string, string> } }
export async function checkDevice(url: string, serial: string, opts: DeviceCheckOptions, deps: DeviceCheckDeps): Promise<Report>;
```

**Behaviour:**
1. `requireDevice(serial)`, then `identify`. Check the options: `hold` on an emulator is invalid use, `ToolError` subclass `UsageError`, which maps to exit 2. Export `class UsageError extends Error {}` from `checkDevice.ts`.
2. **Postures:**
   - an emulator with a catalog device gets every posture in `posturesOf`. It skips the ones for which `emulatorPosture` throws, and ones whose `{emulator, rotation}` repeats an earlier posture's. The note `<label> looks the same as <earlier label> on the emulator, so it was checked once.` covers those;
   - a phone with a catalog device gets its current `phonePosture` first, then, with `hold`, the remaining ones in catalog order;
   - an unknown device gets one pass with no posture.
3. **Each posture:**
   - **Emulator:** `emulatorPosture` gives the settings. Rotation settings go first, then `emu posture N`, as in part B's command (reuse the same `send` order). Then `sleep(1500)`.
   - **Phone with `hold`:** after the first posture, `waitForEnter('Fold the phone to <label>, then press Enter.')`. Then poll `deviceState` every 500 ms until it matches the target state, for up to 60 s. On timeout, add the note `Skipped <label>: the phone didn't reach it within 60 s.` and continue.
   - **Every frame:**
     - `openChrome` (only once, with the session reused; see below), then `connect`, `page.goto(url)` and `sleep(opts.wait)`;
     - `collect`, then `signals(page, (await deviceState()).state)`;
     - the screenshot, taken with `page.screenshot()` into `capture.images`, keyed by the frame ref;
     - a `ReportInput` with:
       - `tag`: the target key `<id>/<display>/<posture>/<orientation>`, or `''` when unknown;
       - `width` and `height`: the signals viewport;
       - `runtime`;
       - `signals`;
       - `skipRules: ['frame-size-mismatch']`.
     - `onProgress('Checking <serial> <posture>')`.
4. **Transitions** (emulators only, when `opts.transitions`): after the first `flat` frame, set the next half-open posture **without** reloading, collect as `afterResize`, then reload and collect as `afterReload`. Push `resizeVsReload(afterResize.root, afterReload.root, target)` into that frame's findings after `buildReport`, the way `checkSite` merges `extra`.
5. **Sessions:** one `openChrome` session and one `connect` per run, both always closed in `finally`. A SIGINT handler registered for the run's duration calls `close()`.
6. **A lost device:** when `requireDevice` or an adb call fails mid-run, add the frame to `unloaded` with the reason `The device disconnected.`, then stop the loop.
7. **Unknown devices:** the note `<model> isn't in the Dobra catalog, so only the window was checked (no fold geometry).`
8. **Result:** `buildReport(catalog, { kind: 'web', ref: url, name: url }, inputs)`, with the notes and `extra` merged as in `checkSite`.

- [ ] **Step 1: Write the failing tests.** Use the fake runner (answering `devices -l`, `getprop`, `emu avd name`, `dumpsys device_state`, `am start`, `forward`, `/proc/net/unix`), a fake `connect` returning a stub `page` (`goto`, `reload`, `screenshot` resolving a PNG `Uint8Array`), `collect` returning `{ root: [] }`, `signals` returning canned `FrameSignals`, and an instant `sleep`. Cover:
   - an emulator `dobra_galaxy-z-fold-7` gives one frame per distinct emulator state. The postures come from `posturesOf`, minus the ones `emulatorPosture` rejects and minus any whose `{emulator, rotation}` repeats an earlier posture's: `dual-screen` maps to the same open state as `open`, so it's skipped and a note names it. Assert the frames (`closed`, `open`, `book`, `tabletop`), that the tags are the target keys, and the note;
   - every frame has `runtime.emulator: true` and no `frame-size-mismatch` finding;
   - a phone (`RZCXA15YFEJ`, `SM-F741B`) without `hold` gives exactly one frame, for its current posture;
   - **phone safety (Review Focus 4):** across the whole run, no command sent to the phone's serial matches `/settings put|emu |install|\bpm\b/`;
   - with `hold`, `waitForEnter` is called for each remaining posture. A state that never changes, with `now()` advancing by 61 s, gives the skip note;
   - an unknown model gives one untagged frame and the "isn't in the Dobra catalog" note;
   - `hold` on an emulator throws `UsageError`;
   - the forward is removed and `connect`'s `close` is called, even when `collect` throws.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement `signals.ts`,** in the page:

```ts
// What Chrome on the device says about the window and the fold, read in the page.
import type { FrameSignals } from '@dobra/core/signals';
import type { Page } from 'playwright';

export async function readSignals(page: Page, deviceState: FrameSignals['deviceState']): Promise<FrameSignals> {
  const s = await page.evaluate(() => {
    const vp = (window as unknown as { viewport?: { segments?: DOMRect[] } }).viewport;
    const posture = (navigator as unknown as { devicePosture?: { type?: string } }).devicePosture?.type;
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      devicePosture: posture === 'continuous' || posture === 'folded' ? posture : null,
      segments: vp?.segments ? [...vp.segments].map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })) : null,
      mq: {
        horizontalSegments2: matchMedia('(horizontal-viewport-segments: 2)').matches,
        verticalSegments2: matchMedia('(vertical-viewport-segments: 2)').matches,
        postureFolded: matchMedia('(device-posture: folded)').matches,
      },
    };
  });
  return { ...s, deviceState } as FrameSignals;
}
```

   Then implement `checkDevice.ts` to the behaviour above.
- [ ] **Step 4: Run the CLI tests and the typecheck.** Expected: PASS, exit 0.
- [ ] **Step 5: Commit.** `git commit -m "Check a site in Chrome on a device, posture by posture"`

---

### Task 8: `--on`, `--hold`, `check device`, the device list and the report header

**Files:**
- Modify: `packages/cli/src/args.ts`, `packages/cli/src/main.ts`, `packages/cli/README.md`, `apps/report/src/FindingsView.tsx`, `apps/report/src/report.css`
- Test: `packages/cli/src/args.test.ts`, `packages/cli/src/main.test.ts`, `apps/report/src/components.test.ts`

**Interfaces:**
- Consumes: `checkDevice`, `UsageError`, `listDevices`.
- Produces:
  - `SiteOptions.on: string | null` and `SiteOptions.hold: boolean`;
  - a new `CliOptions` member `{ command: 'devices' }`, for `check site --on` without a serial;
  - `check device <serial> <url> [opts]` parses to `SiteOptions` with `on` set;
  - `Io.checkDevice?: typeof checkDevice` for tests.

**Behaviour:**
- **Argument parsing:** before `parseNodeArgs`, if `--on` is the last argument, or is followed by an argument starting with `--`, replace it with `--list-devices`, a hidden boolean.
  - `check site --list-devices` with no URL gives `{ command: 'devices' }`.
  - `--on` with `--targets` or `--category` gives `{ help, error: '--on checks one device; leave out --targets and --category.' }`.
  - `--hold` without `--on` gives `{ help, error: '--hold needs --on <serial>.' }`.
- **`main.ts`:**
  - `devices` prints one line per device: `<serial>  <emulator|phone>  <model>  Android <v>  Chrome <v|none>  <catalog id|not in catalog>  <fold APIs: yes|no>`. It uses `identify`, and exits 0.
  - `site` with `on` runs `checkDevice` with real dependencies:
    - `connect`: `chromium.connectOverCDP`, then the page whose URL starts with the checked URL, or else the first page;
    - `collect`: `collectLayout`;
    - `signals`: `readSignals`;
    - `waitForEnter`: `readline` on stdin;
    - `sleep`: `setTimeout`, and `now`: `Date.now`.
  - The report, Markdown, ZIP, summary and exit code then follow the existing `site` path. `UsageError` gives exit 2, and `ToolError` gives exit 1 with its message.
- **`USAGE`:** add `       dobra check site <url> --on <serial> [--hold]  (Chrome on a device; --on alone lists devices)` and `       dobra check device <serial> <url> [options]`.
- **README:** add a "Check in Chrome on a device" section covering the three uses, the read-only rule for phones, `--hold`, the Chrome 138 note and the device list.
- **Report app, `FrameDetail`:**
  - When `frame.runtime` is set, show under the title `<model> · Android <v> · Chrome <v> · emulator|phone <serial>`.
  - When `frame.signals` is set, show a small "Signals" line: `viewport 750×680 @2.625 · posture continuous · segments none|2`. Style it with the existing `.muted`.

- [ ] **Step 1: Write the failing tests:**
  - **Args:** `check site https://x --on emulator-5554` gives `on: 'emulator-5554'`; `check device R3 https://x` gives `on: 'R3'`; `check site --on` gives `{ command: 'devices' }`; plus the two errors.
  - **Main:** with a fake `checkDevice` returning a report, `run(['check','site','https://x','--on','emulator-5554','--out',…])` writes the report and exits 0. A `UsageError` exits 2 and a `ToolError` exits 1.
  - **Report app:** `FrameDetail` renders the runtime line and the signals line for a frame that has them.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the CLI and report tests, and the typecheck.** Expected: PASS, exit 0.
- [ ] **Step 5: Commit** (three commits):

```bash
git commit -m "Parse --on, --hold and check device, and list connected devices"   # args.ts, main.ts, tests
git commit -m "Document checking a site in Chrome on a device"                    # README
git commit -m "Show where a frame ran and what Chrome reported in the report"     # apps/report
```

---

### Task 9: Real-device tests

**Files:**
- Create: `packages/cli/src/device/machine.test.ts`

- [ ] **Step 1: Write the tests.**
  - Both are opt-in: the emulator test with `DOBRA_MACHINE_TEST=1`, the phone test with `DOBRA_DEVICE=<serial>`.
  - **Emulator:**
    - Create `galaxy-z-fold-7` as `dobra_device_test` in a temporary `ANDROID_AVD_HOME`, and boot it on port 5610.
    - Wait for `sys.boot_completed`, then 15 s more.
    - Serve `examples/sites` with the existing fixture server (`../test/server`), using `adb reverse tcp:<port> tcp:<port>` so the emulator reaches it at `http://localhost:<port>`.
    - Run `run(['check','site', '<url>/good.html', '--on', 'emulator-5610', '--zip', <tmp>/r.zip, '--no-transitions'], io)`.
    - Assert:
      - the exit code is 0 or 1 (findings are fine);
      - there's one frame per posture that `emulatorPosture` accepts for `galaxy-z-fold-7`;
      - every frame has `runtime.chrome` set and `signals.viewport.width > 0`;
      - the ZIP has one screenshot per frame.
    - In `finally`: `adb reverse --remove`, `emu kill`, and delete the temporary AVD home.
  - **Phone:** with `DOBRA_DEVICE` set, the same fixture page through `adb reverse`, **without** `--hold`.
    - Assert one frame with `runtime.emulator === false` and `runtime.serial === DOBRA_DEVICE`.
    - When the phone reports Chrome 138 or newer and its state is `HALF_OPENED`, also assert `signals.segments?.length === 2`.
    - In `finally`: `adb reverse --remove tcp:<port>` only.
- [ ] **Step 2: Run the emulator test on this machine.** `DOBRA_MACHINE_TEST=1 npx vitest run src/device/machine.test.ts` in `packages/cli`. Expected: PASS, with `~/.android/avd` unchanged.
- [ ] **Step 3: Run the phone test only if the user confirms, in chat, that it may use the phone.** `DOBRA_DEVICE=RZCXA15YFEJ npx vitest run src/device/machine.test.ts -t phone`. It opens one Chrome tab on the phone. Record the result, or "not run (no confirmation)", in the ledger.
- [ ] **Step 4: Run the full suites and the typecheck.** Run `npm test` and `npm run typecheck` at the root. Expected: PASS.
- [ ] **Step 5: Commit, push and open PR 2.**

```bash
git add packages/cli/src/device/machine.test.ts
git commit -m "Test device checks against a real emulator, and a phone when DOBRA_DEVICE is set"
git push -u origin feat/device-check-cli
gh pr create --base feat/device-check-core --title "dobra check site --on: check a site in Chrome on a device" --label enhancement --label area:cli --body "Closes #198. Plan Tasks 4 to 9."
```

After merging, rebuild the local CLI (`npm run build:cli`), tell agent/04 the interface (`--on`, `--hold`, `check device`, the device list, and `runtime` and `signals` in the report), and confirm the Production deploy is Ready.
