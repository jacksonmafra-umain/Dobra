# `@dobra/brand` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `packages/brand`, the one place Dobra's colors, type, radii, spacing, fonts, logo and icon are defined, so the simulator, report, plugin and site can import it.

**Architecture:** A workspace package that ships static files (`tokens.css`, `fonts.css`, the woff2 fonts, SVGs, PNGs) plus one TypeScript mirror of the theme tokens (`tokens.ts`) for code without CSS. Generated assets (fonts copied from `@fontsource`, the outlined logo, the PNGs) come from scripts in `scripts/` that are run by hand; their output is committed. Vitest checks that the files agree with each other and meet the contrast floor.

**Tech Stack:** Plain CSS custom properties, TypeScript 7, Vitest 4, `@fontsource-variable/{geist,inter,jetbrains-mono}` 5.3, `@fontsource/geist` 5.3 (static woff for outlining), `opentype.js` 2.0, `@resvg/resvg-js` 2.6.

**Spec:** `docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md` (§2, §3; §6 for why `tokens.ts` exists).

## Global Constraints

- Dark is the default and lives on `:root`; light lives under `[data-theme='light']`. Surfaces switch theme by setting `data-theme` on an element; the tokens never read `prefers-color-scheme` themselves.
- Token values are exactly those in spec §3.1. `--dobra-fold` is `#00F0FF` dark, `#007C85` light.
- Contrast floor, both themes: text, muted and the four accents at least 4.5:1 on `--dobra-bg`; text and muted at least 4.5:1 on the panel composited over the bg; `--dobra-on-fold` at least 4.5:1 on `--dobra-fold`.
- Fonts are Latin subset woff2 only, bundled in the package. No network fetches anywhere at runtime.
- The logo is outlined paths: no `<text>`, has a `viewBox` and `<title>Dobra</title>`. The fold line is `#00F0FF` on the dark variant (`#007C85` on the light variant, so it stays visible on white).
- Every SVG has a `viewBox`, no `<text>`, and renders with resvg.
- No new dependencies in any other workspace in this plan.
- Workflow: a labeled GitHub issue, branch `feat/brand-package` from `main`, microcommits in plain English with no assistant mention and no trailers, a PR with `Closes #N`, labels `enhancement` and `area:web`.

## Review Focus

- **A token added to one theme only.** Adding `--dobra-x` to `:root` and forgetting light must fail a test, not silently fall back to the dark value in light mode. Pinned in Task 1 (theme parity test).
- **`tokens.ts` drifting from `tokens.css`.** Someone edits a hex in the CSS; the plugin's canvas colors must not keep the old one. Pinned in Task 1 (mirror test).
- **Upgrading `@fontsource` without re-copying.** A version bump leaves stale committed fonts; a test compares bytes with the installed package. Pinned in Task 2.
- **A translucent panel failing contrast only after compositing.** `rgb(17 24 39 / 0.85)` must be blended over the bg before measuring, or the check passes on a color that never renders. Pinned in Task 1 (composite helper test).
- **Regenerating the logo on another machine.** The script must be deterministic (same bytes twice); a test renders it twice and compares. Pinned in Task 4.

---

## File Structure

```
packages/brand/
  package.json            exports map for every shipped file
  tsconfig.json
  vitest.config.ts
  README.md               what is in the package and how to regenerate assets
  tokens.css              theme tokens (dark :root, light [data-theme='light']) and shared tokens (:where(:root))
  tokens.ts               TypeScript mirror of the two theme blocks
  fonts.css               @font-face for Geist, Inter, JetBrains Mono
  fonts/                  geist-latin-wght-normal.woff2, inter-latin-wght-normal.woff2,
                          jetbrains-mono-latin-wght-normal.woff2, OFL-geist.txt, OFL-inter.txt,
                          OFL-jetbrains-mono.txt
  icon.svg                the official icon
  favicon.svg             simplified icon for 16–32 px
  logo.svg                wordmark for dark backgrounds
  logo-light.svg          wordmark for light backgrounds
  png/                    favicon-32.png, icon-128.png, icon-512.png
  scripts/copy-fonts.mjs  copies the woff2 and licence files from @fontsource
  scripts/build-logo.mjs  outlines "Dobra" and writes both logo SVGs
  scripts/build-png.mjs   renders the PNGs from the SVGs
  test/css.ts             tiny parsers: CSS blocks, colors, contrast (test helper, no runtime use)
  test/css.test.ts        tests for the helper itself
  test/tokens.test.ts
  test/fonts.test.ts
  test/svg.test.ts
  test/png.test.ts
```

---

### Task 0: Issue and branch

- [ ] **Step 1: Open the issue**

```bash
gh issue create --title "Add the @dobra/brand package: tokens, fonts, logo and icon" \
  --label enhancement --label area:web \
  --body "Slice 1 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md (§3). A workspace package with the design tokens (dark and light), the bundled Geist, Inter and JetBrains Mono fonts, the outlined logo, the official icon, a favicon and the PNG sizes. Tests cover theme parity, the TypeScript mirror, contrast, font freshness and SVG hygiene."
```

Note the issue number as `N`.

- [ ] **Step 2: Branch from main**

```bash
git fetch origin && git switch -c feat/brand-package origin/main
```

---

### Task 1: Package scaffold, tokens and their tests

**Files:**
- Create: `packages/brand/package.json`, `packages/brand/tsconfig.json`, `packages/brand/vitest.config.ts`
- Create: `packages/brand/test/css.ts`, `packages/brand/test/css.test.ts`
- Create: `packages/brand/tokens.css`, `packages/brand/tokens.ts`, `packages/brand/test/tokens.test.ts`

**Interfaces:**
- Produces: `tokens.css` custom properties `--dobra-*` (names in spec §3.1 plus the shared ones below).
- Produces: `tokens.ts` → `export const THEME_TOKENS` (readonly tuple of names without the `--dobra-` prefix), `export type ThemeToken`, `export type ThemeTokens = Record<ThemeToken, string>`, `export const tokens: { dark: ThemeTokens; light: ThemeTokens }`.
- Produces (test helper only): `test/css.ts` → `cssBlock(css: string, selector: string): Map<string, string>`, `parseColor(value: string): { r: number; g: number; b: number; a: number }`, `composite(top, bottom)`, `contrast(a, b): number`.

- [ ] **Step 1: Scaffold the package**

`packages/brand/package.json`:

```json
{
  "name": "@dobra/brand",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "exports": {
    "./tokens": "./tokens.ts",
    "./tokens.css": "./tokens.css",
    "./fonts.css": "./fonts.css",
    "./fonts/*": "./fonts/*",
    "./*.svg": "./*.svg",
    "./png/*": "./png/*"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^26.6.2",
    "typescript": "^7.0.2",
    "vitest": "^4.1.11"
  }
}
```

`packages/brand/tsconfig.json`: copy `packages/core/tsconfig.json` exactly, then set `"include": ["tokens.ts", "test", "vitest.config.ts"]`.

`packages/brand/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
```

Run: `npm install` (links the workspace). Expected: `node_modules/@dobra/brand` is a symlink to `packages/brand`.

- [ ] **Step 2: Write the failing helper tests**

`packages/brand/test/css.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { composite, contrast, cssBlock, parseColor } from './css';

describe('css test helpers', () => {
  it('reads one block by its exact selector, ignoring comments', () => {
    const css = `/* a */\n:root {\n  --x: #fff; /* note */\n  --y: rgb(0 0 0 / 0.5);\n}\n[data-theme='light'] { --x: #000; }`;
    expect([...cssBlock(css, ':root')]).toEqual([['--x', '#fff'], ['--y', 'rgb(0 0 0 / 0.5)']]);
    expect(cssBlock(css, "[data-theme='light']").get('--x')).toBe('#000');
  });

  it('throws when the selector is missing', () => {
    expect(() => cssBlock(':root { --x: 1; }', '.nope')).toThrow(/\.nope/);
  });

  it('parses hex and space-separated rgb with alpha', () => {
    expect(parseColor('#00F0FF')).toEqual({ r: 0, g: 240, b: 255, a: 1 });
    expect(parseColor('rgb(17 24 39 / 0.85)')).toEqual({ r: 17, g: 24, b: 39, a: 0.85 });
    expect(() => parseColor('red')).toThrow(/red/);
  });

  it('composites a translucent color over an opaque one', () => {
    const c = composite(parseColor('rgb(255 255 255 / 0.5)'), parseColor('#000000'));
    expect(c).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });

  it('measures WCAG contrast', () => {
    expect(contrast(parseColor('#ffffff'), parseColor('#000000'))).toBeCloseTo(21, 5);
    expect(contrast(parseColor('#777777'), parseColor('#ffffff'))).toBeCloseTo(4.48, 2);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @dobra/brand`
Expected: FAIL, "Failed to resolve import './css'".

- [ ] **Step 4: Write the helper**

`packages/brand/test/css.ts`:

```ts
// Test-only helpers: read a CSS block, parse the two color forms tokens.css uses, and measure
// WCAG 2 contrast. Not shipped; the package has no runtime code besides tokens.ts.

export type Rgba = { r: number; g: number; b: number; a: number };

export function cssBlock(css: string, selector: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for selector ${selector}`);
  const open = clean.indexOf('{', start);
  const close = clean.indexOf('}', open);
  const out = new Map<string, string>();
  for (const decl of clean.slice(open + 1, close).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim();
    if (name.startsWith('--')) out.set(name, decl.slice(i + 1).trim());
  }
  return out;
}

export function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  throw new Error(`Unsupported color ${value}`);
}

export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 5: Run the helper tests**

Run: `npm test -w @dobra/brand`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/brand package-lock.json
git commit -m "Scaffold the @dobra/brand package with CSS and contrast test helpers"
```

- [ ] **Step 7: Write the failing token tests**

`packages/brand/test/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_TOKENS, tokens } from '../tokens';
import { composite, contrast, cssBlock, parseColor } from './css';

const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
const themes = { dark: cssBlock(css, ':root'), light: cssBlock(css, "[data-theme='light']") };
const shared = cssBlock(css, ':where(:root)');
const TEXT_ACCENTS = ['fold', 'pass', 'warn', 'hinge'] as const;

describe('tokens.css', () => {
  it('defines exactly the same theme tokens in dark and light', () => {
    expect([...themes.light.keys()].sort()).toEqual([...themes.dark.keys()].sort());
  });

  it('has no theme token in the shared block', () => {
    for (const name of shared.keys()) expect(themes.dark.has(name), name).toBe(false);
  });

  it('defines the shared radius, spacing, font and type tokens', () => {
    for (const name of [
      '--dobra-radius-sm', '--dobra-radius', '--dobra-radius-lg', '--dobra-radius-xl',
      '--dobra-space-xs', '--dobra-space-sm', '--dobra-space-md', '--dobra-space-lg', '--dobra-space-xl',
      '--dobra-font-display', '--dobra-font-body', '--dobra-font-mono',
      '--dobra-type-headline-lg', '--dobra-type-body-md', '--dobra-type-label-md',
    ]) expect(shared.has(name), name).toBe(true);
  });
});

describe('tokens.ts', () => {
  it('mirrors both theme blocks of tokens.css exactly', () => {
    for (const theme of ['dark', 'light'] as const) {
      const fromCss = Object.fromEntries([...themes[theme]].map(([k, v]) => [k.replace('--dobra-', ''), v]));
      expect(tokens[theme]).toEqual(fromCss);
    }
    expect([...THEME_TOKENS].sort()).toEqual(Object.keys(tokens.dark).sort());
  });
});

describe.each(['dark', 'light'] as const)('contrast in %s', (theme) => {
  const t = tokens[theme];
  const bg = parseColor(t.bg);
  const panel = composite(parseColor(t.panel), bg);

  it('keeps text and muted text readable on the canvas and on panels', () => {
    for (const fg of [t.text, t.muted]) {
      expect(contrast(parseColor(fg), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseColor(fg), panel)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accents readable as text on the canvas', () => {
    for (const name of TEXT_ACCENTS) expect(contrast(parseColor(t[name]), bg), name).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps text on a fold-colored fill readable', () => {
    expect(contrast(parseColor(t['on-fold']), parseColor(t.fold))).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npm test -w @dobra/brand`
Expected: FAIL, "ENOENT … tokens.css" (and `../tokens` unresolved).

- [ ] **Step 9: Write `tokens.css`**

`packages/brand/tokens.css`:

```css
/* Dobra design tokens. Theme tokens: dark on :root, light under [data-theme='light'] on any
   element. Shared tokens sit in :where(:root) so they never outrank a theme block.
   tokens.ts mirrors the two theme blocks; a test keeps them equal. */
:root {
  color-scheme: dark;
  --dobra-bg: #0B0F17;
  --dobra-panel: rgb(17 24 39 / 0.85);
  --dobra-flyout: rgb(31 41 55 / 0.92);
  --dobra-field: #0F172A;
  --dobra-text: #DFE2EE;
  --dobra-muted: #9AA8B8;
  --dobra-border: rgb(255 255 255 / 0.08);
  --dobra-border-strong: #334155;
  --dobra-fold: #00F0FF;
  --dobra-on-fold: #0B0F17;
  --dobra-accent-2: #818CF8;
  --dobra-pass: #10B981;
  --dobra-warn: #F59E0B;
  --dobra-hinge: #EC4899;
  --dobra-glow: 0 0 12px rgb(0 240 255 / 0.35);
  --dobra-shadow-2: 0 8px 32px -4px rgb(0 0 0 / 0.6);
}

[data-theme='light'] {
  color-scheme: light;
  --dobra-bg: #F6F7FA;
  --dobra-panel: rgb(255 255 255 / 0.85);
  --dobra-flyout: rgb(255 255 255 / 0.96);
  --dobra-field: #FFFFFF;
  --dobra-text: #0F131C;
  --dobra-muted: #4B5565;
  --dobra-border: rgb(15 19 28 / 0.12);
  --dobra-border-strong: #CBD2DC;
  --dobra-fold: #007C85;
  --dobra-on-fold: #FFFFFF;
  --dobra-accent-2: #4F46E5;
  --dobra-pass: #047857;
  --dobra-warn: #B45309;
  --dobra-hinge: #BE185D;
  --dobra-glow: 0 0 0 1px rgb(0 124 133 / 0.35);
  --dobra-shadow-2: 0 8px 24px -8px rgb(15 19 28 / 0.18);
}

:where(:root) {
  --dobra-radius-sm: 2px;
  --dobra-radius: 4px;
  --dobra-radius-lg: 8px;
  --dobra-radius-xl: 12px;
  --dobra-space-xs: 4px;
  --dobra-space-sm: 8px;
  --dobra-space-md: 12px;
  --dobra-space-lg: 20px;
  --dobra-space-xl: 32px;
  --dobra-font-display: 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --dobra-font-body: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --dobra-font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  /* Type scale from DESIGN.md: use as `font: var(--dobra-type-…)` plus the matching tracking. */
  --dobra-type-headline-lg: 600 32px/40px var(--dobra-font-display);
  --dobra-type-headline-md: 600 22px/28px var(--dobra-font-display);
  --dobra-type-headline-sm: 600 18px/24px var(--dobra-font-display);
  --dobra-type-body-lg: 400 15px/22px var(--dobra-font-body);
  --dobra-type-body-md: 400 13px/18px var(--dobra-font-body);
  --dobra-type-body-sm: 400 11px/16px var(--dobra-font-body);
  --dobra-type-label-lg: 500 12px/16px var(--dobra-font-mono);
  --dobra-type-label-md: 500 11px/14px var(--dobra-font-mono);
  --dobra-type-label-sm: 400 10px/12px var(--dobra-font-mono);
  --dobra-tracking-headline-lg: -0.02em;
  --dobra-tracking-headline-md: -0.01em;
  --dobra-tracking-headline-sm: -0.005em;
  --dobra-tracking-label-lg: 0.02em;
  --dobra-tracking-label-md: 0.03em;
  --dobra-tracking-label-sm: 0.04em;
}
```

- [ ] **Step 10: Write `tokens.ts`**

`packages/brand/tokens.ts`:

```ts
// The theme tokens of tokens.css for code that has no CSS, such as the Figma plugin's main
// thread. Names drop the `--dobra-` prefix. A test keeps these equal to tokens.css.

export const THEME_TOKENS = [
  'bg', 'panel', 'flyout', 'field', 'text', 'muted', 'border', 'border-strong',
  'fold', 'on-fold', 'accent-2', 'pass', 'warn', 'hinge', 'glow', 'shadow-2',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeTokens = Record<ThemeToken, string>;

export const tokens: { dark: ThemeTokens; light: ThemeTokens } = {
  dark: {
    bg: '#0B0F17',
    panel: 'rgb(17 24 39 / 0.85)',
    flyout: 'rgb(31 41 55 / 0.92)',
    field: '#0F172A',
    text: '#DFE2EE',
    muted: '#9AA8B8',
    border: 'rgb(255 255 255 / 0.08)',
    'border-strong': '#334155',
    fold: '#00F0FF',
    'on-fold': '#0B0F17',
    'accent-2': '#818CF8',
    pass: '#10B981',
    warn: '#F59E0B',
    hinge: '#EC4899',
    glow: '0 0 12px rgb(0 240 255 / 0.35)',
    'shadow-2': '0 8px 32px -4px rgb(0 0 0 / 0.6)',
  },
  light: {
    bg: '#F6F7FA',
    panel: 'rgb(255 255 255 / 0.85)',
    flyout: 'rgb(255 255 255 / 0.96)',
    field: '#FFFFFF',
    text: '#0F131C',
    muted: '#4B5565',
    border: 'rgb(15 19 28 / 0.12)',
    'border-strong': '#CBD2DC',
    fold: '#007C85',
    'on-fold': '#FFFFFF',
    'accent-2': '#4F46E5',
    pass: '#047857',
    warn: '#B45309',
    hinge: '#BE185D',
    glow: '0 0 0 1px rgb(0 124 133 / 0.35)',
    'shadow-2': '0 8px 24px -8px rgb(15 19 28 / 0.18)',
  },
};
```

- [ ] **Step 11: Run the tests**

Run: `npm test -w @dobra/brand && npm run typecheck -w @dobra/brand`
Expected: PASS, all tests in `css.test.ts` and `tokens.test.ts` (the contrast ratios are verified: dark text 14.84, muted 7.92, fold 13.62, pass 7.56, warn 8.93, hinge 5.44; light text 17.34, muted 7.04, fold 4.64, pass 5.12, warn 4.69, hinge 5.64; on-fold 13.62 dark and 4.97 light). Typecheck clean.

- [ ] **Step 12: Prove the parity test bites, then revert**

Temporarily delete the `--dobra-glow` line from the light block and run `npm test -w @dobra/brand`. Expected: FAIL in "defines exactly the same theme tokens in dark and light". Restore the line and rerun: PASS.

- [ ] **Step 13: Commit**

```bash
git add packages/brand/tokens.css packages/brand/tokens.ts packages/brand/test/tokens.test.ts
git commit -m "Add the Dobra design tokens for dark and light, with a TypeScript mirror"
```

---

### Task 2: Bundled fonts

**Files:**
- Modify: `packages/brand/package.json` (devDependencies)
- Create: `packages/brand/scripts/copy-fonts.mjs`, `packages/brand/fonts/*`, `packages/brand/fonts.css`, `packages/brand/test/fonts.test.ts`

**Interfaces:**
- Consumes: `--dobra-font-*` family names from Task 1: `'Geist'`, `'Inter'`, `'JetBrains Mono'`.
- Produces: `@dobra/brand/fonts.css` declaring those three families (weights 100–900, normal style, Latin range).

- [ ] **Step 1: Add the font packages**

```bash
npm install -D -w @dobra/brand @fontsource-variable/geist@^5.3.0 @fontsource-variable/inter@^5.3.0 @fontsource-variable/jetbrains-mono@^5.3.0
```

- [ ] **Step 2: Write the failing font test**

`packages/brand/test/fonts.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const pkg = (p: string) => new URL(`../${p}`, import.meta.url);
const css = readFileSync(pkg('fonts.css'), 'utf8');

const FONTS = [
  ['Geist', '@fontsource-variable/geist', 'geist-latin-wght-normal.woff2', 'OFL-geist.txt'],
  ['Inter', '@fontsource-variable/inter', 'inter-latin-wght-normal.woff2', 'OFL-inter.txt'],
  ['JetBrains Mono', '@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2', 'OFL-jetbrains-mono.txt'],
] as const;

describe('fonts.css', () => {
  it('points only at files that exist in the package', () => {
    const urls = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((m) => m[1]);
    expect(urls).toHaveLength(3);
    for (const u of urls) expect(existsSync(pkg(u)), u).toBe(true);
  });

  it.each(FONTS)('declares %s as a variable Latin face', (family, _source, file) => {
    const face = css.split('@font-face').find((b) => b.includes(`font-family: '${family}'`));
    expect(face).toBeDefined();
    expect(face).toContain(`url('./fonts/${file}') format('woff2')`);
    expect(face).toContain('font-weight: 100 900');
    expect(face).toContain('font-display: swap');
    expect(face).toContain('unicode-range: U+0000-00FF');
  });
});

describe.each(FONTS)('the bundled %s', (_family, source, file, licence) => {
  it('matches the installed @fontsource file byte for byte', () => {
    const installed = readFileSync(require.resolve(`${source}/files/${file}`));
    expect(readFileSync(pkg(`fonts/${file}`)).equals(installed)).toBe(true);
  });

  it('ships its OFL licence', () => {
    expect(readFileSync(pkg(`fonts/${licence}`), 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @dobra/brand`
Expected: FAIL, "ENOENT … fonts.css".

- [ ] **Step 4: Write the copy script**

`packages/brand/scripts/copy-fonts.mjs`:

```js
// Copies the Latin variable woff2 files and their licences from @fontsource into fonts/.
// Run after changing a @fontsource version: node packages/brand/scripts/copy-fonts.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = new URL('../fonts/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const [source, name] of [
  ['@fontsource-variable/geist', 'geist'],
  ['@fontsource-variable/inter', 'inter'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono'],
]) {
  const file = `${name}-latin-wght-normal.woff2`;
  copyFileSync(require.resolve(`${source}/files/${file}`), new URL(file, out));
  copyFileSync(require.resolve(`${source}/LICENSE`), new URL(`OFL-${name}.txt`, out));
}
```

Run: `node packages/brand/scripts/copy-fonts.mjs && ls packages/brand/fonts`
Expected: the three woff2 files (about 29 KB, 48 KB, 40 KB) and three `OFL-*.txt`.

- [ ] **Step 5: Write `fonts.css`**

`packages/brand/fonts.css` (the unicode range is the one @fontsource uses for its `latin` subset):

```css
/* Geist, Inter and JetBrains Mono, Latin subset, variable weight. Bundled so nothing loads from
   the network (the Figma plugin has no network access). Licences: fonts/OFL-*.txt. */
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('./fonts/geist-latin-wght-normal.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('./fonts/inter-latin-wght-normal.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('./fonts/jetbrains-mono-latin-wght-normal.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
```

Note: `×` (U+00D7, used in `404 × 874`) and `·` (U+00B7) are inside U+0000-00FF; `→` (U+2192) is not in the range and falls back to the system font, which is acceptable.

- [ ] **Step 6: Run the tests**

Run: `npm test -w @dobra/brand && npm run typecheck -w @dobra/brand`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/brand/package.json packages/brand/scripts/copy-fonts.mjs packages/brand/fonts packages/brand/fonts.css packages/brand/test/fonts.test.ts package-lock.json
git commit -m "Bundle Geist, Inter and JetBrains Mono in @dobra/brand"
```

---

### Task 3: Icon and favicon

**Files:**
- Create: `packages/brand/icon.svg`, `packages/brand/favicon.svg`, `packages/brand/test/svg.test.ts`
- Modify: `packages/brand/package.json` (devDependency `@resvg/resvg-js`)

**Interfaces:**
- Produces: `@dobra/brand/icon.svg` (512×512 viewBox), `@dobra/brand/favicon.svg` (512×512 viewBox, simplified).
- Produces (test): `svg.test.ts` with a `SVGS` list that Task 4 extends with the two logo files.

- [ ] **Step 1: Add resvg**

```bash
npm install -D -w @dobra/brand @resvg/resvg-js@^2.6.2
```

- [ ] **Step 2: Write the failing SVG test**

`packages/brand/test/svg.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const SVGS = ['icon.svg', 'favicon.svg'];

describe.each(SVGS)('%s', (file) => {
  const svg = read(file);

  it('has a viewBox, an xmlns and no text or comments', () => {
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/viewBox="[\d.\s-]+"/);
    expect(svg).not.toMatch(/<text[\s>]/);
    expect(svg).not.toContain('<!--');
  });

  it('renders with resvg', () => {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 64 } }).render();
    expect(png.width).toBe(64);
  });
});

describe('favicon.svg', () => {
  it('keeps the fold axis and drops details that vanish at 16 px', () => {
    const svg = read('favicon.svg');
    expect(svg).toContain('x1="256"');
    expect(svg).not.toContain('stroke-opacity="0.12"');
    expect(svg).not.toContain('height="6"');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @dobra/brand`
Expected: FAIL, "ENOENT … icon.svg".

- [ ] **Step 4: Write `icon.svg`**

Copy the `<svg>` element from `.redesign/dobra_icone_oficial/code.html` in the main checkout (`/Users/jackson.mafra/Downloads/Projects/Dobra/.redesign/`, untracked), then: delete every `<!-- … -->` comment; delete `transform="translate(0, 0)"` from the `<g>`; delete the `width="512" height="512"` attributes on the root (keep `viewBox`, `xmlns`, `fill="none"`); collapse blank lines. Every shape, gradient and filter stays. The first line must be exactly:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
```

- [ ] **Step 5: Write `favicon.svg`**

`packages/brand/favicon.svg` keeps the squircle, both panes and the axis, and drops the inner glow ring, the inner bezels' skeleton lines and the glow filter (it smears at 16 px):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect x="8" y="8" width="496" height="496" rx="112" fill="#0B0F17" stroke="#1F293D" stroke-width="12"/>
  <rect x="108" y="128" width="138" height="256" rx="20" fill="#162032" stroke="#334155" stroke-width="10"/>
  <rect x="266" y="128" width="138" height="256" rx="20" fill="#1A253A" stroke="#334155" stroke-width="10"/>
  <rect x="294" y="166" width="64" height="16" rx="8" fill="#00F0FF"/>
  <line x1="256" y1="96" x2="256" y2="416" stroke="#00F0FF" stroke-width="20" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: Run the tests**

Run: `npm test -w @dobra/brand`
Expected: PASS.

- [ ] **Step 7: Look at both at real size**

Render and inspect:

```bash
node -e "const {Resvg}=require('@resvg/resvg-js');const fs=require('fs');for(const[f,w]of[['icon.svg',256],['favicon.svg',32]])fs.writeFileSync(process.env.SCRATCH+'/'+f+'.png',new Resvg(fs.readFileSync('packages/brand/'+f,'utf8'),{fitTo:{mode:'width',value:w}}).render().asPng())"
```

(`SCRATCH` = the session scratchpad.) Open both PNGs with the Read tool. Expected: `icon.svg.png` matches `.redesign/dobra_icone_oficial/screen.png`; `favicon.svg.png` still reads as two panes split by a cyan line at 32 px.

- [ ] **Step 8: Commit**

```bash
git add packages/brand/icon.svg packages/brand/favicon.svg packages/brand/test/svg.test.ts packages/brand/package.json package-lock.json
git commit -m "Add the official Dobra icon and a simplified favicon"
```

---

### Task 4: Outlined logo

**Files:**
- Create: `packages/brand/scripts/build-logo.mjs`, `packages/brand/logo.svg`, `packages/brand/logo-light.svg`
- Modify: `packages/brand/package.json` (devDependencies `opentype.js`, `@fontsource/geist`), `packages/brand/test/svg.test.ts`

**Interfaces:**
- Consumes: `tokens.dark.fold` / `tokens.light.fold` and `tokens.dark.text` / `tokens.light.text` values from Task 1 (copied as literals into the script; the test checks they match).
- Produces: `@dobra/brand/logo.svg` (for dark backgrounds) and `@dobra/brand/logo-light.svg` (for light backgrounds); `export function buildLogo(fontBuffer: ArrayBuffer, variant: 'dark' | 'light'): string` from `scripts/build-logo.mjs`.

- [ ] **Step 1: Add the dependencies**

opentype.js reads woff but not woff2, so the static Geist Bold woff comes from the non-variable package:

```bash
npm install -D -w @dobra/brand opentype.js@^2.0.0 @fontsource/geist@^5.3.0
```

- [ ] **Step 2: Extend the failing SVG test**

In `packages/brand/test/svg.test.ts`, change `const SVGS = ['icon.svg', 'favicon.svg'];` to:

```ts
const SVGS = ['icon.svg', 'favicon.svg', 'logo.svg', 'logo-light.svg'];
```

add these imports at the top of the file, next to the existing ones:

```ts
import { createRequire } from 'node:module';
import { tokens } from '../tokens';
import { buildLogo } from '../scripts/build-logo.mjs';
```

and append at the end:

```ts
const require = createRequire(import.meta.url);
const geistBold = () => {
  const b = readFileSync(require.resolve('@fontsource/geist/files/geist-latin-700-normal.woff'));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe.each([
  ['logo.svg', 'dark'],
  ['logo-light.svg', 'light'],
] as const)('%s', (file, variant) => {
  const svg = read(file);

  it('is titled Dobra and made only of paths', () => {
    expect(svg).toContain('<title>Dobra</title>');
    expect(svg).toMatch(/<path /);
  });

  it('uses the theme text color for letters and the fold color for the line', () => {
    expect(svg).toContain(`fill="${tokens[variant].text}"`);
    expect(svg).toContain(`fill="${tokens[variant].fold}"`);
  });

  it('is exactly what the script produces, deterministically', () => {
    const a = buildLogo(geistBold(), variant);
    expect(buildLogo(geistBold(), variant)).toBe(a);
    expect(svg).toBe(a);
  });
});
```

Add `"allowJs": true` to `packages/brand/tsconfig.json` `compilerOptions` and `"scripts"` to its `include`, so the test can import the `.mjs` module under typecheck.

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w @dobra/brand`
Expected: FAIL, "Failed to resolve import '../scripts/build-logo.mjs'".

- [ ] **Step 4: Write the script**

`packages/brand/scripts/build-logo.mjs`:

```js
// Outlines "Dobra" in Geist Bold and draws the fold line through the "o", as in the logo PNG in
// .redesign/logo. Writes logo.svg (for dark backgrounds) and logo-light.svg (for light ones).
// Run after changing the logo: node packages/brand/scripts/build-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

// Copied from tokens.css (a test checks they match).
const COLORS = {
  dark: { text: '#DFE2EE', fold: '#00F0FF' },
  light: { text: '#0F131C', fold: '#007C85' },
};
const SIZE = 100; // font size in SVG units
const FOLD_AT = 0.42; // where the line crosses the "o", as a fraction of its width
const FOLD_WIDTH = 5; // line thickness in SVG units
const OVERSHOOT = 0.14; // how far the line runs past the letters, as a fraction of their height
const PAD = 2;

const r = (n) => Math.round(n * 100) / 100;

export function buildLogo(fontBuffer, variant) {
  const font = opentype.parse(fontBuffer);
  const glyphs = font.getPaths('Dobra', 0, SIZE, SIZE);
  const boxes = glyphs.map((p) => p.getBoundingBox());
  const x1 = Math.min(...boxes.map((b) => b.x1));
  const x2 = Math.max(...boxes.map((b) => b.x2));
  const y1 = Math.min(...boxes.map((b) => b.y1));
  const y2 = Math.max(...boxes.map((b) => b.y2));
  const o = boxes[1];
  const over = (y2 - y1) * OVERSHOOT;
  const lineX = o.x1 + (o.x2 - o.x1) * FOLD_AT - FOLD_WIDTH / 2;
  const top = y1 - over;
  const bottom = y2 + over;
  const vb = [x1 - PAD, top, x2 - x1 + PAD * 2, bottom - top].map(r).join(' ');
  const letters = glyphs.map((p) => p.toPathData(2)).join('');
  const { text, fold } = COLORS[variant];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img">`,
    '  <title>Dobra</title>',
    `  <path fill="${text}" d="${letters}"/>`,
    `  <rect fill="${fold}" x="${r(lineX)}" y="${r(top)}" width="${FOLD_WIDTH}" height="${r(bottom - top)}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const b = readFileSync(require.resolve('@fontsource/geist/files/geist-latin-700-normal.woff'));
  const font = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  writeFileSync(new URL('../logo.svg', import.meta.url), buildLogo(font, 'dark'));
  writeFileSync(new URL('../logo-light.svg', import.meta.url), buildLogo(font, 'light'));
}
```

Run: `node packages/brand/scripts/build-logo.mjs`
Expected: `packages/brand/logo.svg` and `logo-light.svg` exist.

- [ ] **Step 5: Run the tests**

Run: `npm test -w @dobra/brand && npm run typecheck -w @dobra/brand`
Expected: PASS. If typecheck rejects the untyped `opentype.js` import, add `packages/brand/scripts/opentype.d.ts` with `declare module 'opentype.js';` and include it.

- [ ] **Step 6: Compare with the reference**

Render `logo.svg` at 424 px wide on a `#0B0F17` background into the scratchpad (use the Step 7 command from Task 3 with `background: '#0B0F17'` in the Resvg options) and open it next to `.redesign/logo/screen.png` with the Read tool. Expected: the same wordmark, with the line crossing the left part of the "o" and running past the top and bottom of the letters. If the line sits visibly off, adjust `FOLD_AT` or `OVERSHOOT`, rerun the script and the tests. Render `logo-light.svg` on `#F6F7FA` and check it too.

- [ ] **Step 7: Commit**

```bash
git add packages/brand/scripts/build-logo.mjs packages/brand/logo.svg packages/brand/logo-light.svg packages/brand/test/svg.test.ts packages/brand/tsconfig.json packages/brand/package.json package-lock.json
git commit -m "Add the Dobra wordmark as outlined SVGs for dark and light backgrounds"
```

(Include `packages/brand/scripts/opentype.d.ts` if Step 5 needed it.)

---

### Task 5: PNG sizes

**Files:**
- Create: `packages/brand/scripts/build-png.mjs`, `packages/brand/png/favicon-32.png`, `packages/brand/png/icon-128.png`, `packages/brand/png/icon-512.png`, `packages/brand/test/png.test.ts`

**Interfaces:**
- Consumes: `favicon.svg`, `icon.svg` from Task 3.
- Produces: `@dobra/brand/png/favicon-32.png` (32×32, from `favicon.svg`), `icon-128.png` (128×128, from `icon.svg`, Figma Community listing), `icon-512.png` (512×512, from `icon.svg`, GitHub avatar).

- [ ] **Step 1: Write the failing test**

`packages/brand/test/png.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Width and height live in the IHDR chunk, bytes 16–23 of a PNG.
const size = (file: string) => {
  const b = readFileSync(new URL(`../png/${file}`, import.meta.url));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('png', () => {
  it.each([
    ['favicon-32.png', 32],
    ['icon-128.png', 128],
    ['icon-512.png', 512],
  ])('%s is %i px square', (file, px) => {
    expect(size(file)).toEqual([px, px]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @dobra/brand`
Expected: FAIL, "ENOENT … png/favicon-32.png".

- [ ] **Step 3: Write the script**

`packages/brand/scripts/build-png.mjs`:

```js
// Renders the PNG sizes from the SVGs. Run after changing icon.svg or favicon.svg:
// node packages/brand/scripts/build-png.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const dir = new URL('../', import.meta.url);
mkdirSync(new URL('png/', dir), { recursive: true });

for (const [source, out, px] of [
  ['favicon.svg', 'favicon-32.png', 32],
  ['icon.svg', 'icon-128.png', 128],
  ['icon.svg', 'icon-512.png', 512],
]) {
  const svg = readFileSync(new URL(source, dir), 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
  writeFileSync(new URL(`png/${out}`, dir), png);
}
```

Run: `node packages/brand/scripts/build-png.mjs`

- [ ] **Step 4: Run the tests**

Run: `npm test -w @dobra/brand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/brand/scripts/build-png.mjs packages/brand/png packages/brand/test/png.test.ts
git commit -m "Render the favicon and icon PNG sizes"
```

---

### Task 6: README, full check and PR

**Files:**
- Create: `packages/brand/README.md`
- Modify: `README.md` (root: add the package to the table and the layout list)

- [ ] **Step 1: Write the package README**

`packages/brand/README.md`:

````markdown
# @dobra/brand

Dobra's design tokens, fonts, logo and icon. Every Dobra surface imports its look from here.

## Use

```css
@import '@dobra/brand/fonts.css';
@import '@dobra/brand/tokens.css';

body { background: var(--dobra-bg); color: var(--dobra-text); font: var(--dobra-type-body-md); }
```

Dark is the default. Set `data-theme="light"` on any element to switch it and its children to light.
The tokens do not read `prefers-color-scheme`; a surface that follows the system sets the attribute.

Code without CSS reads the same values from `@dobra/brand/tokens`:

```ts
import { tokens } from '@dobra/brand/tokens';
tokens.dark.hinge; // '#EC4899'
```

## Tokens

| Token | Use |
| --- | --- |
| `--dobra-bg`, `--dobra-panel`, `--dobra-flyout`, `--dobra-field` | Canvas, Level 1 panels, Level 2 flyouts, inputs |
| `--dobra-text`, `--dobra-muted` | Body and secondary text |
| `--dobra-border`, `--dobra-border-strong` | Hairlines and input borders |
| `--dobra-fold`, `--dobra-on-fold` | Primary and active state, fold lines, focus; text on it |
| `--dobra-accent-2` | Secondary controls, metadata, safe areas |
| `--dobra-pass`, `--dobra-warn`, `--dobra-hinge` | Passing checks, warnings, hinge occlusion and errors |
| `--dobra-glow`, `--dobra-shadow-2` | Fold guide glow, Level 2 shadow |
| `--dobra-radius*`, `--dobra-space-*` | 2/4/8/12 px radii, 4/8/12/20/32 px spacing |
| `--dobra-font-*`, `--dobra-type-*`, `--dobra-tracking-*` | Geist, Inter, JetBrains Mono and the type scale |

Panels are translucent. Add `backdrop-filter: blur(16px)` (Level 1) or `blur(24px)` (Level 2)
where something sits behind them.

## Files

- `logo.svg` (dark backgrounds), `logo-light.svg` (light backgrounds)
- `icon.svg`, `favicon.svg`
- `png/favicon-32.png`, `png/icon-128.png` (Figma Community), `png/icon-512.png` (GitHub avatar)

## Regenerating

```bash
node packages/brand/scripts/copy-fonts.mjs   # after a @fontsource version change
node packages/brand/scripts/build-logo.mjs   # after changing the logo
node packages/brand/scripts/build-png.mjs    # after changing icon.svg or favicon.svg
```

The tests fail when a generated file is stale.

Fonts: Geist, Inter and JetBrains Mono under the SIL Open Font License (`fonts/OFL-*.txt`).
````

- [ ] **Step 2: Update the root README**

In `README.md`, add a row to the "What's here" table after the Core row:

```markdown
| Brand (`packages/brand`) | Design tokens for dark and light, the bundled fonts, the logo and the icon | Merged |
```

and a bullet in "Layout" after the `packages/core` bullet:

```markdown
- `packages/brand`: `@dobra/brand`, the design tokens, fonts, logo and icon every surface imports. See its [README](packages/brand/README.md).
```

- [ ] **Step 3: Full check**

Run: `npm run typecheck && npm test`
Expected: typecheck clean in every workspace; every workspace's tests pass, including `@dobra/brand`.

- [ ] **Step 4: Commit**

```bash
git add packages/brand/README.md README.md
git commit -m "Document the @dobra/brand package"
```

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/brand-package
gh pr create --base main --title "Add the @dobra/brand package" --label enhancement --label area:web --body "Closes #N

Slice 1 of docs/superpowers/specs/2026-09-27-dobra-visual-identity-design.md.

- tokens.css: dark on :root, light under [data-theme='light'], shared radius, spacing and type
- tokens.ts: the same theme values for code without CSS, kept equal by a test
- Geist, Inter and JetBrains Mono, Latin woff2, bundled with their OFL licences
- logo.svg and logo-light.svg, outlined from Geist Bold with the cyan fold line
- icon.svg, favicon.svg, and 32, 128 and 512 px PNGs

Tests: theme parity, the TypeScript mirror, WCAG contrast in both themes (panels composited over the canvas), fonts byte-equal to @fontsource, SVG hygiene and rendering, logo determinism, and PNG sizes."
```

- [ ] **Step 6: Merge once checks pass**

This slice has no manual step, so it can be merged when the PR is open and the full check passed: `gh pr merge --merge`, then delete the branch (remote and local) after confirming it is an ancestor of `origin/main`.
