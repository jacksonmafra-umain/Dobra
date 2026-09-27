# Dobra visual identity: design

Date: 2026-09-27
Status: approved in conversation, pending written-spec review
Source material: `.redesign/` in the main checkout (untracked): `dobra_studio_system/DESIGN.md`, the
logo PNG, the official icon SVG, and mockups for the simulator, the inspector (web report) and a
landing page.

## 1. Goal

Give every Dobra surface one visual identity: the simulator, the web report, the Figma plugin and a
new landing page with a documentation section. The design system, logo and icon in `.redesign/`
are the reference.

Success looks like this:

- One package, `@dobra/brand`, is the only place colors, type, radii, spacing, the logo and the icon
  are defined. Every surface imports it.
- The simulator, the report and the plugin panel look like the mockups' visual language, in dark and
  in a derived light theme, with no change to what they do.
- The logo is a real vector (outlined, no `<text>`), and the icon is used for every favicon, the
  plugin listing and the GitHub repo.
- A static site, `apps/site`, has a landing page and renders the cross-platform responsive design
  guide from `docs/guide/`.

## 2. Decisions

| Topic | Decision |
| --- | --- |
| Fidelity to the mockups | Visual language only. Colors, type, spacing, components and layout feel, applied to features that exist. Controls and data the tools do not have (Bridge :5174, Dual-Engine Active, Sync Figma, Push Tokens, Run CLI Test, JUnit Report, GitHub Actions YAML, virtual keyboard, a health score, a cross-app top nav, "ISO/IEC 23091-2", "Hinge API Spec v2.1") are dropped. Any of them can become its own issue later. |
| Themes | Dark is the default. A light palette is derived from the same tokens. The simulator's Light/Dark switch keeps changing both the chrome and the simulated screen. The report follows `prefers-color-scheme`. The plugin follows Figma's theme. |
| Logo line | Laser cyan `#00F0FF`, matching the icon. Rose stays reserved for hinge alerts. |
| Sharing | A plain-CSS workspace package, `@dobra/brand`. Not a Tailwind preset (only the simulator loads Tailwind) and not copies per app (they drift). |
| Fonts | Geist, Inter and JetBrains Mono, bundled from `@fontsource` (Latin subset, woff2, OFL). No Google Fonts: the plugin has no network access and the single-file simulator must work offline. |
| Icons in the UI | Three inline SVG status icons (pass, warn, error) plus the ones a surface already needs. No icon font. |
| Site stack | Astro in `apps/site`: Vite-based, native Markdown, heading anchors, static HTML that search engines index. |
| Landing page content | Real content only: what Dobra is, the four tools, quick start, links to the simulator and the report. |
| Guide content | Written in `docs/guide/` by two sessions, split as agreed with agent/02 (§8). |
| Out of scope | Changing what any tool does; the simulated app's look (`apps/simulator/src/styles/sample-app.css`); a custom domain; in-site search. |

## 3. `@dobra/brand`

Location: `packages/brand`. It ships files plus one small TypeScript export for code that has no
CSS (§6):

```
packages/brand/
  tokens.ts           the same color values for TypeScript (the plugin's main thread)
  tokens.css          custom properties, dark on :root and [data-theme="dark"], light under [data-theme="light"]
  fonts.css           @font-face for the three families, pointing at the bundled woff2 files
  fonts/              woff2 files copied from @fontsource at build time
  logo.svg            wordmark for dark backgrounds
  logo-light.svg      wordmark for light backgrounds
  icon.svg            the official app icon
  favicon.svg         the icon, simplified for 16–32 px
  png/                favicon-32.png, icon-128.png (plugin listing), icon-512.png (GitHub)
  scripts/            build-logo.mjs, build-png.mjs
```

### 3.1 Tokens

Semantic names, so a surface never names a raw color. Values for dark come from DESIGN.md; light
values are derived so text and accents keep at least 4.5:1 contrast on their backgrounds (the pure
cyan `#00F0FF` fails on white, so light uses a darker teal for text and strokes).

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--dobra-bg` | `#0B0F17` | `#F6F7FA` | Level 0 canvas |
| `--dobra-panel` | `rgb(17 24 39 / 0.85)` | `rgb(255 255 255 / 0.85)` | Level 1: toolbars, sidebars, cards |
| `--dobra-flyout` | `rgb(31 41 55 / 0.92)` | `rgb(255 255 255 / 0.96)` | Level 2: flyouts, tables, overlays |
| `--dobra-field` | `#0F172A` | `#FFFFFF` | Inputs and code fields |
| `--dobra-text` | `#DFE2EE` | `#0F131C` | Body text |
| `--dobra-muted` | `#9AA8B8` | `#4B5565` | Secondary text |
| `--dobra-border` | `rgb(255 255 255 / 0.08)` | `rgb(15 19 28 / 0.12)` | Hairlines |
| `--dobra-border-strong` | `#334155` | `#CBD2DC` | Input borders |
| `--dobra-fold` | `#00F0FF` | `#007C85` | Primary: active state, fold line, focus |
| `--dobra-on-fold` | `#0B0F17` | `#FFFFFF` | Text on a fold-colored fill |
| `--dobra-accent-2` | `#818CF8` | `#4F46E5` | Secondary controls, metadata, safe areas |
| `--dobra-pass` | `#10B981` | `#047857` | Passing checks |
| `--dobra-warn` | `#F59E0B` | `#B45309` | Warnings, clipping risk |
| `--dobra-hinge` | `#F062A8` | `#BE185D` | Hinge occlusion, collisions, errors |
| `--dobra-glow` | `0 0 12px rgb(0 240 255 / 0.35)` | `0 0 0 1px rgb(0 124 133 / 0.35)` | Fold guide |
| `--dobra-shadow-2` | `0 8px 32px -4px rgb(0 0 0 / 0.6)` | `0 8px 24px -8px rgb(15 19 28 / 0.18)` | Level 2 |

Also in `tokens.css`: `--dobra-radius-sm` 2px, `--dobra-radius` 4px, `--dobra-radius-lg` 8px,
`--dobra-radius-xl` 12px; spacing `--dobra-space-xs` 4px, `-sm` 8px, `-md` 12px, `-lg` 20px, `-xl`
32px; the font stacks `--dobra-font-display` (Geist), `--dobra-font-body` (Inter), `--dobra-font-mono`
(JetBrains Mono), each with system fallbacks; and the DESIGN.md type scale as `--dobra-type-*`
shorthand values (headline-lg/md/sm, body-lg/md/sm, label-lg/md/sm).

Blur (`backdrop-filter: blur(16px)` for Level 1, `24px` for Level 2) is applied by the surfaces,
not the tokens, because it only makes sense where something sits behind the panel.

### 3.2 Logo

`scripts/build-logo.mjs` loads Geist Bold from the bundled font with `opentype.js`, converts
"Dobra" to paths, and draws the fold line: a vertical `--dobra-fold` bar through the "o", matching
the PNG's position and weight. It writes `logo.svg` (light letters) and `logo-light.svg` (dark
letters). The SVGs have a `viewBox`, a `<title>Dobra</title>`, and no `<text>`. The script is run by
hand when the logo changes; its output is committed.

### 3.3 Icon

`icon.svg` is the official SVG from `.redesign/dobra_icone_oficial/code.html`, with comments and
unused definitions removed. `favicon.svg` drops the inner glow ring and the pane placeholder lines,
which vanish at 16 px, and keeps the squircle, the two panes and the cyan axis. `build-png.mjs`
renders the PNGs with `@resvg/resvg-js`.

### 3.4 Tests

- Every custom property defined on `:root` is also defined under `[data-theme="light"]`.
- Contrast, in both themes: `--dobra-text` and `--dobra-muted` reach at least 4.5:1 on
  `--dobra-bg` and on the panel color composited over `--dobra-bg`; `--dobra-fold`, `--dobra-pass`,
  `--dobra-warn` and `--dobra-hinge` reach at least 4.5:1 on `--dobra-bg`, because they are also
  used for text (chips, labels, links); `--dobra-on-fold` reaches at least 4.5:1 on `--dobra-fold`.
- The SVGs parse, have a `viewBox`, and contain no `<text>`.
- Every file `fonts.css` references exists.

## 4. Simulator

Same structure: top bar with controls, canvas, inspector sidebar, parity view.

- **Chrome.** The `--ui-*` variables in `apps/simulator/src/styles/app.css` point at the brand
  tokens; `.app[data-theme]` sets `data-theme` so both themes follow. The top bar and sidebar are
  Level 1 (translucent, `blur(16px)`, hairline border); flyouts and the parity table are Level 2.
  Controls use 4px radii, cards 8px.
- **Type.** Geist for titles, Inter for body, JetBrains Mono for every number and identifier:
  sizes (`404 × 874 pt`), control labels in caps (`DEVICE:`, `POSTURE:`), target keys, rule ids and
  sources.
- **Controls.** `.seg` becomes the compact track with a raised active segment. The export button is
  the solid fold-colored primary. Overlay toggles become 14px checkbox chips.
- **Top bar.** The vector logo replaces the "Dobra Simulator" text; the version is a mono badge.
- **Inspector.** The size class is a hero card at the top (the mockup's "wExpanded · hRegular"
  block), fed by the existing `formatSizeClass`. Facts are label/value rows with mono values. Rule
  findings get the pass/warn/error icons.
- **Device overlays.** Fold line in `--dobra-fold` with a dashed `--dobra-glow`; occluding hinge
  regions and collisions in `--dobra-hinge`; safe areas in `--dobra-accent-2` (moved from pink so
  they do not read as hinge alerts); margins stay translucent; the grid in `--dobra-pass`.
- **Page.** `favicon.svg` and `favicon-32.png` in `index.html`.
- **Unchanged.** `sample-app.css` and every component of the simulated app.

## 5. Web report

Same content and flow: file link and token, or a dropped JSON; then coverage, frames and notes.

- **Theme.** Follows `prefers-color-scheme`, mapped onto the brand tokens in both themes.
- **Header.** Logo, the "Foldable Check" heading in Geist, a mono badge with the report version.
- **Input panel.** A Level 1 card; mono inputs for the Figma link and the token with a fold-colored
  focus ring; "Check file" as the solid primary; the drop zone as the dashed "import report JSON"
  area.
- **Coverage.** The report's real coverage figure, shown large with a ring. No invented score.
- **Findings.** Each finding shows a PASS, WARN or ERROR chip (`--dobra-pass`, `--dobra-warn`,
  `--dobra-hinge`), the rule title, the message, and the rect or target in mono on the right.
- **Frames.** Cards with thumbnails; overlays in the simulator's colors.
- **Errors and notes.** Hairline cards; "Could not load" has a `--dobra-hinge` left edge.
- **Page.** Favicon from the icon; works at 375px wide.

## 6. Figma plugin

Two surfaces with different limits.

- **Panel (HTML iframe).** Full CSS is available, so the panel uses the same tokens, fonts and
  components as the report: segmented tabs, mono labels, the three chips, the primary button, 14px
  checkboxes. Limits: 380px wide, no network (fonts bundled into `ui.html`), and Figma's theme. With
  `themeColors: true` the panel reads Figma's `figma-dark` / `figma-light` class on `<html>` and
  sets `data-theme` accordingly; the brand colors do not map onto Figma's blue. No glass blur: there
  is nothing behind the panel to blur.
- **Canvas (artboard overlays the plugin draws).** Only Figma fills, strokes and effects exist, so
  there are no CSS glows. Overlays use solid brand colors with opacity: separating hinges and hinge
  safe zones in `--dobra-hinge`, a flexible crease as a `--dobra-fold` hairline, grids in
  `--dobra-pass`. Colors come from `@dobra/brand` through a small TypeScript export of the token
  values (`packages/brand/tokens.ts`, with a test that its values match `tokens.css`), since
  the plugin's main thread has no CSS. Layer names stay the same ("Hinge", "Hinge safe zone",
  "Crease"), so tags, checks and the report keep working.
- **Icon.** `icon-128.png` for the Community listing. The development manifest has no icon field.
- **Tests.** `presets.test.ts` checks the new colors; existing tests stay green; a screenshot of the
  panel rendered outside Figma in both themes; one manual run in Figma by the user (a PR checkbox
  that holds the merge until ticked).

## 7. Site: `apps/site`

Astro, static output, React available for islands.

- **Landing page.** The landing mockup's visual language with real content: a hero with the logo and
  one sentence on what Dobra is; the four tools (simulator, Figma plugin, web report, CLI), each
  with a short description and its entry point; the quick-start commands; links to open the
  simulator and the report and to read the guide.
- **Video.** The launch video (21.5 s, 1080p with a 720p fallback and a poster) plays inline with
  controls, muted, never autoplaying.
- **Bundled tools.** The site build copies the simulator's production build to `/simulator/` and
  the report's to `/report/`, so the whole thing deploys as one static folder. It deploys to the
  Vercel project `dobra` (scope `jacksonmafra-1855s-projects`) at https://dobra-five.vercel.app,
  which is also the canonical URL.
- **Docs.** Routes `/guide/<slug>/` from `docs/guide/*.md` in file-name order (`00-index` to
  `09-faq`; `00-index` is `/guide/` and the rest drop their number). A sidebar from each page's title and its `##` headings. Every heading gets a stable,
  unique id and a visible anchor link. Tables get brand styling and scroll horizontally on narrow
  screens. The final `## Sources` section of each page renders as a distinct sources block.
  `[unverified — confirm before use]` renders as an amber callout. The Part 8 glossary table gets a
  dense style. Code blocks use JetBrains Mono with a theme built from the tokens.
- **Theme.** Follows `prefers-color-scheme`, with a toggle remembered in `localStorage` (read in a
  `try/catch`).
- **Tests.** A build test that every guide page renders and every heading id is unique on its page;
  a link check that every internal link and anchor resolves; screenshots at 1280px and 375px in both
  themes.

## 8. Guide content split

The guide is a cross-platform responsive design reference for Android/Compose, iOS/SwiftUI and the
Web, in `docs/guide/`, in the format agent/02 proposed: one file per Part; a 2–3 sentence summary at
the top; comparison tables; a `## Sources` list at the end; `[unverified — confirm before use]` on
anything not confirmed; glossary entries for Part 8 as
`term | definition | platform(s) | equivalents elsewhere (or "none") | source`. Primary sources
only (developer.android.com, android-developers.googleblog.com, developer.apple.com,
developer.mozilla.org, web.dev, W3C/WHATWG; m3.material.io does not fetch, so its claims use the
matching developer.android.com page or are marked unverified). Every URL is fetched and verified;
no API or URL is invented.

| Owner | Parts |
| --- | --- |
| This session | Part 0 mental model; Part 2 iOS/SwiftUI; Part 6 accessibility and typography; the SwiftUI code in each Part 5 pattern |
| agent/02 | Part 1 Android/Compose; Part 3 Web; Part 4 cross-platform mapping (after 1–3); Part 5 pattern skeletons with Compose and CSS/HTML code; Part 7 anti-patterns; Part 8 FAQ and glossary (last); `00-index.md` |

Guide PRs touch only `docs/guide/`; site PRs touch only `apps/site` (and the root `package.json`
scripts).

## 9. Delivery

Each slice gets a labeled issue, a branch from `main`, microcommits and a PR, merged in order:

1. `@dobra/brand`: tokens, fonts, logo, icon, PNGs, tests. Labels `enhancement`, `area:web`.
2. Simulator restyle. `enhancement`, `area:web`.
3. Report restyle. `enhancement`, `area:web`.
4. Plugin restyle. `enhancement`, `area:plugin`. Held until the user's manual run in Figma.
5. Site: landing page and docs rendering. `enhancement`, `area:web`, `area:docs`.

The GitHub repo avatar (`icon-512.png`) is set by the user; the API does not allow it. Guide Parts
0, 2 and 6 are separate `documentation`, `area:docs` PRs and can land in parallel with slices 1–5.

Root scripts added: `dev:site`, `build:site`. `npm test` and `npm run typecheck` cover the new
workspaces.
