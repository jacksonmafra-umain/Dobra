# Simulator: Figma screens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps are TDD: write the test, watch it fail, implement, watch it pass, commit.

**Goal:** paste a Figma file link and a token, pick frames, and see them inside any simulated device with the simulator's overlays and the foldable checks.

**Architecture:**
- `figmaClient` moves to `@dobra/core`. apps/report keeps a one-line re-export, so `ReportApp.tsx` isn't touched during agent/02's rework.
- The simulator gets:
  - a store (localStorage, holding the file key, file name and picked node ids);
  - a loader, which lists a file's frames with thumbnails and loads the picked frames' images and GeoNodes;
  - a modal;
  - a `FigmaScreen` renderer.
- A picked Figma frame renders in place of the sample screen. The layout engine keeps using a built-in screen for the overlays (margins, grid). The Checks list runs core `check()` on the frame's GeoNodes, scaled to the window, in place of `runLayoutChecks`.

**Spec:** `docs/superpowers/specs/2026-09-28-simulator-figma-screens-design.md` (merged in #132).

## Global Constraints

- Browser calls go straight to `api.figma.com`. CORS allows it: `Access-Control-Allow-Origin: *`, with `X-Figma-Token` in the allowed headers (checked 2026-09-28).
- **Token:** held in memory. It goes to sessionStorage only with **Remember for this tab**, through the report's `tokenStore` pattern. It is never in the URL and never in localStorage.
- **localStorage `dobra.figmaScreens`:** holds `{ version: 1, fileKey, fileName, frames: [{ id, name, page, width, height }] }` and nothing else. Every access is in try/catch.
- **Images and layers** are memory only.
- **URL:** `screen=figma:<nodeId>`, with `:` in node ids kept as-is. An unknown id falls back to the first sample screen.
- **Styling (agent/03):**
  - plain classes only, no inline styles and no colour literals (`chrome.test.ts` rejects them);
  - reuse `.panel`, `.seg`, `.seg-single--accent` and `.tag`;
  - new classes get their rules from agent/03, and the class names go to agent/03 before slice 2's PR.
- **Files agent/02 froze during its rework:** `apps/report/src/{ReportApp,siteCheck,ZipDownload,zipView}.tsx?` and `packages/cli/src/{args,main}.ts`. This plan touches none of them.
- **Workflow:** a labeled issue and PR per slice, from main, with microcommits and CI green; check typecheck by its exit code; no assistant mention. Merges deploy dobra-five.vercel.app.

## Review Focus

- A reload with frames stored but no token must show "Sign in to load", not an error or a blank screen.
- A picked frame deleted in Figma must show "No longer in the file", with **Remove**.
- A frame much wider or narrower than the window must be scaled to the window's width, show the banner, and mark its findings estimated.
- A Figma file with hundreds of frames must list quickly, with thumbnails loading lazily and 429s retried once after Retry-After.
- Switching device while a frame's image loads must not show the previous device's image or findings.

---

## Slice 1: shared Figma client (branch `feat/core-figma-client`)

### Task 1: Move `figmaClient` to core
- **Move:** `apps/report/src/figmaClient.ts` and its test go to `packages/core/src/figmaClient.ts`, using `git mv`, with the imports rewritten.
- **Shim:** `apps/report/src/figmaClient.ts` becomes `export * from '@dobra/core/figmaClient';`, so `ReportApp.tsx` and `loadReport.ts` don't change.
- **Images at a scale:** `images(key, ids, scale = 1)`, where `scale` is 0.1–4 and becomes `&scale=`. Test: the URL carries the scale, and the default is 1.
- **Check:** core compiles with `lib: ["ES2023"]`, and `fetch`/`Response` come from `@types/node`. Run `npm run typecheck` and the core and report tests.
- **Commits:** "Move the Figma REST client to core so the simulator can share it", then "Let the Figma client fetch images at a scale".

---

## Slice 2: store, loader and modal (branch `feat/sim-figma-picker`)

### Task 2: Store
- `apps/simulator/src/figma/store.ts`:
  - `readFigmaScreens(storage)` returns a `StoredFigmaScreens` or null. It validates the shape with a small check and returns null for anything malformed.
  - `writeFigmaScreens(storage, value)`.
  - `clearFigmaScreens(storage)`.
- **Tests:** a round trip; malformed JSON; a storage that throws.
- **Commit:** "Remember the chosen Figma file and frames in this browser".

### Task 3: Loader
- `apps/simulator/src/figma/loader.ts`:
  - `listFrames(client, url)` returns `{ fileKey, fileName, pages: { name, frames: FrameEntry[] }[] }`. It uses `parseFileKey`, `client.file`, the report's container expansion (moved into a small shared helper in the same file), and `frameCandidates`.
  - `FrameEntry` holds `{ id, name, page, width, height, match?: string }`. `match` is the catalog device that `matchFrame` finds by tag or size.
  - `thumbnails(client, key, ids)` calls `client.images(key, ids, 0.25)`, in batches of 50.
  - `loadFrames(client, key, frames, scale)` returns `Map<id, LoadedFrame>`, where `LoadedFrame` holds `{ image: string | null, geo: GeoNode[] | null, reason?: string }`. It calls `client.nodes`, then `restToGeo` with `patternsFromDocument`, then `client.images` at `scale`.
  - A 429 is retried once after Retry-After.
- **Tests, with a fake `FigmaClient`:**
  - pages and frames with matches;
  - a Section expanded;
  - a deleted frame gets a reason;
  - a 429 retried once;
  - an image failure keeps the geometry.
- **Commit:** "Load a Figma file's frames, thumbnails, images and layers for the simulator".

### Task 4: Modal and picker
- `apps/simulator/src/figma/FigmaScreensModal.tsx`, with two steps:
  1. **Connect:** the link and the token, the **Remember** checkbox and **Load file**.
  2. **Pick:** search, then frames grouped by page, each with a thumbnail, its size, its match and a checkbox, then **Add N screens** and **Cancel**.
- The steps are driven by a pure reducer, `pickerReducer`, which is tested directly.
- **App wiring:**
  - an **Add Figma screens** button next to the Screen picker;
  - a `<optgroup label="From Figma · <file>">` in the Screen select;
  - `screen=figma:<id>` read and written through `urlState`.
- **Classes:** `figma-screens`, `figma-screens__step`, `figma-screens__search`, `figma-screens__page`, `figma-screens__frame`, `figma-screens__thumb`, `figma-screens__meta`, `figma-screens__actions` and `figma-screens__error`. Buttons reuse `.seg-single--accent` and `.tag`.
- **Tests:**
  - reducer transitions: load, error, search, pick, add;
  - the markup of each step, through `renderToStaticMarkup`;
  - `urlState` round-trips `figma:1:23`.
- **Commits:** "Pick Figma frames in a two-step modal", then "List picked Figma frames in the Screen picker and the URL".

---

## Slice 3: render and check (branch `feat/sim-figma-render`)

### Task 5: Render a Figma screen
- `apps/simulator/src/figma/FigmaScreen.tsx`:
  - the frame's image fills the window's width, and a taller frame scrolls inside the window;
  - a transparent, positioned `<div data-name={node.name}>` sits over each important GeoNode (text and interactive), scaled to the window, so `useCollisions` measures them;
  - the banner shows when `|frame.width − window.width| > 1`.
- **States:**
  - "Sign in to load", when frames are stored but there is no token;
  - "Loading…";
  - "No longer in the file" with **Remove**;
  - "Image unavailable" with **Retry**.
- An image is keyed by (frame id, scale), so a device change never shows a stale one.
- **Classes:** `figma-screen`, `figma-screen__image`, `figma-screen__hit`, `figma-screen__banner`, `figma-screen__state`.
- **Tests:** the markup for each state and for the banner; hit boxes scaled and positioned.
- **Commit:** "Show a Figma frame inside the simulated window, with hit boxes for the fold outlines".

### Task 6: Checks for a Figma screen
- `apps/simulator/src/figma/checks.ts`:
  - `scaleGeo(nodes, factor)`;
  - `figmaFindings(config, env, target, frame)` builds a `Subject`: `source: 'simulator'`, `confidence: 'tag'`, the window's size, and the scaled GeoNodes. It runs core `check()`, and sets `estimated: true` on every finding when the factor isn't 1.
  - With no target (free resize), it returns a note in place of findings.
- **App:** when a Figma screen is selected, `findings = [...figmaFindings(...), ...collisionsToFindings(...)]`.
- **Tests:**
  - a frame at the window's width gives the same findings as `check()`;
  - a scaled frame's findings are all estimated;
  - free resize gives the note.
- **Commit:** "Check a Figma screen with the foldable rules for the simulated device".

### Task 7: By hand, with the user's test file
- Add three frames, then show one on a Pixel 9 Pro Fold in book posture. The fold outlines should appear on content across the crease, and the Checks list should match the web report for that frame.
- Reload without the token, and see "Sign in to load".
- Then send agent/03 the final class list.
