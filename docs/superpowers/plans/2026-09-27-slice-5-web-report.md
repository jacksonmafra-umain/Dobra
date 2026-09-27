# Slice 5 — Web report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only web report: paste a Figma file URL and a personal access token (or drop a
CLI JSON report) and get the coverage matrix, per-frame findings with thumbnails and overlays,
a presets download and a report export for tickets.

**Architecture:** Core gains three pure modules: `figmaRest` (Figma REST JSON → frames and
`GeoNode` trees, the same mapping the plugin uses), `report` (a validated `Report` shape built
from frames by the same `matchFrame`, `check` and `coverage`, plus Markdown), and `presetZip` (a
ZIP of SVG presets and plugin JSON). A new app, `apps/report` (`@hinge/report`), holds a small
Figma client (token in memory only, typed errors, batched calls, per-version cache) and the
React page.

**Tech Stack:** TypeScript 7, zod 4, Vitest 4, Vite 8 + React 19, `fflate` 0.8 (ZIP).

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §3.3 (web app
adapter), §6 (web app), §9 (error handling and token), §11 risk 1 (rate limits), §12 slice 5.

## Global Constraints

- Figma calls (spec §6): `GET /v1/me`; `GET /v1/files/:key?depth=2`; batched
  `GET /v1/files/:key/nodes?ids=…&plugin_data=shared`; `GET /v1/images/:key` for thumbnails.
  Cached per file `version`.
- The web app cannot create frames or produce a `.fig` (spec §6); it exports plugin JSON, an SVG
  per cell and a ZIP.
- Errors (spec §9): 403 → token or scope; 404 → file not shared; 429 → show `Retry-After`; a
  partial `/nodes` failure produces a partial report; invalid catalog → zod path.
- Token (spec §9): kept in memory (sessionStorage only when the user opts in), never written to
  URL state, logs or error messages; redacted in the fetch wrapper. If `api.figma.com` refuses a
  browser request (CORS/network), the error says so and suggests a local proxy on `127.0.0.1`.
- Frames are identified by the `hinge/target` shared plugin data, then name, then size (spec §2,
  §8.1) — the same `matchFrame` as the plugin.
- `core` stays free of React and the DOM. Commits in English, microcommits, never mention the
  assistant. Never push to or merge into `main`; the PR closes a labeled issue
  (`enhancement`, `area:web`).
- Base branch: `feat/figma-plugin-checker` (PR #20). Work branch: `feat/web-report`.

## Review Focus

1. A token pasted with surrounding spaces or a newline — expected: trimmed before use; the
   header never contains whitespace (test in Task 4).
2. A file whose frames sit inside Sections — expected: frames are found at depth 2 and inside
   sections; the report does not silently miss them (test in Task 1).
3. A 429 on the batched `/nodes` call after the file call succeeded — expected: a partial report
   listing the frames that could not be loaded and the wait from `Retry-After`, not a blank page
   (test in Task 4).
4. A dropped JSON file that is not a report (for example the plugin's preset JSON) — expected: a
   readable error naming the first invalid path (test in Task 2).
5. Any error message or thrown object containing the token — expected: the token is replaced by
   `•••` before it reaches the UI (test in Task 4).

---

### Task 0: Branch

- [ ] **Step 1**

```bash
git fetch origin
git switch -c feat/web-report origin/feat/figma-plugin-checker
npm install && npm test
git add docs/superpowers/plans/2026-09-27-slice-5-web-report.md
git commit -m "Add the implementation plan for the web report"
```
Expected: tests pass (core 268, plugin 47, simulator 72 at the time of writing).

### Task 1: Figma REST JSON → frames and geometry

**Files:** Create `packages/core/src/figmaRest.ts`, `packages/core/src/figmaRest.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RestNode {                          // the subset of Figma's REST node we read
  id: string; name: string; type: string; visible?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: RestNode[];
  characters?: string; style?: { fontSize?: number };
  overflowDirection?: string; layoutMode?: string; clipsContent?: boolean;
  fills?: { type: string }[];
  sharedPluginData?: Record<string, Record<string, string>>;
}
export interface RestFrame { id: string; name: string; page: string; width: number; height: number; tag: string }
export function parseFileKey(url: string): string | null;            // figma.com/file|design/<key>/…
export function frameCandidates(document: RestNode): RestFrame[];    // top-level frames, and frames inside sections
export function tagOf(node: RestNode): string;                       // sharedPluginData.hinge.target or ''
export function restToGeo(frame: RestNode): GeoNode[];               // children of a frame, frame-relative
export const OVERLAY_NAME = '⎔ hinge-overlay';                       // re-exported for both adapters
```

- [ ] **Step 1: Failing test** `figmaRest.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { frameCandidates, parseFileKey, restToGeo, tagOf, type RestNode } from './figmaRest';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const doc: RestNode = {
  id: '0:0', name: 'Document', type: 'DOCUMENT',
  children: [
    {
      id: '0:1', name: 'Screens', type: 'CANVAS',
      children: [
        { id: '1:1', name: 'Home', type: 'FRAME', absoluteBoundingBox: box(0, 0, 1100, 756), sharedPluginData: { hinge: { target: 'surface-duo-2/spanned/spanned/landscape' } } },
        { id: '1:2', name: 'Group', type: 'SECTION', children: [{ id: '1:3', name: 'Cover', type: 'FRAME', absoluteBoundingBox: box(2000, 0, 352, 339) }] },
        { id: '1:4', name: 'A rectangle', type: 'RECTANGLE', absoluteBoundingBox: box(0, 0, 10, 10) },
      ],
    },
  ],
};

describe('Figma REST adapter', () => {
  it('reads the file key from design and file URLs', () => {
    expect(parseFileKey('https://www.figma.com/design/AbC123xyz/My-file?node-id=1-2')).toBe('AbC123xyz');
    expect(parseFileKey('https://figma.com/file/AbC123xyz/My-file')).toBe('AbC123xyz');
    expect(parseFileKey('https://example.com/nothing')).toBeNull();
  });

  it('finds top-level frames and frames inside sections, with their page and tag', () => {
    expect(frameCandidates(doc)).toEqual([
      { id: '1:1', name: 'Home', page: 'Screens', width: 1100, height: 756, tag: 'surface-duo-2/spanned/spanned/landscape' },
      { id: '1:3', name: 'Cover', page: 'Screens', width: 352, height: 339, tag: '' },
    ]);
    expect(tagOf(doc.children![0].children![1])).toBe('');
  });

  it('maps a frame subtree to frame-relative geometry with roles, skipping hidden layers and the overlay', () => {
    const frame: RestNode = {
      id: '1:1', name: 'Home', type: 'FRAME', absoluteBoundingBox: box(100, 50, 1100, 756),
      children: [
        { id: '2:1', name: 'Title', type: 'TEXT', characters: 'Welcome back', style: { fontSize: 24 }, absoluteBoundingBox: box(116, 90, 300, 30) },
        { id: '2:2', name: 'Buy button', type: 'FRAME', absoluteBoundingBox: box(630, 350, 80, 48) },
        { id: '2:3', name: 'Hidden', type: 'FRAME', visible: false, absoluteBoundingBox: box(0, 0, 1, 1) },
        { id: '2:4', name: '⎔ hinge-overlay', type: 'FRAME', absoluteBoundingBox: box(100, 50, 1100, 756) },
        { id: '2:5', name: 'Hero', type: 'FRAME', clipsContent: true, overflowDirection: 'HORIZONTAL_SCROLLING', layoutMode: 'HORIZONTAL', absoluteBoundingBox: box(100, 200, 1100, 200) },
      ],
    };
    expect(restToGeo(frame)).toEqual([
      { id: '2:1', name: 'Title', role: 'text', rect: { x: 16, y: 40, width: 300, height: 30 }, chars: 12, fontSize: 24, scrollAxis: 'none', layout: 'none' },
      { id: '2:2', name: 'Buy button', role: 'interactive', rect: { x: 530, y: 300, width: 80, height: 48 }, scrollAxis: 'none', layout: 'none' },
      { id: '2:5', name: 'Hero', role: 'container', rect: { x: 0, y: 150, width: 1100, height: 200 }, scrollAxis: 'x', layout: 'horizontal', clips: true },
    ]);
  });
});
```
Run: `npm test -w @hinge/core -- src/figmaRest.test.ts` → FAIL.

- [ ] **Step 2: Implement** `figmaRest.ts`. Roles follow the plugin's rules exactly (text by type;
  chrome by `CHROME_NAME`; interactive by `INTERACTIVE_NAME`, or an `INSTANCE` whose shorter side
  is ≥ 32; media by an `IMAGE`/`VIDEO` fill; else container). Move `INTERACTIVE_NAME`,
  `CHROME_NAME` and `MIN_CONTROL_SIDE` from `packages/figma-plugin/src/geo.ts` into this core
  module and import them there, so both adapters share one list (update the plugin's imports in
  the same commit). REST `overflowDirection` values are `HORIZONTAL_SCROLLING`,
  `VERTICAL_SCROLLING`, `HORIZONTAL_AND_VERTICAL_SCROLLING`, `NONE`; map to `x`/`y`/`y`/`none`.

```ts
// Figma REST JSON → the core geometry tree, with the same roles as the plugin's adapter.
import type { GeoNode, GeoRole } from './geo';

export const OVERLAY_NAME = '⎔ hinge-overlay';
/** Layer names treated as tappable. Edit to match a design system's naming. */
export const INTERACTIVE_NAME = /\b(button|btn|cta|link|chip|tab(?! ?bar)|toggle|switch|checkbox|radio|input|field|fab|card)\b/i;
/** Layer names treated as system or app chrome. */
export const CHROME_NAME = /\b(nav(igation)?|tab ?bar|tool ?bar|app ?bar|bottom ?bar|status ?bar|header|footer)\b/i;
/** Instances smaller than this on either side are icons, dividers or badges, not controls. */
export const MIN_CONTROL_SIDE = 32;

export interface RestNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: RestNode[];
  characters?: string;
  style?: { fontSize?: number };
  overflowDirection?: string;
  layoutMode?: string;
  clipsContent?: boolean;
  fills?: { type: string }[];
  sharedPluginData?: Record<string, Record<string, string>>;
}

export interface RestFrame {
  id: string;
  name: string;
  page: string;
  width: number;
  height: number;
  tag: string;
}

export function parseFileKey(url: string): string | null {
  const m = url.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

export function tagOf(node: RestNode): string {
  return node.sharedPluginData?.hinge?.target ?? '';
}

export function frameCandidates(document: RestNode): RestFrame[] {
  const out: RestFrame[] = [];
  for (const page of document.children ?? []) {
    const visit = (nodes: RestNode[]) => {
      for (const n of nodes) {
        if (n.type === 'FRAME' && n.absoluteBoundingBox) {
          out.push({ id: n.id, name: n.name, page: page.name, width: n.absoluteBoundingBox.width, height: n.absoluteBoundingBox.height, tag: tagOf(n) });
        } else if (n.type === 'SECTION' || n.type === 'GROUP') {
          visit(n.children ?? []);
        }
      }
    };
    visit(page.children ?? []);
  }
  return out;
}

export function roleOfRest(n: RestNode): GeoRole {
  if (n.type === 'TEXT') return 'text';
  if (CHROME_NAME.test(n.name)) return 'chrome';
  if (INTERACTIVE_NAME.test(n.name)) return 'interactive';
  const b = n.absoluteBoundingBox;
  if (n.type === 'INSTANCE' && b && Math.min(b.width, b.height) >= MIN_CONTROL_SIDE) return 'interactive';
  if ((n.fills ?? []).some((f) => f.type === 'IMAGE' || f.type === 'VIDEO')) return 'media';
  return 'container';
}

const SCROLL: Record<string, GeoNode['scrollAxis']> = {
  HORIZONTAL_SCROLLING: 'x',
  VERTICAL_SCROLLING: 'y',
  HORIZONTAL_AND_VERTICAL_SCROLLING: 'y',
};
const LAYOUT: Record<string, GeoNode['layout']> = { HORIZONTAL: 'horizontal', VERTICAL: 'vertical' };

export function restToGeo(frame: RestNode): GeoNode[] {
  const origin = frame.absoluteBoundingBox ?? { x: 0, y: 0, width: 0, height: 0 };
  const convert = (nodes: RestNode[]): GeoNode[] =>
    nodes.flatMap((n) => {
      if (n.visible === false || n.name === OVERLAY_NAME || !n.absoluteBoundingBox) return [];
      const b = n.absoluteBoundingBox;
      const g: GeoNode = {
        id: n.id,
        name: n.name,
        role: roleOfRest(n),
        rect: { x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height },
        scrollAxis: SCROLL[n.overflowDirection ?? ''] ?? 'none',
        layout: LAYOUT[n.layoutMode ?? ''] ?? 'none',
        ...(n.clipsContent ? { clips: true } : {}),
      };
      if (n.type === 'TEXT') {
        g.chars = (n.characters ?? '').length;
        if (n.style?.fontSize) g.fontSize = n.style.fontSize;
      }
      if (n.children?.length) g.children = convert(n.children);
      return [g];
    });
  return convert(frame.children ?? []);
}
```
Key order in the test's expected objects does not matter to `toEqual`; `children` must be absent
(not `[]`) for leaves, which `n.children?.length` ensures.

- [ ] **Step 3:** `npm test && npm run typecheck` → PASS (the plugin still passes with the moved
  patterns). **Step 4: Commit**

```bash
git add packages/core/src/figmaRest.ts packages/core/src/figmaRest.test.ts packages/figma-plugin/src/geo.ts
git commit -m "Read frames and geometry from Figma REST JSON with the plugin's roles"
```

### Task 2: The report shape, building it, and Markdown

**Files:** Create `packages/core/src/report.ts`, `packages/core/src/report.test.ts`

**Interfaces:**
- Consumes: `matchFrame`, `check`, `coverage`, `Subject` (slices 3–4).
- Produces:

```ts
export const reportSchema: z.ZodType<Report>;
export interface ReportFrame { ref: string; name: string; page: string; width: number; height: number; confidence: 'tag' | 'name' | 'size' | 'none'; targets: string[]; nearest?: string; findings: Finding[] }
export interface Report { version: 1; generatedAt: string; source: { kind: 'figma' | 'web'; ref: string; name: string; fileVersion?: string }; catalogVersion: string; frames: ReportFrame[]; coverage: CoverageMatrix; unloaded: { ref: string; name: string; reason: string }[] }
export function buildReport(catalog: Catalog, source: Report['source'], frames: { ref: string; name: string; page: string; width: number; height: number; tag: string; root: GeoNode[] | null; reason?: string }[], now?: Date): Report;
export function parseReport(json: unknown): Report;                    // throws ConfigError with the path
export function toMarkdown(r: Report): string;
```
  A frame with `root: null` goes into `unloaded` with its `reason` (partial reports).

- [ ] **Step 1: Failing test** `report.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { ConfigError } from './config/schema';
import { buildReport, parseReport, toMarkdown } from './report';

const catalog = loadCatalog();
const source = { kind: 'figma' as const, ref: 'AbC123xyz', name: 'My file', fileVersion: '42' };
const button = { id: '2:2', name: 'Buy button', role: 'interactive' as const, rect: { x: 530, y: 300, width: 80, height: 48 } };
const frames = [
  { ref: '1:1', name: 'Home', page: 'Screens', width: 1100, height: 756, tag: 'surface-duo-2/spanned/spanned/landscape', root: [button] },
  { ref: '1:3', name: 'Odd', page: 'Screens', width: 399, height: 801, tag: '', root: [] },
  { ref: '1:9', name: 'Heavy', page: 'Screens', width: 411, height: 923, tag: '', root: null, reason: 'Rate limited: retry in 30 s' },
];

describe('report', () => {
  const r = buildReport(catalog, source, frames, new Date('2026-09-27T10:00:00Z'));

  it('matches, checks and covers the frames', () => {
    expect(r.frames[0]).toMatchObject({ ref: '1:1', confidence: 'tag', targets: ['surface-duo-2/spanned/spanned/landscape'] });
    expect(r.frames[0].findings.map((f) => f.ruleId)).toContain('hinge-content');
    expect(r.frames[1]).toMatchObject({ confidence: 'none', nearest: expect.any(String), findings: [] });
    expect(r.coverage.byCategory['dual-screen'].present).toBe(1);
  });

  it('lists frames it could not load instead of dropping them', () => {
    expect(r.unloaded).toEqual([{ ref: '1:9', name: 'Heavy', reason: 'Rate limited: retry in 30 s' }]);
    expect(r.frames.map((f) => f.ref)).not.toContain('1:9');
  });

  it('round-trips through JSON and rejects something that is not a report, with the path', () => {
    expect(parseReport(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(() => parseReport({ version: 1, frames: [] })).toThrow(ConfigError);
    expect(() => parseReport({ version: 1, frames: 'x' })).toThrow(/frames/);
  });

  it('writes Markdown for tickets', () => {
    const md = toMarkdown(r);
    expect(md).toMatch(/^# Foldable check — My file/);
    expect(md).toContain('| dual-screen | 1/3 |');
    expect(md).toContain('hinge-content');
    expect(md).toContain('Could not load');
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `report.ts`

```ts
// A foldable check report: what was checked, what matched, what the rules found and what coverage
// is missing. Built by the web report and the CLI, validated when imported.
import { z } from 'zod';
import type { Catalog } from './config/schema';
import { ConfigError, formatPath } from './config/schema';
import { coverage, type CoverageMatrix } from './coverage';
import type { Finding } from './engine/checks';
import type { GeoNode } from './geo';
import { matchFrame } from './match';
import { check } from './rules';
import { envConfigOf, targetKey } from './targets';

export interface ReportFrame {
  ref: string;
  name: string;
  page: string;
  width: number;
  height: number;
  confidence: 'tag' | 'name' | 'size' | 'none';
  targets: string[];
  nearest?: string;
  findings: Finding[];
}

export interface Report {
  version: 1;
  generatedAt: string;
  source: { kind: 'figma' | 'web'; ref: string; name: string; fileVersion?: string };
  catalogVersion: string;
  frames: ReportFrame[];
  coverage: CoverageMatrix;
  unloaded: { ref: string; name: string; reason: string }[];
}

export interface ReportInput {
  ref: string;
  name: string;
  page: string;
  width: number;
  height: number;
  tag: string;
  /** null when the frame could not be loaded. */
  root: GeoNode[] | null;
  reason?: string;
}

const rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const target = z.object({ deviceId: z.string(), displayId: z.string(), pose: z.string().optional(), orientation: z.enum(['portrait', 'landscape']), rotation: z.union([z.literal(0), z.literal(90)]).optional() });
const finding = z.object({ ruleId: z.string(), severity: z.enum(['error', 'warn', 'info']), target, nodeId: z.string(), rect, message: z.string(), source: z.string(), estimated: z.boolean() });
const requirement = z.object({ category: z.string(), kind: z.string(), orientation: z.enum(['portrait', 'landscape']), level: z.enum(['required', 'optional']), note: z.string().optional() });

export const reportSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  source: z.object({ kind: z.enum(['figma', 'web']), ref: z.string(), name: z.string(), fileVersion: z.string().optional() }),
  catalogVersion: z.string(),
  frames: z.array(
    z.object({
      ref: z.string(),
      name: z.string(),
      page: z.string(),
      width: z.number(),
      height: z.number(),
      confidence: z.enum(['tag', 'name', 'size', 'none']),
      targets: z.array(z.string()),
      nearest: z.string().optional(),
      findings: z.array(finding),
    }),
  ),
  coverage: z.object({
    cells: z.array(z.object({ requirement, status: z.enum(['present', 'present-by-size', 'missing']), frames: z.array(z.string()) })),
    byCategory: z.record(z.string(), z.object({ required: z.number(), present: z.number() })),
  }),
  unloaded: z.array(z.object({ ref: z.string(), name: z.string(), reason: z.string() })),
});

export function parseReport(json: unknown): Report {
  const result = reportSchema.safeParse(json);
  if (!result.success) throw new ConfigError(result.error.issues.map((i) => `${formatPath(i.path) || '(root)'}: ${i.message}`));
  return result.data as Report;
}

export function buildReport(catalog: Catalog, source: Report['source'], inputs: ReportInput[], now = new Date()): Report {
  const config = envConfigOf(catalog);
  const frames: ReportFrame[] = [];
  const unloaded: Report['unloaded'] = [];
  const present = [];
  for (const f of inputs) {
    if (!f.root) {
      unloaded.push({ ref: f.ref, name: f.name, reason: f.reason ?? 'Not loaded' });
      continue;
    }
    const m = matchFrame({ tag: f.tag || undefined, name: f.name, width: f.width, height: f.height }, config);
    const base = { ref: f.ref, name: f.name, page: f.page, width: f.width, height: f.height };
    if (m.by === 'none') {
      frames.push({ ...base, confidence: 'none', targets: [], ...(m.nearest ? { nearest: m.nearest.key } : {}), findings: [] });
      continue;
    }
    const findings = check({ source: source.kind, ref: f.ref, targets: m.targets, confidence: m.by, width: f.width, height: f.height, root: f.root }, config);
    frames.push({ ...base, confidence: m.by, targets: m.targets.map(targetKey), findings });
    present.push({ frameId: f.ref, targets: m.targets, confidence: m.by });
  }
  return {
    version: 1,
    generatedAt: now.toISOString(),
    source,
    catalogVersion: catalog.version,
    frames,
    coverage: coverage(catalog, present),
    unloaded,
  };
}

const ICON = { error: '⛔', warn: '⚠️', info: 'ℹ️' } as const;

export function toMarkdown(r: Report): string {
  const lines = [
    `# Foldable check — ${r.source.name}`,
    '',
    `Generated ${r.generatedAt} · catalog ${r.catalogVersion}${r.source.fileVersion ? ` · file version ${r.source.fileVersion}` : ''}`,
    '',
    '| Category | Covered |',
    '|---|---|',
    ...Object.entries(r.coverage.byCategory).map(([c, v]) => `| ${c} | ${v.present}/${v.required} |`),
    '',
    '## Frames',
  ];
  for (const f of r.frames) {
    lines.push('', `### ${f.name} (${f.confidence === 'none' ? `unknown size${f.nearest ? `, nearest ${f.nearest}` : ''}` : f.confidence})`);
    if (!f.findings.length) lines.push('', 'No problems found.');
    for (const x of f.findings) lines.push(`- ${ICON[x.severity]} **${x.ruleId}** ${x.message}${x.estimated ? ' _(estimated)_' : ''}`);
  }
  if (r.unloaded.length) {
    lines.push('', '## Could not load', '');
    for (const u of r.unloaded) lines.push(`- ${u.name}: ${u.reason}`);
  }
  return `${lines.join('\n')}\n`;
}
```
If `formatPath` is not exported from `config/schema.ts`, export it there (it already exists as a
module function). `present` needs an explicit type: `const present: PresentFrame[] = []` with
`PresentFrame` imported from `./coverage`.

- [ ] **Step 3:** `npm test -w @hinge/core && npm run typecheck -w @hinge/core` → PASS.
  **Step 4: Commit**

```bash
git add packages/core/src/report.ts packages/core/src/report.test.ts
git commit -m "Build, validate and export foldable check reports"
```

### Task 3: Presets ZIP

**Files:** Create `packages/core/src/presetZip.ts`, `packages/core/src/presetZip.test.ts`; add
`fflate` to `packages/core/package.json` dependencies.

**Interfaces:** Produces `presetZip(config: EnvConfig, targets: Target[]): Uint8Array` containing
`presets.json` (`toPluginJSON`) and one `svg/<device>__<display>__<pose>__<orientation>.svg` per
target (`toSVG`).

- [ ] **Step 1: Failing test**

```ts
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from './catalog/load';
import { presetZip } from './presetZip';
import { envConfigOf } from './targets';

describe('presetZip', () => {
  it('packs plugin JSON and one SVG per target', () => {
    const files = unzipSync(presetZip(envConfigOf(loadCatalog()), [
      { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' },
      { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' },
    ]));
    expect(Object.keys(files).sort()).toEqual(['presets.json', 'svg/pixel-9__main__-__portrait.svg', 'svg/surface-duo-2__spanned__spanned__landscape.svg']);
    expect(JSON.parse(strFromU8(files['presets.json'])).frames).toHaveLength(2);
    expect(strFromU8(files['svg/pixel-9__main__-__portrait.svg'])).toMatch(/^<svg /);
  });
});
```
Run (after `npm install fflate@^0.8.3 -w @hinge/core`) → FAIL.

- [ ] **Step 2: Implement**

```ts
// A ZIP of preset artboards for designers without the plugin: plugin JSON plus one SVG per target.
import { strToU8, zipSync } from 'fflate';
import type { EnvConfig } from './engine/environment';
import { presetSpec } from './presets';
import { toPluginJSON, toSVG } from './presetSvg';
import { targetKey, type Target } from './targets';

export function presetZip(config: EnvConfig, targets: Target[]): Uint8Array {
  const frames = targets.map((t) => presetSpec(config, t));
  const files: Record<string, Uint8Array> = { 'presets.json': strToU8(toPluginJSON(frames)) };
  for (const [i, t] of targets.entries()) files[`svg/${targetKey(t).replaceAll('/', '__')}.svg`] = strToU8(toSVG(frames[i]));
  return zipSync(files, { level: 6 });
}
```
- [ ] **Step 3:** `npm test -w @hinge/core && npm run typecheck -w @hinge/core` → PASS. Check
  `fflate` does not reach the plugin bundle: `npm run build -w @hinge/figma-plugin` and
  `grep -c zipSync packages/figma-plugin/dist/code.js` → `0` (the plugin does not import
  `presetZip`). **Step 4: Commit**

```bash
git add packages/core package-lock.json
git commit -m "Download preset artboards as a ZIP of SVGs and plugin JSON"
```

### Task 4: The report app and its Figma client

**Files:**
- Create: `apps/report/{package.json,index.html,tsconfig.json,vite.config.ts,vitest.config.ts}`,
  `apps/report/src/{figmaClient.ts,figmaClient.test.ts,loadReport.ts,loadReport.test.ts,main.tsx,ReportApp.tsx,report.css}`
- Modify: root `package.json` scripts (`build:report`, `dev:report`)

**Interfaces:**
- `figmaClient.ts` produces:

```ts
export class FigmaError extends Error { constructor(message: string, readonly status: number | 'network', readonly retryAfter?: number) }
export interface FigmaClient {
  me(): Promise<{ handle: string }>;
  file(key: string): Promise<{ name: string; version: string; document: RestNode }>;
  nodes(key: string, ids: string[]): Promise<{ loaded: Record<string, RestNode>; failed: { id: string; reason: string }[] }>;
  images(key: string, ids: string[]): Promise<Record<string, string | null>>;
}
export function createFigmaClient(token: string, fetchImpl?: typeof fetch): FigmaClient;
export function redact(text: string, token: string): string;
```
- `loadReport.ts` produces `loadFigmaReport(client: FigmaClient, url: string): Promise<{ report: Report; thumbnails: Record<string, string | null> }>` (cache per `key@version` in a module `Map`).

- [ ] **Step 1: Package**

`apps/report/package.json`:
```json
{
  "name": "@hinge/report",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "@hinge/core": "*", "react": "^19.3.0", "react-dom": "^19.3.0" },
  "devDependencies": {
    "@types/node": "^26.6.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "typescript": "^7.0.2",
    "vite": "^8.3.1",
    "vite-plugin-singlefile": "^2.3.3",
    "vitest": "^4.1.11"
  }
}
```
`vite.config.ts`: React + `viteSingleFile()`, `base: './'`, `build.outDir: 'dist'` (one HTML file
the team can open or host anywhere). `tsconfig.json`: DOM libs, `jsx: react-jsx`, `types: ['vite/client', 'node']`,
`include: ['src', 'vite.config.ts', 'vitest.config.ts']`. `vitest.config.ts`: node environment,
`src/**/*.test.ts`. Root scripts: `"dev:report": "npm run dev -w @hinge/report --"`,
`"build:report": "npm run build -w @hinge/report"`.

- [ ] **Step 2: Failing client test** `figmaClient.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { createFigmaClient, FigmaError, redact } from './figmaClient';

const TOKEN = 'figd_secret_123';
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('Figma client', () => {
  it('sends the trimmed token in the X-Figma-Token header, never in the URL', async () => {
    const fetchImpl = vi.fn(async () => json(200, { handle: 'me' }));
    await createFigmaClient(`  ${TOKEN}\n`, fetchImpl).me();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.figma.com/v1/me');
    expect((init.headers as Record<string, string>)['X-Figma-Token']).toBe(TOKEN);
    expect(url).not.toContain(TOKEN);
  });

  it('turns 403, 404 and 429 into readable errors', async () => {
    const client = (status: number, headers = {}) => createFigmaClient(TOKEN, async () => json(status, { err: 'x' }, headers));
    await expect(client(403).me()).rejects.toThrow(/token/i);
    await expect(client(404).file('k')).rejects.toThrow(/shared|not found/i);
    await expect(client(429, { 'retry-after': '30' }).file('k')).rejects.toMatchObject({ status: 429, retryAfter: 30 });
  });

  it('explains a network or CORS failure and suggests a local proxy', async () => {
    const client = createFigmaClient(TOKEN, async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(client.me()).rejects.toThrow(/127\.0\.0\.1/);
  });

  it('batches node requests, asks for shared plugin data, and keeps partial results', async () => {
    const calls: string[] = [];
    const client = createFigmaClient(TOKEN, async (input) => {
      const url = String(input);
      calls.push(url);
      if (calls.length === 2) return json(429, {}, { 'retry-after': '12' });
      const ids = new URL(url).searchParams.get('ids')!.split(',');
      return json(200, { nodes: Object.fromEntries(ids.map((id) => [id, { document: { id, name: id, type: 'FRAME' } }])) });
    });
    const ids = Array.from({ length: 120 }, (_, i) => `1:${i}`);
    const { loaded, failed } = await client.nodes('k', ids);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain('plugin_data=shared');
    expect(Object.keys(loaded)).toHaveLength(70);
    expect(failed).toHaveLength(50);
    expect(failed[0].reason).toMatch(/12 s/);
  });

  it('never lets the token reach an error message', async () => {
    const client = createFigmaClient(TOKEN, async () => {
      throw new Error(`boom ${TOKEN}`);
    });
    await expect(client.me()).rejects.not.toThrow(TOKEN);
    expect(redact(`x ${TOKEN} y`, TOKEN)).toBe('x ••• y');
  });
});
```
Run: `npm install && npm test -w @hinge/report` → FAIL.

- [ ] **Step 3: Implement** `figmaClient.ts`: base `https://api.figma.com/v1`; `request(path)`
  wraps `fetchImpl` in `try/catch` — a thrown error becomes
  `new FigmaError(redact('Could not reach api.figma.com (network or browser CORS). Run the report behind a local proxy on 127.0.0.1, or check the connection. ' + String(e), token), 'network')`;
  `403` → `'Figma refused the token: check it is valid and has the file_content:read scope.'`;
  `404` → `'File not found: check the URL and that the file is shared with the token's account.'`;
  `429` → `` `Rate limited by Figma: retry in ${retryAfter} s.` `` with `retryAfter` from the
  `retry-after` header (seconds); other non-2xx → `Figma returned <status>.` Every message goes
  through `redact`. `nodes` splits ids into chunks of 50, calls
  `/files/:key/nodes?ids=<chunk>&plugin_data=shared` sequentially, and on a `FigmaError` for a
  chunk records each id of that chunk in `failed` with the error message instead of throwing.
  `images` calls `/images/:key?ids=…&format=png&scale=1` in chunks of 50 and merges `images`.
  `file` calls `/files/:key?depth=2&plugin_data=shared`.
- [ ] **Step 4: Failing orchestration test** `loadReport.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { RestNode } from '@hinge/core/figmaRest';
import type { FigmaClient } from './figmaClient';
import { FigmaError } from './figmaClient';
import { loadFigmaReport } from './loadReport';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const home: RestNode = { id: '1:1', name: 'Home', type: 'FRAME', absoluteBoundingBox: box(0, 0, 1100, 756), sharedPluginData: { hinge: { target: 'surface-duo-2/spanned/spanned/landscape' } }, children: [] };
const cover: RestNode = { id: '1:3', name: 'Cover', type: 'FRAME', absoluteBoundingBox: box(2000, 0, 352, 339), children: [] };
const document: RestNode = { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{ id: '0:1', name: 'Screens', type: 'CANVAS', children: [home, cover] }] };

function fakeClient(version: string, failCover = false) {
  const calls = { file: 0, nodes: 0, images: 0 };
  const client: FigmaClient = {
    me: async () => ({ handle: 'me' }),
    file: async () => (calls.file++, { name: 'My file', version, document }),
    nodes: async () => (calls.nodes++, { loaded: failCover ? { '1:1': home } : { '1:1': home, '1:3': cover }, failed: failCover ? [{ id: '1:3', reason: new FigmaError('Rate limited by Figma: retry in 12 s.', 429, 12).message }] : [] }),
    images: async () => (calls.images++, { '1:1': 'https://img/1', '1:3': 'https://img/3' }),
  };
  return { client, calls };
}

describe('loadFigmaReport', () => {
  it('builds a report with tagged frames and thumbnails', async () => {
    const { client } = fakeClient('v1');
    const { report, thumbnails } = await loadFigmaReport(client, 'https://www.figma.com/design/KEY1/x');
    expect(report.frames.find((f) => f.ref === '1:1')).toMatchObject({ confidence: 'tag' });
    expect(thumbnails['1:1']).toBe('https://img/1');
  });

  it('serves nodes and images from the cache while the file version is unchanged', async () => {
    const { client, calls } = fakeClient('v7');
    await loadFigmaReport(client, 'https://www.figma.com/design/KEY2/x');
    await loadFigmaReport(client, 'https://www.figma.com/design/KEY2/x');
    expect(calls).toEqual({ file: 2, nodes: 1, images: 1 });
  });

  it('keeps going when some frames could not be loaded', async () => {
    const { client } = fakeClient('v1', true);
    const { report } = await loadFigmaReport(client, 'https://www.figma.com/design/KEY3/x');
    expect(report.unloaded).toEqual([{ ref: '1:3', name: 'Cover', reason: 'Rate limited by Figma: retry in 12 s.' }]);
  });

  it('asks for a Figma link when the URL has no file key', async () => {
    await expect(loadFigmaReport(fakeClient('v1').client, 'https://example.com')).rejects.toThrow('Paste a figma.com file or design link.');
  });
});
```
Run → FAIL.

- [ ] **Step 5: Implement** `loadReport.ts`

```ts
// Figma file → foldable check report, with thumbnails. Nodes and thumbnails are cached per file version.
import { loadCatalog } from '@hinge/core/catalog/load';
import { frameCandidates, parseFileKey, restToGeo } from '@hinge/core/figmaRest';
import { buildReport, type Report } from '@hinge/core/report';
import type { FigmaClient } from './figmaClient';

const catalog = loadCatalog();
const cache = new Map<string, { report: Report; thumbnails: Record<string, string | null> }>();

export async function loadFigmaReport(client: FigmaClient, url: string): Promise<{ report: Report; thumbnails: Record<string, string | null> }> {
  const key = parseFileKey(url);
  if (!key) throw new Error('Paste a figma.com file or design link.');
  await client.me();
  const file = await client.file(key);
  const cached = cache.get(`${key}@${file.version}`);
  if (cached) return cached;
  const frames = frameCandidates(file.document);
  const { loaded, failed } = await client.nodes(key, frames.map((f) => f.id));
  const reasons = new Map(failed.map((f) => [f.id, f.reason]));
  const report = buildReport(
    catalog,
    { kind: 'figma', ref: key, name: file.name, fileVersion: file.version },
    frames.map((f) => ({ ref: f.id, name: f.name, page: f.page, width: f.width, height: f.height, tag: f.tag, root: loaded[f.id] ? restToGeo(loaded[f.id]) : null, reason: reasons.get(f.id) })),
  );
  const thumbnails = await client.images(key, Object.keys(loaded));
  const result = { report, thumbnails };
  cache.set(`${key}@${file.version}`, result);
  return result;
}
```

- [ ] **Step 6:** `npm test -w @hinge/report && npm run typecheck -w @hinge/report` → PASS.
  **Step 7: Commit** (two microcommits: package + client; orchestration)

```bash
git add apps/report/package.json apps/report/tsconfig.json apps/report/vite.config.ts apps/report/vitest.config.ts apps/report/src/figmaClient.ts apps/report/src/figmaClient.test.ts package.json package-lock.json
git commit -m "Add a Figma REST client with readable errors and a redacted token"
git add apps/report/src/loadReport.ts apps/report/src/loadReport.test.ts
git commit -m "Load a Figma file into a foldable check report, cached per version"
```

### Task 5: The report page

**Files:** Create `apps/report/index.html`, `apps/report/src/{main.tsx,ReportApp.tsx,report.css,download.ts}`

**Interfaces:** Consumes `loadFigmaReport`, `createFigmaClient`, `parseReport`, `toMarkdown`,
`presetZip`, `representativeTarget`, `resolveTarget`.

- [ ] **Step 1: Page** — `ReportApp.tsx`:
  - **Input:** a Figma URL field, a password-type token field with a "Remember for this tab"
    checkbox (sessionStorage key `hinge.token`, read in a `try/catch`, only written when checked),
    a "Check file" button; and a drop zone / file input for a CLI JSON report (`parseReport`).
    The token lives in React state only; it is never put in the URL, `console`, or an error.
  - **Summary:** file name, version, generated time, counts per severity.
  - **Coverage:** the matrix grouped by category (category · posture · orientation · ✓/~/✗) and
    `present/required` per category.
  - **Frames:** one card per frame: thumbnail (`<img>` from `thumbnails`, lazy) with an SVG
    overlay drawn over it — hinge rects and safe zones from `presetSpec` of the frame's first
    target, scaled to the thumbnail width — then findings (severity icon, rule id, message,
    `estimated` badge). Frames with `confidence: 'none'` show "Unknown size — nearest <key>".
    `unloaded` frames show their reason.
  - **Downloads:** "Report JSON" (`JSON.stringify(report, null, 2)`), "Markdown" (`toMarkdown`),
    "Presets ZIP" (`presetZip` for the representative target of every missing required cell;
    disabled when none is missing). `download.ts`: `download(name, data: string | Uint8Array, type)`
    via `Blob` + object URL, revoked after click.
  - **Errors:** a banner with the `FigmaError` message (already redacted), and for 429 the wait.
  Styles in `report.css` with light/dark tokens on `:root` (`prefers-color-scheme`).
- [ ] **Step 2:** `npm run build -w @hinge/report && npm test && npm run typecheck` → PASS.
- [ ] **Step 3: Browser check** — `npm run dev:report -- --port 4751 --strictPort`, open it in the
  built-in browser, load a report JSON built from the Task 2 fixture through the file input
  (write the fixture to the scratchpad and set it on the input with a `DataTransfer` in
  `javascript_tool`), and confirm the coverage table, frame cards, findings and downloads render
  with no console errors. The live Figma path needs a real token: ask the user to try it and
  record the result in the PR.
- [ ] **Step 4: Commit**

```bash
git add apps/report
git commit -m "Add the web report page with coverage, findings, thumbnails and downloads"
```

### Task 6: README, issue and PR

- [ ] **Step 1:** `apps/report/README.md`: what the report reads (file, frames, tags), the token
  (scope `file_content:read`, memory only, optional per-tab remember), rate limits and caching,
  the CORS fallback, importing a CLI JSON report, and the downloads.
- [ ] **Step 2:** Issue:

```bash
gh issue create -R jacksonmafra-umain/SizeClassSimulator \
  --title "Web report: coverage and findings for a Figma file" --label enhancement --label area:web \
  --body "Slice 5 of docs/superpowers/specs/2026-09-25-foldable-artboards-design.md. A read-only web report: paste a Figma file URL and a personal access token (or drop a CLI JSON report) to see coverage, findings per frame with thumbnails and overlays, and download presets or the report."
```
- [ ] **Step 3:** `git push -u origin feat/web-report`; PR targeting `feat/figma-plugin-checker`,
  labels `enhancement,area:web`, body `Closes #N`, Summary, Test plan (counts, typecheck, builds,
  browser check with a JSON report, live Figma check pending the user). No assistant mention.
