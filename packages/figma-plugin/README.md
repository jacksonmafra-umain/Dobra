# Hinge — Figma plugin

Artboards for foldable and dual-screen devices, straight from the device catalog in `@hinge/core`.

## Build

```bash
npm install
npm run build -w @hinge/figma-plugin
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

## What a tag stores

Shared plugin data in the `hinge` namespace, readable by the Figma REST API and the web report:

- `target` — the target key, `device/display/posture/orientation`, for example
  `galaxy-z-fold-7/inner/book/landscape` (`-` when the device has no posture).
- `catalogVersion` — the catalog version the frame was created or tagged with.

## Privacy

The plugin makes no network requests (`networkAccess: none`); the catalog is bundled.
