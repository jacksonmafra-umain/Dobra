# Dobra — Figma plugin

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
`packages/figma-plugin/manifest.json`. Run it from Plugins › Development › Dobra.

## Look

The panel uses the Dobra design tokens and fonts from `@dobra/brand` and follows Figma's light or
dark theme. Overlays on the canvas use the same palette: hinges and their safe zones in rose,
flexible creases as a teal hairline, insets and safe areas in indigo, reserved regions in amber and
the column grid in green. The icon for a Community listing is `packages/brand/png/icon-128.png`.

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
  - **Mark as important** makes the selected layers count as content in the hinge check, whatever
    their names: a chart, a price, a signature area.
  - **Mark as not important** skips the selected layers, and everything inside them, in the hinge
    and touch-target checks. Use it for decoration that sits on the fold on purpose.
  - **Clear mark** returns them to automatic classification. Marks are stored on the layer, so
    the web report respects them too.
  - **Name words** lists the words that make a layer a control (button, cta, chip…) or chrome
    (nav, tab bar, header…). They are matched as whole words in any case, so "tab bar" also
    matches "Tabbar". The list is saved in the file for everyone, and the web report uses it.
    **Reset to defaults** restores the built-in words.
- **Adapt frame** — select one frame, pick targets, and optionally "Split into panes at the hinge".
  For each target the plugin copies the frame (the original stays as it is), resizes it, redraws
  the overlay and grids, tags it, swaps component variants named `Size` or `Posture` to the new
  size class or posture, and switches variable collections to a mode named after the size class.
  Then it checks the copy. It never decides for you: it flags content past the new edge, pinned
  layers when the width changes by more than 20%, a bottom bar that should become a rail at 600
  and wider, images whose frame changed shape, and "decide which content goes in each pane".
  It also switches Dobra's device collection to the target's mode (see Variables).
- **Variables** — writes Figma variables for size classes and devices (see below).

## Variables

The Variables tab writes variable collections to the open file. Bind a frame's width, padding, gap
or grid to them, then pick the frame's mode in the right panel, and the frame follows.

- **Dobra · Size classes · Android**, with modes `Compact`, `Medium`, `Expanded`, `Large` and
  `ExtraLarge`, and **Dobra · Size classes · iOS**, with modes `Compact` and `Regular`. Both hold
  `layout/margin`, `layout/gutter`, `layout/columns`, `layout/panes`, `breakpoint/min-width` and
  `breakpoint/max-width` (0 means unbounded).
- **Dobra · Devices** has one mode per device and posture you pick. It holds:
  - `window/width` and `window/height`;
  - `safe-area/*`;
  - `hinge/present`, `hinge/separating` and `hinge/x`, `/y`, `/width`, `/height` (0 without a hinge);
  - `layout/*`, resolved for that exact window;
  - `size-class/width` and `size-class/height`;
  - `media/pointer`, `media/keyboard` and `media/viewing-distance`.

Values come from the catalog's platform defaults (Material 3, Apple), or from an app profile you
paste or pick. Every variable's description names its source and says "(estimated)" where the value
is estimated. Mode names match size-class ids, so **Adapt frame** switches the size-class collections,
and it switches the device collection to the adapted target.

**Running it again** updates the same collections in place. Dobra finds them by the keys it stores,
so you can rename collections and variables, and existing bindings keep working.
- A value you changed in Figma is kept and listed ("Kept your edit"), unless you tick
  **Overwrite my edits**.
- Modes of devices you no longer pick are kept and listed, unless you tick **Remove modes no longer
  selected**. A collection always keeps at least one mode.
- Variables Dobra no longer writes are listed, never deleted.
- The whole run is one undo step.

**Mode limits.** Figma plans limit the modes per collection. When Figma refuses a mode, Dobra splits
the device collection by category (`Dobra · Devices · Foldable book`), and then into numbered parts.
A size-class collection is split into numbered parts. The summary explains each split. Later runs
fill the existing parts directly, without warning again. Each part is its own Figma collection, so
a frame picks a mode in each part separately: bind a frame to the part that holds the modes it
needs. A collection
with Dobra's name that Dobra did not create is left alone; Dobra writes `… (Dobra)` next to it.

**Smoke test in Figma desktop (once per release):**
1. Create the collections.
2. Bind a frame's padding to `layout/margin` and switch modes.
3. Run again and confirm nothing changes.
4. Edit one value, run again, and confirm the edit is kept.
5. Adapt a frame and confirm its device mode.

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

Shared plugin data in the `dobra` namespace, readable by the Figma REST API and the web report:

- `target` — the target key, `device/display/posture/orientation`, for example
  `galaxy-z-fold-7/inner/book/landscape` (`-` when the device has no posture).
- `catalogVersion` — the catalog version the frame was created or tagged with.

## Privacy

The plugin makes no network requests (`networkAccess: none`); the catalog is bundled.
