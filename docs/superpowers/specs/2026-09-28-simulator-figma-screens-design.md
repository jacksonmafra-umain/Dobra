# Simulator: show Figma screens — design

## 1. Goal

The simulator's **Screen** picker lists only its built-in sample screens, which are React
components defined in the app profile. "(not in Figma)" means a screen has no Figma frame linked;
nothing is fetched from Figma today.

With this feature, a designer or developer can:
1. paste a Figma file link and a token;
2. pick frames from the file;
3. see each picked frame inside any simulated device, with the simulator's safe-area, hinge and
   grid overlays and the foldable checks.

### Success criteria

- An **Add Figma screens** button next to the Screen picker opens a modal:
  - fields for the file link and a personal access token;
  - the file's frames, grouped by page, with thumbnails and sizes;
  - a checkbox per frame, and **Add**.
- Added frames appear in the Screen picker under a "From Figma" group, and are picked like any
  screen, including from the URL.
- A Figma screen renders its image inside the device window, with the overlays on top:
  - safe areas, the hinge and its safe zone, the column grid;
  - the collision outlines from the frame's own layers.
- The inspector's **Checks** list runs the foldable rules on the frame's layers for the current
  device, as the web report does.
- The token never leaves the browser except in the `X-Figma-Token` header to `api.figma.com`. It is
  kept only for the tab, unless the user ticks **Remember**.
- Only the file link and the chosen frames are remembered across visits; images are fetched again.

### Non-goals

- **Reflowing a Figma frame.** It is a static image, so it doesn't change with the device, size
  class, posture or text size. Only the built-in screens do that. When the frame's size differs
  from the window, the simulator says so and points to the plugin's **Adapt**, which makes a
  version per device.
- **Editing Figma files.** Reading is all the REST API allows on every plan.
- **Showing Figma prototypes or interactions.**

## 2. What the user sees

- **Modal, step 1:**
  - "Figma file link" and "Personal access token (scope file_content:read; stays in this tab)";
  - **Remember for this tab** (sessionStorage), and **Load file**.
  - Errors are the web report's own messages, with the token redacted.
- **Modal, step 2:**
  - the file's name, then its pages, each with its top-level frames, shown as thumbnails with the
    name and size;
  - a search field that filters frames by name;
  - **Add N screens** and **Cancel**.
  - Frames that match a catalog device by tag or size show that device, for example "matches
    iPhone 17", using the web report's frame matching.
- **Screen picker:** a "From Figma · <file name>" group follows the built-in screens. Each item is
  the frame's name and its size.
- **Canvas:**
  - the frame's image fills the window's width, and a taller frame scrolls inside the window as a
    real screen would;
  - the device frame, the system bars and every overlay stay the simulator's.
  - When the frame's width differs from the window's by more than 1 point, a banner reads: "This
    frame is 402 wide; this window is 360. The frame is scaled to fit, so positions are
    approximate. Use the plugin's Adapt to make a version for this device."
- **Inspector:**
  - the **Checks** list comes from core `check()` on the frame's layers;
  - the size-class, window, fold and media rows are unchanged.
- **Manage:** a **Remove** action on the screen, and **Refresh from Figma** to fetch the file again.

## 3. Architecture

```
apps/simulator
  ui/FigmaScreensModal.tsx   link + token → frame list → pick
  ui/figmaScreens.ts         store (localStorage: file key, name, picked node ids), fetch, scale
  sample/FigmaScreen.tsx     renders the image in the window; exposes layer rects to collisions
packages/core (shared, moved)
  figmaClient.ts             the REST client now in apps/report, moved so both apps use one copy
  figmaRest.ts (existing)    parseFileKey, frameCandidates, restToGeo, tagOf, patternsFromDocument
  rules.ts (existing)        check(subject, config)
```

- **Loading a file:**
  - `client.file(key)` lists the pages and their frames (`frameCandidates`);
  - `client.images(key, ids)` fetches the thumbnails at a small scale for the modal;
  - the full-size images, at the device's scale, for the picked frames.
- **Picking frames:** `client.nodes(key, ids)` fetches each picked frame's layers, and `restToGeo`
  turns them into `GeoNode`s once.
- **Checks:**
  - For the current environment, the simulator builds a `Subject`:
    - `source: 'simulator'`;
    - the current target;
    - `confidence: 'tag'`;
    - the window's size;
    - the frame's GeoNodes, scaled by `window.width / frame.width`.
  - It then runs `check()`.
  - When the scale is not 1, every finding carries `estimated: true`, and the banner explains why.
- **Collisions:** the existing collision outlines use DOM rects. For a Figma screen,
  `FigmaScreen` renders a transparent, positioned box per important GeoNode over the image, so the
  existing `useCollisions` measures them the same way.
- **Environments with no target** (free resize): the frame renders, and the Checks list says
  "Free resize is not a catalog target", as the findings export does.
- **Moving `figmaClient.ts` to core:** a pure `fetch`-based module with no DOM. Core compiles with
  `lib: ["ES2023"]` and no DOM types; `fetch` and `Response` type-check through `@types/node`,
  and the client takes `fetch` as a parameter so tests inject a fake. apps/report then imports it from `@dobra/core/figmaClient`, and its tests
  move with it.

## 4. Storage and privacy

| Kept | Where | How long |
|---|---|---|
| Token | Memory; sessionStorage with **Remember** | The tab |
| File key, file name, picked node ids | localStorage `dobra.figmaScreens` | Until removed |
| Images, layers | Memory | The tab; fetched again on the next visit (needs the token) |

- Every storage access sits in try/catch, and the feature degrades to "session only" when storage
  is blocked.
- No image or layer data is written to storage: client files stay out of the browser's disk.
- On a reload without a token, the "From Figma" group shows its frames with "Sign in to load" and a
  button that reopens the modal.

## 5. Errors

- **Figma errors:** the token and file errors (401, 403, 404, 429 with Retry-After) reuse the web
  report's `FigmaError` messages.
- **Missing frames:** a frame deleted from the file since it was picked shows "No longer in the
  file" with **Remove**.
- **Failed images:** the image URLs from `/v1/images` expire. A failed image is fetched again once,
  then shows "Image unavailable" with **Retry**.
- **Large files:** listing is paged by page, and thumbnails load as they scroll into view, 50 frames
  per `/images` call.

## 6. Testing

- **Unit, with a fake Figma client:**
  - the modal's two steps and its errors;
  - search and picking;
  - the store round trip, including blocked storage;
  - geometry scaling;
  - `check()` on a scaled frame marks its findings estimated;
  - a picker entry per frame;
  - the URL state (`screen=figma:<nodeId>`).
- **Core:** the moved `figmaClient` tests pass unchanged, and apps/report still passes.
- **Browser, with the user's test file:**
  - add three frames and show one on a Pixel 9 Pro Fold in book posture;
  - see the fold outlines on content across the crease, and the Checks list agreeing with the web
    report for the same frame;
  - reload without the token and see "Sign in to load".

## 7. Delivery

1. **Move `figmaClient` to core.** Touches apps/report and packages/core; agreed with agent/02 and
   agent/03.
2. **Simulator store and modal.** The file link, the token and the frame picker; screens appear in
   the picker.
3. **Rendering, checks and collisions** for Figma screens, and the size banner.

Each slice has its own issue and PR from main, with microcommits and CI green. UI components ship
with plain class names in the simulator's existing style; the visual restyle, if any, is
agent/03's.

## 8. Risks

- **Scaled checks are approximate.** A frame designed for another width is checked after uniform
  scaling, which is not how it would reflow. The banner and the `estimated` flag say so, and the
  fix is a frame per device, made with Adapt.
- **Rate limits:** a file with hundreds of frames hits Figma's REST rate limits. Thumbnails load
  lazily, and 429s are retried after Retry-After, as the web report does.
- **Tokens in a browser:** the token lives in the tab, as in the web report. The simulator has no
  server, so it never reaches Dobra.
