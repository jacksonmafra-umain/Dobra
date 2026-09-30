# Check a website on foldables

Runs `dobra check site`, which opens the page in Chromium at each device target, emulates the
hinge where the device has one, checks the foldable rules, and checks whether the page lays itself
out again when a foldable unfolds.

## 1. Scope

- **The address.** Use one exact URL for every command. For `localhost`, `127.0.0.1`, `*.local`,
  `*.test` or a staging host given without a scheme, add `http://` yourself: the CLI adds
  `https://`, which a local dev server usually doesn't answer. Check the server answers first:

      curl -sS --max-time 10 -o /dev/null -w '%{http_code}\n' <url>

  - Nothing answers: tell the user the server isn't running, and stop. That isn't a site finding.
  - A 4xx or 5xx code: the server answered with an error. Say so and ask before checking it.
- **The targets.** With no request, use the default: one representative device per required
  coverage cell. When the user names kinds of device, pass one `--category` per kind: `phone`,
  `foldable-book`, `foldable-flip`, `dual-screen`, `multi-fold`, `tablet`, `desktop`.
- **Named devices.** Build `--targets` keys, `device/display/posture/orientation` (`-` for no
  posture), from the catalog. Never guess an ID. List a device's displays and postures:

      node -e 'const c=require(process.argv[1]);const d=c.devices.find(d=>d.id===process.argv[2]);console.log(d?JSON.stringify({displays:Object.keys(d.displays),postures:(d.postures||d.poses||[]).map(p=>p.id+"@"+p.display)}):"unknown device")' "<DOBRA_DIR>/packages/core/src/catalog/catalog.json" galaxy-z-fold-7

  `book@inner` becomes `galaxy-z-fold-7/inner/book/landscape`. If the CLI answers
  `Unknown target <key>`, that orientation isn't offered: try the other one.

## 2. Run

Write the results to a scratch folder, never into the user's project:

    out="$(mktemp -d)/dobra"; mkdir -p "$out"
    dobra check site <url> --out "$out/foldable-report.json" --md "$out/report.md" --fail-on never

Add `--targets <keys>` or `--category <name>` from step 1. `--fail-on never` keeps the exit code
for real failures (a target that couldn't load still exits 1). The run also writes
`$out/foldable-report.zip` with a screenshot per target; keep it.

If it fails before checking anything:

| Output | Meaning | Tell the user |
|---|---|---|
| `Executable doesn't exist` or `browserType.launch` | Chromium is missing | Run `npx playwright install chromium` in `<DOBRA_DIR>`, or the installer again |
| `Not a web address` | The URL is malformed | Ask for a full URL |
| `Unknown target` | A bad `--targets` key | Rebuild it from the catalog (step 1) |

## 3. Read the JSON

Read `$out/foldable-report.json`, not the Markdown. What matters:

- `frames[]`: one per checked window. `frames[].targets` are the target keys it stands for;
  `frames[].findings[]` has `ruleId`, `severity`, `target`, `nodeId`, `message`, `source` and
  `estimated`.
- `unloaded[]`: targets that couldn't load, with a `reason`. These are "could not load", not
  findings.
- `coverage.cells[]`: which required device kinds were checked.
- `notes[]`: things the reader should know, such as a page cut short.

## 4. Explain each rule

| `ruleId` | What it means on a website | Fix, with the guide section |
|---|---|---|
| `hinge-content` | Content sits under the hinge or fold | Lay out around the fold with the Viewport Segments API: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `pane-split` | A pane crosses the hinge instead of splitting at it | One pane per segment, `@media (horizontal-viewport-segments: 2)` and `env(viewport-segment-*)`: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `tabletop-controls` | Controls sit in the top half in tabletop posture | Move controls below the fold with `vertical-viewport-segments`: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `landscape-not-wide` | Side-by-side panes in a window too narrow for them | Branch on width, not orientation: `08-anti-patterns.md#branching-on-orientation-instead-of-available-width`, `04-web.md#media-queries-and-container-queries` |
| `min-legible-width` | Text in a column too narrow to read | `08-anti-patterns.md#splitting-into-panes-too-narrow-to-read`, `04-web.md#intrinsic-layout` |
| `overflow-x` | Content runs past the window's width | `04-web.md#intrinsic-layout`, `04-web.md#viewport-units` |
| `chrome-overlap` | A fixed bar covers content in a short window | `04-web.md#safe-areas`, `04-web.md#viewport-units` |
| `touch-target` | A control is smaller than the touch minimum | `07-accessibility.md#touch-targets` |
| `fold-layout-missing` | Only with `--on` on Chrome 138 or newer: Chrome reports two viewport segments, but nothing on the page lines up with the fold | One pane per segment with `env(viewport-segment-*)`: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `fold-posture-mismatch` | Only with `--on` on Chrome 138 or newer: the device is half-open, but `navigator.devicePosture` isn't `folded` | Check that nothing overrides the posture: `04-web.md#foldables-and-dual-screens-the-viewport-segments-api` |
| `resize-vs-reload` | The page lays itself out only on load, not when a foldable unfolds | Use CSS queries or `ResizeObserver`, not a width read once: `08-anti-patterns.md#assuming-the-window-size-never-changes-after-first-layout` |
| `frame-size-mismatch` | The checked window differs from the target's size | Report it as a note about the run |

A rule not in this table: explain `message` and cite the closest section of `04-web.md`.

## 5. Report

Follow [report-format.md](report-format.md). Also:

- Say where the package is (`$out/foldable-report.zip`) and how to open it: `dobra report`, then drop
  the ZIP into Foldable Check.
- Always state the emulation limits: iOS targets are size-only (Chromium with an iOS user agent, no
  hinge), and a tri-fold shows its first separating fold only
  (`04-web.md#testing-and-the-limits-of-emulation`).
- Offer to re-run with the same targets after a fix, or only the failing ones (from
  `frames[].targets`).
