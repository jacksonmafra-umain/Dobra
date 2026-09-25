# Prompt — extend the Size-Class Simulator to Android

## Context you are given

`size-class-simulator-v0.4.0-2026-09-25.html` is a single-file export (React + Tailwind v4, Vite build,
typeface embedded). Work in the **source project**, not
the export.

Everything the simulator renders is driven by one config object whose own `$comment` says:

> "Size-Class Simulator config. Everything the simulator shows is driven from this file.
> All sizes are iOS points."

Today that config is iOS-only:

- `devices[]` — `iphone-se`, `iphone-17`, `iphone-17-pro-max`, `iphone-duo`, each with
  `displays{main|outer|inner}`, `portraitSize`, `pixels`, `scale`, `cornerRadius`,
  `homeIndicator`, `orientations{portrait,landscape}{sizeClass{horizontal,vertical}, barAxis,
  safeArea{top,right,bottom,left,source}, statusBar}`, `hardware{dynamicIsland, camera, fold}`,
  `reservedRegions[]`, and for the foldable a `poses[]` list
  (`closed` / `open` / `book` / `flat` / `stand`).
- Rules keyed by UIKit size class (`compact`/`regular` × horizontal/vertical) carrying
  `pageMargin{base, mode}`, `grid{columns, gutter}`, `panes`, and per-component layout
  (`perRow`, `minItemWidth`, `maxItemWidth`, `variant`, `mode: carousel`, tab-bar `item` style).
- `freeResize{regularWidthMin: 600, regularHeightMin: 500, barAxis}` for the device-less case.
- `fold{balanceMargins, evenGridGutterAtFold, modalPlacement}` citing Apple's HIG.
- `verticalBars{...}` — the iPhone Duo trailing rail geometry, all `estimated: true`.
- `screens[]` — `home`, `deals`, `rewards`, `bag`, `checkout`, each with Figma node ids,
  `components[]` and a `toolbar` definition.
- `sources{figma-ui, figma-tokens, apple-device, estimated}` provenance, surfaced in the UI
  (`(not in Figma)`, `estimated`).
- UI: device/pose/orientation pickers, free resize in pt, screen picker, overlays
  (Safe areas / Margins / Grid / Reserved / Fold), Present (Alert / Sheet), Zoom, Light/Dark,
  LTR/RTL, plus a sidebar inspector and a **collision checker**.

## What to build

Add Android as a **first-class second platform**, then raise the quality of the whole tool. Do not
fork the renderer: one engine, two platform profiles, so a screen can be compared across both.

### 1. Make the model platform-aware

Introduce `platform: "ios" | "android"` on every device, and a platform profile that owns the
vocabulary the engine currently hardcodes from iOS:

- **Units.** iOS `pt` vs Android `dp`, plus Android `sp` for type. The engine must carry a unit
  per platform and label the UI accordingly; never print "pt" on an Android device.
- **Size classes.** iOS keeps `compact`/`regular` on two axes. Android uses
  `androidx.window.core.layout.WindowSizeClass` breakpoints — width **Compact < 600 ≤ Medium <
  840 ≤ Expanded**, height **Compact < 480 ≤ Medium < 900 ≤ Expanded** — with the extra-large
  width breakpoint at **1200** for desktop-class windows. Rules must be keyable by either
  vocabulary; do not force Android into compact/regular.
- **Insets.** Replace the single `safeArea` with a platform-shaped inset set. Android needs
  status bar, navigation bar (**and whether it is 3-button or gesture, because the bottom inset
  differs**), display cutout, waterfall, IME, and the **caption bar** that appears in desktop
  windowing. Keep `source` provenance on every value.
- **Bars.** iOS `barAxis` maps to Android's navigation pattern: bottom navigation bar on compact,
  **navigation rail** on medium/expanded, **navigation drawer** on extra-large — the
  `NavigationSuiteScaffold` thresholds. Model it explicitly rather than reusing `barAxis`.

### 2. Android devices and displays to ship

Every entry carries real `dp` sizes, density, provenance, and is marked `estimated` until
confirmed. Sizes below are the ones to verify first, not to trust blindly.

| Class | Devices | Notes |
| --- | --- | --- |
| Phone | Pixel 8/9, a small phone (~360×780dp), a large phone | Baseline compact |
| Book foldable | Pixel 9 Pro Fold, Galaxy Z Fold | Outer **443×995dp**, inner **851×883dp** — inner is Expanded width |
| Clamshell foldable | Galaxy Z Flip 7 | Inner **360×880dp** (compact!), cover **352×339dp** — landscape aspect but compact width |
| Tri-fold | Galaxy Z TriFold, Huawei Mate XT | **Two hinges**: the model must be a list of folds, never one |
| Tablet | Pixel Tablet, generic 10"/12" | Expanded, both orientations |
| Desktop / large | Chromebook, Samsung DeX, Android desktop windowing | Free-form window, caption bar inset |

The Flip cover display is the single most valuable cell in the matrix: it is *landscape* (wider
than tall) while being **compact width**, which is exactly where orientation-based layout logic
fails. Make sure the simulator can express it.

### 3. Android postures

Model `androidx.window` faithfully, replacing the iOS-only `poses[]` for Android devices:

- `FoldingFeature.Orientation` — `VERTICAL` (book) and `HORIZONTAL` (tabletop).
- `FoldingFeature.State` — `FLAT` and `HALF_OPENED`.
- `isSeparating` — true when the fold splits the window into logical areas. **This, not the
  state, is what decides whether a layout should split.**
- `occlusionType` — `NONE` (flexible display) vs `FULL` (physical gap that hides content).
- Hinge **bounds**, so a two-pane layout can split *at the crease* rather than at 50%.
- Cover/outer display as its own display, with the note that running an app there is
  **user-granted on Samsung** (Good Lock / MultiStar / the cover-screen setting) and that **no
  manifest flag puts an app on the cover screen**.
- Rear-display and dual-screen presentation modes (`WindowAreaController`) as a posture, even if
  only documented.

### 4. Window states that are not postures

Android windows change size without any hardware folding. Each of these must be a selectable
state, because each breaks layouts differently:

- **Split-screen / multi-window** — arbitrary window size, app is not the display.
- **Free-form / desktop windowing** — drag-resize across every breakpoint, caption bar present.
- **Pop-up view** (Samsung) — small floating window.
- **Picture-in-picture** — extreme compact.
- **Rotation**, including rotation locked vs sensor.
- **User display size and font scale** — Android users can change density and font scale
  system-wide. A font scale slider (**1.0 → 2.0**) is not a nice-to-have; it is where most real
  breakage shows up. `sp` type must respond to it while `dp` spacing does not.

Add the **targetSdk 36** rule to the tool's guidance text: from Android 16, apps targeting API 36
no longer get orientation or resizability restrictions honoured on displays ≥600dp. The app is
being resized whether it opts in or not.

### 5. Seed the collision checker with real, observed failures

These were all found on a physical Galaxy Z Flip 7 and a Pixel 9 Pro Fold emulator running the
Sample Android app. Encode each as a check the simulator can flag:

1. **Landscape ≠ wide.** A component choosing a side-by-side layout from
   `orientation == landscape` renders a half-width pane on the Flip cover (352dp → a 176dp
   column) and wraps headings one word per line. Flag any rule whose side-by-side layout would
   apply below 600dp width.
2. **Stacked landscape assumptions.** Three independent landscape branches (page gutters, a 4:3
   header split, a card's own landscape variant) compounded to render a card at **141dp inside a
   352dp window**, with text breaking one glyph per line. Flag cumulative width loss: when
   margins plus splits leave a component under a minimum legible width.
3. **Floating chrome over content.** A floating tab bar drawn over the content covers the bottom
   of a card on a 339dp-tall window. Flag reserved-region overlap against short heights, not just
   against safe areas.
4. **Density change recreates the activity.** Moving to a display with a different density
   recreated the activity and crashed on a retained navigator
   (`Navigator … is replacing an already attached …`). Model density change as a distinct
   transition, separate from a size change, and warn that `configChanges` rarely lists it.
5. **Text that fits in one column and not in a pane.** Empty-state strings that wrap acceptably
   at full width break badly at 40% width. Add a minimum-width check per text block.

### 6. Raise the quality of the tool itself

- **Schema and validation.** The config is the product. Give it a real schema (zod or JSON
  Schema), validate on load, and fail loudly with the offending path. Keep and extend the
  existing `estimated` / `source` provenance — it is one of the best things in the file.
- **Platform parity view.** Same screen, same breakpoint, iOS and Android side by side, with the
  differences between the two rule sets listed. This is what makes the tool worth using to
  settle cross-platform arguments.
- **Shareable state.** Encode device, pose, orientation, screen, overlays, zoom, theme, direction
  and font scale in the URL so a specific cell can be linked in a ticket.
- **Matrix export.** Render every device × pose × orientation × screen cell headlessly to PNG,
  plus a contact sheet and a JSON report of collisions, so it can run in CI and be attached to a
  PR.
- **Regression baseline.** Store an approved snapshot per cell and diff against it, so a rules
  change that breaks the Flip cover fails visibly.
- **Accessibility states.** Font scale, bold text, reduced motion, and a large-text preview as
  first-class toggles beside Light/Dark.
- **IME.** A keyboard overlay for the form screens — the keyboard is the most common cause of a
  window suddenly becoming height-compact.
- **Weight.** The export is 12.8MB in a single file, dominated by embedded font and icon data.
  Split assets, lazy-load them, and keep a self-contained export as an explicit build mode rather
  than the only one.

### 7. Screens

Extend `screens[]` beyond `home` / `deals` / `rewards` / `bag` / `checkout` to cover the flows
where adaptive layout actually decides something: market select (a long list), order location
(a map with a list — the canonical two-pane and tabletop case), product list (a grid), product
detail (image plus actions), and mobile code (the cover-display case). Keep the Figma node ids
and the honest `source: "built from Sample design system components — not in Figma yet"` marker where a
screen has no Figma frame.

## How to work

- Keep the config-driven architecture. Anything you hardcode in a component that varies per
  device, platform or breakpoint is a bug.
- Every Android number gets a `source`: a device spec, a Figma token, `androidx.window`
  documentation, or `estimated`. Do not launder guesses into facts.
- Android and iOS are peer clients of the same product spec. Do not describe one as mirroring the
  other in code or comments; differences are differences, and each platform's guidance
  (HIG / Material 3 adaptive) is cited on its own terms.
- Ship in slices that are each usable: platform-aware model → Android phones and tablets →
  foldables and postures → window states → collision checks → exports and parity view.
