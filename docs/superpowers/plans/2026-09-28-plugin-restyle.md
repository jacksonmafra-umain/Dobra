# Figma Plugin Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Figma plugin the Dobra visual identity within Figma's limits: the panel (an HTML iframe) uses the same tokens, fonts and components as the web report and follows Figma's light or dark theme; the overlays it draws on the canvas use the brand colors.

**Architecture:** The panel imports `@dobra/brand/fonts.css` and `tokens.css`; a tiny tested helper reads Figma's theme class (`figma-dark` / `figma-light` on `<html>`, set because the plugin opens with `themeColors: true`) and mirrors it to `data-theme`, watching for changes. `app.css` maps its own variables to `--dobra-*` tokens (a test forbids literals), and the emoji severity icons become text chips. On the canvas, the main thread reads colors from `@dobra/brand/tokens` through a tested `figmaColor(hex)` converter, so the overlays and grids use the same palette. Layer names stay the same, so tags, checks and the report keep working.

**Tech Stack:** React 19, Vite 8 + `vite-plugin-singlefile` (panel), esbuild (main thread, target es2017), Vitest 4 with the existing fake Figma API, `@dobra/brand`.

**Spec:** `docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md` §6 (§2 decisions, §3.1 tokens).

## Global Constraints

- Visual language only. No new commands, tabs or data. The emoji severity markers (`⛔ ⚠️ ℹ️`) become the text chips `ERROR`, `WARN`, `INFO`, the same as the web report. Every other string stays.
- Panel theme follows Figma: `figma-dark` on `<html>` means `data-theme="dark"`, anything else means light. It updates when the user switches Figma's theme while the panel is open.
- Panel colors come only from `--dobra-*` tokens; a color literal may appear in `app.css` only as the value of one of its own custom properties, built from a token. No glass blur in the panel (nothing sits behind it).
- Fonts are bundled into `dist/ui.html`; the plugin has no network access (`networkAccess: none`).
- Canvas colors come from `@dobra/brand/tokens` (`tokens.light`, since artboards are usually light; see the ruling in Task 3): insets and safe areas `accent-2`, reserved regions `warn`, separating hinges and hinge safe zones `hinge`, a zero-width crease hairline `fold`, the column grid `pass`, the pane grid `hinge`. Opacities stay as they are today.
- Layer names do not change: `⎔ hinge-overlay`, `Hinge`, `Hinge safe zone`, `Crease`, `Inset top/bottom/left/right`, and reserved labels.
- The main thread stays es2017-compatible and free of `import(` and HTML comment markers (`bundle.test.ts`).
- The PR has a manual-test checkbox for the user (a run inside Figma) and is held until it is ticked.
- Workflow: a GitHub issue labeled `enhancement` and `area:plugin`; branch `feat/plugin-restyle` from `main`; microcommits in plain English, no assistant mention, no trailers; a PR with `Closes #N`, same labels.

## Review Focus

- **Switching Figma's theme with the panel open.** The panel must follow at once, not only on the next open. Pinned in Task 1 (`followFigmaTheme` observer test).
- **A theme class Figma might not set** (older desktop apps, the browser app, a future class name). The panel must fall back to light, never to an unstyled mix. Pinned in Task 1 (`figmaTheme` tests).
- **A hex value that is not six digits or a token that is not a hex** (for example `panel` is an `rgb(… / a)` string). `figmaColor` must reject it rather than draw black. Pinned in Task 3.
- **Existing artboards.** Re-decorating a frame (Tag frames, Re-check) must replace the old overlay, not stack a second one in new colors. Pinned in Task 3 (the existing "replaces the overlay" behaviour, re-run with the new colors).
- **The bundle.** Fonts inline in `ui.html`, `code.js` still passes the sandbox checks. Pinned in Task 4 (`bundle.test.ts` additions).

---

## File Structure

```
packages/figma-plugin/
  package.json                 add "@dobra/brand": "*"
  src/ui/main.tsx              import brand CSS; follow Figma's theme
  src/ui/theme.ts              figmaTheme(className), followFigmaTheme(root, observe)
  src/ui/theme.test.ts
  src/ui/app.css               token mapping and restyle
  src/ui/style.test.ts         no color literals outside app.css's own custom properties
  src/ui/App.tsx               severity chips instead of emoji; tab class
  src/ui/SeverityChip.tsx      severityLabel(), SeverityChip
  src/ui/SeverityChip.test.ts
  src/colors.ts                figmaColor(hex), CANVAS palette from tokens.light
  src/colors.test.ts
  src/presets.ts               use CANVAS instead of RED/BLUE/AMBER
  src/presets.test.ts          assert the new colors
  src/bundle.test.ts           ui.html carries the fonts and no network URLs
```

`tsconfig.ui.json` includes only `src/ui`; `src/colors.ts` is main-thread code and is covered by `tsconfig.json`.

---

### Task 0: Issue and branch

- [ ] **Step 1**

```bash
gh issue create --title "Restyle the Figma plugin with the Dobra visual identity" \
  --label enhancement --label area:plugin \
  --body "Slice 4 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md (§6). The panel uses @dobra/brand tokens and fonts and follows Figma's light or dark theme, with severity chips like the web report. The canvas overlays and grids use the brand palette. Layer names and behaviour stay the same."
git fetch origin && git switch -c feat/plugin-restyle origin/main && npm install
```

Note the number as `N`.

---

### Task 1: Brand wiring and Figma's theme

**Files:**
- Modify: `packages/figma-plugin/package.json`, `packages/figma-plugin/src/ui/main.tsx`, `packages/figma-plugin/src/ui/app.css:1-7`
- Create: `packages/figma-plugin/src/ui/theme.ts`, `theme.test.ts`, `style.test.ts`

**Interfaces:**
- Produces: `export function figmaTheme(className: string): 'dark' | 'light'`; `export function followFigmaTheme(root: { className: string; dataset: DOMStringMap }, observe: (onChange: () => void) => () => void): () => void` (applies now, re-applies on every change, returns the unsubscribe).
- Produces: `app.css` variables `--bg`, `--panel`, `--field`, `--text`, `--muted`, `--border`, `--border-strong`, `--accent`, `--on-accent`, `--accent-soft`, `--bad`, `--bad-soft`, `--warn`, `--warn-soft`, `--ok`, `--ok-soft`, `--info`, `--info-soft` (18), with light-theme tints at 6% as in the web report (`:root[data-theme='light']`).

- [ ] **Step 1: Write the failing tests**

`packages/figma-plugin/src/ui/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { figmaTheme, followFigmaTheme } from './theme';

describe('figmaTheme', () => {
  it('reads Figma dark from the html class', () => {
    expect(figmaTheme('figma-dark')).toBe('dark');
    expect(figmaTheme('foo figma-dark bar')).toBe('dark');
  });
  it('treats anything else as light', () => {
    expect(figmaTheme('figma-light')).toBe('light');
    expect(figmaTheme('')).toBe('light');
    expect(figmaTheme('figma-darker')).toBe('light');
  });
});

describe('followFigmaTheme', () => {
  it('applies the theme now and again whenever Figma changes the class', () => {
    const root = { className: 'figma-light', dataset: {} as DOMStringMap };
    let fire = () => {};
    const stop = followFigmaTheme(root, (cb) => ((fire = cb), () => (fire = () => {})));
    expect(root.dataset.theme).toBe('light');
    root.className = 'figma-dark';
    fire();
    expect(root.dataset.theme).toBe('dark');
    stop();
    root.className = 'figma-light';
    fire();
    expect(root.dataset.theme).toBe('dark');
  });
});
```

`packages/figma-plugin/src/ui/style.test.ts` (same checks as the web report's `style.test.ts`, for `app.css`):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const OWN = /^--(bg|panel|field|text|muted|border|border-strong|accent|on-accent|accent-soft|bad|bad-soft|warn|warn-soft|ok|ok-soft|info|info-soft)$/;

function declarations(source: string): [string, string][] {
  return source.replace(/[^{}]*\{/g, ';').replace(/\}/g, ';').split(';').map((d) => d.trim()).filter((d) => d.includes(':')).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
}

describe('app.css', () => {
  it('uses no color literal outside its own custom properties', () => {
    expect(declarations(css).filter(([p, v]) => COLOR.test(v) && !OWN.test(p))).toEqual([]);
  });
  it('builds its custom properties from brand tokens, not Figma variables', () => {
    const own = declarations(css).filter(([p]) => OWN.test(p));
    expect(own.length).toBeGreaterThanOrEqual(18);
    for (const [p, v] of own) expect(v, p).toMatch(/var\(--dobra-/);
    expect(css).not.toContain('--figma-color');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @dobra/figma-plugin -- src/ui/theme.test.ts src/ui/style.test.ts`
Expected: FAIL: `./theme` not found; `style.test.ts` lists the `--figma-color-*` fallbacks such as `['color', 'var(--figma-color-text, #1e1e1e)']`.

- [ ] **Step 3: Write `theme.ts`**

```ts
// Figma adds figma-dark or figma-light to <html> when the plugin opens with themeColors: true,
// and swaps it when the user changes Figma's theme. The brand tokens switch on data-theme.

export function figmaTheme(className: string): 'dark' | 'light' {
  return className.split(/\s+/).includes('figma-dark') ? 'dark' : 'light';
}

export function followFigmaTheme(root: { className: string; dataset: DOMStringMap }, observe: (onChange: () => void) => () => void): () => void {
  const apply = () => (root.dataset.theme = figmaTheme(root.className));
  apply();
  return observe(apply);
}
```

- [ ] **Step 4: Wire it and map the palette**

Add `"@dobra/brand": "*"` to `dependencies` (before `@dobra/core`); `npm install`.

`packages/figma-plugin/src/ui/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import '@dobra/brand/fonts.css';
import '@dobra/brand/tokens.css';
import { App } from './App';
import './app.css';
import { followFigmaTheme } from './theme';

const html = document.documentElement;
followFigmaTheme(html, (onChange) => {
  const observer = new MutationObserver(onChange);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
});
createRoot(document.getElementById('root')!).render(<App />);
```

(If `app.css` is currently imported from `App.tsx` rather than `main.tsx`, keep it where it is and drop the `./app.css` line here; check with `grep -n "app.css" src/ui/*.tsx`.)

Replace the first rule of `app.css` (the comment and `body`) with:

```css
/* The panel's palette, all from @dobra/brand. <html> carries data-theme from Figma's theme class
   (src/ui/theme.ts), so these follow Figma's light and dark. */
:root {
  --bg: var(--dobra-bg);
  --panel: var(--dobra-panel);
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
/* On a light background a 14% tint is too dark behind small colored text; 6% keeps chips at 4.5:1. */
:root[data-theme='light'] {
  --accent-soft: color-mix(in srgb, var(--dobra-fold) 6%, transparent);
  --bad-soft: color-mix(in srgb, var(--dobra-hinge) 6%, transparent);
  --warn-soft: color-mix(in srgb, var(--dobra-warn) 6%, transparent);
  --ok-soft: color-mix(in srgb, var(--dobra-pass) 6%, transparent);
  --info-soft: color-mix(in srgb, var(--dobra-accent-2) 6%, transparent);
}
body {
  margin: 0;
  font: var(--dobra-type-body-md);
  color: var(--text);
  background: var(--bg);
}
```

Then replace every remaining `var(--figma-color-…, #…)` in `app.css`:

| Old | New |
| --- | --- |
| `var(--figma-color-bg-secondary, #f5f5f5)` | `var(--field)` |
| `var(--figma-color-border, #e6e6e6)` | `var(--border)` |
| `var(--figma-color-bg-brand, #0d99ff)` | `var(--accent)` |
| `var(--figma-color-text-onbrand, #ffffff)` | `var(--on-accent)` |
| `var(--figma-color-border-brand, #0d99ff)` | `var(--accent)` |
| `var(--figma-color-text-secondary, #757575)` | `var(--muted)` |
| `var(--figma-color-bg-danger-tertiary, #ffe0e0)` | `var(--bad-soft)` |

- [ ] **Step 5: Run the tests**

Run: `npm test -w @dobra/figma-plugin && npm run typecheck -w @dobra/figma-plugin`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/figma-plugin/package.json packages/figma-plugin/src/ui package-lock.json
git commit -m "Point the plugin panel at the Dobra brand tokens and follow Figma's theme"
```

---

### Task 2: Panel components

**Files:**
- Create: `packages/figma-plugin/src/ui/SeverityChip.tsx`, `SeverityChip.test.ts`
- Modify: `packages/figma-plugin/src/ui/App.tsx:269, 340-345`, `packages/figma-plugin/src/ui/app.css`

**Interfaces:**
- Produces: `export function severityLabel(severity: string): 'ERROR' | 'WARN' | 'INFO'`; `export function SeverityChip({ severity }: { severity: string })` rendering `<span class="chip chip--error|warn|info">LABEL</span>`.

- [ ] **Step 1: Write the failing test**

`packages/figma-plugin/src/ui/SeverityChip.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeverityChip, severityLabel } from './SeverityChip';

describe('SeverityChip', () => {
  it('labels each severity like the web report', () => {
    expect(severityLabel('error')).toBe('ERROR');
    expect(severityLabel('warn')).toBe('WARN');
    expect(severityLabel('info')).toBe('INFO');
    expect(severityLabel('fatal')).toBe('INFO');
  });
  it('renders a chip with a class per severity', () => {
    expect(renderToStaticMarkup(createElement(SeverityChip, { severity: 'warn' }))).toBe('<span class="chip chip--warn">WARN</span>');
  });
});
```

(`react-dom/server` is available: `react-dom` is already a dependency. If the plugin's `vitest.config.ts` includes only `src/**/*.test.ts`, this file is covered.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @dobra/figma-plugin -- src/ui/SeverityChip.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

`packages/figma-plugin/src/ui/SeverityChip.tsx`:

```tsx
export type SeverityLabel = 'ERROR' | 'WARN' | 'INFO';

/** The chip text for a finding's severity, the same as the web report's. */
export function severityLabel(severity: string): SeverityLabel {
  return severity === 'error' ? 'ERROR' : severity === 'warn' ? 'WARN' : 'INFO';
}

export function SeverityChip({ severity }: { severity: string }) {
  const label = severityLabel(severity);
  return <span className={`chip chip--${label.toLowerCase()}`}>{label}</span>;
}
```

- [ ] **Step 4: Run it**

Run: `npm test -w @dobra/figma-plugin -- src/ui/SeverityChip.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it and restyle the panel**

In `App.tsx`: delete `const SEVERITY = { error: '⛔', warn: '⚠️', info: 'ℹ️' } as const;` (line 269), import `SeverityChip`, and replace `{SEVERITY[x.severity]} <strong>{x.ruleId}</strong>` with `<SeverityChip severity={x.severity} /> <strong className="mono">{x.ruleId}</strong>`.

In `app.css`, replace the rules for `main`, `button, select`, `button.primary`, `.tabs`, `.tabs button[aria-pressed='true']`, `.card`, `.notice`, `.notice--error`, `.notice--info`, `td, th`, `.finding`, `textarea` with:

```css
main { padding: 12px 12px 20px; }
h1, h2, h3 { font: var(--dobra-type-headline-sm); margin: 12px 0 6px; }
button, select, input[type='text'], input[type='search'] {
  font: 500 12px/1.2 var(--dobra-font-body);
  color: var(--text);
  background: var(--field);
  border: 1px solid var(--border-strong);
  border-radius: var(--dobra-radius);
  padding: 6px 10px;
}
button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
button.primary { background: var(--accent); color: var(--on-accent); border-color: transparent; font-weight: 600; margin-bottom: 8px; }
input[type='checkbox'] { accent-color: var(--accent); width: 14px; height: 14px; }
/* Tabs: a compact segmented track with a raised active segment. */
.tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 2px; margin-bottom: 12px; background: var(--field); border: 1px solid var(--border); border-radius: var(--dobra-radius); }
.tabs button { border: 0; background: transparent; color: var(--muted); padding: 5px 8px; font: var(--dobra-type-label-md); letter-spacing: var(--dobra-tracking-label-md); border-radius: var(--dobra-radius-sm); }
.tabs button[aria-pressed='true'] { background: var(--bg); color: var(--text); box-shadow: inset 0 0 0 1px var(--border-strong); font-weight: 600; }
.card { display: grid; gap: 4px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.notice { padding: 8px 10px; border-radius: var(--dobra-radius); border: 1px solid var(--border); border-left: 3px solid var(--info); background: var(--field); }
.notice--error { border-left-color: var(--bad); background: var(--bad-soft); }
.notice--info { border-left-color: var(--info); }
td, th { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border); }
th { font: var(--dobra-type-label-sm); letter-spacing: var(--dobra-tracking-label-sm); text-transform: uppercase; color: var(--muted); }
.finding { display: block; width: 100%; text-align: left; margin: 6px 0; line-height: 1.5; }
.finding:hover { border-color: var(--accent); }
.chip { display: inline-block; font: 600 10px/1 var(--dobra-font-mono); letter-spacing: 0.04em; padding: 3px 5px; border-radius: var(--dobra-radius-sm); vertical-align: 1px; }
.chip--error { color: var(--bad); background: var(--bad-soft); }
.chip--warn { color: var(--warn); background: var(--warn-soft); }
.chip--info { color: var(--info); background: var(--info-soft); }
.mono { font-family: var(--dobra-font-mono); }
details > summary { cursor: pointer; padding: 4px 0; }
textarea { width: 100%; box-sizing: border-box; font: 11px/1.5 var(--dobra-font-mono); color: var(--text); background: var(--field); border: 1px solid var(--border-strong); border-radius: var(--dobra-radius); padding: 6px 8px; }
```

- [ ] **Step 6: Tests and a look**

Run: `npm test -w @dobra/figma-plugin && npm run typecheck -w @dobra/figma-plugin`
Expected: PASS.

Preview the panel outside Figma: `npx -w @dobra/figma-plugin vite --port 5195` serves `src/ui`. Open it in the Browser pane; it shows the tabs with empty content, because no Figma main thread answers. Screenshot with `document.documentElement.className = 'figma-dark'` and again with `'figma-light'`. Expected: the tab track, cyan primary buttons, mono labels, brand colors in both themes. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add packages/figma-plugin/src/ui
git commit -m "Restyle the plugin panel with brand tabs, buttons and severity chips"
```

---

### Task 3: Canvas colors

**Files:**
- Create: `packages/figma-plugin/src/colors.ts`, `colors.test.ts`
- Modify: `packages/figma-plugin/src/presets.ts:7-9` and the calls that use `RED`, `BLUE`, `AMBER`; `packages/figma-plugin/src/presets.test.ts`

**Interfaces:**
- Consumes: `tokens` from `@dobra/brand/tokens`.
- Produces: `export function figmaColor(hex: string): RGB` (`#RRGGBB` → `{ r, g, b }` in 0–1, throwing on anything else); `export const CANVAS: { inset: RGB; reserved: RGB; hinge: RGB; crease: RGB; grid: RGB }` built from `tokens.light` (`accent-2`, `warn`, `hinge`, `fold`, `pass`).

Ruling to record: canvas colors use the light-theme token values, because artboards are usually light and the light values are the higher-contrast ones on white; Figma has no way to switch a document's fills with the app theme.

- [ ] **Step 1: Write the failing tests**

`packages/figma-plugin/src/colors.test.ts`:

```ts
import { tokens } from '@dobra/brand/tokens';
import { describe, expect, it } from 'vitest';
import { CANVAS, figmaColor } from './colors';

describe('figmaColor', () => {
  it('turns a hex color into Figma RGB between 0 and 1', () => {
    expect(figmaColor('#FF0000')).toEqual({ r: 1, g: 0, b: 0 });
    expect(figmaColor('#007C85')).toEqual({ r: 0, g: 124 / 255, b: 133 / 255 });
  });
  it('rejects anything that is not #RRGGBB instead of drawing black', () => {
    expect(() => figmaColor('rgb(255 255 255 / 0.85)')).toThrow(/rgb/);
    expect(() => figmaColor('#fff')).toThrow(/#fff/);
  });
});

describe('CANVAS', () => {
  it('uses the brand palette for each overlay', () => {
    expect(CANVAS).toEqual({
      inset: figmaColor(tokens.light['accent-2']),
      reserved: figmaColor(tokens.light.warn),
      hinge: figmaColor(tokens.light.hinge),
      crease: figmaColor(tokens.light.fold),
      grid: figmaColor(tokens.light.pass),
    });
  });
});
```

Append to `presets.test.ts`:

```ts
describe('overlay colors', () => {
  const fill = (node: SceneNode) => ((node as RectangleNode).fills as SolidPaint[])[0];

  it('draws the hinge and its safe zone in the brand hinge color', () => {
    const overlay = overlayOf(applyPreset(createFakeFigma(), duo, catalog.version));
    for (const name of ['Hinge', 'Hinge safe zone']) expect(fill(overlay.children.find((c) => c.name === name)!).color).toEqual(CANVAS.hinge);
  });

  it('draws a crease hairline in the fold color and insets in the secondary color', () => {
    const open = presetSpec(config, { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'open', orientation: 'portrait' });
    const overlay = overlayOf(applyPreset(createFakeFigma(), open, catalog.version));
    expect(fill(overlay.children.find((c) => c.name === 'Crease')!).color).toEqual(CANVAS.crease);
    const inset = overlay.children.find((c) => c.name.startsWith('Inset'));
    if (inset) expect(fill(inset).color).toEqual(CANVAS.inset);
  });

  it('colors the column grid with the pass color and the pane grid with the hinge color', () => {
    const [columns, panes] = applyPreset(createFakeFigma(), duo, catalog.version).layoutGrids as (LayoutGrid & { color: RGBA })[];
    expect(columns.color).toMatchObject({ r: CANVAS.grid.r, g: CANVAS.grid.g, b: CANVAS.grid.b });
    expect(panes.color).toMatchObject({ r: CANVAS.hinge.r, g: CANVAS.hinge.g, b: CANVAS.hinge.b });
  });

  it('replaces the old overlay when a frame is decorated again', () => {
    const api = createFakeFigma();
    const frame = applyPreset(api, duo, catalog.version);
    decorate(api, frame, duo, catalog.version);
    expect(frame.children.filter((c) => c.name === OVERLAY_NAME)).toHaveLength(1);
  });
});
```

and add `import { CANVAS } from './colors';` to its imports.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @dobra/figma-plugin -- src/colors.test.ts src/presets.test.ts`
Expected: FAIL: `./colors` not found (and the color assertions fail once it exists, until `presets.ts` uses it).

- [ ] **Step 3: Write `colors.ts`**

```ts
// The brand palette for what the plugin draws on the canvas. Figma fills take RGB in 0–1, and the
// main thread has no CSS, so the values come from @dobra/brand/tokens.
import { tokens } from '@dobra/brand/tokens';

export function figmaColor(hex: string): RGB {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Not a #RRGGBB color: ${hex}`);
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

// Light-theme values: artboards are usually light, and these read best on white.
const t = tokens.light;
export const CANVAS = {
  inset: figmaColor(t['accent-2']),
  reserved: figmaColor(t.warn),
  hinge: figmaColor(t.hinge),
  crease: figmaColor(t.fold),
  grid: figmaColor(t.pass),
};
```

- [ ] **Step 4: Use it in `presets.ts`**

Delete the `RED`, `BLUE` and `AMBER` constants, `import { CANVAS } from './colors';`, and replace:
- the column grid color `{ ...BLUE, a: 0.08 }` → `{ ...CANVAS.grid, a: 0.08 }`;
- both pane grid colors `{ ...RED, a: 0.1 }` → `{ ...CANVAS.hinge, a: 0.1 }`;
- the four `Inset` boxes' `BLUE` → `CANVAS.inset`;
- reserved `AMBER` → `CANVAS.reserved`;
- `Hinge safe zone` and `Hinge` `RED` → `CANVAS.hinge`;
- both `Crease` boxes' `RED` → `CANVAS.crease`.

- [ ] **Step 5: Run everything**

Run: `npm test -w @dobra/figma-plugin && npm run typecheck -w @dobra/figma-plugin`
Expected: PASS (the existing layout and name tests unchanged; the new color tests pass).

- [ ] **Step 6: Commit**

```bash
git add packages/figma-plugin/src/colors.ts packages/figma-plugin/src/colors.test.ts packages/figma-plugin/src/presets.ts packages/figma-plugin/src/presets.test.ts
git commit -m "Draw the plugin's overlays and grids in the brand palette"
```

---

### Task 4: Bundle checks, README and PR

**Files:**
- Modify: `packages/figma-plugin/src/bundle.test.ts`, `packages/figma-plugin/README.md`

- [ ] **Step 1: Extend the bundle test**

Append inside the `describe.skipIf(...)('bundle', …)` block:

```ts
  it('carries the brand fonts inside ui.html and fetches nothing', () => {
    const ui = readFileSync(dist('ui.html'), 'utf8');
    expect(ui.match(/font\/woff2/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(ui).not.toMatch(/fonts\.googleapis|https?:\/\/[^"')\s]+\.(woff2?|css)/);
  });
```

- [ ] **Step 2: Build and run it**

Run: `npm run build -w @dobra/figma-plugin`
Expected: the build runs `bundle.test.ts` at the end and it passes (5 tests). If `ui.html` does not inline the fonts (the woff2 files sit in `@dobra/brand/fonts/`, reached through a relative `url()` in `fonts.css`), set `build.assetsInlineLimit: Number.MAX_SAFE_INTEGER` in the plugin's `vite.config.ts` and rebuild; record it.

- [ ] **Step 3: README**

In `packages/figma-plugin/README.md`, after the "Import into Figma" section, add:

```markdown
## Look

The panel uses the Dobra design tokens and fonts from `@dobra/brand` and follows Figma's light or
dark theme. Overlays on the canvas use the same palette: hinges and their safe zones in rose,
flexible creases as a teal hairline, insets and safe areas in indigo, reserved regions in amber and
the column grid in green. The icon for a Community listing is `packages/brand/png/icon-128.png`.
```

- [ ] **Step 4: Full check, push, PR**

```bash
npm run typecheck && npm test
git add packages/figma-plugin/src/bundle.test.ts packages/figma-plugin/README.md
git commit -m "Check that the plugin panel carries its fonts, and describe its look"
git push -u origin feat/plugin-restyle
gh pr create --base main --title "Restyle the Figma plugin with the Dobra visual identity" --label enhancement --label area:plugin --body "Closes #N

Slice 4 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md (§6).

- The panel uses the @dobra/brand tokens and fonts, bundled into ui.html with no network access. It follows Figma's light or dark theme, including when you switch it while the panel is open.
- Brand tabs, buttons, inputs and notices, with ERROR, WARN and INFO chips on findings in place of the emoji, the same as the web report.
- Canvas overlays and grids use the brand palette: hinges and safe zones in rose, creases in teal, insets in indigo, reserved regions in amber and the column grid in green. Layer names are unchanged, so tags, checks and the report keep working.

- [ ] Manual run in Figma by the owner: open the development plugin, create an artboard (Artboards), tag a frame (Tag frames), run Check, and switch Figma between light and dark with the panel open."
```

- [ ] **Step 5: Hold for the manual run**

Do not merge until the owner ticks the manual-run box. When they do and CI passes: `gh pr merge --merge`, delete the branch after confirming it is an ancestor of `origin/main`, and rerun `npm test` on the merged `main`.
