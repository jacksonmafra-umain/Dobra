# Parity view and findings export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the same screen and state on an iOS device and an Android device side by side, with a table of what differs. Export the current screen's findings as a Dobra Report JSON that the web report can open.

**Architecture:** The canvas's device-plus-screen rendering moves into a `Stage` component, so the app can render one or two stages. Parity is a URL flag (`vs=<deviceId>`). The counterpart device is chosen by a pure function: same category, nearest width. A second pure function compares the two resolved environments and layouts row by row. The export walks the rendered screen's DOM into records, a pure function turns them into core `GeoNode`s, and `buildReport` from `@dobra/core/report` produces the Report JSON. Nothing in `packages/core` changes.

**Tech Stack:** TypeScript, React 19, Vitest; `@dobra/core` read-only.

**Spec:** `docs/android-extension-brief.md`, whose last slice is "exports and the parity view". Also `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §3.2 (GeoNode, Report) and §6 (the web report).

## Global Constraints

- Scope is `apps/simulator` only. Do not edit `packages/core`, `apps/report` or `packages/figma-plugin`. If a core change is needed, open a labeled `area:core` issue and message agent/02.
- Do not add fields to `Report`. Do not set `Report.notes`: slice 6 adds it for the CLI.
- **Part B (the export, Tasks 4 and 5) is blocked until PR #22 merges and until the `area:core` issue from the media-facts plan's Task 0 lands. That issue adds `'simulator'` to `Report.source.kind`.** `buildReport`, `Report`, `GeoNode`, `targetKey` and `loadCatalog`'s `Catalog` come from `packages/core/src/report.ts`, `geo.ts` and `targets.ts`, as they are on `origin/feat/web-report`. Part A (Tasks 1 to 3) can start now.
- iOS and Android are peer clients of the same spec. The parity view compares them; it does not present one as the reference for the other.
- Use English throughout, microcommits, and no assistant mention in commits or PRs. Use one labeled issue per part (`enhancement`), on branch `feat/parity-view` for Part A and `feat/findings-export` for Part B, each from `main`, each with a PR that closes its issue.

## Rulings made while planning

- **Source kind.** The export uses `kind: 'simulator'`, with `ref` set to the simulator URL. `'web'` would mislabel it in the web report. agent/02 adds `'simulator'` to `Report.source.kind` in the core issue; `Subject.source` already has it in `geo.ts`. `'web'` is used only as a fallback, if that issue slips and the user wants the export sooner. The fallback is one constant, `SOURCE_KIND` in `exportReport.ts`.
- **Which findings a Report holds.** `buildReport` runs core `check()` over the GeoNode tree, so the Report's findings are core's geometry rules. They are not the simulator's own `runLayoutChecks` list, which reads engine state such as scenes and window modes. The export dialog says this in one line. Folding `runLayoutChecks` findings into a Report would need a core change, since `buildReport` takes no findings.
- **What can be exported.** Only catalog targets can be exported: the target must pass `isKnownTarget`, and the Android window must be full screen. Free resize, split, freeform, popup and PiP windows are not catalog frames, and `matchFrame` would report them as `frame-size-mismatch` or `none`. The Export button is disabled in those states, with the reason as its title.

## Review Focus

- Parity with a device that has no counterpart in the same category (a flip, a desktop or dual-screen) falls back to a sensible pair and never crashes.
- A `vs` URL value that is not an enabled device of the other platform is ignored, and parity turns off.
- Changing the orientation in parity mode moves both stages. On Android the counterpart rotates only when its natural shape differs.
- Each stage's collision checker measures its own DOM subtree. The two stages must not share collisions state.
- The export on a folded target (Pixel 9 Pro Fold, book) produces a Report that `parseReport` accepts, whose frame `targets` holds exactly the current target key.

---

## Part A: Parity view

### Task 1: Counterpart device and parity rows

**Files:**
- Create: `apps/simulator/src/ui/parity.ts`
- Test: `apps/simulator/src/ui/parity.test.ts`

**Interfaces:**
- Consumes: `SimulatorConfig`, `DeviceSpec` (`@dobra/core/config/types`), `Environment`, `Selection`, `resolveEnvironment` (`@dobra/core/engine/environment`), `Layout` (`@dobra/core/engine/layout`), `Finding` (`@dobra/core/engine/checks`).
- Produces:
  - `counterpartOf(config: SimulatorConfig, device: DeviceSpec): DeviceSpec`
  - `counterpartSelection(config: SimulatorConfig, sel: Selection, counterpartId: string, orientation: Orientation): Selection`
  - `interface ParitySide { env: Environment; layout: Layout; findings: Finding[] }`
  - `interface ParityRow { label: string; a: string; b: string; differs: boolean }`
  - `parityRows(a: ParitySide, b: ParitySide): ParityRow[]`

- [ ] **Step 1: Write the failing test**

```ts
// apps/simulator/src/ui/parity.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '@dobra/core/config/load';
import { parseConfig } from '@dobra/core/config/schema';
import { runLayoutChecks, targetOf } from '@dobra/core/engine/checks';
import { findDevice, resolveEnvironment, type Selection } from '@dobra/core/engine/environment';
import { resolveLayout } from '@dobra/core/engine/layout';
import { counterpartOf, counterpartSelection, parityRows } from './parity';

const config = parseConfig(raw);
const dev = (id: string) => findDevice(config, id);
const sel = (deviceId: string, extra: Partial<Selection> = {}): Selection => ({ deviceId, displayId: '', orientation: 'portrait', free: null, ...extra });
const side = (s: Selection) => {
  const env = resolveEnvironment(config, s);
  const screen = config.screens.find((x) => x.id === 'home')!;
  const layout = resolveLayout(config, env, screen);
  return { env, layout, findings: runLayoutChecks(config, env, layout, screen, targetOf(s, env)) };
};

describe('counterpartOf', () => {
  it('pairs devices of the same category by nearest width', () => {
    expect(counterpartOf(config, dev('iphone-17')).id).toBe('pixel-9');
    expect(counterpartOf(config, dev('pixel-9')).platform).toBe('ios');
    expect(counterpartOf(config, dev('pixel-tablet')).id).toMatch(/^ipad-/);
  });
  it('falls back when the other platform has no device in that category', () => {
    expect(counterpartOf(config, dev('galaxy-z-flip-7')).platform).toBe('ios');
    expect(counterpartOf(config, dev('chromebook')).id).toMatch(/^ipad-/);
    expect(counterpartOf(config, dev('surface-duo-2')).platform).toBe('ios');
  });
});

describe('counterpartSelection', () => {
  it('carries the orientation to an iOS counterpart', () => {
    expect(counterpartSelection(config, sel('pixel-9'), 'iphone-17', 'landscape')).toMatchObject({ deviceId: 'iphone-17', orientation: 'landscape' });
  });
  it('rotates an Android counterpart only when its natural shape differs', () => {
    expect(counterpartSelection(config, sel('iphone-17'), 'pixel-9', 'landscape').rotation).toBe(90);
    expect(counterpartSelection(config, sel('iphone-17'), 'pixel-9', 'portrait').rotation).toBe(0);
  });
});

describe('parityRows', () => {
  it('compares size class, rule, navigation, scene and findings', () => {
    const rows = parityRows(side(sel('iphone-17')), side(sel('pixel-9')));
    expect(rows.map((r) => r.label)).toEqual(['Window', 'Size class', 'Layout rule', 'Navigation', 'Scene', 'Findings']);
    expect(rows.find((r) => r.label === 'Window')!.a).toMatch(/pt$/);
    expect(rows.find((r) => r.label === 'Window')!.b).toMatch(/dp$/);
  });
  it('marks differing rows', () => {
    const rows = parityRows(side(sel('iphone-17')), side(sel('pixel-9', { rotation: 90 })));
    expect(rows.find((r) => r.label === 'Size class')!.differs).toBe(true);
  });
});
```

- [ ] **Step 2: Run and fail**

Run: `npm test -w @dobra/simulator -- src/ui/parity.test.ts`
Expected: FAIL, `Cannot find module './parity'`.

- [ ] **Step 3: Implement**

```ts
// apps/simulator/src/ui/parity.ts
// Pairs a device with its nearest peer on the other platform and compares how both resolve.
import type { DeviceSpec, Orientation, SimulatorConfig } from '@dobra/core/config/types';
import type { Finding } from '@dobra/core/engine/checks';
import type { Environment, Selection } from '@dobra/core/engine/environment';
import type { Layout } from '@dobra/core/engine/layout';
import { formatSizeClass } from '@dobra/core/engine/sizeClass';

type Category = DeviceSpec['category'];

/** When the other platform has no device in a category, try these in order. */
const FALLBACK: Record<Category, Category[]> = {
  phone: ['phone'],
  'foldable-book': ['foldable-book', 'tablet', 'phone'],
  'foldable-flip': ['foldable-flip', 'phone'],
  'dual-screen': ['dual-screen', 'foldable-book', 'tablet'],
  'multi-fold': ['multi-fold', 'tablet'],
  tablet: ['tablet'],
  desktop: ['desktop', 'tablet'],
};

const firstDisplay = (d: DeviceSpec) => Object.values(d.displays)[0].size;

export function counterpartOf(config: SimulatorConfig, device: DeviceSpec): DeviceSpec {
  const others = config.devices.filter((d) => d.enabled && d.platform !== device.platform);
  const width = firstDisplay(device).width;
  for (const category of FALLBACK[device.category]) {
    const pool = others.filter((d) => d.category === category);
    if (pool.length) return pool.reduce((best, d) => (Math.abs(firstDisplay(d).width - width) < Math.abs(firstDisplay(best).width - width) ? d : best));
  }
  return others[0];
}

export function counterpartSelection(config: SimulatorConfig, sel: Selection, counterpartId: string, orientation: Orientation): Selection {
  const device = config.devices.find((d) => d.id === counterpartId)!;
  const displayId = Object.keys(device.displays)[0];
  const base: Selection = { ...sel, deviceId: counterpartId, displayId, pose: undefined, free: null, orientation };
  if (device.platform === 'ios') return base;
  const size = device.displays[displayId].size;
  const natural: Orientation = size.width > size.height ? 'landscape' : 'portrait';
  return { ...base, rotation: natural === orientation ? 0 : 90, windowMode: undefined };
}

export interface ParitySide { env: Environment; layout: Layout; findings: Finding[] }
export interface ParityRow { label: string; a: string; b: string; differs: boolean }

const describeFindings = (f: Finding[]) => (f.length ? [...new Set(f.map((x) => x.ruleId))].sort().join(', ') : 'none');

export function parityRows(a: ParitySide, b: ParitySide): ParityRow[] {
  const row = (label: string, f: (s: ParitySide) => string, compare: (s: ParitySide) => string = f): ParityRow => ({ label, a: f(a), b: f(b), differs: compare(a) !== compare(b) });
  return [
    row('Window', (s) => `${s.env.width} × ${s.env.height} ${s.env.unit}`),
    row('Size class', (s) => formatSizeClass(s.env.sizeClass)),
    row('Layout rule', (s) => s.layout.rule.id),
    row('Navigation', (s) => s.layout.navigation.pattern),
    row('Scene', (s) => `${s.layout.scene.strategy} · ${s.layout.scene.panes.length} pane${s.layout.scene.panes.length === 1 ? '' : 's'}`),
    row('Findings', (s) => describeFindings(s.findings)),
  ];
}
```

`formatSizeClass(sc, profile?)` takes an optional Android profile for labels; the ids are enough for the table. Size classes from different systems (UIKit and WindowSizeClass) always "differ" as strings. That is correct: the row shows what each platform sees, and the table does not rank them.

- [ ] **Step 4: Run and pass**

Run: `npm test -w @dobra/simulator -- src/ui/parity.test.ts`
Expected: PASS, 6/6. If a counterpart id assertion fails because of catalog widths, print the widths, fix the expectation to the nearest-width result, and ledger it.

- [ ] **Step 5: Commit**

```bash
git add apps/simulator/src/ui/parity.ts apps/simulator/src/ui/parity.test.ts
git commit -m "Pair devices across platforms and compare how they resolve"
```

### Task 2: Extract the Stage component

**Files:**
- Create: `apps/simulator/src/ui/Stage.tsx`
- Modify: `apps/simulator/src/ui/App.tsx` (the `<main className="canvas">` body)

**Interfaces:**
- Produces: `Stage` with the props `{ config, env, layout, screen, theme, zoom, rtl, overlays, text, modal, onCloseModal, onCollisions, onResize?, onResizeWindow? }`. It renders `DeviceFrame`, `AndroidChrome`, `Overlays` and the `.sample` `Screen`, exactly as `App.tsx` does now.

This is a refactor with no behaviour change, so the existing suite is its test.

- [ ] **Step 1: Move the JSX.** Move the `DeviceFrame … </DeviceFrame>` block from `App.tsx` into `Stage.tsx` unchanged, with props replacing the closed-over values. `App` renders `<Stage … onCollisions={setCollisions} />`.
- [ ] **Step 2: Verify.** Run `npm test && npm run typecheck`; expect a pass. In the browser, `/?device=pixel-9-pro-fold&display=inner&pose=book&ov=safe,fold` looks identical before and after (compare screenshots), the collision checker still lists findings, and the console is clean.
- [ ] **Step 3: Commit**

```bash
git add apps/simulator/src/ui/Stage.tsx apps/simulator/src/ui/App.tsx
git commit -m "Move the device frame and sample screen into a Stage component"
```

### Task 3: Parity mode

**Files:**
- Modify: `apps/simulator/src/ui/urlState.ts` (`UrlState.vs?: string`, key `vs`)
- Modify: `apps/simulator/src/ui/urlState.test.ts`
- Create: `apps/simulator/src/ui/ParityTable.tsx`
- Modify: `apps/simulator/src/ui/App.tsx`, `apps/simulator/src/styles/app.css`

- [ ] **Step 1: Write the failing URL tests**

```ts
  it('round-trips the parity counterpart', () => {
    const state = readUrlState('?device=iphone-17&vs=pixel-9&screen=home');
    expect(state.vs).toBe('pixel-9');
    const env = resolveEnvironment(config, state.selection);
    expect(writeUrlState(state, env)).toContain('vs=pixel-9');
  });
  it('drops a counterpart on the same platform', () => {
    const state = readUrlState('?device=iphone-17&vs=iphone-air&screen=home');
    expect(validCounterpart(config, state.selection.deviceId, state.vs)).toBeUndefined();
  });
```

(If Task 2 of the media-facts plan has already merged, `writeUrlState` takes a third `device` argument. Pass it.)

- [ ] **Step 2: Run and fail.** Run `npm test -w @dobra/simulator -- src/ui/urlState.test.ts`. Expect a FAIL on `state.vs`.
- [ ] **Step 3: Implement.**
  - Read `vs: q.get('vs') ?? undefined`, and write `if (state.vs) q.set('vs', state.vs)`.
  - Export `validCounterpart(config, deviceId, vs): string | undefined` from `parity.ts`. It returns `vs` only when `vs` is an enabled device of the other platform.
  - In `App`: add `const [vs, setVs] = useState(validCounterpart(config, initial.selection.deviceId, initial.vs));`. When parity is on, compute `selB = counterpartSelection(config, sel, vs, env.orientation)` with its own `envB`, `layoutB`, a `collisionsB` state and `findingsB`.
  - Render two `Stage`s in a `.canvas.parity` grid of two columns, each titled with its device name. Render `<ParityTable rows={parityRows(sideA, sideB)} />` below them, with differing rows emphasised.
  - Add a header toggle, "Compare platforms". It sets `vs` to `counterpartOf(config, device).id`, and a select next to it lists the other platform's enabled devices.
  - Changing the device on side A re-validates `vs`. If `vs` is now the same platform, replace it with `counterpartOf` of the new device.
  - Keep the inspector on side A. The table carries the comparison.
- [ ] **Step 4: Verify.**
  - Run `npm test && npm run typecheck`; expect a pass.
  - Browser: `/?device=iphone-17&vs=pixel-9&screen=home` shows two frames and the table.
  - Switching to landscape rotates both.
  - `/?device=galaxy-z-flip-7&display=cover&vs=iphone-17` renders.
  - `/?device=iphone-17&vs=bogus` shows a single stage.
  - Each stage's collisions differ, so the collision states are not shared. Temporarily log both lengths to confirm, then remove the log.
  - The console is clean.
- [ ] **Step 5: Commit**

```bash
git add apps/simulator/src/ui/urlState.ts apps/simulator/src/ui/urlState.test.ts apps/simulator/src/ui/parity.ts
git commit -m "Keep the parity counterpart in the URL"
git add apps/simulator/src/ui/ParityTable.tsx apps/simulator/src/ui/App.tsx apps/simulator/src/styles/app.css
git commit -m "Show iOS and Android side by side with a table of what differs"
```

---

## Part B: Findings export (blocked on PR #22 and the core issue for the `simulator` source kind)

Before starting, check that `main` has `packages/core/src/report.ts`, `geo.ts` and `targets.ts`, and re-read `buildReport` and `ReportInput`. If they changed since this plan, rule on the difference and ledger it.

### Task 4: DOM records to GeoNodes

**Files:**
- Create: `apps/simulator/src/ui/exportReport.ts`
- Test: `apps/simulator/src/ui/exportReport.test.ts`

**Interfaces:**
- Consumes: `GeoNode`, `GeoRole` (`@dobra/core/geo`); `buildReport`, `parseReport`, `ReportInput`, `Report` (`@dobra/core/report`); `targetKey`, `isKnownTarget`, `envConfigOf` (`@dobra/core/targets`); `loadCatalog` (`@dobra/core/catalog/load`); `Target` (`@dobra/core/engine/checks`).
- Produces:
  - `interface NodeRecord { id: string; name: string; role: GeoRole; rect: Rect; fontSize?: number; chars?: number; scrollAxis?: 'x' | 'y' | 'none'; parent: string | null }`
  - `toGeoTree(records: NodeRecord[]): GeoNode[]`
  - `exportable(env: Environment, target: Target): { ok: true } | { ok: false; reason: string }`
  - `simulatorReport(target: Target, label: string, url: string, width: number, height: number, records: NodeRecord[], now?: Date): Report`

- [ ] **Step 1: Write the failing test**

```ts
// apps/simulator/src/ui/exportReport.test.ts
import { describe, expect, it } from 'vitest';
import { parseReport } from '@dobra/core/report';
import { exportable, simulatorReport, toGeoTree, type NodeRecord } from './exportReport';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const records: NodeRecord[] = [
  { id: 'root', name: 'screen', role: 'container', rect: r(0, 0, 851, 883), parent: null },
  { id: 'title', name: 'h1', role: 'text', rect: r(16, 16, 819, 40), fontSize: 28, chars: 24, parent: 'root' },
  { id: 'cta', name: 'button', role: 'interactive', rect: r(400, 800, 120, 48), parent: 'root' },
];
const target = { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'book', orientation: 'portrait' as const };

describe('toGeoTree', () => {
  it('nests records under their parents', () => {
    const [root] = toGeoTree(records);
    expect(root.children!.map((c) => c.id)).toEqual(['title', 'cta']);
  });
});

describe('simulatorReport', () => {
  it('builds a Report that parses and names the target', () => {
    const report = simulatorReport(target, 'Pixel 9 Pro Fold · Home', 'http://localhost:5199/?device=pixel-9-pro-fold', 851, 883, records, new Date('2026-09-27T00:00:00Z'));
    expect(() => parseReport(report)).not.toThrow();
    expect(report.source).toEqual({ kind: 'simulator', ref: 'http://localhost:5199/?device=pixel-9-pro-fold', name: 'Pixel 9 Pro Fold · Home' });
    expect(report.frames[0]).toMatchObject({ confidence: 'tag', targets: ['pixel-9-pro-fold/inner/book/portrait'] });
  });
  it('flags a CTA across the book hinge', () => {
    const report = simulatorReport(target, 'x', 'u', 851, 883, records);
    expect(report.frames[0].findings.map((f) => f.ruleId)).toContain('hinge-content');
  });
});

describe('exportable', () => {
  it('refuses free resize and non-fullscreen windows', () => {
    expect(exportable({ isFree: true } as never, target)).toMatchObject({ ok: false });
    expect(exportable({ isFree: false, window: { mode: 'split' } } as never, target)).toMatchObject({ ok: false, reason: expect.stringMatching(/full screen/) });
  });
});
```

The `hinge-content` expectation rests on the CTA's x span (400–520) crossing the book fold near x=425. Confirm the fold's x from `resolveTarget` output while running. If it differs, move the CTA to straddle it and ledger that.

- [ ] **Step 2: Run and fail**

Run: `npm test -w @dobra/simulator -- src/ui/exportReport.test.ts`
Expected: FAIL, `Cannot find module './exportReport'`.

- [ ] **Step 3: Implement**

```ts
// apps/simulator/src/ui/exportReport.ts
// Turns the rendered sample screen into a Dobra Report that the web report can open.
import { loadCatalog } from '@dobra/core/catalog/load';
import type { Rect } from '@dobra/core/config/types';
import type { Target } from '@dobra/core/engine/checks';
import type { Environment } from '@dobra/core/engine/environment';
import type { GeoNode, GeoRole } from '@dobra/core/geo';
import { buildReport, type Report } from '@dobra/core/report';
import { envConfigOf, isKnownTarget, targetKey } from '@dobra/core/targets';

export interface NodeRecord { id: string; name: string; role: GeoRole; rect: Rect; fontSize?: number; chars?: number; scrollAxis?: 'x' | 'y' | 'none'; parent: string | null }

export function toGeoTree(records: NodeRecord[]): GeoNode[] {
  const nodes = new Map(records.map(({ parent: _p, ...n }) => [n.id, { ...n, children: [] as GeoNode[] }]));
  const roots: GeoNode[] = [];
  for (const rec of records) (rec.parent && nodes.has(rec.parent) ? nodes.get(rec.parent)!.children! : roots).push(nodes.get(rec.id)!);
  return roots;
}

const catalog = loadCatalog();

/** 'web' only as a fallback while Report.source.kind lacks 'simulator'. */
const SOURCE_KIND = 'simulator' as const;

export function exportable(env: Environment, target: Target): { ok: true } | { ok: false; reason: string } {
  if (env.isFree) return { ok: false, reason: 'Free resize is not a catalog target.' };
  if (env.window && env.window.mode !== 'fullscreen') return { ok: false, reason: 'Only full screen windows match a catalog frame.' };
  if (!isKnownTarget(envConfigOf(catalog), target)) return { ok: false, reason: 'This pose and orientation is not a catalog target.' };
  return { ok: true };
}

export function simulatorReport(target: Target, label: string, url: string, width: number, height: number, records: NodeRecord[], now = new Date()): Report {
  return buildReport(catalog, { kind: SOURCE_KIND, ref: url, name: label }, [
    { ref: targetKey(target), name: label, page: 'Simulator', width, height, tag: targetKey(target), root: toGeoTree(records) },
  ], now);
}
```

`matchFrame` parses `tag` with `parseTargetKey`, so the tag is the bare target key.

- [ ] **Step 4: Run and pass.** Run `npm test -w @dobra/simulator -- src/ui/exportReport.test.ts`. Expect PASS, 4/4.
- [ ] **Step 5: Commit**

```bash
git add apps/simulator/src/ui/exportReport.ts apps/simulator/src/ui/exportReport.test.ts
git commit -m "Build a Dobra Report from the simulator's rendered screen"
```

### Task 5: Walk the DOM and download the Report

**Files:**
- Modify: `apps/simulator/src/ui/exportReport.ts` (add `collectRecords(host: HTMLElement, env: Environment): NodeRecord[]`)
- Modify: `apps/simulator/src/ui/App.tsx` (Export button), `apps/simulator/src/ui/Stage.tsx` (forward a ref to the `.sample` host)

- [ ] **Step 1: Implement `collectRecords`.**
  - Mirror the measuring in `apps/simulator/src/sample/collisions.ts` `useCollisions`: host rect, `scale = box.width / env.width`, and rects divided by the scale into window units.
  - Role mapping: `button, a, input, [role=button], [role=tab]` → `interactive`; `img, svg, video, [role=img]` → `media`; `h1–h6, p, [data-text]` → `text` (with `fontSize` from the computed style divided by the scale, and `chars` from `textContent.length`); `nav, header, [data-chrome]` → `chrome`; the rest → `container`.
  - `scrollAxis` comes from the computed `overflow-x` and `overflow-y`.
  - Skip zero-size and `display:none` nodes.
  - Ids are `n<index>` in document order. The name is the tag plus the first class.
  - This is DOM-only glue. Its logic under test is `toGeoTree` and `simulatorReport` (Task 4). Verify the glue in the browser (Step 3).
- [ ] **Step 2: Add the button.**
  - In the header, add an "Export findings" button. It is disabled with `title={reason}` when `exportable(env, target)` is not ok.
  - A click calls `collectRecords` and `simulatorReport(target, `${env.deviceName} · ${screen.name}`, location.href, env.width, env.height, records)`, then downloads the result through a `Blob` and an `a[download]` named `dobra-report-<targetKey with / replaced by _>.json`.
  - A one-line note next to the button says that exported findings come from the shared geometry rules.
- [ ] **Step 3: Verify.**
  - Run `npm test && npm run typecheck`; expect a pass.
  - Browser, `/?device=pixel-9-pro-fold&display=inner&pose=book&screen=home`: export, then open the file in the web report (`apps/report`, "Open a report JSON"). It lists one frame with the target key and its findings.
  - `?win=split` disables the button with the full-screen reason.
  - The console is clean.
- [ ] **Step 4: Commit**

```bash
git add apps/simulator/src/ui/exportReport.ts apps/simulator/src/ui/Stage.tsx
git commit -m "Collect the rendered screen's geometry for the Report"
git add apps/simulator/src/ui/App.tsx
git commit -m "Export the current screen's findings as a Dobra Report JSON"
```
