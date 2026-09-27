# Simulator Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the simulator's own interface (top bar, canvas, inspector, parity view, overlays) the Dobra visual identity from `@dobra/brand`, in dark and light, without changing what it does.

**Architecture:** The simulator already styles its chrome through `--ui-*` and `--ov-*` custom properties in `apps/simulator/src/styles/app.css`. This plan points those properties at `--dobra-*` tokens, removes every other color literal from `app.css`, restyles the components in CSS, and makes four small markup changes (the logo in the top bar, the size-class hero card, status icons on findings, and a class for each kind of fold). The small logic that decides which logo, icon or fold class to use lives in pure functions with unit tests; the look is checked with screenshots.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (only for the sample app), plain CSS custom properties, Vitest 4 (node environment), `@dobra/brand`.

**Spec:** `docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md` §4 (and §2 for the decisions, §3.1 for token names).

## Global Constraints

- Visual language only: no new controls, no new data, no invented labels. Every string on screen stays as it is today, except the "Dobra Simulator" title text, which the logo replaces (its `alt` is "Dobra").
- Colors in `apps/simulator/src/styles/app.css` come only from `--dobra-*` tokens. A color literal (`#…`, `rgb(`, `rgba(`, `hsl(`) may appear only as the value of a custom property whose name starts with `--ui-` or `--ov-`, and then only as a mix built from a token (for example `color-mix(in srgb, var(--dobra-fold) 20%, transparent)`); the test in Task 1 enforces "no literal outside a custom property".
- Theme: `.app` keeps `data-theme={theme}`; `@dobra/brand/tokens.css` matches `[data-theme='light']` and `[data-theme='dark']` on any element, so the chrome follows the existing Light/Dark switch.
- Type: Geist (`--dobra-font-display`) for titles, Inter (`--dobra-font-body`) for body, JetBrains Mono (`--dobra-font-mono`) for every number, identifier, control label, rule id, target key and source.
- Radii: 4 px (`--dobra-radius`) on controls, 8 px (`--dobra-radius-lg`) on cards and the device caption badge.
- Overlay colors: fold line `--dobra-fold` with `--dobra-glow`; occluding hinge and collisions `--dobra-hinge`; safe areas `--dobra-accent-2`; grid `--dobra-pass`; margins a translucent neutral; reserved regions `--dobra-warn`.
- `apps/simulator/src/styles/sample-app.css` is the simulated app. Its look does not change. The one rule that is tool chrome, `[data-collision]`, moves out of it into `app.css` (see Task 5).
- Workflow: a GitHub issue labeled `enhancement` and `area:web`; branch `feat/simulator-restyle` from `main`; microcommits in plain English with no assistant mention and no trailers; a PR with `Closes #N`, same labels.

## Review Focus

- **The light theme.** Every restyled surface must also read correctly with `data-theme="light"`: a dark-only hardcoded color (for example `#fff` text on a chip) shows up only there. Pinned by the Task 1 literal test plus the light screenshots in Tasks 2–6.
- **The single-file build.** `npm run build:single` inlines everything; the fonts from `@dobra/brand/fonts.css` and the logo SVG must end up inside `dist-single/index.html` and load offline. Pinned in Task 6 (a check that the built HTML contains the inlined font data and no `fonts.googleapis`).
- **A fold that is separating but does not occlude** (a half-open Pixel Fold) versus **one that occludes** (a spanned Surface Duo). They must render differently (cyan line versus rose hatch), and a flat crease (not separating) keeps its dashed look. Pinned in Task 5 (`foldOverlayClass` tests).
- **Findings of each severity.** `error`, `warn` and `info` must each get their own icon and color; an unknown severity must not crash. Pinned in Task 4 (`statusIcon` tests).
- **Narrow windows.** At 960 px and below the sidebar moves under the canvas; the new hero card and chips must not overflow at 375 px. Pinned by the narrow screenshot in Task 6.

---

## File Structure

```
apps/simulator/
  package.json                      add "@dobra/brand": "*"
  index.html                        favicon links, title unchanged
  src/styles/index.css              import brand fonts and tokens before app.css
  src/styles/app.css                token mapping, component restyle, overlays, [data-collision]
  src/styles/sample-app.css         remove the [data-collision] rule (moved to app.css)
  src/styles/chrome.test.ts         no color literals outside custom properties; import order
  src/ui/brand.ts                   logoFor(theme), statusIcon(severity), foldOverlayClass(fold)
  src/ui/brand.test.ts
  src/ui/StatusIcon.tsx             the three inline SVG icons
  src/ui/App.tsx                    logo in the top bar, version badge, chip class on overlay toggles
  src/ui/Inspector.tsx              size-class hero card, status icons on findings
  src/ui/Overlays.tsx               use foldOverlayClass
```

---

### Task 0: Issue and branch

- [ ] **Step 1: Open the issue**

```bash
gh issue create --title "Restyle the simulator with the Dobra visual identity" \
  --label enhancement --label area:web \
  --body "Slice 2 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md (§4). Point the simulator's chrome at @dobra/brand tokens in dark and light: Geist, Inter and JetBrains Mono, the logo in the top bar, the size-class hero card, status icons on findings, and brand colors for the overlays. No change to what the simulator does or to the simulated app's look."
```

Note the number as `N`.

- [ ] **Step 2: Branch**

```bash
git fetch origin && git switch -c feat/simulator-restyle origin/main && npm install
```

---

### Task 1: Wire the brand and map the palette

**Files:**
- Modify: `apps/simulator/package.json`, `apps/simulator/src/styles/index.css`, `apps/simulator/src/styles/app.css:1-42`
- Create: `apps/simulator/src/styles/chrome.test.ts`

**Interfaces:**
- Consumes: `@dobra/brand/fonts.css`, `@dobra/brand/tokens.css` (names in spec §3.1).
- Produces: the `--ui-*` and `--ov-*` custom properties, now defined once on `.app` from tokens:
  `--ui-bg`, `--ui-surface`, `--ui-flyout`, `--ui-field`, `--ui-border`, `--ui-border-strong`, `--ui-text`, `--ui-muted`, `--ui-accent`, `--ui-on-accent`, `--ui-accent-soft`, `--ui-warn`, `--ui-warn-soft`, `--ui-error`, `--ui-error-soft`, `--ui-pass`, `--ov-safe`, `--ov-safe-ink`, `--ov-margin`, `--ov-margin-ink`, `--ov-grid`, `--ov-grid-ink`, `--ov-reserved`, `--ov-reserved-ink`, `--ov-hinge`, `--ov-hinge-ink`, `--ov-fold`. Later tasks use only these names or `--dobra-*` directly.

- [ ] **Step 1: Write the failing test**

`apps/simulator/src/styles/chrome.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;

// Every declaration in a stylesheet, with comments removed, as [property, value].
function declarations(css: string): [string, string][] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[^{}]*\{/g, ';').replace(/\}/g, ';');
  return body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
}

describe('simulator chrome styles', () => {
  it('imports the brand fonts and tokens before the chrome', () => {
    const lines = read('./index.css').split('\n').filter((l) => l.startsWith('@import'));
    expect(lines).toEqual([
      '@import "tailwindcss";',
      '@import "@dobra/brand/fonts.css";',
      '@import "@dobra/brand/tokens.css";',
      '@import "./sample-app.css";',
      '@import "./app.css";',
    ]);
  });

  it('uses no color literal outside a --ui-* or --ov-* custom property', () => {
    const offenders = declarations(read('./app.css')).filter(
      ([prop, value]) => COLOR.test(value) && !/^--(ui|ov)-/.test(prop),
    );
    expect(offenders).toEqual([]);
  });

  it('builds every --ui-* and --ov-* color from a brand token', () => {
    const custom = declarations(read('./app.css')).filter(([prop]) => /^--(ui|ov)-/.test(prop));
    expect(custom.length).toBeGreaterThan(20);
    for (const [prop, value] of custom) expect(value, prop).toMatch(/var\(--dobra-/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @dobra/simulator -- src/styles/chrome.test.ts`
Expected: FAIL. The import-order test fails (no brand imports), and the literal test lists offenders such as `['background', '#111']` and `['color', '#fff']`.

- [ ] **Step 3: Add the dependency and the imports**

In `apps/simulator/package.json` `dependencies`, add `"@dobra/brand": "*"` (keep alphabetical order, before `@dobra/core`). Run `npm install`.

Replace `apps/simulator/src/styles/index.css` with:

```css
@import "tailwindcss";
@import "@dobra/brand/fonts.css";
@import "@dobra/brand/tokens.css";
@import "./sample-app.css";
@import "./app.css";
```

- [ ] **Step 4: Replace the palette block and the body font in `app.css`**

Replace lines 1–42 (the header comment, the `:root` block, the `.app[data-theme="dark"]` block, the `html, body, #root` rule and the `body` rule) with:

```css
/* Simulator chrome: top bar, canvas, sidebar and overlays. Every color comes from @dobra/brand;
   .app carries data-theme, so the tokens switch with the Light/Dark control. */
.app {
  --ui-bg: var(--dobra-bg);
  --ui-surface: var(--dobra-panel);
  --ui-flyout: var(--dobra-flyout);
  --ui-field: var(--dobra-field);
  --ui-border: var(--dobra-border);
  --ui-border-strong: var(--dobra-border-strong);
  --ui-text: var(--dobra-text);
  --ui-muted: var(--dobra-muted);
  --ui-accent: var(--dobra-fold);
  --ui-on-accent: var(--dobra-on-fold);
  --ui-accent-soft: color-mix(in srgb, var(--dobra-fold) 14%, transparent);
  --ui-warn: var(--dobra-warn);
  --ui-warn-soft: color-mix(in srgb, var(--dobra-warn) 14%, transparent);
  --ui-error: var(--dobra-hinge);
  --ui-error-soft: color-mix(in srgb, var(--dobra-hinge) 14%, transparent);
  --ui-pass: var(--dobra-pass);
  --ov-safe: color-mix(in srgb, var(--dobra-accent-2) 22%, transparent);
  --ov-safe-ink: var(--dobra-accent-2);
  --ov-margin: color-mix(in srgb, var(--dobra-muted) 14%, transparent);
  --ov-margin-ink: var(--dobra-muted);
  --ov-grid: color-mix(in srgb, var(--dobra-pass) 12%, transparent);
  --ov-grid-ink: color-mix(in srgb, var(--dobra-pass) 45%, transparent);
  --ov-reserved: color-mix(in srgb, var(--dobra-warn) 30%, transparent);
  --ov-reserved-ink: var(--dobra-warn);
  --ov-hinge: color-mix(in srgb, var(--dobra-hinge) 40%, transparent);
  --ov-hinge-ink: var(--dobra-hinge);
  --ov-fold: var(--dobra-fold);
}
html,
body,
#root {
  height: 100%;
  margin: 0;
}
body {
  background: var(--dobra-bg);
  font: var(--dobra-type-body-md);
}
```

The `.app` rule that follows (line 43 onwards: `background: var(--ui-bg); height: 100%; …`) stays; it merges with the block above.

- [ ] **Step 5: Replace the remaining literals with tokens**

In the rest of `app.css`, replace every color literal outside a custom property. The exact replacements:

| Selector | Property | Old | New |
| --- | --- | --- | --- |
| `.device` | `background` | `#111` | `var(--dobra-field)` |
| `.device` | `box-shadow` | `0 0 0 2px #3f3f46, 0 20px 50px #00000040` | `0 0 0 2px var(--dobra-border-strong), var(--dobra-shadow-2)` |
| `.device__screen` | `background` | `#fff` | `var(--dobra-bg)` |
| `.ov-safe em`, `.ov-margin span`, `.ov-reserved em`, `.ov-fold em` | `color` | `#fff` | `var(--dobra-bg)` |
| `.ov-margin` | `border-inline` | `1px solid #2563eb66` | `1px solid var(--ov-margin-ink)` |
| `.ov-grid__col` | `border-inline` | `1px solid #10b98159` | `1px solid var(--ov-grid-ink)` |
| `.bar-notes li[data-kind="overfull"]`, `.collisions--bad`, `.config-error h1` | `color` | `#dc2626` | `var(--ui-error)` |
| `.ov-reserved` | `background` | the violet gradient | `repeating-linear-gradient(45deg, var(--ov-reserved) 0 6px, transparent 6px 12px)` |
| `.ov-reserved` | `outline` | `1px solid #7c3aed` | `1px solid var(--ov-reserved-ink)` |
| `.ov-reserved em` | `background` | `#7c3aed` | `var(--ov-reserved-ink)` |
| `.ov-fold` | `background` | the orange gradient | `repeating-linear-gradient(45deg, var(--ov-hinge) 0 6px, transparent 6px 12px)` |
| `.ov-fold` | `outline` | `1px solid #ea580c` | `1px solid var(--ov-hinge-ink)` |
| `.ov-fold em` | `background` | `#ea580c` | `var(--ov-hinge-ink)` |
| `.ov-fold-region` | `outline` | `1px dashed #ea580c99` | `1px dashed var(--ov-fold)` |
| `.ov-fold-region em` | `color`, `background` | `#9a3412`, `#ffedd5eb` | `var(--dobra-on-fold)`, `var(--ov-fold)` |
| `.seg-single--accent` | `color` | `#fff` | `var(--ui-on-accent)` |
| `.device--free` | `background` | `#3f3f46` | `var(--dobra-border-strong)` |
| `.device__screen--desktop` | `background` | `linear-gradient(135deg, #3f3f46, #18181b)` | `linear-gradient(135deg, var(--dobra-border-strong), var(--dobra-bg))` |
| `.window--floating` | `box-shadow` | `0 12px 40px #00000066` | `var(--dobra-shadow-2)` |
| `.window-other` | `background` | the gray gradient | `repeating-linear-gradient(45deg, var(--ui-surface) 0 8px, var(--ui-flyout) 8px 16px)` |
| `.window-other` | `color` | `#52525b` | `var(--ui-muted)` |
| `.window-other` | `font` | `600 12px/1 ui-monospace, Menlo, monospace` | `var(--dobra-type-label-lg)` |
| `.window-divider` | `background` | `#18181b` | `var(--dobra-bg)` |
| `.caption-bar` | `background`, `color` | `#27272a`, `#fafafa` | `var(--ui-flyout)`, `var(--ui-text)` |
| `.caption-bar` | `font` | `600 12px/1 system-ui, sans-serif` | `600 12px/1 var(--dobra-font-body)` |

- [ ] **Step 6: Run the test**

Run: `npm test -w @dobra/simulator -- src/styles/chrome.test.ts`
Expected: PASS (3 tests). If the literal test still lists offenders, replace each one it names with the matching token and rerun.

- [ ] **Step 7: Look at it**

Start the dev server with the Browser pane's `preview_start` (add a `.claude/launch.json` entry `{"name": "simulator", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173}` if none exists; do not commit it). Open the default device, take a screenshot in dark, click "Light" and take another. Expected: the chrome is the obsidian palette in dark and a light gray-white in light; the simulated app screen looks exactly as before in both; nothing is unreadable.

- [ ] **Step 8: Commit**

```bash
git add apps/simulator/package.json apps/simulator/src/styles/index.css apps/simulator/src/styles/app.css apps/simulator/src/styles/chrome.test.ts package-lock.json
git commit -m "Point the simulator chrome at the Dobra brand tokens"
```

---

### Task 2: Type, controls and panels

**Files:**
- Modify: `apps/simulator/src/styles/app.css` (component rules), `apps/simulator/src/ui/App.tsx:393-411` (overlay toggle group class)

**Interfaces:**
- Consumes: the `--ui-*` names from Task 1; `--dobra-font-*`, `--dobra-type-*`, `--dobra-radius*`.
- Produces: the class `seg seg--chips` on the overlay toggle group (the only markup change).

This task changes only CSS and one class name, so its gate is the Task 1 test staying green plus screenshots.

- [ ] **Step 1: Restyle the chrome in `app.css`**

Apply these rule changes (edit the existing rules; add the new ones next to them):

```css
.topbar {
  background: var(--ui-surface);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--ui-border);
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 24px;
  padding: 12px 16px;
  display: flex;
  position: relative;
  z-index: 10;
}
.control > span {
  color: var(--ui-muted);
  text-transform: uppercase;
  font: var(--dobra-type-label-md);
  letter-spacing: var(--dobra-tracking-label-md);
}
.control select,
.free-resize input {
  border: 1px solid var(--ui-border-strong);
  background: var(--ui-field);
  color: var(--ui-text);
  font: var(--dobra-type-label-lg);
  border-radius: var(--dobra-radius);
}
.control select:focus-visible,
.free-resize input:focus-visible,
.seg button:focus-visible,
.seg-single:focus-visible {
  outline: 1px solid var(--ui-accent);
  outline-offset: 1px;
  box-shadow: 0 0 0 3px var(--ui-accent-soft);
}
.seg {
  background: var(--ui-field);
  border: 1px solid var(--ui-border);
  border-radius: var(--dobra-radius);
  padding: 2px;
  gap: 2px;
  display: inline-flex;
}
.seg button {
  background: transparent;
  height: 24px;
  color: var(--ui-muted);
  font: var(--dobra-type-label-md);
  letter-spacing: var(--dobra-tracking-label-md);
  border-radius: var(--dobra-radius-sm);
  cursor: pointer;
  border: 0;
  padding: 0 8px;
}
.seg button + button {
  border-left: 0;
}
.seg button[aria-pressed="true"] {
  background: var(--ui-flyout);
  color: var(--ui-text);
  box-shadow: inset 0 0 0 1px var(--ui-border-strong);
  font-weight: 600;
}
/* Overlay toggles read as checkbox chips: a 14 px box that fills with the fold color when on. */
.seg--chips {
  background: transparent;
  border: 0;
  padding: 0;
  gap: 6px;
}
.seg--chips button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ui-border);
  background: var(--ui-field);
}
.seg--chips button::before {
  content: "";
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--dobra-radius-sm);
}
.seg--chips button[aria-pressed="true"] {
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  box-shadow: none;
  border-color: color-mix(in srgb, var(--dobra-fold) 40%, transparent);
}
.seg--chips button[aria-pressed="true"]::before {
  /* A filled square inside the box marks it checked; drawn with tokens, so it works in both themes. */
  background: var(--ui-accent);
  box-shadow: inset 0 0 0 2px var(--ui-field);
  border-color: var(--ui-accent);
}
.seg-single {
  border: 1px solid var(--ui-border);
  background: var(--ui-field);
  color: var(--ui-text);
  font: var(--dobra-type-label-lg);
  border-radius: var(--dobra-radius);
}
.seg-single--accent {
  background: var(--ui-accent);
  color: var(--ui-on-accent);
  border-color: var(--ui-accent);
  font-weight: 600;
}
.tag {
  text-transform: uppercase;
  font: var(--dobra-type-label-sm);
  letter-spacing: var(--dobra-tracking-label-sm);
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  border-radius: var(--dobra-radius-sm);
  margin-left: 6px;
  padding: 3px 6px;
  font-weight: 600;
  display: inline-block;
}
.sidebar {
  border-left: 1px solid var(--ui-border);
  background: var(--ui-surface);
  backdrop-filter: blur(16px);
  flex: none;
  width: 320px;
  overflow-y: auto;
}
.panel__title {
  text-transform: uppercase;
  font: var(--dobra-type-label-md);
  letter-spacing: var(--dobra-tracking-label-md);
  color: var(--ui-muted);
  margin: 0 0 10px;
}
.panel__sub {
  font: var(--dobra-type-headline-sm);
  font-size: 13px;
  margin: 16px 0 8px;
}
.kv dd,
.device-caption,
.parity-table td {
  font: var(--dobra-type-label-lg);
  font-variant-numeric: tabular-nums;
}
.kv--dense dt,
.bar-notes code,
.rule-chip code {
  font-family: var(--dobra-font-mono);
}
.parity-table {
  background: var(--ui-flyout);
  backdrop-filter: blur(24px);
  border-radius: var(--dobra-radius-lg);
  box-shadow: var(--dobra-shadow-2);
}
```

The checked state is a filled square inside the 14 px box (an inset ring in the field color around a fold-colored fill), so it needs no image and follows both themes.

- [ ] **Step 2: Mark the overlay group**

In `apps/simulator/src/ui/App.tsx`, inside the `Overlays` control (around line 395), change `<div className="seg">` to `<div className="seg seg--chips">`. Nothing else in the file changes in this task.

- [ ] **Step 3: Run the tests and typecheck**

Run: `npm test -w @dobra/simulator && npm run typecheck -w @dobra/simulator`
Expected: PASS, typecheck clean.

- [ ] **Step 4: Screenshots**

In the Browser pane, screenshot the top bar and the sidebar in dark and in light. Expected: labels in caps mono; segmented controls as a compact track with a raised active segment; overlay toggles as chips with a 14 px box, checked ones cyan; 4 px radii; the inspector values in mono. Compare against `.redesign/dobra_size_class_foldable_simulator/screen.png` for the feel (not the content).

- [ ] **Step 5: Commit**

```bash
git add apps/simulator/src/styles/app.css apps/simulator/src/ui/App.tsx
git commit -m "Restyle the simulator controls, panels and type with the brand"
```

---

### Task 3: Logo and version badge in the top bar

**Files:**
- Create: `apps/simulator/src/ui/brand.ts`, `apps/simulator/src/ui/brand.test.ts`
- Modify: `apps/simulator/src/ui/App.tsx:113-118`, `apps/simulator/src/styles/app.css` (`.topbar__title`, new `.topbar__logo`, `.topbar__version`)

**Interfaces:**
- Consumes: `Theme` from `apps/simulator/src/ui/urlState.ts` (`'light' | 'dark'`); `@dobra/brand/logo.svg`, `@dobra/brand/logo-light.svg` (imported as URLs through Vite).
- Produces: `export function logoFor(theme: Theme): string` in `brand.ts`, returning the URL of the logo that reads on that theme's background.

- [ ] **Step 1: Write the failing test**

`apps/simulator/src/ui/brand.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { logoFor } from './brand';

describe('logoFor', () => {
  it('uses the light-lettered logo on the dark theme', () => {
    expect(logoFor('dark')).toMatch(/logo\.svg$/);
  });
  it('uses the dark-lettered logo on the light theme', () => {
    expect(logoFor('light')).toMatch(/logo-light\.svg$/);
  });
});
```

Vitest resolves `?url` style asset imports only through Vite; plain `import x from '…svg'` under Vitest returns the file path, which is what the test matches.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @dobra/simulator -- src/ui/brand.test.ts`
Expected: FAIL, "Failed to resolve import './brand'".

- [ ] **Step 3: Write `brand.ts`**

```ts
// Brand choices that depend on state: which logo reads on the current theme.
import logoDark from '@dobra/brand/logo.svg';
import logoLight from '@dobra/brand/logo-light.svg';
import type { Theme } from './urlState';

/** logo.svg has light letters for dark backgrounds; logo-light.svg has dark letters. */
export function logoFor(theme: Theme): string {
  return theme === 'dark' ? logoDark : logoLight;
}
```

- [ ] **Step 4: Run it**

Run: `npm test -w @dobra/simulator -- src/ui/brand.test.ts && npm run typecheck -w @dobra/simulator`
Expected: PASS; typecheck clean (`vite/client` types declare `*.svg` imports as `string`). If the test fails because the import does not come back as a string ending in the file name, switch both imports in `brand.ts` to the explicit `?url` form (`'@dobra/brand/logo.svg?url'`, `'@dobra/brand/logo-light.svg?url'`), rerun, and record the change as a ruling.

- [ ] **Step 5: Use it in the top bar**

In `App.tsx`, add `import { logoFor } from './brand';` with the other `./` imports, and replace:

```tsx
        <h1 className="topbar__title">
          Dobra Simulator <span className="tag">step 4</span>
          <span className="topbar__version" title="Version and build date of this copy">
            v{config.version} · {__BUILD_DATE__}
          </span>
        </h1>
```

with:

```tsx
        <h1 className="topbar__title">
          <img className="topbar__logo" src={logoFor(theme)} alt="Dobra" />
          <span className="tag">step 4</span>
          <span className="topbar__version" title="Version and build date of this copy">
            v{config.version} · {__BUILD_DATE__}
          </span>
        </h1>
```

In `app.css`, replace `.topbar__title` and add the two rules:

```css
.topbar__title {
  align-items: center;
  gap: 8px;
  margin: 0 16px 4px 0;
  display: flex;
}
.topbar__logo {
  height: 22px;
  width: auto;
  display: block;
}
.topbar__version {
  font: var(--dobra-type-label-sm);
  letter-spacing: var(--dobra-tracking-label-sm);
  color: var(--ui-muted);
  border: 1px solid var(--ui-border);
  border-radius: var(--dobra-radius-sm);
  padding: 3px 6px;
}
```

- [ ] **Step 6: Run everything and look**

Run: `npm test -w @dobra/simulator && npm run typecheck -w @dobra/simulator`
Expected: PASS. Screenshot the top bar in dark and light: the logo swaps letter color with the theme, and the version is a mono badge.

- [ ] **Step 7: Commit**

```bash
git add apps/simulator/src/ui/brand.ts apps/simulator/src/ui/brand.test.ts apps/simulator/src/ui/App.tsx apps/simulator/src/styles/app.css
git commit -m "Show the Dobra logo and a version badge in the simulator top bar"
```

---

### Task 4: Size-class hero card and finding status icons

**Files:**
- Modify: `apps/simulator/src/ui/brand.ts`, `apps/simulator/src/ui/brand.test.ts`, `apps/simulator/src/ui/Inspector.tsx:96-121`, `apps/simulator/src/styles/app.css` (`.rule-chip`, `.bar-notes`, new `.finding-icon`)
- Create: `apps/simulator/src/ui/StatusIcon.tsx`

**Interfaces:**
- Consumes: the finding shape from `@dobra/core/engine/checks` (`severity: 'error' | 'warn' | 'info'`).
- Produces: `export type StatusKind = 'error' | 'warn' | 'info'`; `export function statusIcon(severity: string): StatusKind` in `brand.ts` (unknown values map to `'info'`); `export function StatusIcon({ kind }: { kind: StatusKind })` in `StatusIcon.tsx`, rendering an inline 14 px SVG with `aria-hidden` and class `finding-icon finding-icon--<kind>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/simulator/src/ui/brand.test.ts`, and add `statusIcon` to its import from `./brand`:

```ts
describe('statusIcon', () => {
  it('gives each severity its own icon', () => {
    expect(statusIcon('error')).toBe('error');
    expect(statusIcon('warn')).toBe('warn');
    expect(statusIcon('info')).toBe('info');
  });
  it('falls back to info for a severity it does not know', () => {
    expect(statusIcon('fatal')).toBe('info');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @dobra/simulator -- src/ui/brand.test.ts`
Expected: FAIL, "statusIcon is not a function" (or not exported).

- [ ] **Step 3: Implement**

Append to `brand.ts`:

```ts
export type StatusKind = 'error' | 'warn' | 'info';

/** The icon for a finding's severity; anything unrecognised reads as information. */
export function statusIcon(severity: string): StatusKind {
  return severity === 'error' || severity === 'warn' ? severity : 'info';
}
```

`apps/simulator/src/ui/StatusIcon.tsx`:

```tsx
import type { StatusKind } from './brand';

// Three 14 px icons drawn with currentColor; the color comes from .finding-icon--<kind>.
const PATHS: Record<StatusKind, string> = {
  error: 'M7 1.5 12.5 12H1.5Z M7 5.5v3 M7 10.2v.1',
  warn: 'M7 1.75a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 7 1.75Z M7 4.5v3.2 M7 9.6v.1',
  info: 'M7 1.75a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 7 1.75Z M7 6.4v3.6 M7 4.4v.1',
};

export function StatusIcon({ kind }: { kind: StatusKind }) {
  return (
    <svg className={`finding-icon finding-icon--${kind}`} viewBox="0 0 14 14" width="14" height="14" aria-hidden>
      <path d={PATHS[kind]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 4: Run it**

Run: `npm test -w @dobra/simulator -- src/ui/brand.test.ts`
Expected: PASS.

- [ ] **Step 5: Use them in the inspector**

In `Inspector.tsx`, add `import { statusIcon } from './brand';` and `import { StatusIcon } from './StatusIcon';`. Replace the `rule-chip` block:

```tsx
      <div className="rule-chip">
        <span className="rule-chip__sc">{formatSizeClass(sc, android)}</span>
        <span>{layout.rule.label}</span>
        <code>{layout.rule.id}</code>
      </div>
```

with:

```tsx
      <div className="rule-chip">
        <span className="rule-chip__eyebrow">Size class</span>
        <span className="rule-chip__sc">{formatSizeClass(sc, android)}</span>
        <span className="rule-chip__label">{layout.rule.label}</span>
        <code>{layout.rule.id}</code>
      </div>
```

and in the findings list replace the `<li …>` opening and its first child:

```tsx
            <li data-kind={f.severity === 'error' ? 'overfull' : 'text-in-vertical'} key={i}>
              <code>{f.ruleId}</code> {f.message}{' '}
```

with:

```tsx
            <li data-kind={f.severity === 'error' ? 'overfull' : 'text-in-vertical'} key={i}>
              <StatusIcon kind={statusIcon(f.severity)} />
              <code>{f.ruleId}</code> {f.message}{' '}
```

"Size class" is the only new visible text; it labels the existing value the same way the mockup does. Record it as a ruling if a reviewer questions it.

- [ ] **Step 6: Style them**

In `app.css`, replace `.rule-chip`, `.rule-chip__sc`, `.rule-chip code` and `.bar-notes` rules with:

```css
.rule-chip {
  background: linear-gradient(135deg, color-mix(in srgb, var(--dobra-accent-2) 30%, var(--ui-flyout)), var(--ui-flyout));
  border: 1px solid color-mix(in srgb, var(--dobra-accent-2) 40%, transparent);
  border-radius: var(--dobra-radius-lg);
  color: var(--ui-text);
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
  padding: 12px 14px;
}
.rule-chip__eyebrow {
  text-transform: uppercase;
  font: var(--dobra-type-label-sm);
  letter-spacing: var(--dobra-tracking-label-sm);
  color: var(--ui-muted);
}
.rule-chip__sc {
  font: var(--dobra-type-headline-md);
  letter-spacing: var(--dobra-tracking-headline-md);
  overflow-wrap: anywhere;
}
.rule-chip__label {
  color: var(--ui-muted);
}
.rule-chip code {
  color: var(--ui-muted);
  font-size: 11px;
}
.bar-notes {
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
}
.bar-notes li {
  display: grid;
  grid-template-columns: 14px 1fr;
  gap: 2px 8px;
  align-items: start;
}
.bar-notes li > :not(.finding-icon) {
  grid-column: 2;
}
.finding-icon {
  margin-top: 2px;
}
.finding-icon--error {
  color: var(--ui-error);
}
.finding-icon--warn {
  color: var(--ui-warn);
}
.finding-icon--info {
  color: var(--ui-accent);
}
```

Environment notes (`data-kind="compression"`) have no icon; the `li > :not(.finding-icon)` rule keeps their text in the second column, so they align with findings.

- [ ] **Step 7: Run everything and look**

Run: `npm test -w @dobra/simulator && npm run typecheck -w @dobra/simulator`
Expected: PASS. Pick a device with findings (for example Galaxy Z Flip 7 cover, landscape) and screenshot the inspector in dark and light. Expected: a hero card with the size class large in Geist; each finding with a colored icon; nothing overflows the 320 px sidebar.

- [ ] **Step 8: Commit**

```bash
git add apps/simulator/src/ui/brand.ts apps/simulator/src/ui/brand.test.ts apps/simulator/src/ui/StatusIcon.tsx apps/simulator/src/ui/Inspector.tsx apps/simulator/src/styles/app.css
git commit -m "Show the size class as a hero card and give findings status icons"
```

---

### Task 5: Overlay colors and fold classes

**Files:**
- Modify: `apps/simulator/src/ui/brand.ts`, `apps/simulator/src/ui/brand.test.ts`, `apps/simulator/src/ui/Overlays.tsx:52-68`, `apps/simulator/src/styles/app.css` (`.ov-fold*`), `apps/simulator/src/styles/sample-app.css:1349-1353`

**Interfaces:**
- Consumes: `FoldFeature` from `@dobra/core/engine/folds` (`axis`, `separating`, `occludes`).
- Produces: `export function foldOverlayClass(fold: Pick<FoldFeature, 'axis' | 'separating' | 'occludes'>): string` in `brand.ts`, returning `ov-fold ov-fold--<axis>` plus `ov-fold--occludes` when `occludes`, or `ov-fold--line` when separating without occluding, or `ov-fold--flat` when not separating.

- [ ] **Step 1: Write the failing test**

Append to `brand.test.ts` (add `foldOverlayClass` to the import):

```ts
describe('foldOverlayClass', () => {
  it('draws a physical gap as a rose hatch', () => {
    expect(foldOverlayClass({ axis: 'vertical', separating: true, occludes: true })).toBe('ov-fold ov-fold--vertical ov-fold--occludes');
  });
  it('draws a separating crease as a cyan line', () => {
    expect(foldOverlayClass({ axis: 'horizontal', separating: true, occludes: false })).toBe('ov-fold ov-fold--horizontal ov-fold--line');
  });
  it('keeps a flat, non-separating crease dashed', () => {
    expect(foldOverlayClass({ axis: 'vertical', separating: false, occludes: false })).toBe('ov-fold ov-fold--vertical ov-fold--flat');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @dobra/simulator -- src/ui/brand.test.ts`
Expected: FAIL, `foldOverlayClass` not exported.

- [ ] **Step 3: Implement**

Append to `brand.ts`:

```ts
import type { FoldFeature } from '@dobra/core/engine/folds';

/** A gap that hides content is a hinge (rose); a separating crease is a fold line (cyan); a flat crease stays dashed. */
export function foldOverlayClass(fold: Pick<FoldFeature, 'axis' | 'separating' | 'occludes'>): string {
  const kind = fold.occludes ? 'occludes' : fold.separating ? 'line' : 'flat';
  return `ov-fold ov-fold--${fold.axis} ov-fold--${kind}`;
}
```

(Move the `import type` to the top of the file with the other imports.)

- [ ] **Step 4: Run it**

Run: `npm test -w @dobra/simulator -- src/ui/brand.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it and restyle the folds**

In `Overlays.tsx`, add `import { foldOverlayClass } from './brand';` and replace:

```tsx
              className={`ov-fold ov-fold--${fold.axis}${fold.separating ? '' : ' ov-fold--flat'}`}
```

with:

```tsx
              className={foldOverlayClass(fold)}
```

In `app.css`, after the existing `.ov-fold` rules, add (and delete the old `.ov-fold--flat` rule):

```css
.ov-fold--line,
.ov-fold--flat {
  background: var(--ov-fold);
  outline: 0;
  box-shadow: var(--dobra-glow);
}
.ov-fold--flat {
  background: none;
  outline: 1px dashed var(--ov-fold);
  box-shadow: none;
}
.ov-fold--line em,
.ov-fold--flat em {
  background: var(--ov-fold);
  color: var(--dobra-on-fold);
}
```

- [ ] **Step 6: Move the collision outline into the chrome**

Delete the `[data-collision] { … }` rule from `sample-app.css` (lines 1349–1353) and add to `app.css`:

```css
/* Important elements that sit in a fold or a reserved region (sample/collisions.ts). */
[data-collision] {
  outline: 2px solid var(--ui-error) !important;
  outline-offset: -2px;
  box-shadow: inset 0 0 0 9999px var(--ui-error-soft);
}
```

Record: `Ruling: moved [data-collision] from sample-app.css to app.css — it is the checker's outline, not the sample app's look — cost if wrong: none, same selector and specificity`.

- [ ] **Step 7: Run everything and look**

Run: `npm test -w @dobra/simulator && npm run typecheck -w @dobra/simulator`
Expected: PASS. Screenshots with Fold and Safe areas on, in dark and light:
- Surface Duo 2, spanned: a rose hatch at the hinge.
- Pixel 9 Pro Fold, inner, half-open (tabletop or book): a cyan line with a glow.
- Pixel 9 Pro Fold, inner, flat: a dashed cyan line.
- Any iPhone: indigo safe areas; a reserved region (Dynamic Island) in amber hatch.
- A screen with a collision: rose outline.

- [ ] **Step 8: Commit**

```bash
git add apps/simulator/src/ui/brand.ts apps/simulator/src/ui/brand.test.ts apps/simulator/src/ui/Overlays.tsx apps/simulator/src/styles/app.css apps/simulator/src/styles/sample-app.css
git commit -m "Draw folds, hinges, safe areas and collisions in the brand colors"
```

---

### Task 6: Favicon, single-file build, full check and PR

**Files:**
- Modify: `apps/simulator/index.html`, `apps/simulator/src/styles/chrome.test.ts`

**Interfaces:**
- Consumes: `@dobra/brand/favicon.svg`, `@dobra/brand/png/favicon-32.png`.

- [ ] **Step 1: Write the failing test**

Append to `chrome.test.ts`:

```ts
describe('simulator page', () => {
  it('links the brand favicon in SVG and PNG', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="../../packages/brand/favicon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="../../packages/brand/png/favicon-32.png" />');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @dobra/simulator -- src/styles/chrome.test.ts`
Expected: FAIL on the favicon test.

- [ ] **Step 3: Add the links**

In `apps/simulator/index.html`, after the viewport meta, add:

```html
    <link rel="icon" type="image/svg+xml" href="../../packages/brand/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="../../packages/brand/png/favicon-32.png" />
```

The relative path points at the workspace package on disk, so it works whether or not npm hoists `@dobra/brand`. Vite serves it in dev (the workspace root is inside its default `server.fs.allow`), rewrites it to a hashed asset in `build`, and inlines it in `build:single`. If Vite instead copies the path through unchanged (check the built `dist/index.html`), record it as a ruling and move the two links into `src/main.tsx` as `import faviconUrl from '@dobra/brand/favicon.svg'` plus a `<link>` added with `document.head.append`, and update the test to check `main.tsx`.

- [ ] **Step 4: Run the tests**

Run: `npm test -w @dobra/simulator`
Expected: PASS.

- [ ] **Step 5: Check both builds**

```bash
npm run build > "$SCRATCH/sim-build.log" 2>&1; tail -5 "$SCRATCH/sim-build.log"
npm run build:single > "$SCRATCH/sim-single.log" 2>&1; tail -5 "$SCRATCH/sim-single.log"
grep -c "fonts.googleapis" apps/simulator/dist-single/index.html
grep -c "font/woff2" apps/simulator/dist-single/index.html
grep -c "<title>Dobra</title>" apps/simulator/dist-single/index.html
```

Expected: both builds succeed; `fonts.googleapis` count 0; `font/woff2` count at least 3 (the three fonts inlined as data URLs); the logo's `<title>Dobra</title>` present at least once (the SVG inlined as a data URL may be base64; if the count is 0, check for `data:image/svg+xml` instead and record that). Open `dist-single/index.html` from disk in the Browser pane and confirm the fonts render (headings in Geist, numbers in JetBrains Mono).

- [ ] **Step 6: Narrow window and parity screenshots**

In the dev server: resize the Browser pane to 375 px wide (`resize_window` preset `mobile`), screenshot the top bar and the inspector (now under the canvas), then reset with preset `desktop`. Turn on Compare (side by side) and screenshot the parity table in dark and light. Expected: nothing overflows horizontally; the parity table is a Level 2 card.

- [ ] **Step 7: Full check**

Run: `npm run typecheck && npm test`
Expected: typecheck clean everywhere; all workspaces pass.

- [ ] **Step 8: Commit, push and open the PR**

```bash
git add apps/simulator/index.html apps/simulator/src/styles/chrome.test.ts
git commit -m "Use the Dobra favicon in the simulator"
git push -u origin feat/simulator-restyle
gh pr create --base main --title "Restyle the simulator with the Dobra visual identity" --label enhancement --label area:web --body "Closes #N

Slice 2 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md (§4).

- The chrome colors all come from @dobra/brand. A test fails on any color literal outside a --ui-* or --ov-* property.
- Geist for titles, Inter for body and JetBrains Mono for numbers and identifiers; a compact segmented track; checkbox chips for the overlays; Level 1 panels and a Level 2 parity table.
- The logo in the top bar, swapping with the theme, and the version as a badge.
- The size class as a hero card, and status icons on findings.
- Overlays: a separating crease is a cyan line with a glow, an occluding hinge is a rose hatch, safe areas are indigo, reserved regions are amber and collisions are rose.
- The brand favicon. The single-file build inlines the fonts and makes no network requests.

The simulated app's look is unchanged. Screenshots in dark and light are attached below."
```

Attach the dark and light screenshots from Steps 4–7 of the earlier tasks to the PR (drag them into the PR description on GitHub, or list their scratchpad paths in the final message if they cannot be uploaded).

- [ ] **Step 9: Merge once checks pass**

No manual step in this slice: once the PR is open and the full check passed, `gh pr merge --merge`, then delete the branch (remote and local) after confirming it is an ancestor of `origin/main`.
