# Foldable Check — web report

A read-only report for a Figma file: which foldable and dual-screen cells it covers, and what the
foldable rules find in each frame. It can also open a report made by the command-line checker.

## Run

```bash
npm run dev:report          # local development server
npm run build:report        # one self-contained dist/index.html to open or host anywhere
```

## Checking a Figma file

1. Paste the file link (`figma.com/design/…` or `figma.com/file/…`).
2. Paste a Figma personal access token with the `file_content:read` scope
   (Figma › Settings › Security › Personal access tokens).
3. Press **Check file**.

The report reads the file's pages, the frames on them (including frames inside Sections), each
frame's layers and the tag the Hinge plugin stores (`hinge` / `target`). Frames without a tag are
matched by name, then by size, and marked as lower confidence.

### The token

- It stays in the page's memory. Tick **Remember for this tab** to keep it in this tab's session
  storage; it is never put in the URL and never shown in errors.
- It is only sent to `api.figma.com`, in the `X-Figma-Token` header.

### Limits and errors

- Figma rate-limits its API. The report makes one file call, then loads frames in batches of 50,
  and caches the result for each file version, so checking the same unchanged file again costs one
  call. A rate-limited batch does not stop the report: those frames are listed under
  **Could not load** with the wait time.
- **403** means the token is invalid or lacks the scope; **404** means the file is not shared with
  the token's account.
- If the browser cannot reach `api.figma.com` (network, or a browser blocking the request), run
  the report behind a local proxy on `127.0.0.1`.

## Opening a command-line report

Use **Open a report JSON** with a file written by the command-line checker (or saved from this
page). A file that is not a report shows which field is wrong.

## Downloads

- **Report JSON** — the whole report, to attach to a ticket or reopen later.
- **Markdown** — a readable summary for tickets and pull requests.
- **Presets ZIP** — for every missing required cell, an SVG artboard with its hinge overlay (paste
  into Figma for editable layers) and `presets.json` for the plugin.
