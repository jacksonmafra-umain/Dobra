# Dobra core

`@dobra/core` holds everything the Dobra tools agree on: the device catalog, targets, the layout
engine, the geometry rules, frame matching, coverage, reports and resize transitions. It is pure
TypeScript with no DOM and no React, so the same code runs in the simulator, the web report, the
Figma plugin sandbox and the CLI in Node. A test (`boundary.test.ts`) fails if a module imports
React, and the tsconfig blocks DOM globals.

The package is private to the workspace and has no build step: consumers import the TypeScript
sources directly.

## Importing

Every module is its own export, `@dobra/core/<module>`, with the path relative to `src` and no
extension. JSON files are exported with their extension.

```ts
import { loadCatalog } from '@dobra/core/catalog/load';
import { enumerateTargets, envConfigOf, resolveTarget } from '@dobra/core/targets';
import { check } from '@dobra/core/rules';
import catalogJson from '@dobra/core/catalog/catalog.json';
import profileJson from '@dobra/core/profiles/sample.profile.json';
```

There is no index module; import from the module that defines what you need.

## Modules

| Module | What it does |
| --- | --- |
| `catalog/load` | `loadCatalog()`: the bundled catalog, validated, or any catalog JSON you pass |
| `catalog/categories` | The device categories (`phone`, `foldable-book`, `foldable-flip`, `dual-screen`, `multi-fold`, `tablet`, `desktop`) and `categoryOf` |
| `catalog/postures` | The posture kinds a device offers (`cover`, `flat`, `book`, `tabletop`, `partial`, `dual`, `rear`) |
| `catalog/media` | CSS media features (`pointer`, `any-pointer`) and Android UI facts per category, overridable per device |
| `config/schema` | Zod schemas for the catalog and an app profile, `parseCatalog`, `parseConfig` and `ConfigError`, which lists the path of every bad value |
| `config/compose` | `composeConfig(catalog, profile)`: validates both together and refuses a profile that sets catalog keys or redefines catalog sources |
| `config/load` | `loadConfig()`: the bundled catalog with the sample profile |
| `config/types` | Types derived from the schemas (`DeviceSpec`, `Rect`, `Orientation` and others) |
| `config/orientations` | Which orientations a display can be shown in |
| `targets` | A target is one display, an optional posture and an orientation. Keys (`device/display/posture/orientation`), enumeration, lookup and `resolveTarget` |
| `engine/environment` | `resolveEnvironment`: turns a device, display, posture and orientation into a window with size, size class, insets, folds and reserved regions |
| `engine/ios`, `engine/android` | The per-platform resolvers behind `resolveEnvironment` |
| `engine/sizeClass` | UIKit size classes on iOS, `WindowSizeClass` on Android |
| `engine/folds` | `FoldFeature`, `splitRegions` along every separating fold, `separatingFold` |
| `engine/layout` | Matches a layout rule and resolves page margins, grid, panes and navigation (tab bar, rail, bar, drawer) |
| `engine/scenes` | Pane strategies: single, list-detail, two-pane, supporting-pane |
| `engine/bars` | Toolbar and tab bar layout, including vertical bars and overflow |
| `engine/gridFlex` | Grid tracks and flex lines resolved to item widths |
| `engine/modal` | Where an alert or sheet goes, clear of a fold |
| `engine/window` | Android window states that are not postures: split-screen, freeform, pop-up and picture-in-picture |
| `engine/typography` | Type scale with the user's text size: non-linear on Android (`sp`), linear on iOS (`pt`) |
| `engine/checks` | The `Target` and `Finding` shapes, rule ids and the layout checks that need no geometry tree |
| `engine/diff` | Which rules changed between two states, for the simulator's "What changed" panel |
| `geo` | A platform-neutral tree of what a frame draws. Figma nodes, DOM elements and simulator layouts all become `GeoNode`s |
| `rules` | `check(subject, config)`: the v1 rules over a geometry tree, for Figma frames, web pages and the simulator |
| `collisions` | Which elements sit in a fold or a reserved region, from rects in window coordinates |
| `match` | Which targets a frame stands for: by tag, then by a key in its name, then by size (low confidence) |
| `coverage` | Which required cells (category, posture kind, orientation) a set of frames covers, and a representative target for each |
| `report` | The report JSON: `buildReport`, `parseReport` (validates on import) and `toMarkdown` |
| `reportZip` | The report package: report JSON, Markdown, `index.json` and a screenshot per frame. `readReportZip` enforces size, entry and ratio limits |
| `transition` | `resizeVsReload`: compares a page resized in place with a fresh load at the new size |
| `adapt` | What adapting a frame to another target does, and which decisions it leaves to the designer |
| `presets` | A declarative artboard per target: size, hinge overlay, safe zones, insets and grid |
| `presetSvg` | A preset as SVG with named groups, and as plugin JSON |
| `presetZip` | A ZIP of plugin JSON plus one SVG per target, for designers without the plugin |
| `variables` | The Figma variable collections, modes and values Dobra writes, as plain data |
| `figmaRest` | Figma REST JSON to the geometry tree, with the same roles as the plugin |
| `figmaClient` | A small Figma REST client. The token only travels in the `X-Figma-Token` header, and error messages are redacted |
| `namePatterns` | The layer-name words that mark controls and chrome, and the `dobra` plugin data keys for patterns and importance |
| `siteAddress` | `withScheme`: normalises a typed or pasted site address to a URL |

## The catalog and the profile

The tools are driven by two JSON files. Both are validated on load; a problem is reported with the
path of the value, for example `devices[12].displays.inner.hinges[0].position`.

**The catalog**, `src/catalog/catalog.json`, describes devices and platforms:

- `sources`: every source id a value may cite, with a line saying what it is.
- `platforms`: the vocabulary of each platform. iOS uses `pt` and UIKit size classes. Android uses
  `dp` and `sp`, and `WindowSizeClass` breakpoints computed from the window size: width 600
  (medium), 840 (expanded) and 1200 (large), plus 1600 (extra-large) from androidx.window 1.5, and
  height 480 and 900. Android navigation rules, window modes and display sizes live here too.
- `devices`: each device has a `platform` (`ios` or `android`), a `category` and its `displays`.
  A display lists its size, scale or density, safe areas or insets, reserved regions and folds.
  An Android display lists its `hinges`, so a tri-fold has two, and its postures set each hinge's
  state (`FLAT` or `HALF_OPENED`). An iOS display describes its fold under `hardware.fold`, and the
  device's `poses` say which poses fold it. Either way the resolved environment has a list of folds.
- `requirements`: the coverage cells, by category, posture kind and orientation, each `required`
  or `optional`.
- `layoutDefaults`: page margins, gutters and columns per size class when no profile says otherwise.

Both platforms are resolved by the same engine into the same `Environment`. Whether a layout
splits follows `isSeparating` on each fold (true when the hinge is `HALF_OPENED` or fully
occludes content), not the fold state.

**The app profile**, for example `src/profiles/sample.profile.json`, describes one app: its
`components`, `scenes`, `typography`, `app` manifest values, `layoutRules`, `tabBar` and `screens`.
A profile may add its own `sources` but may not set devices, platforms or other catalog keys.

### Provenance

Values carry a `source` that must name an entry in `sources`, for example `figma-ui` (from the
sample profile), `figma-tokens`, `apple-device`, `device-spec`, `androidx-window` or `estimated`.
An unknown source fails validation. Values that could not be confirmed are marked `estimated: true` (or cite the
`estimated` source); the engine carries the flag through to environments, folds and reserved
regions, and the tools show those values as estimated. Android display sizes are checked against
`pixels / density`; a mismatch fails unless the display is marked estimated.

Keys starting with `$` (`$comment`, `$note`) are notes and are stripped before validation.

## Adding a device

1. Add an entry to `devices` in `src/catalog/catalog.json` with a unique `id`, its `platform`,
   `category` and `displays`. Copy a similar device as a start.
2. Give every value a `source`. Mark what you could not confirm as estimated, and add a `$note`
   saying why: a test fails for an estimated device or display without one.
3. For an Android foldable, list each hinge on its display and add postures whose features refer
   to those hinge ids. For an iOS foldable, set `hardware.fold` on the display and add `poses`.
4. Run the tests. The new device's targets then appear in the simulator, the plugin presets and the
   CLI's `--targets` and `--category`.

## Tests

```bash
npm test -w @dobra/core
npm run typecheck -w @dobra/core
```

Tests sit next to the modules as `*.test.ts` and run with Vitest. The catalog tests check the
bundled devices and requirements; the engine tests check environments, folds, window states and
layouts on both platforms.
