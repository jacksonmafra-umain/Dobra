# Hinge — Figma plugin

Artboards for foldable and dual-screen devices, straight from the device catalog in `@dobra/core`.

## Build

```bash
npm install
npm run build -w @dobra/figma-plugin
```

This writes `dist/code.js` (the plugin's main thread) and `dist/ui.html` (its panel), then checks
that the bundle carries the device catalog and no app profile.

## Import into Figma

Figma desktop › Plugins › Development › Import plugin from manifest… › choose
`packages/figma-plugin/manifest.json`. Run it from Plugins › Development › Hinge.

## Commands

- **Artboards** — pick devices, displays, postures and orientations, then create one frame per
  choice. Each frame has:
  - its exact size in pt or dp and the device's corner radius;
  - a locked `⎔ hinge-overlay` layer with the hinge (red), a 16 dp hinge safe zone (estimated),
    safe-area insets (blue) and reserved regions such as the camera (amber). Hide the layer to
    work without it;
  - a column grid for the window's width class (Material 3 defaults: 4, 8 or 12 columns), plus a
    two-pane grid split at the hinge when the fold separates the window.
- **Tag frames** — for frames the plugin did not create, suggests the devices whose size matches
  (within 1 px, either orientation) and stores the one you pick.
- **Coverage** — compares the page with the catalog's coverage requirements (category × posture ×
  orientation): ✓ tagged, ~ matched by size only, ✗ missing. "Create missing" adds an artboard for
  every missing required cell, and does nothing when none is missing.
- **Check** — checks the selected artboards (or the whole page, or every page) and lists the
  findings per frame. Click a finding to select and zoom to the layer. Presets get a Re-check
  button in the properties panel.
- **Adapt frame** — select one frame, pick targets, and optionally "Split into panes at the hinge".
  For each target the plugin copies the frame (the original stays as it is), resizes it, redraws
  the overlay and grids, tags it, swaps component variants named `Size` or `Posture` to the new
  size class or posture, and switches variable collections to a mode named after the size class.
  Then it checks the copy. It never decides for you: it flags content past the new edge, pinned
  layers when the width changes by more than 20%, a bottom bar that should become a rail at 600
  and wider, images whose frame changed shape, and "decide which content goes in each pane".

## Rules

| Rule | Flags | Threshold |
|---|---|---|
| `hinge-content` | Text or a tappable layer on a hinge that splits or hides content | — |
| `pane-split` | A pane in an auto-layout row that crosses a separating hinge (heuristic) | — |
| `landscape-not-wide` | Side-by-side panes in a window narrower than 600, even in landscape | 600 |
| `min-legible-width` | Text of 20+ characters narrower than 200 (estimate) | 200 |
| `chrome-overlap` | A bar covering content in a window shorter than 480 (estimate) | 480 |
| `touch-target` | A tappable layer smaller than 48 dp (Android) / 44 pt (iOS) | 48 / 44 |
| `overflow-x` | Content wider than the frame, outside horizontal scrollers | — |
| `tabletop-controls` | Controls above the fold in tabletop posture (heuristic) | — |
| `frame-size-mismatch` | A tagged frame whose size differs from its target | 1 px |

Frames matched by size only are checked against every device they could be, and the hinge rules
assume the fold splits and hides content (the worst case).

Roles come from layer types and names: text layers are text; component instances and layers
named like `button`, `cta`, `card`, `link`, `chip`, `tab`, `toggle`, `input`… are tappable;
layers named like `nav`, `tab bar`, `toolbar`, `app bar`, `bottom bar`, `header`, `footer` are
chrome. The patterns live in `src/geo.ts` (`INTERACTIVE_NAME`, `CHROME_NAME`).

## What a tag stores

Shared plugin data in the `hinge` namespace, readable by the Figma REST API and the web report:

- `target` — the target key, `device/display/posture/orientation`, for example
  `galaxy-z-fold-7/inner/book/landscape` (`-` when the device has no posture).
- `catalogVersion` — the catalog version the frame was created or tagged with.

## Privacy

The plugin makes no network requests (`networkAccess: none`); the catalog is bundled.
