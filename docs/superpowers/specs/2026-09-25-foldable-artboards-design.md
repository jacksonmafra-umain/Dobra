# Foldable artboards, checker and coverage for Figma — design

Date: 2026-09-25
Status: approved in conversation, pending written-spec review
Name: **Dobra** (plugin, CLI and plugin-data namespace `dobra`); rename freely before the
first release.

## 1. Goal

Help designers working in Figma design for foldable and dual-screen devices without researching
sizes by hand. The tool must:

1. **Create artboards** for every device × display × posture × orientation, with a hinge overlay,
   a toggleable hinge safe zone, insets, reserved regions and layout grids.
2. **Adapt & flag** an existing frame onto other devices and postures, doing the mechanical work
   and flagging everything that needs a design decision.
3. **Check rules** on Figma frames and on live websites (content under the hinge, landscape is not
   wide, minimum legible width, and so on).
4. **Report coverage**: does a file deliver every required device, grouped by category.

Sources that shaped the scope: the Figma forum request "Artboards for fold devices", divriots'
"Responsive design in Figma: the ultimate guide", bluetext's "iPhone Duo" article and
duoresponsive.com/devices.

### Success criteria

- A designer can generate every required foldable artboard from the plugin in one action, and
  each frame carries a correct hinge overlay and grid.
- The checker flags the five observed foldable failures (§8.2) when they are reproduced as Figma
  frames or web pages.
- The coverage matrix states, per category, which required cells are present, missing or only
  matched by size.
- Every number in the catalog has a `source`; guesses are marked `estimated`.

### Non-goals

- Redesigning screens automatically (list/detail splits, bar-to-rail swaps, text rewriting).
- Writing Figma files from the web app (the REST API is read-only for nodes).
- A hosted website-checking service.

## 2. Decisions taken

| Topic | Decision |
|---|---|
| Delivery | Web app in this repo (track C) **and** a Figma plugin with a shared core (track D) |
| Required coverage | A subset defined in the catalog's `requirements` block. The default is one device per category × posture × orientation; teams can edit it |
| Frame identity | Tags written by the plugin, plus a "Tag frames" command for existing files. Untagged frames fall back to name, then size (±1px), and are marked low-confidence |
| Catalog gaps | Add all found: Surface Duo 2, iPads (744/820/834/1024 wide), OnePlus Open, Pixel Fold gen 1, Razr+, Galaxy S25 family, iPhone mini and Plus sizes. Verify the Galaxy Z Fold inner size |
| Distribution | Development plugin (import `manifest.json`) now; Figma Community later |
| Postures in Figma | Plain frames in v1, not component variants |
| Canvas annotations | Off by default; the plugin modifies the file only on request |
| Website checks | CLI producing JSON that the web app imports |
| Interactive layers | Recognised by an editable list of name patterns, plus a "Mark as important" action |

## 3. Architecture

npm workspaces; no extra build orchestrator.

```
packages/core/          catalog, categories, fold geometry, rules, coverage, preset specs
packages/figma-plugin/  presets, Tag frames, Adapt & flag, checker, coverage (writes to the file)
packages/cli/           website checks with Playwright + Chromium, JSON output
apps/simulator/         the existing simulator, plus the web report (track C)
```

`core` is plain TypeScript and zod: no React, no DOM, no `figma` global. It ships as TypeScript
source (`"exports": {"./*": "./src/*.ts"}`); Vite and esbuild consume it directly.

### 3.1 Generic catalog vs app profile

Because the plugin will go to the Community, the catalog splits in two:

- **Generic (core, public):** devices, displays, categories, postures, fold geometry, insets,
  reserved regions, generic rules, default requirements, preset specs.
- **App profile (optional, per team):** `screens`, `layoutRules`, `tabBar`, components and
  coverage requirements for one product. The repo ships a neutral sample profile only.

The plugin bundles only the generic catalog. A profile (layout rules and requirements) can be
imported into the plugin as JSON and is stored in the document's shared plugin data.

### 3.2 Core API

```ts
// catalog
loadCatalog(json?: unknown): Catalog                     // zod; throws with the offending path
type Category = 'phone' | 'foldable-book' | 'foldable-flip' | 'dual-screen' | 'multi-fold' | 'tablet' | 'desktop'
categoryOf(d: DeviceSpec): Category

// targets: one artboard = one Target
interface Target { deviceId: string; displayId: string; pose?: string; orientation: Orientation; rotation?: 0 | 90 }
// The key carries the derived orientation; Android's rotation round-trips through `rotation`.
targetKey(t: Target): string                             // "galaxy-z-fold-7/inner/book/landscape"
parseTargetKey(s: string): Target | null
enumerateTargets(c: Catalog, filter?: TargetFilter): Target[]
resolveTarget(c: Catalog, t: Target): Environment        // wraps resolveEnvironment
hingeSafeZone(env: Environment, padding?: number): Rect[]
matchFrame(name: string, size: Size, c: Catalog): { targets: Target[]; by: 'tag' | 'name' | 'size' | 'none' }

// geometry: the one input shape every adapter produces
interface GeoNode {
  id: string; name: string
  role: 'text' | 'interactive' | 'media' | 'container' | 'chrome'
  rect: Rect; fontSize?: number; scrollAxis?: 'x' | 'y' | 'none'; children?: GeoNode[]
}
interface Subject {
  source: 'figma' | 'web' | 'simulator'; ref: string
  targets: Target[]                                      // more than one when matched by size only
  confidence: 'tag' | 'name' | 'size'
  width: number; height: number; root: GeoNode[]
  meta?: { scrollWidth?: number }
}

// rules and checking
interface Finding {
  ruleId: RuleId; severity: 'error' | 'warn' | 'info'; target: Target
  nodeId: string; rect: Rect; message: string; source: string; estimated: boolean
}
check(s: Subject, c: Catalog, rules?: RuleId[]): Finding[]   // runs per candidate target
findCollisions(nodes: GeoNode[], zones: Rect[]): Collision[] // extracted from collisions.ts

// coverage
coverage(c: Catalog, subjects: Subject[], req: Requirement[]): CoverageMatrix

// presets
presetSpec(c: Catalog, t: Target): PresetFrame           // size, hinge, safe zone, insets, grids
toPluginJSON(p: PresetFrame[]): string
toSVG(p: PresetFrame): string
```

### 3.3 Adapters

Each source turns what it reads into `Subject`s; the same `check()` and `coverage()` run on all.

- **Plugin:** Figma nodes → `GeoNode` (`absoluteBoundingBox` minus the frame origin; hidden and
  overlay nodes skipped; `TEXT` → text; instances or names matching the pattern list →
  interactive, outermost only).
- **Web app:** Figma REST JSON → `GeoNode`, same mapping.
- **CLI:** DOM rects from Playwright → `GeoNode`.
- **Simulator:** the existing `useCollisions` hook becomes a thin DOM adapter over
  `findCollisions`.

## 4. Catalog changes

- Add `category` to every device and a `requirements` block (category × posture × orientation,
  each `required` or `optional`).
- Add the gap devices listed in §2. Each value carries a `source`; anything not confirmed against
  a spec sheet is `estimated: true`.
- Surface Duo 2 is the only device whose hinge occludes content (`occlusionType: FULL`); it is the
  reference fixture for the hinge rule.
- iPhone Duo values stay `estimated` (unreleased device).
- Resolve the Galaxy Z Fold inner-display disagreement (duoresponsive lists Fold 6 at 768×904; the
  catalog has Fold 7 at 750×832) against a spec sheet.

## 5. Figma plugin

### 5.1 Build and manifest

- esbuild bundles `code.ts` (target es2017) to `dist/code.js`; Vite with `vite-plugin-singlefile`
  builds `ui.html` (React). Main thread and UI exchange a typed `PluginMsg` union.
- Manifest: `editorType: ["figma", "dev"]`, `documentAccess: "dynamic-page"`,
  `networkAccess: { allowedDomains: ["none"] }`, menu commands `presets`, `tag`, `adapt`,
  `check`, `coverage`, and a `check` relaunch button.

### 5.2 Presets

- `figma.createFrame()` sized to the resolved environment. Name for humans:
  `Screen / Galaxy Z Fold 7 · inner · book · landscape`.
- Identity: `setSharedPluginData('dobra', 'target', targetKey)` and `'catalogVersion'`. Shared data
  lets REST, the web app and the CLI read it.
- Overlay: a locked child frame `⎔ hinge-overlay` (ignores auto layout, stretch constraints) with
  the hinge (hatched, 20% opacity), safe areas, insets and reserved regions. Toggling sets
  `visible`. The checker and exporters skip it.
- `layoutGrids`: columns from the matched layout rule, and a two-pane grid whose gutter equals the
  hinge width, so panes snap to the fold.
- `setRelaunchData({ check: '' })` on every preset.

### 5.3 Tag frames

Walks untagged top-level frames, proposes targets from the name and then the size, and lets the
designer confirm or pick from the candidates. Confirmed choices are written as the tag.

### 5.4 Adapt & flag

Does automatically:

- Duplicate the source frame to each chosen target, resize it, and rely on its constraints and
  auto layout.
- For separating folds, offer "Split at hinge": wrap children in a two-pane auto layout with
  `itemSpacing` equal to the hinge width (vertical fold) or a top/bottom split (tabletop).
- Reapply the target's grid and overlay; tag the new frame.
- Swap component properties named `Size` or `Posture` when they match; switch variable modes named
  after a size class.

Flags, never does: choosing pane content, reflowing absolutely positioned children without
constraints, bar-to-rail swaps, text truncation, aspect-ratio crops. Every adapted frame is run
through the checker and the flags are listed.

### 5.5 Checker

- Scope: selection, current page, or all pages (`figma.loadAllPagesAsync()`, opt-in).
- Discovery: `findAllWithCriteria({ sharedPluginData: { namespace: 'dobra', keys: ['target'] } })`,
  then name, then size. `figma.skipInvisibleInstanceChildren = true`.
- Yields every ~500 nodes, reports progress, caches per frame.
- Results grouped by frame and rule; clicking selects the node and calls
  `scrollAndZoomIntoView`. Optional "Annotate" writes Figma annotations (off by default).

### 5.6 Coverage

Matrix of category/device rows × posture·orientation columns; cells are present (tag), present
(size, low confidence), missing or optional. "Create missing" generates presets for empty cells.
Exportable as JSON for the web app and CLI.

## 6. Web app (track C)

- Input: Figma file URL plus a personal access token (`file_content:read`), or a CLI JSON report.
- Calls: `GET /v1/me`; `GET /v1/files/:key?depth=2`; batched
  `GET /v1/files/:key/nodes?ids=…&plugin_data=shared`; `GET /v1/images/:key` for thumbnails.
  Cached per file `version`.
- Output: the coverage matrix, per-cell thumbnails with hinge, safe-zone and finding overlays
  (reusing `Overlays.tsx`), findings with source and `estimated` badges, presets download (plugin
  JSON, SVG per cell, PNG overlays, ZIP), and a JSON or Markdown report for tickets.
- The web app cannot create frames or produce a `.fig`; adapting frames belongs to the plugin.

## 7. CLI (website checks)

`dobra check site <url> --targets …` with Playwright and Chromium:

1. For each target, set the viewport, `deviceScaleFactor` and a platform user agent.
2. For folded or spanned targets, emulate the fold through the CDP display-feature override so
   `@media (horizontal-viewport-segments: 2)`, `env(viewport-segment-*)` and
   `window.viewportSegments` respond. WebKit cannot emulate segments, so iOS targets are
   size-only.
3. Collect rects and computed font sizes of headings, text blocks, interactive elements and
   landmarks, plus `documentElement.scrollWidth`.
4. Transition pass: resize cover → inner without reloading and collect again.

Output: `Subject[]` JSON, imported by the web app.

## 8. Rules (v1)

| ID | Rule | Source |
|---|---|---|
| `hinge-content` | Text or interactive node intersects a hinge that separates or occludes; a scrolling container only counts its cross-axis span | androidx.window `FoldingFeature`; existing collision checker |
| `pane-split` | A two-pane split is not aligned to the hinge bounds | Material 3 adaptive, foldables; config `fold` block |
| `landscape-not-wide` | Side-by-side layout below 600dp width | WindowSizeClass breakpoints; §8.2 #1 |
| `min-legible-width` | Text block or component narrower than the threshold | §8.2 #2 and #5; threshold **estimated** |
| `chrome-overlap` | Floating chrome overlaps content in windows shorter than 480dp | §8.2 #3; threshold **estimated** |
| `touch-target` | Interactive node smaller than 48dp (Android) / 44pt (iOS) | Material 3 accessibility; Apple HIG |
| `overflow-x` | Content wider than the window | bluetext |
| `tabletop-controls` | In tabletop posture, primary controls sit in the top half | Material 3 tabletop guidance; severity **estimated** |
| `frame-size-mismatch` | Frame size differs from its tagged target | this design |
| `resize-vs-reload` | Web layout differs after a live resize versus a reload (CLI only) | bluetext |

### 8.2 Observed failures used as fixtures

Found on a physical Galaxy Z Flip 7 and a Pixel 9 Pro Fold emulator:

1. Side-by-side layout chosen from `orientation == landscape` renders a 176dp column on the 352dp
   Flip cover.
2. Stacked landscape branches (margins, a header split, a card variant) leave a card at 141dp in a
   352dp window.
3. A floating tab bar covers content in a 339dp-tall window.
4. A density change recreates the activity (documented, not checkable in Figma).
5. Text that fits at full width breaks at 40% pane width.

`pane-split` and `tabletop-controls` infer panes from auto-layout children in Figma and are
reported as heuristics.

### 8.1 Untagged frames

When a frame is matched by size, `check()` runs against every candidate target and groups the
findings per target. Hinge rules assume the worst case: a frame sized like a foldable's inner
display is checked as if the fold separates and occludes (vertical for book, horizontal for
tabletop). Coverage counts the frame for every candidate and marks it ambiguous. Frames that match
nothing are listed with the nearest catalog size.

## 9. Error handling

- Invalid catalog or profile: fail loudly with the zod path, as `ConfigErrorPage` does today.
- Figma REST: 403 (token or scope), 404 (file not shared), 429 (show `Retry-After`), partial
  `/nodes` failure produces a partial report.
- Token: kept in memory (sessionStorage only on opt-in), never written to URL state, logs or error
  reports; redacted in the fetch wrapper. If api.figma.com refuses browser CORS, fall back to a
  local proxy on `127.0.0.1`.
- Plugin: large files yield and show progress; nodes missing on refresh are reported, not thrown.

## 10. Testing

- **core:** move the existing vitest suites (`postures`, `android`, `platform`, `schema`); add
  table tests per rule, `targetKey` round-trips, `enumerateTargets` counts per device, coverage
  matrices, and size-matching ambiguity.
- **Fixtures:** Surface Duo 2 (occluding hinge) and Galaxy Z Flip 7 cover in landscape.
- **plugin:** logic lives in pure modules (`toGeo`, `presetSpec`, `adaptPlan`); a declarative node
  tree is applied by a thin `apply()`. Tested against an in-memory `FakeFigma` (`createFrame`,
  `findAllWithCriteria`, plugin data, `resize`, children) with JSON fixtures exported from a real
  file through REST. The web app uses the same fixtures.
- **CLI:** Playwright against local fixture pages that use `viewport-segments`.
- A manual smoke test on one real Figma file per plugin release.

## 11. Risks

1. **Figma REST rate limits** on View/Collab seats may make the web track impractical; if so the
   checker lives mainly in the plugin. Limits must be checked against current Figma docs.
2. **Classifying important nodes** in arbitrary files is noisy; mitigated by editable name
   patterns and "Mark as important".
3. **Catalog accuracy and drift:** many values are `estimated`; frames carry `catalogVersion` so
   drift can be detected, and every consumer pins the same `core` version.
4. **CDP display-feature emulation** is experimental and Chromium-only.

## 12. Delivery

Each slice gets its own GitHub issue (labels `enhancement` or `documentation` plus an `area:*`
label), its own branch, its own implementation plan and a PR that closes the issue. Commits are
microcommits; nothing is merged directly to `main`.

0. **Remove brand references** — replace the brand-specific screens, components, assets, fonts,
   Figma node ids, config names and docs in the existing simulator with a neutral sample app, so
   the repo and every package are brand-free before anything is published. (`area:core`)
1. **Extract core** — workspaces; move the app to `apps/simulator`; move `src/engine/*` and
   `src/config/*` to `packages/core` with re-export shims; split `collisions.ts`; remove shims.
   (`area:core`)
2. **Catalog** — generic catalog / app profile split, `category` and `requirements`, gap devices, Fold size check.
   (`area:catalog`)
3. **Plugin presets, Tag frames and coverage** (`area:plugin`)
4. **Plugin checker and Adapt & flag** (`area:plugin`)
5. **Web report** (`area:web`)
6. **CLI website checks** (`area:cli`)
