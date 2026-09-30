# Dobra CLI — website checks

`dobra check site <url>` opens a website in Chromium at each device target, emulates the hinge
where the device has one, and runs the same foldable rules as the Figma plugin and the web report.
It also checks whether the page lays itself out again when a foldable unfolds. It writes a report
JSON that the web report opens, an optional Markdown summary, and an exit code for CI.

## Install and build

Without a checkout, the [installer](../../README.md#install-on-your-mac) sets up everything and adds
`dobra check site <url>` to the Terminal. In a checkout:

```bash
npm install
npx playwright install chromium   # once: downloads Playwright's Chromium build
npm run build:cli                 # writes packages/cli/dist/dobra.mjs
```

## Usage

```bash
npm run dobra -- check site https://example.com
```

This writes `foldable-report.json` and a report package, `foldable-report.zip`, with the JSON, the
Markdown and a screenshot of each target. Drop the ZIP into Foldable Check to review it.

| Option | Meaning |
| --- | --- |
| `--targets <keys>` | Comma-separated target keys, `device/display/posture/orientation` (`-` for no posture), for example `surface-duo-2/spanned/spanned/landscape,pixel-9/main/-/portrait` |
| `--category <name>` | Every target of a device category (`phone`, `foldable-book`, `foldable-flip`, `dual-screen`, `multi-fold`, `tablet`, `desktop`); repeat for more |
| `--out <file>` | Report JSON path, default `foldable-report.json` |
| `--md <file>` | Also write a Markdown summary |
| `--zip <file>` | Report package path, default the `--out` name with `.zip` (`foldable-report.zip`). The package holds `foldable-report/report.json`, `report.md`, `index.json` and a PNG screenshot of each target's window. Drop it into Foldable Check to see the findings, the Markdown and the JSON; it's read in the browser only. A screenshot that fails is listed as missing and never fails the run |
| `--no-zip` | Skip the report package and its screenshots, for example in CI |
| `--wait <ms>` | Settle time after the page's `load` event, default `500` |
| `--fail-on <level>` | Exit 1 on findings of this level or worse: `error` (default), `warn` or `never`. A target that could not load always exits 1 |
| `--no-transitions` | Skip the unfold pass |

Without `--targets` or `--category`, the check visits one representative device for every
required coverage cell in the catalog.

The check waits for the `load` event plus `--wait`, never for network idle, so pages that poll
or keep beacons open still finish. If `load` has not fired after 30 s (one slow third-party
resource), the page is checked as it is and the report notes it. A page whose script stops
answering for 30 s is listed under **Could not load**.

## Create an emulator or simulator

`dobra emulator` turns a catalog device into an Android emulator (AVD) or an iOS simulator configured
like it. For Android that means the screen, the density, the region shown when folded, the hinges
and the postures. It needs the Android SDK (Android Studio) or Xcode on this machine.

```bash
npm run dobra -- emulator list                     # every device and how well it can be emulated
npm run dobra -- emulator create galaxy-z-fold-7   # creates dobra_galaxy-z-fold-7
npm run dobra -- emulator create galaxy-z-fold-7 pixel-tablet iphone-17 --start   # several at once
npm run dobra -- emulator script galaxy-z-fold-7 iphone-17 > dobra-emulators.sh  # the same steps as a script
```

| Option | Meaning |
|---|---|
| `--api <n>` | Android API level. Default: the newest system image installed for this processor. With none installed, the command prints the `sdkmanager` line to install one |
| `--runtime <id>` | iOS runtime, for example `com.apple.CoreSimulator.SimRuntime.iOS-26-4`. Default: the newest one that supports the device |
| `--name <name>` | Name to create. Default `dobra_<device>`, or `<Device> (Dobra)` for simulators |
| `--start` | Start the emulator, or boot the simulator, once it's created |
| `--force` | Replace an emulator or simulator that has the same name |
| `--json` | Print the result as JSON (`"version": 1`), for scripts and agents. With several devices it's `{ "version": 1, "results": [...] }`, one entry per device, with `error` for one that failed |

### Switch a running emulator's posture

```bash
npm run dobra -- emulator posture galaxy-z-fold-7 book
npm run dobra -- emulator posture galaxy-z-fold-7 tabletop --json
```

It finds the running emulator for the device (the AVD `dobra_<device>`, or `--name`, or `--serial
emulator-5554`) and sends the posture: closed, half-open (book, tabletop, flex) or open. A posture the
catalog marks as rotated, such as tabletop, also turns the screen 90°; `--orientation
portrait|landscape` chooses it yourself. `dobra emulator list --json` lists each device's postures.
Postures the emulator doesn't have (rear display), devices with two hinges and iOS simulators exit 2
with the reason; an emulator that isn't running exits 1 with the command that starts it.

What an emulator can't reproduce is listed as **limits**, never guessed. Examples: a flip phone's
cover screen, a rear-display posture, and posture switching on devices with two hinges. iOS
simulators exist only for Apple's own models, so each catalog device maps to the closest one, and a
hypothetical device such as iPhone Duo has none. With several devices, `create` checks them all first,
creates each one, and exits 1 if any failed. `script` needs only the Android SDK or Xcode, not Dobra,
and it runs on macOS and Linux. Save it and run it with `sh dobra-emulators.sh`. Don't paste it into
a terminal: pasted, a failure would close that terminal. The site's Generator page prints the same script.

## Check sites from the report

`dobra report` serves Foldable Check with a local site-check endpoint, so a website can be checked
from the report page. The check runs on your machine, so `localhost` and staging addresses work.

```bash
npm run build:report                # once: the page it serves
npm run dobra -- report             # prints http://127.0.0.1:5301/
```

| Option | Meaning |
| --- | --- |
| `--port <n>` | Port to listen on, default `5301`; `0` picks a free one |
| `--host <addr>` | Address to listen on, default `127.0.0.1` |
| `--dir <folder>` | The built report app to serve, default `apps/report/dist` |

It answers `GET /api/health` and `POST /api/check` with a JSON body
`{ "url": "…", "targets": ["…"], "categories": ["…"] }`. Both lists are optional; without them the
representative set is checked, as with `check site`. The response is the report JSON. The page is
served at `/` and `/report/`; if it isn't built yet, those paths say so and the endpoint still works.

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

The browser tests start Chromium against local fixture pages in `src/test/fixtures`. Two
acceptance suites use the repo's `examples/sites`:
- `sites.test.ts` runs every check in `examples/sites/expected.json`;
- `e2e.test.ts` builds `dist/dobra.mjs` and runs the real command, checking its exit codes, the
  report JSON and the Markdown.
