# Hinge CLI — website checks

`dobra check site <url>` opens a website in Chromium at each device target, emulates the hinge
where the device has one, and runs the same foldable rules as the Figma plugin and the web report.
It also checks whether the page lays itself out again when a foldable unfolds. It writes a report
JSON that the web report opens, an optional Markdown summary, and an exit code for CI.

## Install and build

```bash
npm install
npx playwright install chromium   # once: downloads Playwright's Chromium build
npm run build:cli                 # writes packages/cli/dist/dobra.mjs
```

## Usage

```bash
npm run dobra -- check site https://example.com --md foldable-report.md
```

| Option | Meaning |
| --- | --- |
| `--targets <keys>` | Comma-separated target keys, `device/display/posture/orientation` (`-` for no posture), for example `surface-duo-2/spanned/spanned/landscape,pixel-9/main/-/portrait` |
| `--category <name>` | Every target of a device category (`phone`, `foldable-book`, `foldable-flip`, `dual-screen`, `multi-fold`, `tablet`, `desktop`); repeat for more |
| `--out <file>` | Report JSON path, default `foldable-report.json` |
| `--md <file>` | Also write a Markdown summary |
| `--wait <ms>` | Settle time after the page's `load` event, default `500` |
| `--fail-on <level>` | Exit 1 on findings of this level or worse: `error` (default), `warn` or `never`. A target that could not load always exits 1 |
| `--no-transitions` | Skip the unfold pass |

Without `--targets` or `--category`, the check visits one representative device for every
required coverage cell in the catalog.

The check waits for the `load` event plus `--wait`, never for network idle, so pages that poll
or keep beacons open still finish. If `load` has not fired after 30 s (one slow third-party
resource), the page is checked as it is and the report notes it. A page whose script stops
answering for 30 s is listed under **Could not load**.

## What is emulated

- **Size, scale and user agent** of each target: the window in CSS px, the display density (Android)
  or scale (iOS) as the device pixel ratio, and an Android or iOS user agent.
- **The hinge**, on Android foldables and dual-screen devices, through the Chrome DevTools device
  metrics override. The page sees `@media (horizontal-viewport-segments: 2)` (or `vertical-…`),
  `env(viewport-segment-*)` and `window.viewport.segments`. Chromium takes one display feature,
  so a tri-fold shows its first separating fold only.
- **iOS targets are size-only.** WebKit cannot emulate segments, so iOS targets run in Chromium
  with an iOS user agent and no hinge.

## What is checked

The page's headings, text blocks, interactive elements, media, landmarks and scroll containers
are collected in document coordinates. Content below the first screen counts, because it scrolls
across the hinge. The collector stops at 4 000 elements and the report notes the cut.

The rules are the shared v1 set: `hinge-content`, `pane-split`, `landscape-not-wide`,
`min-legible-width`, `chrome-overlap`, `touch-target`, `overflow-x` and `tabletop-controls`.
The CLI adds one more:

- `resize-vs-reload`: on an Android device with a cover display, the page is loaded on the cover,
  resized to the inner display without reloading (as unfolding does), and compared with a fresh
  load at that size. Three or more elements whose left or right edge sits more than 4 px apart mean the
  page only lays itself out on load. Vertical shifts are ignored: late banners, lazy images and
  carousels move content between any two loads. Both thresholds are estimated.

## Known limits

- A horizontal fold (tabletop) does not flag content that scrolls with the page, since it moves
  past the crease. Fixed elements and pages that do not scroll are still checked.
- A page without `initial-scale=1` that a mobile browser zooms out to fit wide content gets
  approximate hinge positions; the report notes the zoom.
- Iframes are treated as media and not entered.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No findings at or above `--fail-on`, and every target loaded |
| `1` | Findings at or above `--fail-on`, or a target that could not load (network error, HTTP 4xx/5xx) |
| `2` | Help, bad arguments, an unknown target key, or a crash |

With `--fail-on never`, findings never fail the run, but a target that could not load still exits `1`.

## CI

```yaml
- run: npm ci && npx playwright install --with-deps chromium && npm run build:cli
- run: npm run dobra -- check site ${{ env.PREVIEW_URL }} --out foldable-report.json --md foldable-report.md
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: foldable-report, path: "foldable-report.*" }
```

Open `foldable-report.json` in the web report (**Open a report JSON**) to see coverage and every
finding per device.

## Tests

```bash
npm test -w @dobra/cli
```

The browser tests start Chromium against local fixture pages in `src/test/fixtures`.
