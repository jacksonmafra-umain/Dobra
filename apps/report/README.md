# Foldable Check — web report

A read-only report for a Figma file or a website: which foldable and dual-screen cells it covers,
and what the foldable rules find in each frame. It also opens a report JSON or a report package
(ZIP) made by the command-line checker.

## Open it

- Hosted: <https://dobra-five.vercel.app/report/>.
- After the installer (see "Install on your Mac" in the root README): `dobra report` serves the
  report with a local site-check endpoint and opens it in the browser; Ctrl+C stops it.
- From the repo, `npm run dobra -- report` serves the same thing (see
  [Checking a website](#checking-a-website)).

## Run

```bash
npm run dev:report          # local development server
npm run build:report        # one self-contained dist/index.html to open or host anywhere
```

## Checking a Figma file

1. Choose **Figma file**.
2. Paste the file link (`figma.com/design/…` or `figma.com/file/…`).
3. Paste a Figma personal access token with the `file_content:read` scope
   (Figma › Settings › Security › Personal access tokens).
4. Press **Check file**.

The report reads the file's pages, the frames on them (it opens each Section and Group to find the
frames inside), each frame's layers and the tag the Dobra plugin stores (`dobra` / `target`). Frames without a tag are
matched by name, then by size, and marked as lower confidence.

### The token

- It stays in the page's memory. Tick **Remember for this tab** to keep it in this tab's session
  storage (unticking removes it); it is never put in the URL and never shown in errors.
- It is only sent to `api.figma.com`, in the `X-Figma-Token` header.

### Limits and errors

- Figma rate-limits its API. The report makes one file call, opens top-level Sections, then loads
  frames in batches of 50. A complete result is cached for each file version, so checking the same
  unchanged file again costs one call. A rate-limited batch does not stop the report: those frames
  are listed under **Could not load** with the wait time, and checking again loads them.
- **401 / 403** mean the token is invalid, expired or lacks the scope; **404** means the file is
  not shared with the token's account.
- If thumbnails cannot be loaded, the report still shows, with a note.
- If the browser cannot reach `api.figma.com` (network, or a browser blocking the request), run
  the report behind a local proxy on `127.0.0.1`.

## Checking a website

Choose **Website**, type an address (`www.example.com` means `https://www.example.com`; a pasted
Markdown link or `<…>` address also works) and pick the devices: the representative set, or one or
more device categories.

A website is checked in Chromium by the command-line checker, so the page first asks its host for a
check endpoint (`/api/health`):

- **Served by `dobra report` or `npm run dobra -- report`:** press **Check site**. The check runs on your machine, so
  `localhost` and staging addresses work, and the report opens when it finishes. One check runs at a
  time.
- **A hosted endpoint:** public addresses only, with a limit on devices per check, shown on the form.
- **No endpoint** (the hosted copy or a local build): the form fills in the command to run
  instead, `dobra check site <url>` for the installer's `dobra` command, with a **Copy command**
  button, the installer line for anyone who doesn't have it yet, and a GitHub Actions step. Run it
  on your machine, then open the `foldable-report.zip` it writes (see below). In a Dobra checkout,
  the form also shows the same check as `npm run dobra -- check site <url>`, after building the
  checker once with `npm run build:cli && npx playwright install chromium`.

When a check fails in a way that running it yourself would fix, the form shows the command too.

## Opening a report

Use **Or open a report (JSON or ZIP)** with a file written by the command-line checker, the
simulator, or saved from this page. The file is read in the browser only; nothing is uploaded or
kept. A file that is not a report shows which field is wrong.

- **Report JSON** (`foldable-report.json`): the report itself.
- **Report package** (`foldable-report.zip`, written by `dobra check site` unless `--no-zip`): a
  `foldable-report/` folder with `report.json`, `report.md`, `index.json` and a PNG screenshot per
  target. The frames show their screenshots, and the Markdown tab shows the package's own
  `report.md` with its images. A frame without a screenshot is listed with the reason the package
  gives. The package is refused if it is over 200 MB, would expand past a safe size, has more than
  2,000 files, unsafe or duplicate paths, or no `report.json`. A screenshot that is not a PNG or is
  larger than 16,384 px on a side is skipped with a note.

## The result

The report shows the coverage summary, then three tabs:

- **Findings** — each frame with its findings, its thumbnail or screenshot, and the coverage table.
- **Markdown** — the readable summary.
- **JSON** — the whole report, with **Copy JSON**.

## Downloads

- **Download JSON** — the whole report, to attach to a ticket or reopen later.
- **Download Markdown** — a readable summary for tickets and pull requests (a package's own
  `report.md` when one is open).
- **Presets ZIP** — for every missing required cell, an SVG artboard with its hinge overlay (paste
  into Figma for editable layers) and `presets.json` for the plugin.
