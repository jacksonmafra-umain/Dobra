# Dobra simulator

A browser simulator for foldable, dual-screen and large-screen layouts on iOS and Android. It
places a screen inside a device window and resolves that window's size class, layout rule, safe areas,
folds and reserved regions. It also shows which foldable rules the screen breaks there. The screen can be one of the
sample screens or a frame loaded from a Figma file.

## Run and build

```bash
npm run dev            # local development server (Vite)
npm run build          # dist/, assets split into hashed files
npm run build:single   # dist-single/index.html, one self-contained file with images and favicons inlined
```

Run them from the repo root or in this folder. The single-file build opens straight from disk or
can be hosted anywhere.

A hosted copy runs at https://dobra-five.vercel.app/simulator/. Without a checkout, the
[installer](../../README.md#install-on-your-mac) builds everything, and `dobra simulator` opens the
simulator in the browser.

The top bar shows the version and build date of the copy you are using. If the catalog or the app
profile doesn't validate, the page lists each invalid value with its path instead.

## What's on screen

### Device and window

- **Device**: every enabled device in the catalog, grouped by platform.
- **Pose** (iOS) or **Posture** (Android): the device's postures, such as closed, open or tabletop.
  An estimated posture is marked with `*`. **Open device** / **Close device** switches between the
  closed posture and the first open one.
- **Display**: the displays of a device that has more than one and no postures.
- **Orientation**: **Portrait** or **Landscape**. An orientation the display doesn't support in the
  config is disabled.
- **Reserved regions** (iOS foldables): **Camera on** reserves the inner front camera, and **Live
  Activity** expands the outer camera into the Dynamic Island.
- Android only: **Rotation** (0° or 90° from the display's natural orientation, locked when the
  posture fixes it), **System navigation** (**Gesture** or **3-button**), **Window** (**Full
  screen**, **Split**, **Desktop**, **Pop-up**, **PiP**, as the device supports), the split ratio
  and half, **Display size**, and app settings (**Rotation lock**, **Portrait only**, `targetSdk`
  35 or 36). A **Desktop** window has drag handles to resize it.
- **Free resize**: a window with no device. Type the width and height (280 × 320 to 1400 × 1400)
  or drag the frame's handles, and pick which platform's size classes apply. Free resize isn't a
  catalog target, so the foldable rules don't run on it.

Sizes are in pt on iOS and in dp on Android.

### Screen

**Screen** lists the sample screens (Home, Deals, Rewards, Bag, Checkout, Locations, Products),
each marked **(sample)**, and any Figma frames you added, under **From Figma · *file name***.

To add Figma frames:

1. Press **Add Figma screens** (**Figma screens…** once some are added).
2. Paste the file link (`figma.com/design/…` or `figma.com/file/…`) and a personal access token
   with the `file_content:read` scope.
3. Press **Load file**. The frames appear by page, with thumbnails, and each frame that matches a
   catalog target by tag, name or size is labelled. Sections and Groups are opened to find the frames inside them.
4. Tick frames (use **Search frames** to filter) and press **Add *n* screens**.

A Figma frame is shown as an image in place of the sample screen, with an invisible box over each
text or tappable layer so the collision checker can outline it. The foldable rules run on the
frame's layers. A frame drawn for a different width is scaled to the window, and its positions and
findings are marked as approximate. If a frame is deleted from the file, the simulator offers
**Remove**, and if it fails to load, **Retry**.

The token:

- stays in the page's memory. Tick **Remember for this tab** to keep it in the tab's session
  storage; unticking removes it. It never goes to local storage or the URL.
- is sent only to Figma's API. Nothing loads while the dialog is open.

The file and the picked frames (ids, names, pages and sizes only) are remembered in the browser's
local storage. The token, images and layers are never stored. After a reload, a Figma screen asks
you to **Sign in to load** until a token is entered again.

### Overlays and view

- **Overlays**: **Safe areas**, **Margins**, **Grid** (the layout rule's columns and gutters),
  **Reserved** (camera and Live Activity regions) and **Fold** (each fold with its thickness, and
  the size of each region it separates). Estimated values are labelled `est.`
- **Present**: shows an **Alert** or a **Sheet** over the sample screen.
- **Zoom**: **Fit** scales the device to the canvas; **100%** shows it at actual size.
- **Appearance**: **Light** or **Dark**.
- **Direction**: **LTR** or **RTL**.
- **Text size**, **Large text**, **Bold text** and **Reduced motion**, within the platform's font
  scale range.
- **Keyboard** shows or hides the on-screen keyboard. **Pointer**, **Keyboard kind**, **Distance**
  and **Sensors** override the device's input and media features, and **Reset** clears the overrides.

### Inspector

The sidebar shows, for the current window:

- **Indicators**: size class (UIKit horizontal and vertical on iOS, `WindowSizeClass` width and
  height on Android), the layout rule, window, orientation, pose, available space, navigation,
  safe area or insets, page margins and grid. Estimated values are labelled as estimated.
- **Checks**: the findings, each with its rule id, message and source.
- The active layout rule for each component of the screen, the bars, and **Reserved regions &
  folds** (on Android, each fold's orientation, state, `isSeparating` and occlusion type).
- **Design source**: the screen's source, or a link to its Figma variant for the current orientation.
- **What changed**: which rules changed after the last device, posture, orientation or size change.

### Collision checker

Important elements (buttons, headings, cards, modals, and the layers of a Figma frame) that sit on
a fold or in a reserved region are outlined in red and listed in the findings. Carousels, chrome
and other containers where an overlap is expected are skipped. Content that scrolls is measured
again as it scrolls.

### Compare platforms

**Compare platforms** shows a second device from the other platform next to the first, paired by
category and short side, and you can pick another. It follows the first side's screen, state and
orientation. A table below lists the window, size class, layout rule, navigation, scene and
findings of both, and highlights the rows that differ.

### Export report

**Export report** downloads a Dobra Report JSON (`dobra-report-<target>.json`) for the
[web report](../report/README.md). It runs the shared geometry rules over what is on screen,
collected the same way as the CLI's site check. It works only for a catalog target in a full screen
window: not for free resize, other window modes, or a posture and orientation that isn't a target.

### Links

The whole state (device, posture, orientation, screen, overlays, text settings, theme, zoom,
direction and the compared device) is kept in the URL, so a link opens the same view.

## Where the devices and screens come from

The simulator shows what the config in `packages/core` describes:

- `packages/core/src/catalog/catalog.json`: platforms, devices, displays, postures, folds, safe
  areas, reserved regions and hardware. Every value carries a `source`, and estimated values are
  shown as estimated.
- `packages/core/src/profiles/sample.profile.json`: the app profile, with its components, layout
  rules, typography, tab bar and screens.

A device or screen with `enabled: false` is hidden. Edit these files to change what the simulator
shows.

## Tests

```bash
npm test -w @dobra/simulator
```
