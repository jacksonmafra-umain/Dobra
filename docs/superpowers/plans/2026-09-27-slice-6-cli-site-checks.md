# Slice 6 — Command-line website checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dobra check site <url>` opens a website in Chromium at every chosen device target,
emulates the hinge where the device has one, collects the page's layout, runs the same rules as
the plugin and the web report, checks the resize-versus-reload behaviour, and writes a report JSON
(and Markdown) the web report opens — with a non-zero exit code for CI.

**Architecture:** Core gains the `resize-vs-reload` rule as a pure comparison of two layout trees.
A new package, `packages/cli` (`@dobra/cli`), holds: argument parsing and target selection (pure,
unit-tested), a Playwright emulation layer (viewport, device scale, user agent, and the Chrome
DevTools `Emulation.setDisplayFeaturesOverride` for folds), an in-page DOM collector that returns
`GeoNode` trees, and `checkSite`, which builds a `Report` with core's `buildReport`. esbuild bundles
the CLI to one Node file with Playwright left external.

**Tech Stack:** Node 25, TypeScript 7, Vitest 4, Playwright 1.63 (Chromium), esbuild 0.28.

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §7 (CLI), §8
(`resize-vs-reload`, CLI only), §3.3 (CLI adapter: DOM rects → `GeoNode`), §10 (CLI tests against
local fixture pages that use `viewport-segments`), §11 risk 4 (CDP emulation is experimental and
Chromium-only), §12 slice 6.

## Global Constraints

- For each target: set the viewport, `deviceScaleFactor` and a platform user agent (spec §7.1).
- For folded or spanned targets, emulate the fold through the CDP display-feature override so
  `@media (horizontal-viewport-segments: 2)`, `env(viewport-segment-*)` and
  `window.viewportSegments` respond (spec §7.2). WebKit cannot emulate segments, so iOS targets
  are size-only (spec §7.2) — this slice runs iOS targets in Chromium with an iOS user agent and
  no display feature.
- Collect rects and computed font sizes of headings, text blocks, interactive elements and
  landmarks, plus `documentElement.scrollWidth` (spec §7.3).
- Transition pass: resize cover → inner without reloading and collect again (spec §7.4).
- Output: a report JSON the web report imports (spec §7); `source.kind = 'web'`.
- The rule set is shared with the plugin (spec §8); `resize-vs-reload` is added and is CLI-only.
- Browsers: Playwright's Chromium. Downloading a browser build needs the user's permission first
  (state the command, source and size).
- `core` stays free of React and the DOM. Commits in English, microcommits, never mention the
  assistant. Never push to or merge into `main`; the PR closes a labeled issue
  (`enhancement`, `area:cli`).
- Base branch: `feat/web-report` (PR #22). Work branch: `feat/cli-site-checks`.

## Review Focus

1. A page that never reaches network idle (analytics beacons, long polling) — expected: the load
   waits for `load` plus a settle delay (`--wait`, default 500 ms), then continues with a note;
   it never hangs (test with a fixture that polls forever, Task 5).
2. A page that is much taller than the viewport — expected: the collector records every element
   in document coordinates (not only what is on screen), so a button further down that sits on
   the hinge is still found (Task 4).
3. A site with thousands of elements — expected: the collector caps at 4 000 nodes and the report
   says the page was truncated, instead of an enormous JSON (Task 4).
4. An unreachable URL or a 4xx/5xx response — expected: that target goes to `unloaded` with the
   status, the other targets still run, and the exit code reflects it (Task 5 and Task 6).
5. A device without a hinge (a phone) — expected: no display feature is set and
   `matchMedia('(horizontal-viewport-segments: 2)')` stays false (Task 3).

---

### Task 0: Branch

- [ ] **Step 1**

```bash
git fetch origin
git switch -c feat/cli-site-checks origin/feat/web-report
npm install && npm test
git add docs/superpowers/plans/2026-09-27-slice-6-cli-site-checks.md
git commit -m "Add the implementation plan for the command-line site checks"
```
Expected: tests pass (core 279, plugin 47, report 14, simulator 72 at the time of writing).

### Task 1: The resize-vs-reload rule in core

**Files:** Create `packages/core/src/transition.ts`, `packages/core/src/transition.test.ts`;
modify `packages/core/src/engine/checks.ts` (`RuleId` gains `'resize-vs-reload'`).

**Interfaces:** Produces
`resizeVsReload(afterResize: GeoNode[], afterReload: GeoNode[], target: Target, opts?: { tolerance?: number; minMoved?: number }): Finding[]`
— elements are matched by `id` (the collector's stable DOM path); an element counts as moved when
any rect edge differs by more than `tolerance` (default 4 px); one finding per target when at least
`minMoved` (default 3) elements moved, listing up to five names.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { GeoNode } from './geo';
import { resizeVsReload } from './transition';

const T = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'open', orientation: 'portrait' } as const;
const n = (id: string, x: number, width = 100): GeoNode => ({ id, name: id, role: 'container', rect: { x, y: 0, width, height: 50 } });

describe('resize-vs-reload', () => {
  it('passes when resizing lays the page out as a reload would', () => {
    expect(resizeVsReload([n('a', 0), n('b', 100)], [n('a', 2), n('b', 101)], T)).toEqual([]);
  });

  it('reports a page that only lays itself out on load', () => {
    const resized = [n('a', 0, 360), n('b', 0, 360), n('c', 0, 360), n('d', 0, 360)];
    const reloaded = [n('a', 0, 750), n('b', 0, 375), n('c', 375, 375), n('d', 0, 750)];
    const [f] = resizeVsReload(resized, reloaded, T);
    expect(f).toMatchObject({ ruleId: 'resize-vs-reload', severity: 'warn', target: T });
    expect(f.message).toMatch(/4 elements/);
  });

  it('ignores elements that exist in only one of the two layouts', () => {
    expect(resizeVsReload([n('a', 0), n('only-before', 0)], [n('a', 0), n('only-after', 500)], T)).toEqual([]);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

```ts
// resize-vs-reload (spec §8, CLI only): unfolding a foldable resizes the window without reloading.
// A page that lays itself out only on load looks different from a fresh load at the new size.
import type { Finding, Target } from './engine/checks';
import { walk, type GeoNode } from './geo';

export function resizeVsReload(
  afterResize: GeoNode[],
  afterReload: GeoNode[],
  target: Target,
  { tolerance = 4, minMoved = 3 }: { tolerance?: number; minMoved?: number } = {},
): Finding[] {
  const before = new Map(walk(afterResize).map((p) => [p.node.id, p.node]));
  const moved: GeoNode[] = [];
  for (const { node } of walk(afterReload)) {
    const b = before.get(node.id);
    if (!b) continue;
    const r = node.rect;
    const edges = [b.rect.x - r.x, b.rect.y - r.y, b.rect.x + b.rect.width - (r.x + r.width), b.rect.y + b.rect.height - (r.y + r.height)];
    if (edges.some((d) => Math.abs(d) > tolerance)) moved.push(node);
  }
  if (moved.length < minMoved) return [];
  const names = moved.slice(0, 5).map((m) => m.name).join(', ');
  return [
    {
      ruleId: 'resize-vs-reload',
      severity: 'warn',
      target,
      nodeId: moved[0].id,
      rect: moved[0].rect,
      message: `${moved.length} elements sit differently after unfolding than after a reload at the same size (${names}${moved.length > 5 ? ', …' : ''}); the page lays itself out only on load.`,
      source: 'estimated',
      estimated: false,
    },
  ];
}
```
- [ ] **Step 3:** `npm test -w @dobra/core && npm run typecheck` → PASS. **Step 4: Commit**

```bash
git add packages/core/src/transition.ts packages/core/src/transition.test.ts packages/core/src/engine/checks.ts
git commit -m "Compare a resized layout with a reloaded one"
```

### Task 2: CLI package, arguments and target selection

**Files:**
- Create: `packages/cli/{package.json,tsconfig.json,vitest.config.ts,build.mjs}`,
  `packages/cli/src/{args.ts,args.test.ts,targets.ts,targets.test.ts}`

**Interfaces:**
- `parseArgs(argv: string[]): CliOptions | { help: string }` with
  `CliOptions = { command: 'site'; url: string; targets: string[] | null; categories: string[]; out: string; md: string | null; wait: number; failOn: 'error' | 'warn' | 'never'; transitions: boolean }`.
- `chooseTargets(catalog: Catalog, opts: Pick<CliOptions, 'targets' | 'categories'>): Target[]` —
  explicit keys (validated, readable error naming the key) > categories (every target of those
  categories) > default: the representative target of every required requirement (deduplicated).

- [ ] **Step 1: Package** — `packages/cli/package.json`:

```json
{
  "name": "@dobra/cli",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "bin": { "dobra": "dist/dobra.mjs" },
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "@dobra/core": "*", "playwright": "^1.63.0" },
  "devDependencies": { "@types/node": "^26.6.2", "esbuild": "^0.28.2", "typescript": "^7.0.2", "vitest": "^4.1.11" }
}
```
`build.mjs`: esbuild `src/main.ts` → `dist/dobra.mjs`, `platform: 'node'`, `format: 'esm'`,
`target: 'node22'`, `bundle: true`, `external: ['playwright', 'playwright-core']`,
`banner: { js: '#!/usr/bin/env node' }`; then `chmodSync('dist/dobra.mjs', 0o755)`.
`tsconfig.json`: `lib: ['ES2023', 'DOM']` (the collector runs in the page), `types: ['node']`,
strict, bundler resolution, `resolveJsonModule`, `noEmit`. `vitest.config.ts`: node environment,
`src/**/*.test.ts`, `testTimeout: 60_000` (browser tests).
Root scripts: `"dobra": "node packages/cli/dist/dobra.mjs"`, `"build:cli": "npm run build -w @dobra/cli"`.

- [ ] **Step 2: Failing tests** `args.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';

describe('parseArgs', () => {
  it('reads a site check with defaults', () => {
    expect(parseArgs(['check', 'site', 'https://example.com'])).toEqual({
      command: 'site', url: 'https://example.com', targets: null, categories: [], out: 'foldable-report.json', md: null, wait: 500, failOn: 'error', transitions: true,
    });
  });

  it('reads targets, categories, outputs and thresholds', () => {
    const o = parseArgs(['check', 'site', 'http://localhost:3000', '--targets', 'pixel-9/main/-/portrait,surface-duo-2/spanned/spanned/landscape', '--category', 'foldable-book', '--out', 'r.json', '--md', 'r.md', '--wait', '1200', '--fail-on', 'warn', '--no-transitions']);
    expect(o).toMatchObject({ targets: ['pixel-9/main/-/portrait', 'surface-duo-2/spanned/spanned/landscape'], categories: ['foldable-book'], out: 'r.json', md: 'r.md', wait: 1200, failOn: 'warn', transitions: false });
  });

  it('returns help for a missing URL or an unknown command', () => {
    expect(parseArgs(['check', 'site'])).toHaveProperty('help');
    expect(parseArgs(['frobnicate'])).toHaveProperty('help');
    expect(parseArgs(['check', 'site', 'ftp://x'])).toHaveProperty('help');
  });
});
```
`targets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { targetKey } from '@dobra/core/targets';
import { chooseTargets } from './targets';

const catalog = loadCatalog();

describe('chooseTargets', () => {
  it('defaults to one device per required coverage cell', () => {
    const keys = chooseTargets(catalog, { targets: null, categories: [] }).map(targetKey);
    expect(keys).toContain('surface-duo-2/spanned/spanned/landscape');
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThanOrEqual(catalog.requirements.length);
  });

  it('takes explicit keys and names an unknown one', () => {
    expect(chooseTargets(catalog, { targets: ['pixel-9/main/-/portrait'], categories: [] }).map(targetKey)).toEqual(['pixel-9/main/-/portrait']);
    expect(() => chooseTargets(catalog, { targets: ['nope/x/-/portrait'], categories: [] })).toThrow(/nope\/x\/-\/portrait/);
  });

  it('expands categories to all their targets', () => {
    const keys = chooseTargets(catalog, { targets: null, categories: ['dual-screen'] }).map(targetKey);
    expect(keys.every((k) => k.startsWith('surface-duo-2/'))).toBe(true);
  });
});
```
Run: `npm install && npm test -w @dobra/cli` → FAIL.

- [ ] **Step 3: Implement** `args.ts` with `node:util`'s `parseArgs` (`allowPositionals: true`,
  options `targets`, `category` (multiple), `out`, `md`, `wait`, `fail-on`, `no-transitions`
  (boolean), `help`). Positionals must be `check site <url>`; the URL must parse with `new URL`
  and use `http:` or `https:`; `--wait` must be a non-negative integer; `--fail-on` one of
  `error|warn|never`. Anything else returns `{ help: USAGE }` where `USAGE` is:

```
Usage: dobra check site <url> [options]

  --targets <keys>     Comma-separated target keys (device/display/posture/orientation)
  --category <name>    Every target of a category; repeat for more
  --out <file>         Report JSON path (default foldable-report.json)
  --md <file>          Also write a Markdown summary
  --wait <ms>          Settle time after load (default 500)
  --fail-on <level>    Exit 1 on findings of this level: error, warn or never (default error)
  --no-transitions     Skip the unfold (resize without reload) pass
```
  `targets.ts`: explicit keys → `parseTargetKey` + `isKnownTarget(envConfigOf(catalog), t)`, else
  `throw new Error(`Unknown target ${key}`)`; categories → `enumerateTargets` filtered by the
  device category; default → `representativeTarget` for every `required` requirement, deduplicated
  by `targetKey`.
- [ ] **Step 4:** `npm test -w @dobra/cli && npm run typecheck -w @dobra/cli` → PASS.
  **Step 5: Commit**

```bash
git add packages/cli package.json package-lock.json
git commit -m "Add the hinge CLI package with argument parsing and target selection"
```

### Task 3: Browser emulation per target

**Files:** Create `packages/cli/src/emulate.ts`, `packages/cli/src/emulate.test.ts`,
`packages/cli/src/test/server.ts` (a tiny `node:http` fixture server),
`packages/cli/src/test/fixtures/segments.html`

**Interfaces:**
- Produces:
  - `deviceProfile(config: EnvConfig, t: Target): { width: number; height: number; deviceScaleFactor: number; userAgent: string; isMobile: boolean; hasTouch: boolean; fold: { orientation: 'vertical' | 'horizontal'; offset: number; maskLength: number } | null }`
    — size from `resolveTarget`; scale from the display (`density` on Android, `scale` on iOS);
    fold only when a fold separates or occludes and the platform is Android (spec §7.2);
    `offset`/`maskLength` in CSS px along the axis (fold start and thickness).
  - `openTarget(browser: Browser, profile): Promise<{ context: BrowserContext; page: Page; applyFold(fold): Promise<void> }>`
    — new context with viewport, `deviceScaleFactor`, `userAgent`, `isMobile`, `hasTouch`; a CDP
    session from `context.newCDPSession(page)`; `applyFold` sends
    `Emulation.setDisplayFeaturesOverride` with `{ features: [{ orientation, offset, maskLength }] }`
    or `Emulation.clearDisplayFeaturesOverride` when `null`.
  - `startFixtureServer(): Promise<{ url: string; close(): Promise<void> }>` (tests only) serving
    `src/test/fixtures/*.html`.
- User agents: Android `Mozilla/5.0 (Linux; Android 16; <device name>) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36`
  (drop `Mobile` for tablets and desktops); iOS `Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1`
  (`iPad` form for tablets).

- [ ] **Step 1: Browser** — `npx playwright --version`; check `~/Library/Caches/ms-playwright`
  for the Chromium revision Playwright 1.63 expects (`npx playwright install --dry-run chromium`).
  If it is missing, **stop and ask the user** before running `npx playwright install chromium`
  (downloads Chromium, about 150 MB, from Playwright's CDN).
- [ ] **Step 2: Fixture** `segments.html`:

```html
<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { margin: 0; }
  #probe { display: none; }
  @media (horizontal-viewport-segments: 2) { #probe { display: block; } }
</style>
<div id="probe">two segments</div>
<script>
  window.report = () => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    twoSegments: matchMedia('(horizontal-viewport-segments: 2)').matches,
    segments: (window.viewportSegments ?? []).map((s) => [s.x, s.width]),
    ua: navigator.userAgent,
  });
</script>
```
- [ ] **Step 3: Failing test** `emulate.test.ts`:

```ts
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { envConfigOf } from '@dobra/core/targets';
import { deviceProfile, openTarget } from './emulate';
import { startFixtureServer } from './test/server';

const config = envConfigOf(loadCatalog());
let browser: Browser;
let server: Awaited<ReturnType<typeof startFixtureServer>>;
beforeAll(async () => {
  browser = await chromium.launch();
  server = await startFixtureServer();
});
afterAll(async () => {
  await browser.close();
  await server.close();
});

describe('emulation', () => {
  it('describes a spanned Surface Duo 2 with a vertical fold', () => {
    expect(deviceProfile(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' })).toMatchObject({
      width: 1100, height: 756, deviceScaleFactor: 2.5, isMobile: true, fold: { orientation: 'vertical', offset: 537, maskLength: 26 },
    });
  });

  it('gives a phone no fold and an iPhone an iOS user agent', () => {
    expect(deviceProfile(config, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' }).fold).toBeNull();
    expect(deviceProfile(config, { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait' }).userAgent).toMatch(/iPhone/);
  });

  it('makes the page see two viewport segments across the hinge', async () => {
    const profile = deviceProfile(config, { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' });
    const { context, page, applyFold } = await openTarget(browser, profile);
    await applyFold(profile.fold);
    await page.goto(`${server.url}/segments.html`);
    const r = await page.evaluate(() => (window as unknown as { report(): Record<string, unknown> }).report());
    expect(r).toMatchObject({ width: 1100, height: 756, dpr: 2.5, twoSegments: true });
    await context.close();
  });

  it('keeps one segment on a phone', async () => {
    const profile = deviceProfile(config, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' });
    const { context, page } = await openTarget(browser, profile);
    await page.goto(`${server.url}/segments.html`);
    expect(await page.evaluate(() => matchMedia('(horizontal-viewport-segments: 2)').matches)).toBe(false);
    await context.close();
  });
});
```
Run → FAIL.
- [ ] **Step 4: Implement** `emulate.ts` and `test/server.ts` (a `node:http` server on port `0`
  serving files from the fixtures folder by name, `404` otherwise, with `/slow` answering after
  30 s and `/poll.html` for Task 5). If Chromium rejects `setDisplayFeaturesOverride` (the method
  is experimental), try the newer `Emulation.setDevicePostureOverride({ posture: { type: 'folded' } })`
  together with it; if neither makes `twoSegments` true, keep size-only emulation, mark every
  hinge finding for that run `estimated: true`, and ledger it.
- [ ] **Step 5:** `npm test -w @dobra/cli && npm run typecheck -w @dobra/cli` → PASS.
  **Step 6: Commit**

```bash
git add packages/cli/src
git commit -m "Emulate device size, scale, user agent and the hinge in Chromium"
```

### Task 4: Collecting the page's layout

**Files:** Create `packages/cli/src/collect.ts`, `packages/cli/src/collect.test.ts`,
`packages/cli/src/test/fixtures/layout.html`, `packages/cli/src/test/fixtures/huge.html`

**Interfaces:** Produces `collectLayout(page: Page, cap?: number): Promise<{ root: GeoNode[]; scrollWidth: number; truncated: boolean }>`
— runs one `page.evaluate` with a self-contained function (no imports inside it).

- [ ] **Step 1: Fixtures** — `layout.html`: a header (`<header>` with a `<nav>`), an `<h1>`, a
  paragraph of 80 characters, a button at `left: 530px; top: 1500px` (below the fold), a
  horizontal scroller (`overflow-x: auto`) with wide children, an element `width: 1400px` outside
  any scroller, and a clipped container (`overflow: hidden`) with a wide image. `huge.html`: a
  script that appends 6 000 `<button>` elements.
- [ ] **Step 2: Failing test** `collect.test.ts` (same browser/server setup as Task 3, a Surface
  Duo 2 spanned profile):
  - roles: `header`/`nav` → `chrome`; `h1`/`p` → `text` with `chars`; `button` → `interactive`;
    `img` → `media`; scroller → `scrollAxis: 'x'`; clipped container → `clips: true`.
  - the button's `rect.y` is about 1500 (document coordinates, page not scrolled).
  - `scrollWidth` is at least 1400.
  - `huge.html` with `cap: 4000` → 4 000 nodes and `truncated: true`.
  - running `check()` from core on the collected tree for the Duo target reports `hinge-content`
    for the button and `overflow-x` for the 1400 px element but not for the clipped image.
  Run → FAIL.
- [ ] **Step 3: Implement** `collect.ts`:

```ts
// The page's layout as GeoNodes, in document coordinates. Runs inside the page: no imports.
import type { GeoNode } from '@dobra/core/geo';
import type { Page } from 'playwright';

export async function collectLayout(page: Page, cap = 4000): Promise<{ root: GeoNode[]; scrollWidth: number; truncated: boolean }> {
  return page.evaluate((limit) => {
    const TEXT = 'h1,h2,h3,h4,h5,h6,p,li,label,dt,dd,td,th,figcaption,blockquote';
    const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[tabindex]:not([tabindex="-1"])';
    const CHROME = 'header,nav,footer,[role=banner],[role=navigation],[role=contentinfo]';
    const MEDIA = 'img,video,picture,canvas,svg,iframe';
    let count = 0;
    let truncated = false;
    const pathOf = (el: Element): string => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const i = e.parentElement ? Array.prototype.indexOf.call(e.parentElement.children, e) : 0;
        parts.unshift(`${e.tagName.toLowerCase()}:${i}`);
      }
      return parts.join('/');
    };
    const roleOf = (el: Element, style: CSSStyleDeclaration): GeoNode['role'] | null => {
      if (el.matches(CHROME) || style.position === 'fixed' || style.position === 'sticky') return 'chrome';
      if (el.matches(INTERACTIVE)) return 'interactive';
      if (el.matches(MEDIA)) return 'media';
      if (el.matches(TEXT) && (el.textContent ?? '').trim()) return 'text';
      if (style.display.includes('flex') || style.display.includes('grid') || /auto|scroll|hidden/.test(style.overflowX + style.overflowY)) return 'container';
      return null;
    };
    const convert = (el: Element): GeoNode[] => {
      const out: GeoNode[] = [];
      for (const child of Array.from(el.children)) {
        if (count >= limit) {
          truncated = true;
          break;
        }
        const style = getComputedStyle(child);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const role = roleOf(child, style);
        const inner = role === 'media' ? [] : convert(child);
        if (!role) {
          out.push(...inner);
          continue;
        }
        count++;
        const r = child.getBoundingClientRect();
        const g: GeoNode = {
          id: pathOf(child),
          name: (child.getAttribute('aria-label') || child.id || child.tagName.toLowerCase()) + ((child.textContent ?? '').trim() ? ` "${(child.textContent ?? '').trim().slice(0, 24)}"` : ''),
          role,
          rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
          scrollAxis: /auto|scroll/.test(style.overflowX) && child.scrollWidth > child.clientWidth ? 'x' : /auto|scroll/.test(style.overflowY) && child.scrollHeight > child.clientHeight ? 'y' : 'none',
          layout: style.display.includes('flex') ? (style.flexDirection.startsWith('row') ? 'horizontal' : 'vertical') : style.display.includes('grid') ? 'horizontal' : 'none',
          ...(style.overflowX === 'hidden' || style.overflowY === 'hidden' || style.overflow === 'clip' ? { clips: true } : {}),
        };
        if (role === 'text') {
          g.chars = (child.textContent ?? '').trim().length;
          g.fontSize = parseFloat(style.fontSize);
        }
        if (inner.length) g.children = inner;
        out.push(g);
      }
      return out;
    };
    const root = convert(document.body);
    return { root, scrollWidth: document.documentElement.scrollWidth, truncated };
  }, cap);
}
```
  The collector keeps only elements that carry a role and lifts the children of role-less
  wrappers, so the tree mirrors what the rules care about. Adjust `roleOf` only if a fixture
  assertion shows a wrong role, and ledger it.
- [ ] **Step 4:** `npm test -w @dobra/cli && npm run typecheck -w @dobra/cli` → PASS.
  **Step 5: Commit**

```bash
git add packages/cli/src
git commit -m "Collect a page's layout as a geometry tree in document coordinates"
```

### Task 5: Checking a site

**Files:** Create `packages/cli/src/checkSite.ts`, `packages/cli/src/checkSite.test.ts`,
`packages/cli/src/test/fixtures/{onload.html,poll.html}`

**Interfaces:** Produces
`checkSite(url: string, targets: Target[], opts: { wait: number; transitions: boolean; browser?: Browser; onProgress?: (msg: string) => void }): Promise<Report>`.

- [ ] **Step 1: Fixtures** — `onload.html`: a script that sets each card's width once, on
  `load`, from `innerWidth` (and never on resize), with four cards; `poll.html`: a script that
  `fetch`es `/slow` every 100 ms forever, plus a normal layout.
- [ ] **Step 2: Failing test** `checkSite.test.ts`:
  - `layout.html` for `[surface-duo-2 spanned landscape, pixel-9 portrait]` → a report with
    `source.kind: 'web'`, two frames with `confidence: 'tag'`, `hinge-content` on the Duo frame
    and not on the Pixel frame, coverage counting the Duo cell.
  - `onload.html` for `galaxy-z-fold-7/inner/open/portrait` with `transitions: true` → the inner
    frame has a `resize-vs-reload` finding; with `transitions: false` it has none.
  - `poll.html` finishes within 10 s (never waits for network idle).
  - `http://127.0.0.1:1/` (nothing listening) → every target in `unloaded` with a reason, no throw.
  - a `404` page → `unloaded` with `HTTP 404`.
  Run → FAIL.
- [ ] **Step 3: Implement** `checkSite.ts`:

```ts
// dobra check site: one Chromium context per target, the same rules as the plugin, and an unfold pass.
import { loadCatalog } from '@dobra/core/catalog/load';
import type { Finding } from '@dobra/core/engine/checks';
import { buildReport, type Report, type ReportInput } from '@dobra/core/report';
import { envConfigOf, targetKey, type Target } from '@dobra/core/targets';
import { resizeVsReload } from '@dobra/core/transition';
import { chromium, type Browser, type Page } from 'playwright';
import { collectLayout } from './collect';
import { deviceProfile, openTarget } from './emulate';

const catalog = loadCatalog();
const config = envConfigOf(catalog);

async function load(page: Page, url: string, wait: number): Promise<void> {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
  await page.waitForTimeout(wait);
}

/** The cover target of the same device, to unfold from. */
function coverOf(t: Target): Target | null {
  const d = config.devices.find((x) => x.id === t.deviceId);
  if (!d || d.platform !== 'android') return null;
  const cover = d.postures?.find((p) => p.kind === 'cover');
  if (!cover || cover.display === t.displayId) return null;
  return { deviceId: d.id, displayId: cover.display, pose: cover.id, orientation: 'portrait' };
}

export async function checkSite(url: string, targets: Target[], opts: { wait: number; transitions: boolean; browser?: Browser; onProgress?: (msg: string) => void }): Promise<Report> {
  const browser = opts.browser ?? (await chromium.launch());
  const inputs: ReportInput[] = [];
  const extra = new Map<string, Finding[]>();
  try {
    for (const t of targets) {
      const key = targetKey(t);
      opts.onProgress?.(`Checking ${key}`);
      const profile = deviceProfile(config, t);
      const base = { ref: `${url}#${key}`, name: key, page: url, width: profile.width, height: profile.height, tag: key };
      const { context, page, applyFold } = await openTarget(browser, profile);
      try {
        await applyFold(profile.fold);
        await load(page, url, opts.wait);
        const { root, truncated } = await collectLayout(page);
        inputs.push({ ...base, root, ...(truncated ? { reason: 'Page truncated at 4000 elements' } : {}) });

        const cover = opts.transitions ? coverOf(t) : null;
        if (cover) {
          const from = deviceProfile(config, cover);
          const unfold = await openTarget(browser, from);
          try {
            await unfold.applyFold(from.fold);
            await load(unfold.page, url, opts.wait);
            await unfold.page.setViewportSize({ width: profile.width, height: profile.height });
            await unfold.applyFold(profile.fold);
            await unfold.page.waitForTimeout(opts.wait);
            const resized = await collectLayout(unfold.page);
            extra.set(base.ref, resizeVsReload(resized.root, root, t));
          } finally {
            await unfold.context.close();
          }
        }
      } catch (e) {
        inputs.push({ ...base, root: null, reason: e instanceof Error ? e.message.split('\n')[0] : String(e) });
      } finally {
        await context.close();
      }
    }
  } finally {
    if (!opts.browser) await browser.close();
  }
  const report = buildReport(catalog, { kind: 'web', ref: url, name: url }, inputs);
  for (const f of report.frames) f.findings.push(...(extra.get(f.ref) ?? []));
  return report;
}
```
  A truncated page still gets its findings; its `reason` is ignored by `buildReport` because
  `root` is set — record truncation instead as an `info` finding on the frame (`ruleId:
  'overflow-x'` is wrong for it): add a report-level `notes: string[]` field to core's `Report`
  (optional in the schema, so older reports still parse) and push `"<key>: page truncated at 4000 elements"`.
  Ledger that schema addition.
- [ ] **Step 4:** `npm test -w @dobra/cli && npm test -w @dobra/core && npm run typecheck` → PASS.
  **Step 5: Commit** (two: core `notes`; CLI `checkSite`)

```bash
git add packages/core/src/report.ts packages/core/src/report.test.ts
git commit -m "Allow notes on a report"
git add packages/cli/src
git commit -m "Check a site at every target, with an unfold pass"
```

### Task 6: The command

**Files:** Create `packages/cli/src/main.ts`, `packages/cli/src/main.test.ts`

**Interfaces:** Produces `run(argv: string[], io: { out(s: string): void; err(s: string): void; writeFile(path: string, data: string): Promise<void>; check?: typeof checkSite }): Promise<number>`
(exit code) and the entry `main.ts` calls `process.exit(await run(process.argv.slice(2), realIo))`
when run directly.

- [ ] **Step 1: Failing test** `main.test.ts` (with a fake `check` returning a fixed report):
  - help → prints usage to `out`, returns `2`;
  - a clean report → writes the JSON to `--out`, prints a one-line summary per frame, returns `0`;
  - an `error` finding with the default `--fail-on error` → returns `1`; with `--fail-on never` → `0`;
    a `warn` finding with `--fail-on warn` → `1`;
  - `--md r.md` → also writes Markdown (`toMarkdown`);
  - unloaded targets → listed on `err`, and return `1` unless `--fail-on never`;
  - an unknown target key → message on `err`, returns `2`.
  Run → FAIL.
- [ ] **Step 2: Implement** `run` (parse, `chooseTargets`, `check`, write files with
  `node:fs/promises`, summarise: `✓`/`⛔`/`⚠️` per frame with counts, then the coverage line
  `Coverage: <present>/<required> required cells`), and the entry point. Keep all Playwright use
  inside `checkSite` so `run` stays unit-testable.
- [ ] **Step 3:** `npm test -w @dobra/cli && npm run build:cli && node packages/cli/dist/dobra.mjs --help`
  → PASS; the help text prints. Then a real smoke run against a fixture:
  `node packages/cli/dist/dobra.mjs check site <fixture server>/layout.html --targets surface-duo-2/spanned/spanned/landscape --out $SCRATCH/cli.json`
  exits `1` (the fixture has a hinge error) and writes a report the web report's `parseReport`
  accepts (open it in the report page in the built-in browser).
- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/main.ts packages/cli/src/main.test.ts
git commit -m "Add the dobra check site command with CI exit codes"
```

### Task 7: README, issue and PR

- [ ] **Step 1:** `packages/cli/README.md`: install and build, the browser download
  (`npx playwright install chromium`), usage and options, what is emulated (size, scale, user
  agent, the hinge through Chrome DevTools on Android targets; iOS targets size-only), the rules
  including `resize-vs-reload`, the exit codes for CI, and a GitHub Actions snippet:

```yaml
- run: npm ci && npx playwright install --with-deps chromium && npm run build:cli
- run: npm run dobra -- check site ${{ env.PREVIEW_URL }} --out foldable-report.json --md foldable-report.md
- uses: actions/upload-artifact@v4
  with: { name: foldable-report, path: "foldable-report.*" }
```
- [ ] **Step 2:** Issue:

```bash
gh issue create -R jacksonmafra-umain/Dobra \
  --title "CLI: check a website on foldable devices" --label enhancement --label area:cli \
  --body "Slice 6 of docs/superpowers/specs/2026-09-25-foldable-artboards-design.md. dobra check site <url> opens the site in Chromium at every device target, emulates the hinge, runs the foldable rules plus resize-vs-reload, and writes a report JSON (and Markdown) the web report opens, with CI exit codes."
```
- [ ] **Step 3:** `git push -u origin feat/cli-site-checks`; PR targeting `feat/web-report`,
  labels `enhancement,area:cli`, body `Closes #N`, Summary, Test plan (counts, typecheck, builds,
  browser integration tests, the smoke run, the report page opening the CLI output). No assistant
  mention.
