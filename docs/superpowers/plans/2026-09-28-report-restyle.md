# Web Report Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web report (`apps/report`, the "Inspector & Check" mockup) the Dobra visual identity from `@dobra/brand`, following the system's light or dark setting, without changing what it does.

**Architecture:** `report.css` keeps its small set of variables (`--bg`, `--panel`, …) but points them at `--dobra-*` tokens; a test forbids color literals anywhere else. The page root gets `data-theme` from `prefers-color-scheme` through a tiny tested helper, and the favicon is added from JavaScript so Vite inlines it in the single-file build. The visible changes are split into small presentational components (`ReportHeader`, `CoverageSummary`, `SeverityChip`, `FrameOverlay`) that are tested with `renderToStaticMarkup`, the same way `ReportNotes` already is.

**Tech Stack:** React 19, Vite 8 with `vite-plugin-singlefile`, plain CSS custom properties, Vitest 4 (node environment, `react-dom/server`), `@dobra/brand`, `@dobra/core`.

**Spec:** `docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md` §5 (§2 decisions, §3.1 token names).

## Global Constraints

- Visual language only: the same content and flow (file link and token, or a dropped JSON; then summary, coverage, frames, "Could not load", notes). No invented data. Emoji severity icons (`⛔ ⚠️ ℹ️`) become text chips `ERROR`, `WARN`, `INFO`; the coverage symbols `✓ ~ ✗` stay but become colored chips; a frame with no findings shows a `PASS` chip next to its existing "No problems found." text.
- Colors come only from `--dobra-*` tokens. A color literal may appear in `report.css` only as the value of one of its own custom properties (`--bg`, `--panel`, …), built from a token. The test in Task 1 enforces it.
- Theme follows `prefers-color-scheme`, set as `data-theme` on `<html>` and updated when the system setting changes.
- Type: Geist for headings, Inter for body, JetBrains Mono for inputs, target keys, rule ids, sizes, versions and counts.
- Radii: 4 px controls, 8 px cards. Primary button: solid `--dobra-fold` with `--dobra-on-fold` text.
- Severity colors: error `--dobra-hinge`, warn `--dobra-warn`, info `--dobra-accent-2`, pass `--dobra-pass`.
- Thumbnail overlays match the simulator: occluding hinge `--dobra-hinge` hatch-like fill, separating crease `--dobra-fold` line, flat crease dashed `--dobra-fold`, hinge safe zones a faint `--dobra-hinge`.
- The report is one self-contained HTML file: no network requests for fonts, icons or styles.
- Works at 375 px wide with no horizontal page scroll.
- Workflow: a GitHub issue labeled `enhancement` and `area:web`; branch `feat/report-restyle` from `main`; microcommits in plain English, no assistant mention, no trailers; a PR with `Closes #N`, same labels.

## Review Focus

- **The system theme changing while the page is open** (macOS switching to dark at sunset). The page must follow without a reload. Pinned in Task 1 (`followSystemTheme` listener test).
- **An old or partial report**: no findings at all, no coverage cells, `byCategory` empty, or `required` 0 for every category. The coverage figure must not show `NaN%` and the ring must not break. Pinned in Task 3 (`coveragePercent` tests for empty and zero).
- **An unknown severity** in a hand-edited or future report JSON. It must render as `INFO`, not crash. Pinned in Task 4 (`SeverityChip` test).
- **The single-file build** must carry the fonts and the favicon inline. Pinned in Task 5 (grep of `dist/index.html`).
- **375 px wide** with a long Figma URL typed in and wide coverage tables. Pinned in Task 5 (overflow check in the browser).

---

## File Structure

```
apps/report/
  package.json                 add "@dobra/brand": "*"
  index.html                   unchanged (the favicon is added from main.tsx)
  src/main.tsx                 import brand CSS, follow the system theme, add the favicon
  src/page.ts                  followSystemTheme(win, root), addFavicon(doc, href)
  src/page.test.ts
  src/report.css               token mapping and restyle
  src/style.test.ts            no color literals outside report.css's own custom properties
  src/ReportHeader.tsx         logo (picture element), heading, catalog badge
  src/CoverageSummary.tsx      coveragePercent(matrix) and the ring
  src/SeverityChip.tsx         severityLabel(severity) and the chip
  src/FrameOverlay.tsx         hingeKind(hinge) and the thumbnail SVG
  src/components.test.ts       renderToStaticMarkup tests for the four components
  src/fixtures/sampleReport.ts a realistic Report for screenshots (test support only)
  src/fixtures/sampleReport.test.ts
  src/ReportApp.tsx            use the components; class names for banners and chips
```

---

### Task 0: Issue, branch and a sample report

**Files:**
- Create: `apps/report/src/fixtures/sampleReport.ts`, `apps/report/src/fixtures/sampleReport.test.ts`

**Interfaces:**
- Produces: `export function sampleReport(): Report`, a report with a tagged Surface Duo 2 frame whose button crosses the hinge (an error finding), an untagged Galaxy Z Flip 7 cover frame (matched by size), a frame of an unknown size, one unloaded frame, and one note. Used only by tests and by the screenshot steps.

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Restyle the web report with the Dobra visual identity" \
  --label enhancement --label area:web \
  --body "Slice 3 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md (§5). Point the report at @dobra/brand tokens, following the system's light or dark setting: the logo and heading, a brand input panel, the coverage figure with a ring, severity chips on findings, frame overlays in the simulator's colors, and the favicon. Same content and flow."
git fetch origin && git switch -c feat/report-restyle origin/main && npm install
```

Note the issue number as `N`.

- [ ] **Step 2: Write the failing fixture test**

`apps/report/src/fixtures/sampleReport.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { parseReport } from '@dobra/core/report';
import { describe, expect, it } from 'vitest';
import { sampleReport } from './sampleReport';

// For screenshots: SAMPLE_REPORT_OUT=<path> npm test -w @dobra/report -- src/fixtures writes the JSON.
if (process.env.SAMPLE_REPORT_OUT) writeFileSync(process.env.SAMPLE_REPORT_OUT, JSON.stringify(sampleReport(), null, 2));

describe('sampleReport', () => {
  it('is a valid report with an error, a size-matched frame, an unknown size, an unloaded frame and a note', () => {
    const r = parseReport(JSON.parse(JSON.stringify(sampleReport())));
    expect(r.frames.flatMap((f) => f.findings).some((f) => f.severity === 'error')).toBe(true);
    expect(r.frames.map((f) => f.confidence).sort()).toEqual(['none', 'size', 'tag']);
    expect(r.unloaded).toHaveLength(1);
    expect(r.notes).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w @dobra/report -- src/fixtures/sampleReport.test.ts`
Expected: FAIL, "Cannot find module './sampleReport'".

- [ ] **Step 4: Write the fixture**

`apps/report/src/fixtures/sampleReport.ts`:

```ts
// A realistic report for component tests and screenshots: one frame per confidence, an error
// finding on the Surface Duo 2 hinge, an unloaded frame and a note. Test support only.
import { loadCatalog } from '@dobra/core/catalog/load';
import type { GeoNode } from '@dobra/core/geo';
import { buildReport, type Report } from '@dobra/core/report';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

// A call-to-action button centred on the Duo's 26 dp hinge at x = 537.
const duo: GeoNode[] = [
  { id: 'n1', name: 'Order now', role: 'interactive', rect: box(470, 600, 160, 48), children: [{ id: 'n2', name: 'Label', role: 'text', rect: box(490, 612, 120, 24), fontSize: 16, chars: 9 }] },
];
const cover: GeoNode[] = [{ id: 'c1', name: 'Title', role: 'text', rect: box(16, 16, 200, 24), fontSize: 16, chars: 12 }];

export function sampleReport(): Report {
  const report = buildReport(
    loadCatalog(),
    { kind: 'figma', ref: 'KEY1', name: 'Checkout flows', fileVersion: '42' },
    [
      { ref: '1:1', name: 'Checkout · Duo', page: 'Screens', width: 1100, height: 756, tag: 'surface-duo-2/spanned/spanned/landscape', root: duo },
      { ref: '1:2', name: 'Cover', page: 'Screens', width: 352, height: 339, tag: '', root: cover },
      { ref: '1:3', name: 'Scratch', page: 'Screens', width: 777, height: 555, tag: '', root: [] },
      { ref: '1:4', name: 'Archive', page: 'Old', width: 390, height: 844, tag: '', root: null, reason: 'Rate limited by Figma: retry in 12 s.' },
    ],
    new Date('2026-09-28T10:00:00Z'),
  );
  return { ...report, notes: ['Frame thumbnails come from the Figma images API and may lag the file by a minute.'] };
}
```

- [ ] **Step 5: Run it**

Run: `npm test -w @dobra/report -- src/fixtures/sampleReport.test.ts`
Expected: PASS. If the Duo button does not produce an `error` finding (the rule engine decides), move the button so it straddles x = 537 more fully (for example `box(500, 600, 80, 48)`) and rerun; if the cover frame is matched by name instead of size, rename it to `Frame 12`. Record the change as a ruling.

- [ ] **Step 6: Commit**

```bash
git add apps/report/src/fixtures
git commit -m "Add a sample report for the web report's tests and screenshots"
```

---

### Task 1: Brand wiring, system theme and favicon

**Files:**
- Modify: `apps/report/package.json`, `apps/report/src/main.tsx`, `apps/report/src/report.css:1-22`
- Create: `apps/report/src/page.ts`, `apps/report/src/page.test.ts`, `apps/report/src/style.test.ts`

**Interfaces:**
- Produces: `export function followSystemTheme(win: Pick<Window, 'matchMedia'>, root: { dataset: DOMStringMap }): () => void` (sets `root.dataset.theme` to `'dark'` or `'light'` now and on every change; returns an unsubscribe); `export function addFavicon(doc: Pick<Document, 'head' | 'createElement'>, href: string): void` (appends one `<link rel="icon">`).
- Produces: `report.css` variables `--bg`, `--panel`, `--flyout`, `--field`, `--text`, `--muted`, `--border`, `--border-strong`, `--accent`, `--on-accent`, `--accent-soft`, `--bad`, `--bad-soft`, `--warn`, `--warn-soft`, `--ok`, `--ok-soft`, `--info`, `--info-soft`. Later tasks use only these or `--dobra-*`.

- [ ] **Step 1: Write the failing tests**

`apps/report/src/page.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addFavicon, followSystemTheme } from './page';

function fakeWindow(dark: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const query = {
    matches: dark,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.splice(listeners.indexOf(l), 1),
  };
  return { win: { matchMedia: () => query } as unknown as Pick<Window, 'matchMedia'>, change: (m: boolean) => listeners.forEach((l) => l({ matches: m })), listeners };
}

describe('followSystemTheme', () => {
  it('starts from the system setting and follows it when it changes', () => {
    const { win, change } = fakeWindow(true);
    const root = { dataset: {} as DOMStringMap };
    followSystemTheme(win, root);
    expect(root.dataset.theme).toBe('dark');
    change(false);
    expect(root.dataset.theme).toBe('light');
  });

  it('stops following once unsubscribed', () => {
    const { win, listeners } = fakeWindow(false);
    const stop = followSystemTheme(win, { dataset: {} as DOMStringMap });
    stop();
    expect(listeners).toHaveLength(0);
  });
});

describe('addFavicon', () => {
  it('adds one icon link with the given href', () => {
    const appended: { rel: string; href: string }[] = [];
    const doc = { head: { append: (el: { rel: string; href: string }) => appended.push(el) }, createElement: () => ({ rel: '', href: '' }) };
    addFavicon(doc as unknown as Pick<Document, 'head' | 'createElement'>, 'data:image/svg+xml,x');
    expect(appended).toEqual([{ rel: 'icon', href: 'data:image/svg+xml,x' }]);
  });
});
```

`apps/report/src/style.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const OWN = /^--(bg|panel|flyout|field|text|muted|border|border-strong|accent|on-accent|accent-soft|bad|bad-soft|warn|warn-soft|ok|ok-soft|info|info-soft)$/;

function declarations(source: string): [string, string][] {
  return source
    .replace(/[^{}]*\{/g, ';')
    .replace(/\}/g, ';')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
}

describe('report.css', () => {
  it('uses no color literal outside its own custom properties', () => {
    expect(declarations(css).filter(([p, v]) => COLOR.test(v) && !OWN.test(p))).toEqual([]);
  });
  it('builds each of its custom properties from a brand token', () => {
    const own = declarations(css).filter(([p]) => OWN.test(p));
    expect(own.length).toBe(19);
    for (const [p, v] of own) expect(v, p).toMatch(/var\(--dobra-/);
  });
  it('leaves theming to the page root instead of a media query', () => {
    expect(css).not.toContain('prefers-color-scheme');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @dobra/report -- src/page.test.ts src/style.test.ts`
Expected: FAIL: `./page` not found; `style.test.ts` lists offenders such as `['color', '#fff']` and fails the `prefers-color-scheme` check.

- [ ] **Step 3: Write `page.ts`**

```ts
// Page-level setup that has to happen outside React: the theme on <html> and the favicon.

/** Mirrors prefers-color-scheme onto root.dataset.theme now and whenever it changes. */
export function followSystemTheme(win: Pick<Window, 'matchMedia'>, root: { dataset: DOMStringMap }): () => void {
  const query = win.matchMedia('(prefers-color-scheme: dark)');
  const apply = (dark: boolean) => (root.dataset.theme = dark ? 'dark' : 'light');
  apply(query.matches);
  const listener = (e: { matches: boolean }) => apply(e.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Adds the favicon from JavaScript, so Vite can inline it in the single-file build. */
export function addFavicon(doc: Pick<Document, 'head' | 'createElement'>, href: string): void {
  const link = doc.createElement('link');
  link.rel = 'icon';
  link.href = href;
  doc.head.append(link);
}
```

- [ ] **Step 4: Wire it up**

Add `"@dobra/brand": "*"` to `apps/report/package.json` `dependencies` (before `@dobra/core`) and run `npm install`.

Replace `apps/report/src/main.tsx` with:

```tsx
import { createRoot } from 'react-dom/client';
import favicon from '@dobra/brand/favicon.svg';
import '@dobra/brand/fonts.css';
import '@dobra/brand/tokens.css';
import { addFavicon, followSystemTheme } from './page';
import { ReportApp } from './ReportApp';
import './report.css';

followSystemTheme(window, document.documentElement);
addFavicon(document, favicon);
createRoot(document.getElementById('root')!).render(<ReportApp />);
```

Replace lines 1–22 of `report.css` (the `:root` block and the `prefers-color-scheme` block) with:

```css
/* The web report's palette, all from @dobra/brand. <html> carries data-theme from the system
   setting (src/page.ts), so these follow light and dark. */
:root {
  --bg: var(--dobra-bg);
  --panel: var(--dobra-panel);
  --flyout: var(--dobra-flyout);
  --field: var(--dobra-field);
  --text: var(--dobra-text);
  --muted: var(--dobra-muted);
  --border: var(--dobra-border);
  --border-strong: var(--dobra-border-strong);
  --accent: var(--dobra-fold);
  --on-accent: var(--dobra-on-fold);
  --accent-soft: color-mix(in srgb, var(--dobra-fold) 14%, transparent);
  --bad: var(--dobra-hinge);
  --bad-soft: color-mix(in srgb, var(--dobra-hinge) 14%, transparent);
  --warn: var(--dobra-warn);
  --warn-soft: color-mix(in srgb, var(--dobra-warn) 14%, transparent);
  --ok: var(--dobra-pass);
  --ok-soft: color-mix(in srgb, var(--dobra-pass) 14%, transparent);
  --info: var(--dobra-accent-2);
  --info-soft: color-mix(in srgb, var(--dobra-accent-2) 14%, transparent);
}
```

Because `--bg` and friends are set on `:root` from tokens that switch on `[data-theme]` of the same element, they follow the theme. Then replace the literals left in the file: `button.primary` `color: #fff` → `color: var(--on-accent)`; the `body` `font` → `var(--dobra-type-body-lg)`.

- [ ] **Step 5: Run the tests**

Run: `npm test -w @dobra/report && npm run typecheck -w @dobra/report`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Look at it**

Add a `report` entry to the Browser pane's launch configuration if there is none (npm `run dev` in `apps/report`, a free port; do not commit it) and open it. Screenshot in the system's current theme; emulate the other with `resize_window` `colorScheme` and screenshot again. Expected: the page switches between the dark obsidian palette and the light one, the favicon shows in the tab.

- [ ] **Step 7: Commit**

```bash
git add apps/report/package.json apps/report/src/main.tsx apps/report/src/page.ts apps/report/src/page.test.ts apps/report/src/report.css apps/report/src/style.test.ts package-lock.json
git commit -m "Point the web report at the Dobra brand tokens and follow the system theme"
```

---

### Task 2: Header, input panel, buttons and drop zone

**Files:**
- Create: `apps/report/src/ReportHeader.tsx`
- Create: `apps/report/src/components.test.ts`
- Modify: `apps/report/src/ReportApp.tsx:68-101`, `apps/report/src/report.css`

**Interfaces:**
- Consumes: `@dobra/brand/logo.svg`, `@dobra/brand/logo-light.svg`; `loadCatalog().version` from `@dobra/core/catalog/load`.
- Produces: `export function ReportHeader({ catalogVersion }: { catalogVersion: string })`, rendering the logo as a `<picture>` (light-lettered logo by default, dark-lettered logo under `(prefers-color-scheme: light)`), the `Foldable Check` heading, a mono badge `catalog <version>`, and the existing description paragraph.

The badge shows the catalog version, the one version the report always knows before a file is loaded; record it as a ruling (the spec says "report version").

- [ ] **Step 1: Write the failing test**

`apps/report/src/components.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportHeader } from './ReportHeader';

const html = (el: Parameters<typeof createElement>[0], props: object) => renderToStaticMarkup(createElement(el as never, props));

describe('ReportHeader', () => {
  it('shows the logo for each system theme, the heading and the catalog badge', () => {
    const out = html(ReportHeader, { catalogVersion: '0.5.0' });
    expect(out).toContain('<picture');
    expect(out).toContain('media="(prefers-color-scheme: light)"');
    expect(out).toContain('alt="Dobra"');
    expect(out).toContain('<h1>Foldable Check</h1>');
    expect(out).toContain('catalog 0.5.0');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @dobra/report -- src/components.test.ts`
Expected: FAIL, "Cannot find module './ReportHeader'".

- [ ] **Step 3: Write the component**

`apps/report/src/ReportHeader.tsx`:

```tsx
import logoDark from '@dobra/brand/logo.svg';
import logoLight from '@dobra/brand/logo-light.svg';

/** The page header: the logo for the system theme, the heading, and the catalog the checks use. */
export function ReportHeader({ catalogVersion }: { catalogVersion: string }) {
  return (
    <header className="page-header">
      <div className="page-header__brand">
        <picture>
          <source srcSet={logoLight} media="(prefers-color-scheme: light)" />
          <img className="page-header__logo" src={logoDark} alt="Dobra" />
        </picture>
        <span className="badge badge--mono">catalog {catalogVersion}</span>
      </div>
      <h1>Foldable Check</h1>
      <p className="muted">Coverage and foldable rule findings for a Figma file, or for a report made by the command-line checker.</p>
    </header>
  );
}
```

- [ ] **Step 4: Run it**

Run: `npm test -w @dobra/report -- src/components.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it and restyle the panel**

In `ReportApp.tsx`: import `ReportHeader`; replace the `<h1>Foldable Check</h1>` and the paragraph after it with `<ReportHeader catalogVersion={catalog.version} />`; wrap the file-input line in the drop zone as:

```tsx
        <label className="drop">
          <span>Or open a report JSON</span>
          <span className="muted">made by the command-line checker or the simulator</span>
          <input type="file" accept="application/json,.json" aria-label="Report JSON" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
        </label>
```

"made by the command-line checker or the simulator" is the one added line; both are real sources of report JSON. Record it as a ruling.

In `report.css`, replace the matching rules and add the new ones:

```css
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: var(--dobra-type-body-lg); }
main { max-width: 1080px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font: var(--dobra-type-headline-lg); letter-spacing: var(--dobra-tracking-headline-lg); margin: 8px 0 4px; }
h2 { font: var(--dobra-type-headline-sm); letter-spacing: var(--dobra-tracking-headline-sm); margin: 32px 0 12px; }
.page-header { margin-bottom: 24px; }
.page-header__brand { display: flex; align-items: center; gap: 10px; }
.page-header__logo { height: 24px; width: auto; display: block; }
.panel { background: var(--panel); backdrop-filter: blur(16px); border: 1px solid var(--border); border-radius: var(--dobra-radius-lg); padding: 20px; }
.inputs { display: grid; gap: 14px; }
.inputs label { display: grid; gap: 6px; font: var(--dobra-type-body-md); color: var(--muted); }
input[type='url'], input[type='password'] { font: var(--dobra-type-label-lg); padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: var(--dobra-radius); background: var(--field); color: var(--text); width: 100%; min-width: 0; }
input[type='url']:focus-visible, input[type='password']:focus-visible, button:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; box-shadow: 0 0 0 3px var(--accent-soft); }
input[type='checkbox'] { accent-color: var(--accent); width: 14px; height: 14px; }
button { font: 500 13px/1 var(--dobra-font-body); padding: 10px 14px; border-radius: var(--dobra-radius); border: 1px solid var(--border); background: var(--field); color: var(--text); cursor: pointer; }
button.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; padding: 12px 20px; }
.drop { border: 1px dashed var(--border-strong); border-radius: var(--dobra-radius-lg); padding: 20px; display: grid; justify-items: center; gap: 6px; text-align: center; cursor: pointer; }
.drop input { max-width: 100%; }
.badge { font: var(--dobra-type-label-sm); letter-spacing: var(--dobra-tracking-label-sm); border: 1px solid var(--border); border-radius: var(--dobra-radius-sm); padding: 3px 6px; margin-left: 4px; color: var(--muted); }
.badge--mono { text-transform: none; }
```

Delete the old versions of these rules.

- [ ] **Step 6: Run everything and look**

Run: `npm test -w @dobra/report && npm run typecheck -w @dobra/report`
Expected: PASS. Screenshot the empty page in dark and light. Expected: logo with the badge, the heading in Geist, mono inputs with a cyan focus ring, the cyan primary button, the dashed drop zone.

- [ ] **Step 7: Commit**

```bash
git add apps/report/src/ReportHeader.tsx apps/report/src/components.test.ts apps/report/src/ReportApp.tsx apps/report/src/report.css
git commit -m "Give the web report the Dobra header, input panel and buttons"
```

---

### Task 3: Coverage figure, ring and coverage chips

**Files:**
- Create: `apps/report/src/CoverageSummary.tsx`
- Modify: `apps/report/src/components.test.ts`, `apps/report/src/ReportApp.tsx` (the `ReportView` summary line and coverage table), `apps/report/src/report.css`

**Interfaces:**
- Consumes: `CoverageMatrix` from `@dobra/core/coverage`; `Report` from `@dobra/core/report`.
- Produces: `export function coveragePercent(m: Pick<CoverageMatrix, 'byCategory'>): number | null` (present over required across categories, rounded to a whole percent, `null` when nothing is required); `export function CoverageSummary({ report }: { report: Report })` (the figure, an SVG ring, the frame and finding counts as mono stats).

- [ ] **Step 1: Write the failing tests**

Append to `components.test.ts` (add `CoverageSummary, coveragePercent` import from `./CoverageSummary` and `sampleReport` from `./fixtures/sampleReport`):

```ts
describe('coveragePercent', () => {
  it('sums present over required across categories', () => {
    expect(coveragePercent({ byCategory: { phone: { required: 4, present: 3 }, 'foldable-book': { required: 4, present: 1 } } })).toBe(50);
  });
  it('rounds to a whole percent', () => {
    expect(coveragePercent({ byCategory: { phone: { required: 3, present: 2 } } })).toBe(67);
  });
  it('is null when nothing is required, never NaN', () => {
    expect(coveragePercent({ byCategory: {} })).toBeNull();
    expect(coveragePercent({ byCategory: { phone: { required: 0, present: 0 } } })).toBeNull();
  });
});

describe('CoverageSummary', () => {
  it('shows the figure, a ring and the counts from the report', () => {
    const r = sampleReport();
    const out = html(CoverageSummary, { report: r });
    const pct = coveragePercent(r.coverage);
    expect(out).toContain(pct === null ? '—' : `${pct}%`);
    expect(out).toContain('<svg');
    expect(out).toContain(`${r.frames.length} frames`);
  });
  it('shows a dash instead of a percentage when nothing is required', () => {
    const r = { ...sampleReport(), coverage: { cells: [], byCategory: {} } };
    const out = html(CoverageSummary, { report: r });
    expect(out).toContain('—');
    expect(out).not.toContain('NaN');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @dobra/report -- src/components.test.ts`
Expected: FAIL, "Cannot find module './CoverageSummary'".

- [ ] **Step 3: Write the component**

`apps/report/src/CoverageSummary.tsx`:

```tsx
import type { CoverageMatrix } from '@dobra/core/coverage';
import type { Report } from '@dobra/core/report';

/** Present over required across all categories, as a whole percent; null when nothing is required. */
export function coveragePercent(m: Pick<CoverageMatrix, 'byCategory'>): number | null {
  let required = 0;
  let present = 0;
  for (const c of Object.values(m.byCategory)) {
    required += c.required;
    present += c.present;
  }
  return required > 0 ? Math.round((present / required) * 100) : null;
}

const R = 34;
const C = 2 * Math.PI * R;

/** The report's headline: how much of what is required is covered, and what was checked. */
export function CoverageSummary({ report }: { report: Report }) {
  const pct = coveragePercent(report.coverage);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of report.frames) for (const x of f.findings) counts[x.severity] = (counts[x.severity] ?? 0) + 1;
  return (
    <section className="summary panel" aria-label="Coverage summary">
      <div>
        <div className="summary__eyebrow">Required coverage</div>
        <div className="summary__figure">{pct === null ? '—' : `${pct}%`}</div>
        <div className="summary__stats">
          <span>{report.frames.length} frames</span>
          <span className="sev sev--error">{counts.error} error</span>
          <span className="sev sev--warn">{counts.warn} warn</span>
          <span className="sev sev--info">{counts.info} info</span>
        </div>
      </div>
      <svg className="summary__ring" viewBox="0 0 80 80" width="80" height="80" aria-hidden>
        <circle cx="40" cy="40" r={R} className="summary__track" />
        <circle cx="40" cy="40" r={R} className="summary__value" strokeDasharray={`${((pct ?? 0) / 100) * C} ${C}`} transform="rotate(-90 40 40)" />
      </svg>
    </section>
  );
}
```

"Required coverage" labels the existing figure; it is the only new wording. Record it as a ruling.

- [ ] **Step 4: Run it**

Run: `npm test -w @dobra/report -- src/components.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it, and chip the coverage table**

In `ReportView` (`ReportApp.tsx`): keep the `<h2>` with the file name and the "Generated …" line, but remove the `· {ICON.error} …` counts from that line (they move into the summary). Render `<CoverageSummary report={report} />` right after it, before the download buttons row. Remove the now-unused `counts` `useMemo` and the `ICON` constant only if nothing else uses them (Task 4 replaces the last use).

In the coverage table, replace `<td title={c.frames.join(', ')}>{STATUS[c.status]}</td>` with:

```tsx
              <td title={c.frames.join(', ')}>
                <span className={`chip chip--${c.status}`}>{STATUS[c.status]}</span>
              </td>
```

and wrap the table in `<div className="table-scroll">…</div>`.

Add to `report.css`:

```css
.summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 16px 0; }
.summary__eyebrow { font: var(--dobra-type-label-md); letter-spacing: var(--dobra-tracking-label-md); text-transform: uppercase; color: var(--muted); }
.summary__figure { font: 600 44px/1.1 var(--dobra-font-display); letter-spacing: -0.02em; margin: 4px 0 8px; }
.summary__stats { display: flex; flex-wrap: wrap; gap: 6px 14px; font: var(--dobra-type-label-lg); color: var(--muted); }
.summary__ring { flex: none; }
.summary__track { fill: none; stroke: var(--border-strong); stroke-width: 8; }
.summary__value { fill: none; stroke: var(--accent); stroke-width: 8; stroke-linecap: round; }
.sev--error { color: var(--bad); }
.sev--warn { color: var(--warn); }
.sev--info { color: var(--info); }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font: var(--dobra-type-body-md); }
th { font: var(--dobra-type-label-md); letter-spacing: var(--dobra-tracking-label-md); text-transform: uppercase; color: var(--muted); }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
.chip { display: inline-block; min-width: 22px; text-align: center; font: 600 11px/1 var(--dobra-font-mono); padding: 4px 6px; border-radius: var(--dobra-radius-sm); }
.chip--present { color: var(--ok); background: var(--ok-soft); }
.chip--present-by-size { color: var(--warn); background: var(--warn-soft); }
.chip--missing { color: var(--bad); background: var(--bad-soft); }
```

(Replace the old `table` and `th, td` rules.)

- [ ] **Step 6: Run everything and look**

Run: `npm test -w @dobra/report && npm run typecheck -w @dobra/report`
Expected: PASS. Write the sample report with `SAMPLE_REPORT_OUT="$SCRATCH/sample.report.json" npm test -w @dobra/report -- src/fixtures`, read the file, and load it in the page with the Browser pane's JavaScript tool: build a `File` from the JSON text, put it on the `input[type=file]` through a `DataTransfer`, and dispatch a `change` event. Screenshot the summary and the coverage table in dark and light. Later tasks load the sample the same way.

- [ ] **Step 7: Commit**

```bash
git add apps/report/src/CoverageSummary.tsx apps/report/src/components.test.ts apps/report/src/ReportApp.tsx apps/report/src/report.css
git commit -m "Show the report's coverage as a figure with a ring, and chip the coverage table"
```

---

### Task 4: Severity chips and frame overlays

**Files:**
- Create: `apps/report/src/SeverityChip.tsx`, `apps/report/src/FrameOverlay.tsx`
- Modify: `apps/report/src/components.test.ts`, `apps/report/src/ReportApp.tsx` (`FrameCard`), `apps/report/src/report.css`

**Interfaces:**
- Consumes: `PresetFrame` from `@dobra/core/presets` (`hinges: { rect; separating; occludes }[]`, `safeZones`).
- Produces: `export function severityLabel(severity: string): 'ERROR' | 'WARN' | 'INFO'`; `export function SeverityChip({ severity }: { severity: string })` (a `span.chip.chip--<error|warn|info>`); `export function PassChip()` (`span.chip.chip--pass` reading `PASS`); `export function hingeKind(h: { separating: boolean; occludes: boolean }): 'occludes' | 'line' | 'flat'`; `export function FrameOverlay({ preset, width, height }: { preset: PresetFrame; width: number; height: number })`.

- [ ] **Step 1: Write the failing tests**

Append to `components.test.ts` (import `PassChip, SeverityChip, severityLabel` from `./SeverityChip` and `FrameOverlay, hingeKind` from `./FrameOverlay`):

```ts
describe('severity chips', () => {
  it('labels each severity', () => {
    expect(severityLabel('error')).toBe('ERROR');
    expect(severityLabel('warn')).toBe('WARN');
    expect(severityLabel('info')).toBe('INFO');
  });
  it('reads an unknown severity as INFO instead of crashing', () => {
    expect(severityLabel('fatal')).toBe('INFO');
    expect(html(SeverityChip, { severity: 'fatal' })).toBe('<span class="chip chip--info">INFO</span>');
  });
  it('renders the pass chip', () => {
    expect(html(PassChip, {})).toBe('<span class="chip chip--pass">PASS</span>');
  });
});

describe('frame overlay', () => {
  it('draws each kind of hinge the way the simulator does', () => {
    expect(hingeKind({ separating: true, occludes: true })).toBe('occludes');
    expect(hingeKind({ separating: true, occludes: false })).toBe('line');
    expect(hingeKind({ separating: false, occludes: false })).toBe('flat');
  });
  it('uses classes, not color attributes, so the theme applies', () => {
    const preset = { safeZones: [{ x: 500, y: 0, width: 100, height: 756 }], hinges: [{ rect: { x: 537, y: 0, width: 26, height: 756 }, separating: true, occludes: true }] };
    const out = html(FrameOverlay, { preset, width: 1100, height: 756 });
    expect(out).toContain('class="overlay-safe"');
    expect(out).toContain('class="overlay-hinge overlay-hinge--occludes"');
    expect(out).not.toMatch(/fill="#/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @dobra/report -- src/components.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the components**

`apps/report/src/SeverityChip.tsx`:

```tsx
export type SeverityLabel = 'ERROR' | 'WARN' | 'INFO';

/** The chip text for a finding's severity; anything unrecognised reads as information. */
export function severityLabel(severity: string): SeverityLabel {
  return severity === 'error' ? 'ERROR' : severity === 'warn' ? 'WARN' : 'INFO';
}

export function SeverityChip({ severity }: { severity: string }) {
  const label = severityLabel(severity);
  return <span className={`chip chip--${label.toLowerCase()}`}>{label}</span>;
}

export function PassChip() {
  return <span className="chip chip--pass">PASS</span>;
}
```

`apps/report/src/FrameOverlay.tsx`:

```tsx
import type { PresetFrame } from '@dobra/core/presets';

/** Same three kinds as the simulator: a physical gap, a separating crease, a flat crease. */
export function hingeKind(h: { separating: boolean; occludes: boolean }): 'occludes' | 'line' | 'flat' {
  return h.occludes ? 'occludes' : h.separating ? 'line' : 'flat';
}

/** The target's hinges and hinge safe zones over a frame thumbnail, colored by CSS classes. */
export function FrameOverlay({ preset, width, height }: { preset: Pick<PresetFrame, 'safeZones' | 'hinges'>; width: number; height: number }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {preset.safeZones.map((z, i) => (
        <rect key={`z${i}`} className="overlay-safe" x={z.x} y={z.y} width={z.width} height={z.height} />
      ))}
      {preset.hinges.map((h, i) => (
        <rect key={`h${i}`} className={`overlay-hinge overlay-hinge--${hingeKind(h)}`} x={h.rect.x} y={h.rect.y} width={Math.max(h.rect.width, 2)} height={Math.max(h.rect.height, 2)} />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Run them**

Run: `npm test -w @dobra/report -- src/components.test.ts`
Expected: PASS.

- [ ] **Step 5: Use them in `FrameCard`**

In `ReportApp.tsx` `FrameCard`:
- Replace the `{preset && (<svg …>…</svg>)}` block with `{preset && <FrameOverlay preset={preset} width={frame.width} height={frame.height} />}`.
- Replace the size line's `{frame.width}×{frame.height}` with `<span className="mono">{frame.width}×{frame.height}</span>`.
- Replace `{frame.confidence !== 'none' && frame.findings.length === 0 && <p className="muted">No problems found.</p>}` with:

```tsx
        {frame.confidence !== 'none' && frame.findings.length === 0 && (
          <p className="finding">
            <PassChip /> <span className="muted">No problems found.</span>
          </p>
        )}
```

- Replace each finding row with:

```tsx
          <div key={i} className="finding">
            <SeverityChip severity={x.severity} />
            <div className="finding__body">
              <strong className="mono">{x.ruleId}</strong>
              {x.estimated && <span className="badge">estimated</span>}
              <div>{x.message}</div>
            </div>
          </div>
```

- Delete the `ICON` constant and the `counts` memo if no longer used (the typecheck with `noUnusedLocals` tells you).

Add to `report.css` (replacing the old `.finding`, `.card`, `.card__body`, `.thumb` rules):

```css
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--dobra-radius-lg); overflow: hidden; }
.card__body { padding: 14px; display: grid; gap: 8px; }
.thumb { position: relative; background: var(--field); border-bottom: 1px solid var(--border); }
.thumb img, .thumb svg { display: block; width: 100%; height: auto; }
.thumb svg { position: absolute; inset: 0; height: 100%; }
.overlay-safe { fill: var(--bad); fill-opacity: 0.1; }
.overlay-hinge--occludes { fill: var(--bad); fill-opacity: 0.45; }
.overlay-hinge--line { fill: var(--accent); }
.overlay-hinge--flat { fill: none; stroke: var(--accent); stroke-dasharray: 6 4; stroke-width: 2; vector-effect: non-scaling-stroke; }
.finding { display: flex; align-items: flex-start; gap: 8px; margin: 0; }
.finding__body { min-width: 0; overflow-wrap: anywhere; }
.mono { font-family: var(--dobra-font-mono); }
.chip--error { color: var(--bad); background: var(--bad-soft); }
.chip--warn { color: var(--warn); background: var(--warn-soft); }
.chip--info { color: var(--info); background: var(--info-soft); }
.chip--pass { color: var(--ok); background: var(--ok-soft); }
```

- [ ] **Step 6: Run everything and look**

Run: `npm test -w @dobra/report && npm run typecheck -w @dobra/report`
Expected: PASS. With the sample report loaded, screenshot the frame cards in dark and light. Expected: the Duo frame shows a rose hinge band and an ERROR chip with `hinge-content` in mono; the cover frame shows WARN or PASS; chips are readable in both themes.

- [ ] **Step 7: Commit**

```bash
git add apps/report/src/SeverityChip.tsx apps/report/src/FrameOverlay.tsx apps/report/src/components.test.ts apps/report/src/ReportApp.tsx apps/report/src/report.css
git commit -m "Show severity chips on findings and draw frame overlays in the simulator's colors"
```

---

### Task 5: Banners, narrow width, build check and PR

**Files:**
- Modify: `apps/report/src/ReportApp.tsx` (banner classes), `apps/report/src/report.css`

- [ ] **Step 1: Distinguish error and notice banners**

In `ReportApp.tsx`, give the error banner `className="banner banner--error"` and the notice banner `className="banner banner--notice"`. In `report.css`, replace `.banner` with:

```css
.banner { border: 1px solid var(--border); border-left: 3px solid var(--info); background: var(--panel); padding: 12px 14px; border-radius: var(--dobra-radius); margin: 12px 0; overflow-wrap: anywhere; }
.banner--error { border-left-color: var(--bad); }
ul { padding-left: 20px; }
li + li { margin-top: 4px; }
@media (max-width: 600px) { main { padding: 20px 16px 48px; } .summary__figure { font-size: 36px; } }
```

(Replace the old `@media (max-width: 600px)` rule.)

- [ ] **Step 2: Tests and typecheck**

Run: `npm test -w @dobra/report && npm run typecheck -w @dobra/report`
Expected: PASS.

- [ ] **Step 3: Build and check the single file**

```bash
npm run build:report > "$SCRATCH/report-build.log" 2>&1; tail -3 "$SCRATCH/report-build.log"
ls apps/report/dist
grep -c "fonts.googleapis" apps/report/dist/index.html
grep -o "font/woff2" apps/report/dist/index.html | wc -l
grep -o "data:image/svg+xml" apps/report/dist/index.html | wc -l
```

Expected: the build succeeds; `dist` holds only `index.html`; `fonts.googleapis` 0; `font/woff2` 3; at least 3 inline SVGs (the favicon and both logos).

- [ ] **Step 4: Narrow width**

In the Browser pane at the `mobile` preset (375 px), paste a long Figma URL into the link field and load the sample report. Run in the page:

```js
({ W: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })
```

Expected: both 375. If not, find the element whose right edge passes 375 and constrain it (`min-width: 0`, `max-width: 100%` or `overflow-wrap: anywhere`), and record a ruling. Reset with preset `desktop`.

- [ ] **Step 5: Full check, push and PR**

```bash
npm run typecheck && npm test
git add apps/report/src/ReportApp.tsx apps/report/src/report.css
git commit -m "Tell error banners from notices and fit the web report on narrow screens"
git push -u origin feat/report-restyle
gh pr create --base main --title "Restyle the web report with the Dobra visual identity" --label enhancement --label area:web --body "Closes #N

Slice 3 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md (§5).

- The colors all come from @dobra/brand and follow the system's light or dark setting, including when it changes while the page is open. A test fails on any color literal outside the report's own variables.
- A header with the logo (switching with the theme), Foldable Check in Geist and the catalog version as a badge.
- A brand input panel with mono inputs, a cyan focus ring and the cyan primary button, plus the dashed drop zone.
- The required coverage as a large figure with a ring. It shows a dash, never NaN, when nothing is required.
- ERROR, WARN, INFO and PASS chips, and coverage status chips.
- Frame overlays drawn like the simulator's: a rose occluding hinge, a cyan crease line and a dashed flat crease.
- The favicon. The single-file build carries the fonts, logos and favicon inline.

Same content and flow as before."
```

- [ ] **Step 6: Merge once checks pass**

No manual step: `gh pr merge --merge`, then delete the branch (remote and local) after confirming it is an ancestor of `origin/main`, and rerun `npm test` on the merged `main`.
