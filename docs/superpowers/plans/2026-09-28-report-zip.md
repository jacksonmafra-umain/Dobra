# Report packages with screenshots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps are TDD: write the test, watch it fail, implement, watch it pass, commit.

**Goal:** one ZIP per foldable check (`report.json`, `report.md`, `index.json`, `screenshots/*.png`), written by the CLI (`--zip`) and by Foldable Check (**Download ZIP**), and opened by Foldable Check in the browser only.

**Architecture:**
- `packages/core/src/reportZip.ts` builds and reads the package with `fflate`, which is already a core dependency.
- `toMarkdown` gains an optional image map.
- The CLI captures a viewport PNG per target inside the deadline.
- The report app reads and writes ZIPs through the core functions.

**Spec:** `docs/superpowers/specs/2026-09-28-report-zip-design.md` (merged in #125).

## Global Constraints

- The `Report` JSON format is unchanged. Images are mapped in `index.json`: `{ version: 1, screenshots: { ref: path }, missing: { ref: reason } }`. Every frame appears in exactly one of the two maps.
- `toMarkdown(r)` without images stays byte-identical to today's output, pinned by a test.
- Reader limits: at most 200 MB zipped, 500 MB and 50× uncompressed, and 2 000 entries. Only the §2 paths are read, and `..` or a leading `/` refuses the ZIP. Images must carry the PNG signature and be at most 16 384 px on a side. All of this is checked before trusting anything.
- CLI rules (agent/02): `run()` stays unit-testable; the exit codes are unchanged; a failed screenshot never fails the run; captures stay within the deadline; the e2e test covers `--zip`.
- Report app (agent/03): the button is a plain `<button>` in the existing `.row`, and screenshots use the existing `.thumb` `<img>`. The classes are `report-zip`, `report-zip__note` and `report-zip__download`, with no CSS.
- Workflow: a labeled issue and PR per slice, from main, with microcommits and CI green; check typecheck by its exit code; no assistant mention.

## Review Focus

- A ZIP whose central directory under-reports sizes, so the entries inflate far past the stated size (a lying bomb). Expected: refused during inflation, not after.
- A second report file in the ZIP (`other/report.json`), or a `foldable-report/../x`. Expected: other files ignored; the traversal refuses the ZIP.
- A frame ref containing `/`, `#` or non-ASCII characters (website frame refs are `url#target`). Expected: a safe, unique file name.
- A PNG that's valid but 20 000 px on a side. Expected: left out of the view, with a note.
- Opening a second ZIP. Expected: the first ZIP's object URLs are revoked.

---

## Slice 1: core (branch `feat/report-zip-core`)

### Task 1: `toMarkdown` with images
- **Test:** the existing sample report's Markdown equals a stored string; that pins the output without images.
- **Test:** with `{ images: { [ref]: 'screenshots/001-x.png' } }`, the frame heading is followed by a blank line, then `![<name>](screenshots/001-x.png)`.
- **Implementation:** `toMarkdown(r: Report, opts: { images?: Record<string, string> } = {})`.
- **Commit:** "Let the Markdown report link a screenshot under each frame".

### Task 2: `reportZip`
- `reportZip(report: Report, images: Map<string, Uint8Array>, missing?: Record<string, string>): Uint8Array` writes `foldable-report/report.json`, `report.md`, `index.json` and `screenshots/<NNN>-<slug>.png`.
- `screenFile(index, frame)` builds the file name: the three-digit position, then the first target key (with `/` as `__`) or the name, cut down to `[a-z0-9_-]` and at most 80 characters.
- A frame without an image goes into `missing`, with the given reason or "no screenshot".
- **Tests:**
  - a round trip through `unzipSync`;
  - file names for a ref containing `url#target` and for non-ASCII names;
  - every frame is in exactly one of the two maps;
  - the Markdown links resolve to files in the ZIP.
- **Commit:** "Package a report, its Markdown and its screenshots as one ZIP".

### Task 3: `readReportZip`
- `readReportZip(bytes: Uint8Array): { report: Report; images: Map<string, Uint8Array>; notes: string[] }`, which throws a `ReportZipError` with a message.
- **Checks, in order:**
  1. the byte length;
  2. the entry count and each entry's `originalSize` total from the `unzipSync` filter, before inflating;
  3. paths;
  4. the length of each inflated entry against its stated size (lying sizes);
  5. `report.json` present and passing `parseReport`;
  6. `index.json` against a zod schema;
  7. each image's PNG signature and its IHDR width and height.
- **Tests:**
  - the round trip with Task 2;
  - refusals: too big, too many entries, over the total, a lying size, a `..` path, no `report.json`, an invalid report;
  - a non-PNG or oversized image is dropped with a note;
  - other files are ignored.
- **Commit:** "Read a report ZIP back, refusing oversized, malformed or unsafe packages".

---

## Slice 2: CLI (branch `feat/cli-report-zip`, after slice 1 merges)

### Task 4: `--zip <file>`
- `args.ts`: `SiteOptions.zip: string | null`, with a unit test.
- `checkSite`: `CheckOptions.screenshots?: boolean`. When set, it takes `page.screenshot({ type: 'png', timeout: capped(10_000) })` after collection. It returns `{ report, images, missing }` through a new `checkSiteWithScreens()` wrapper, so `checkSite`'s return type stays the same.
  - A failed capture goes into `missing` with its reason, and adds a note.
- `main.ts`: with `--zip`, it writes `reportZip(...)` through `io.writeFile` (which now takes `string | Uint8Array`) and prints the ZIP path and size.
- **Tests:**
  - `run()` with a fake check writes the ZIP;
  - a `checkSite` browser test gets a PNG per loaded target, and a `missing` entry for an unloaded one;
  - `e2e.test.ts`: `check site … --zip` reads back with `readReportZip`, `index.json` covers every frame, `parseReport` passes, and the exit code is unchanged.
- **Commits:**
  - "Take a screenshot of each target within the check's deadline";
  - "Write a report ZIP with --zip".

---

## Slice 3: report app (branch `feat/report-zip-app`, after slice 1 merges)

### Task 5: Open and download a ZIP
- `zipView.ts`:
  - `openReportFile(file: File)` returns `{ report, thumbnails: Record<ref, objectURL>, notes, revoke() }` for `.zip`, and the plain JSON path otherwise;
  - `packageForDownload(report, thumbnails, fetch)` fetches the images (Figma URLs, or the opened ZIP's object URLs) and calls `reportZip`. A failed fetch goes into `missing`.
- `ReportApp.tsx`:
  - the input accepts `.json,.zip`, with the note "Read in this browser only, nothing is uploaded or kept";
  - it calls `revoke()` on the previous report when another one opens;
  - a "Download ZIP (N screenshots)" button in the `.row`, disabled with "No screenshots to include" when there are none.
- **Tests:**
  - `openReportFile` with a ZIP from `reportZip`, and with a refused ZIP;
  - `packageForDownload` with a fake fetch, including a failing one;
  - the markup of the button and the note.
- **By hand:** `dobra check site … --zip`, then open the ZIP in Foldable Check and see the screenshots; and a Figma check, then Download ZIP, then open it again.
- **Commits:** "Open a report ZIP in the browser and show its screenshots", then "Download a report as a ZIP with its screenshots".
