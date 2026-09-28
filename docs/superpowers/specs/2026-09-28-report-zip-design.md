# Foldable Check: report packages with screenshots — design

## 1. Goal

A foldable check produces one ZIP that holds everything a reviewer needs:
- the report JSON;
- a Markdown summary;
- a screenshot of every checked frame.

Foldable Check opens the ZIP and shows each frame's screenshot with its findings. Nothing is uploaded
or kept: the ZIP is read in the browser, and closing the tab discards it.

### Success criteria

- Both producers write the same layout:
  - the CLI, with `dobra check site <url> --zip <file>`;
  - Foldable Check, with a **Download ZIP** button after a Figma or website check.
- "Open a report" accepts a `.json` (as today) or a `.zip`. With a ZIP, every frame card shows its
  screenshot, with the fold and findings drawn over it.
- The `Report` JSON format doesn't change, so every existing consumer still reads it. The images
  are linked from a separate index file.
- Opening a ZIP sends nothing over the network and stores nothing: no server, no localStorage, no
  IndexedDB.
- A malformed or hostile ZIP (a zip bomb, too many files, bad paths, entries that aren't images) is
  refused with a message and never renders.

### Non-goals

- Uploading reports to a server, or sharing links to them.
- Screenshots from the simulator's findings export. A browser can't capture its own DOM as an image
  without a large dependency, so this is deferred.
- Deleting the file from the user's disk. A web page can't do that; the file stays theirs.

## 2. Package layout

```
foldable-report/
  report.json          the Report, unchanged (packages/core/src/report.ts)
  report.md            toMarkdown(report) plus an image under each frame heading
  index.json           { "version": 1, "screenshots": { "<frame ref>": "screenshots/<file>.png" } }
  screenshots/
    001-galaxy-z-flip-7__cover__closed__landscape.png
    002-pixel-9-pro-fold__inner__book__portrait.png
    …
```

- **File names:** a three-digit position in `report.frames`, then the frame's first target key
  (with `/` replaced by `__`) or its name, cut down to `[a-z0-9_-]` and at most 80 characters.
  Names are unique, and ASCII so every unzip tool handles them.
- **Markdown:** `report.md` links images as `![<frame name>](screenshots/<file>.png)`, so it reads
  correctly after unzipping, in an editor or on GitHub.
- **Missing images:** a frame without a screenshot (unloaded, or its image failed) simply has no
  entry in `index.json`.
- **Images:** PNG, captured at the frame's size and scale. The CLI captures the viewport, not the
  full page, so the image matches the window the rules checked.

## 3. Components

| Piece | Where | What it does |
|---|---|---|
| `reportZip(report, images, now)` | `packages/core/src/reportZip.ts` (new) | Builds the ZIP with `fflate` (already a core dependency): report.json, report.md with image links, index.json, screenshots. `images` maps a frame ref to PNG bytes |
| `readReportZip(bytes)` | same file | Checks limits first, then unzips with `fflate`, validates `report.json` with `parseReport` and `index.json` with zod, and checks each image's PNG signature. Returns `{ report, images: Map<ref, Uint8Array> }` or throws with a message |
| `toMarkdown(report, { images })` | `packages/core/src/report.ts` | An optional map of ref to relative path; each frame heading is followed by its image. Without the option, the output is unchanged |
| `--zip <file>` | `packages/cli` | During the check, `page.screenshot()` of each target's viewport after collecting. At the end, `reportZip` writes the file. `--out` and `--md` still work alone or together |
| Download ZIP | `apps/report` | After a Figma check, fetches each thumbnail's PNG (the URLs `loadFigmaReport` already returns) and builds the ZIP. After opening a ZIP, re-exports the same images |
| Open a ZIP | `apps/report` | The file input accepts `.json,.zip`. A ZIP goes through `readReportZip`; images become object URLs for the frame cards |

## 4. Limits and safety

`readReportZip` enforces these before trusting anything:

| Limit | Value | Why |
|---|---|---|
| ZIP size | 200 MB | The browser reads the whole file into memory |
| Uncompressed total | 500 MB, and at most 50× the ZIP size | Stops zip bombs. Totals come from the central directory, checked before inflating |
| Entries | 2 000 | A report with more frames than that isn't realistic |
| Paths | Only the layout in §2 | Other files are ignored, and a path with `..` or a leading `/` refuses the ZIP |
| Images | PNG signature and a 16 384 px maximum side | Anything else is dropped from the view, with a note |

Images are shown through `blob:` object URLs made from the checked bytes, never as `data:` URLs
from untrusted strings. The URLs are revoked when another report opens or the page closes. The
Markdown file is only written, never rendered by the viewer.

## 5. UI (apps/report)

- **Open:** "Open a report JSON" becomes "Open a report (JSON or ZIP)". Picking a ZIP shows "Read
  in this browser only, nothing is uploaded or kept".
- **Frame cards:** the screenshot replaces the grey placeholder. The existing `FrameOverlay` draws
  the hinge and safe zone over it, as it does on Figma thumbnails today.
- **Downloads:** next to **Report JSON** and **Markdown**, a **Download ZIP** button:
  - disabled with "No screenshots to include" when there are none;
  - labelled "Download ZIP (N screenshots)" otherwise.
- **Styling:** agent/03 styles the new controls. The components ship with plain class names:
  `report-zip`, `report-zip__note`, `report-zip__download`.

## 6. CLI

- `dobra check site <url> --zip foldable-report.zip` writes the package. It combines with `--out`
  and `--md`, and prints the ZIP's path in the summary.
- Each target is captured with `page.screenshot({ type: 'png' })` right after the layout is
  collected, before the unfold pass. A capture that fails leaves that frame out of `index.json` and
  adds a note; it never fails the run.
- The exit codes are unchanged.

## 7. Testing

- **Core:** a round trip through `reportZip` and `readReportZip`. The refusals: too big, too many
  entries, a `..` path, a non-PNG image, a missing `report.json`, an invalid report. `toMarkdown`
  with images, plus a snapshot without them to show the output is unchanged.
- **CLI:** unit tests of the `--zip` argument. An e2e case that checks a fixture page with `--zip`,
  unzips the result and finds one PNG per loaded target.
- **Report app:** opening a ZIP with a fake `File` shows the images; a refused ZIP shows a message;
  Download ZIP builds a package that `readReportZip` reads back.
- **Browser, by hand:**
  - `dobra check site … --zip`, then open the ZIP in Foldable Check and see the screenshots;
  - a Figma check, then Download ZIP, then open it again.

## 8. Ownership and delivery

| Slice | Area | Owner |
|---|---|---|
| 1. `reportZip`, `readReportZip` and `toMarkdown` images | packages/core | agent/01, agreed with agent/02 (core owner) |
| 2. `--zip` in the CLI | packages/cli | agent/01, under agent/02's CLI rules (run() testable, exit codes) |
| 3. Open and download a ZIP | apps/report | agent/01 builds unstyled; agent/03 styles |

Each slice has its own issue and PR, from main, with microcommits and CI green before a merge.

## 9. Risks

- **Figma thumbnail fetches:** checked on 2026-09-28. The PNGs that `GET /v1/images` returns are
  served with `Access-Control-Allow-Origin: *`, so the browser can fetch their bytes. Image URLs
  expire after a while, so Download ZIP fetches them when pressed; one that fails is left out with
  a note.
- **Large sites:** a check of many targets makes a large ZIP. PNG at the device scale can reach a
  few MB per image; the CLI reports the ZIP's size.
