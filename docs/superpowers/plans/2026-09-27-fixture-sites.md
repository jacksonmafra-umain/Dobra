# Fixture sites for website checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A set of static HTML pages. Each one reproduces one observed foldable failure, and one "good" page shows the fold-aware pattern. `expected.json` says which rule ids each page must and must not trigger on which targets, so the slice-6 CLI can run an acceptance test against them.

**Architecture:** `examples/sites/` holds plain HTML files with inline CSS and a few lines of inline JS where needed. It has no workspace, no package.json and no dependencies. Pages use semantic elements (`header`, `nav`, `main`, `section`, `h1`–`h3`, `p`, `button`, `img`), so any DOM-to-GeoNode walker reads them the same way. Sizes are in CSS px, which equal dp under device emulation.

**Tech Stack:** HTML and CSS only. Node built-ins are used only for one-off verification commands, and no files are added for them.

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §7 (CLI), §8 (rules) and §8.2 (observed failures).

## Global Constraints

- Everything lives under `examples/sites/`. Do not touch `packages/cli`, `packages/core` or the root `package.json` and `package-lock.json`.
- Every page is self-contained: no external fonts, scripts or images. Use inline SVG, or CSS boxes for media.
- Pages are there to trigger rules deterministically. Each failing page contains its one failure. Every other element is sized to stay clear of the other rules: text blocks at least 200 px wide, interactive elements at least 48×48 px, nothing wider than the viewport, and nothing on a hinge.
- Thresholds come from core rules on `origin/feat/figma-plugin-checker` (`packages/core/src/rules.ts`). A side-by-side layout needs 600. A window is short below 480. Text is legible from 200 px when it has at least 20 characters. Each failure sits well past its threshold, so a small threshold change does not flip the result.
- Use English throughout, microcommits, and no assistant mention in commits or PRs. Work from a labeled issue (`enhancement`, `area:cli`), on branch `feat/fixture-sites` from `main`, with a PR that closes the issue.

## Targets used

Target keys follow `targetKey`: `deviceId/displayId/pose/orientation`.

| Key | Window (dp) | Why |
|---|---|---|
| `galaxy-z-flip-7/cover/closed/landscape` | 352 × 339 | §8.2 #1, #2 and #3 were observed on this cover. It is short and narrow, and it does not rotate |
| `galaxy-z-flip-7/inner/open/portrait` | 360 × 880 | §8.2 #5 at 40% pane width, and the end of the cover-to-inner transition |
| `pixel-9-pro-fold/inner/book/portrait` | 851 × 883 | A separating vertical crease |
| `surface-duo-2/spanned/spanned/landscape` | 1100 × 756 | A FULL-occlusion hinge at x=537, 26 wide |

## `expected.json` format

```json
{
  "$comment": "What the CLI must find on each page. expect: rule ids that must appear on that target. forbid: rule ids that must not. Rule ids outside both lists are not asserted.",
  "pages": [
    {
      "file": "01-orientation-side-by-side.html",
      "observed": "§8.2 #1",
      "checks": [{ "target": "galaxy-z-flip-7/cover/closed/landscape", "expect": ["landscape-not-wide"], "forbid": ["hinge-content", "overflow-x"] }]
    }
  ],
  "transitions": [
    { "file": "08-resize-vs-reload.html", "from": "galaxy-z-flip-7/cover/closed/landscape", "to": "galaxy-z-flip-7/inner/open/portrait", "expect": ["resize-vs-reload"] }
  ]
}
```

## Review Focus

- A page meant to trigger one rule accidentally triggers another: a 40 px icon button (`touch-target`), a 360 px element on a 352 cover (`overflow-x`), or a caption under 200 px. The `forbid` lists catch these, so keep them honest.
- `good.html` relies on segment emulation on folded targets. Without it, the 600 px fallback puts column 1's text across the Duo hinge. The CLI must emulate segments there, or the good page fails for the wrong reason.
- `env(viewport-segment-*)` has no fallback value, so the layout collapses in Chrome without the flag. Every `env()` needs a fallback.
- The resize-vs-reload page must differ only after a live resize. A fresh load at the inner size must render the correct layout, or the CLI cannot tell the two apart.
- Target keys that do not exist in the catalog. Task 1 checks each key's device, display and posture against `catalog.json`.

---

### Task 1: Folder, README and target check

**Files:**
- Create: `examples/sites/README.md`
- Create: `examples/sites/expected.json` (the format above, with `pages: []` and `transitions: []`; later tasks fill them)

- [ ] **Step 1: Write the README**

```markdown
# Fixture sites

Static pages for the website checks. Each numbered page reproduces one foldable failure observed on
real devices (foldable-artboards spec §8.2). `good.html` shows the fold-aware pattern and must not
trigger any rule. `expected.json` lists, per page and target, the rule ids that must and must not be
found.

Open a page directly from disk, or serve the folder with any static server. There is nothing to
install.
```

- [ ] **Step 2: Check the target keys against the catalog**

Run:

```bash
node -e '
const c = require("./packages/core/src/catalog/catalog.json");
const keys = ["galaxy-z-flip-7/cover/closed/landscape","galaxy-z-flip-7/inner/open/portrait","pixel-9-pro-fold/inner/book/portrait","surface-duo-2/spanned/spanned/landscape"];
for (const k of keys) {
  const [dev, disp, pose, o] = k.split("/");
  const d = c.devices.find((x) => x.id === dev);
  const p = d?.postures?.find((x) => x.id === pose);
  const s = d?.displays[disp]?.size;
  const shape = s && (s.width > s.height ? "landscape" : "portrait");
  const turned = p?.rotation === 90 ? (shape === "landscape" ? "portrait" : "landscape") : shape;
  console.log(k, d && p && p.display === disp && turned === o ? "ok" : "MISMATCH", s);
}'
```

Expected: four lines ending in `ok`. After PR #22 merges, repeat with `isKnownTarget(envConfigOf(loadCatalog()), parseTargetKey(k))` in a scratch Vitest file (not committed).

- [ ] **Step 3: Commit**

```bash
git add examples/sites/README.md examples/sites/expected.json
git commit -m "Add the fixture sites folder with its README and expected findings format"
```

### Task 2: Cover-screen failures (#1, #2, #3) and overflow

**Files:**
- Create: `examples/sites/01-orientation-side-by-side.html`, `02-narrow-card.html`, `03-floating-tab-bar.html` and `07-overflow-x.html`
- Modify: `examples/sites/expected.json`

Shared head for every page (copy it into each file; there are no shared assets):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>…</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.4 system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { margin: 0 0 12px; }
  button { min-width: 48px; min-height: 48px; font: inherit; }
  .media { background: #cfd8dc; border-radius: 8px; }
</style>
```

- [ ] **Step 1: `01-orientation-side-by-side.html`.** The layout is chosen from orientation, not width. `main` is `display: flex` under `@media (orientation: landscape)`, with two `section`s at `flex: 1`. On 352 × 339 each section is 176 wide, over 30% of the width, and at least half the row's height. Each section holds one `.media` box (height 120) and an `h2` of under 20 characters, so `min-legible-width` stays quiet. The body has 0 padding.

```html
<style>
  @media (orientation: landscape) { main { display: flex; min-height: 100vh; } main > section { flex: 1; } }
</style>
</head>
<body>
<main>
  <section><div class="media" style="height:120px"></div><h2>Map</h2></section>
  <section><div class="media" style="height:120px"></div><h2>Store</h2></section>
</main>
</body></html>
```

In `expected.json`, add `checks: [{ target: "galaxy-z-flip-7/cover/closed/landscape", expect: ["landscape-not-wide"], forbid: ["hinge-content","overflow-x","chrome-overlap"] }]`.

- [ ] **Step 2: `02-narrow-card.html`.** Stacked landscape branches: landscape adds 24 px side margins, splits the header 60/40, and uses a "compact" card variant at 45% of the remaining width, all under `@media (orientation: landscape)`. On 352: (352 − 48) × 0.45 ≈ 137, and with the card's own 2 px border that is about 141. The card holds a `p` of more than 20 characters (for example, "Double cheeseburger meal, large fries and a drink"), so that `p` is under 200 wide. Keep everything else in normal flow; the page does not need to be tall.

```html
<style>
  @media (orientation: landscape) {
    body { padding: 0 24px; }
    header { display: flex; } header > * { flex: 0 0 60%; } header > *:last-child { flex-basis: 40%; }
    .card { width: calc((100vw - 48px) * 0.45 + 4px); border: 2px solid #90a4ae; border-radius: 12px; padding: 0; }
  }
</style>
</head>
<body>
<header><h1>Order</h1><span>Pickup</span></header>
<article class="card"><p>Double cheeseburger meal, large fries and a drink</p></article>
</body></html>
```

The header's flex children are not `container` or `media` with at least half the row height, so this page must not trigger `landscape-not-wide`; say so with `forbid`. In `expected.json`, add `expect: ["min-legible-width"], forbid: ["landscape-not-wide","overflow-x","hinge-content"]` on the cover target.

- [ ] **Step 3: `03-floating-tab-bar.html`.** A `nav` with `position: fixed; bottom: 12px; left: 12px; right: 12px; height: 64px`, holding four `button`s (each 48 px or larger), floats over a scrolling `main` whose paragraphs pass under it. On a 339 tall window, content at y ≈ 263–327 sits under the bar. Use four paragraphs of 3 lines each so content reaches below y=263 without scrolling.

In `expected.json`, add `expect: ["chrome-overlap"], forbid: ["overflow-x","touch-target"]` on the cover target, plus a second check on `galaxy-z-flip-7/inner/open/portrait` with `forbid: ["chrome-overlap"]`: the window is 880 tall, so the rule does not apply there.

- [ ] **Step 4: `07-overflow-x.html`.** A promo banner with a fixed `width: 400px` inside a body without `overflow` clipping. On 352 it runs 48 px past the right edge; on 360 it runs 40 px past. The rest of the page is fluid.

In `expected.json`, add `expect: ["overflow-x"]` on both Flip targets. On `pixel-9-pro-fold/inner/book/portrait`, 400 fits in 851: `forbid: ["overflow-x"]`. The centred banner crosses the crease there (about x=425), so that check also has `expect: ["hinge-content"]`.

- [ ] **Step 5: Verify the geometry in a browser.** For each page, open it in Chrome at the target viewport size (DevTools device toolbar, DPR 2.6875 for the Flip cover) and run this in the console:

```js
[...document.querySelectorAll('section, .card, .card p, nav, main p, .promo')].map((e) => [e.className || e.tagName, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().y)])
```

Expected:
- Page 01: two sections at 176.
- Page 02: the card is between 138 and 145, and its `p` is under 200.
- Page 03: `nav` at y=263 with a paragraph overlapping it.
- Page 07: the banner reaches 400 in width and its right edge is past the viewport.

Record the numbers in the PR description.

- [ ] **Step 6: Commit, one page at a time**

```bash
git add examples/sites/01-orientation-side-by-side.html examples/sites/expected.json
git commit -m "Add a fixture page that picks side by side from orientation on the Flip cover"
git add examples/sites/02-narrow-card.html examples/sites/expected.json
git commit -m "Add a fixture page whose stacked landscape branches leave a 141 dp card"
git add examples/sites/03-floating-tab-bar.html examples/sites/expected.json
git commit -m "Add a fixture page with a floating tab bar over content in a short window"
git add examples/sites/07-overflow-x.html examples/sites/expected.json
git commit -m "Add a fixture page with a fixed-width banner wider than the cover"
```

### Task 3: Text at 40% pane width (#5) and content on the hinge

**Files:**
- Create: `examples/sites/05-text-at-40-percent.html`, `06-hinge-content.html`
- Modify: `examples/sites/expected.json`

- [ ] **Step 1: `05-text-at-40-percent.html`.** A list-detail layout that splits 60/40 from `@media (min-width: 340px)`, a breakpoint tuned on a large phone. On the Flip's 360 inner display, the 40% detail pane is 144 wide, and its `p` (over 20 characters) breaks there. Both panes are `section`s with `min-height: 100vh`. Set no `orientation` query.

The window is 360 < 600, and both panes are at least 30% of the width, so `landscape-not-wide` fires too. That is correct: the side-by-side split is the cause, and the broken text is the symptom observed in §8.2 #5. Add `expect: ["min-legible-width", "landscape-not-wide"], forbid: ["overflow-x"]` on `galaxy-z-flip-7/inner/open/portrait`.

- [ ] **Step 2: `06-hinge-content.html`.** A hero with a centred primary `button` (width 200) and a centred `h1` over 20 characters, laid out for one wide screen, with no segment awareness. On the Duo spanned (1100 wide, hinge 537–563), both are centred at 550, across the hinge. On the Pixel 9 Pro Fold book (851), they are centred at about 425, across the crease.

In `expected.json`, add `expect: ["hinge-content"], forbid: ["overflow-x"]` on `surface-duo-2/spanned/spanned/landscape` and on `pixel-9-pro-fold/inner/book/portrait`.

- [ ] **Step 3: Verify in a browser.**
  - Page 05 at 360 × 880: the detail `p` is about 144 wide.
  - Page 06 at 1100 × 756: the button's x range contains 537–563.
  - Enable `chrome://flags/#enable-experimental-web-platform-features` with the DevTools "Dual Screen" or a folded device preset, and confirm `window.viewportSegments?.length === 2` where supported. Note the result; this page does not depend on it.
- [ ] **Step 4: Commit**

```bash
git add examples/sites/05-text-at-40-percent.html examples/sites/expected.json
git commit -m "Add a fixture page whose text breaks in a 40 percent pane"
git add examples/sites/06-hinge-content.html examples/sites/expected.json
git commit -m "Add a fixture page with a centred call to action across the hinge"
```

### Task 4: Resize vs reload

**Files:**
- Create: `examples/sites/08-resize-vs-reload.html`
- Modify: `examples/sites/expected.json` (`transitions`)

- [ ] **Step 1: Write the page.** It reads `innerWidth` once on load and sets `document.body.dataset.layout = innerWidth >= 600 ? 'two' : innerWidth >= 340 ? 'wide' : 'compact'`. CSS keys the layout on `body[data-layout]`:
  - `compact`: one column.
  - `wide`: a single column with a 2-column card grid.
  - `two`: two panes.

  There is no `resize` listener, and no media query drives the layout. Loaded at 352 (cover) it picks `wide`. After a live resize to 360 × 880 it stays `wide`, which is correct by coincidence, so make the cover case land in `compact`: use a threshold of `>= 356` for `wide`. Loaded at 352 it is `compact`; resized live to 360 it stays `compact`, whereas a fresh load at 360 renders `wide`. The collected rects differ: one column versus a 2-card grid.

```html
<script>document.body.dataset.layout = innerWidth >= 600 ? 'two' : innerWidth >= 356 ? 'wide' : 'compact';</script>
```

Place the script at the end of `body`. Keep text at least 200 wide and buttons at least 48 in every layout.

- [ ] **Step 2: Add the transition** from the format above to `expected.json`.
- [ ] **Step 3: Verify in a browser.** Open at 352 × 339 and read `document.body.dataset.layout`; expect `compact`. Resize the viewport to 360 × 880 without reloading; expect still `compact`. Reload; expect `wide`.
- [ ] **Step 4: Commit**

```bash
git add examples/sites/08-resize-vs-reload.html examples/sites/expected.json
git commit -m "Add a fixture page that only picks its layout on load"
```

### Task 5: The good page

**Files:**
- Create: `examples/sites/good.html`
- Modify: `examples/sites/expected.json`

- [ ] **Step 1: Write the page.** The same content as pages 01, 03 and 06 (a hero with a CTA, two content blocks and a tab bar), done right:

```css
main { display: grid; grid-template-columns: 1fr; gap: 16px; padding: 16px; }
/* Side by side only when the window is wide, never from orientation. */
@media (min-width: 600px) { main { grid-template-columns: 1fr 1fr; } }
/* Spanned or folded: one column per segment, with the gap equal to the hinge. */
@media (horizontal-viewport-segments: 2) {
  main {
    grid-template-columns: env(viewport-segment-width 0 0, 1fr) env(viewport-segment-width 1 0, 1fr);
    column-gap: calc(env(viewport-segment-left 1 0, 0px) - env(viewport-segment-right 0 0, 0px));
    padding: 0;
  }
  main > * { padding: 16px; }
}
/* Short windows keep the tab bar in flow, so it never covers content. */
nav { position: fixed; bottom: 0; left: 0; right: 0; }
@media (max-height: 479px) { nav { position: static; } }
```

- The CTA sits inside the first column, never centred across the page.
- The body has no fixed-width element.
- Every text block is at least 200 wide at 352. On the cover the layout is one column (352 − 32 = 320).
- Each tab button is at least 48.
- The page expects the CLI's segment emulation on folded and spanned targets (spec §7, step 2). With two segments, each column is exactly one segment, and the hinge is the gap. Without emulation, the `min-width: 600px` fallback gives two equal columns. On the Duo that is (1100 − 48) / 2 = 526 each, so column 1 spans 16–542 and its text would cross the 537–563 hinge. Emulation is therefore required for this page's `forbid: ["hinge-content"]`, and `expected.json` says so in its `$comment`. Left-align the CTA (200 wide, x 16–216) so it is clear either way.

- [ ] **Step 2: Add the expectations.** Add a check for every target in the table above, each with `expect: []` and `forbid: ["landscape-not-wide","min-legible-width","chrome-overlap","hinge-content","overflow-x","touch-target"]`. Also add a transition from the Flip cover to the Flip inner with `forbid: ["resize-vs-reload"]`. The `transitions` entries therefore also take `forbid`; update the format's `$comment`.
- [ ] **Step 3: Verify in a browser** at each target size, with and without segment emulation.
  - Column widths: at least 200.
  - With segment emulation, column 1's right edge is at or left of the hinge (537 on the Duo, about 425 on the Pixel 9 Pro Fold). Without it, only the CTA is clear, as expected.
  - At 352 × 339 the nav is static, below the content.
  - `document.documentElement.scrollWidth === innerWidth`.
- [ ] **Step 4: Commit**

```bash
git add examples/sites/good.html examples/sites/expected.json
git commit -m "Add a fold-aware fixture page that must not trigger any rule"
```

### Task 6: Hand-off

- [ ] Open the PR against `main` (`Closes #<issue>`, labels `enhancement` and `area:cli`), with the browser measurements from Tasks 2 to 5 in the description.
- [ ] Message agent/02 with:
  - the PR number
  - the `expected.json` format, including the `forbid` on transitions
  - the note that page 05 expects `landscape-not-wide` as well, and why.
