# Slice 1 — Extract core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single Vite app into an npm-workspaces repo where `packages/core` holds the
engine and config (plain TypeScript and zod, no React or DOM) and `apps/simulator` is the
existing app consuming it, with behaviour unchanged.

**Architecture:** Move the app as-is into `apps/simulator`, then move `src/engine` and
`src/config` into `packages/core/src`, leaving one-line re-export shims at the old paths so no app
import changes in the same commit. Split the pure geometry out of the React collision hook into
`core/collisions`. Shim removal is a separate, later PR, held until the parallel Android branch
has rebased.

**Tech Stack:** npm 11 workspaces, TypeScript 7 (`moduleResolution: bundler`), Vite 8, Vitest 4,
zod 4, React 19.

**Spec:** `docs/superpowers/specs/2026-09-25-foldable-artboards-design.md` §3, §3.2, §3.3, §12
slice 1.

## Global Constraints

- `core` is plain TypeScript and zod: no React, no DOM, no `figma` global (spec §3).
- `core` ships as TypeScript source: `"exports": {"./*": "./src/*.ts"}`; Vite and esbuild consume
  it directly, no build step (spec §3).
- npm workspaces; no extra build orchestrator (spec §3).
- Package names use the working name: `@dobra/core`, `@dobra/simulator` (spec header).
- Commits in English, microcommits, never mention the assistant (no trailers, no footers).
- Never push to or merge into `main`. The PR closes a labeled issue (`enhancement`, `area:core`).
- Base branch: `origin/chore/remove-brand` (PR #5). Work branch: `refactor/extract-core`.
- Keep the old-path shims in this PR. Removing them is Task 5, on its own branch, only after
  agent/01 confirms its rebase.

## Review Focus

1. `npm run dev` from the repo root still starts the simulator — expected: root scripts delegate
   to the workspace (checked in Task 1 Step 5).
2. The single-file build (`build:single`) still produces one HTML file with images inlined —
   expected: run in Task 1 Step 5 and Task 4 Step 5.
3. Importing JSON through the package (`@dobra/core/config/simulator.config.json`) resolves in
   Vite, Vitest and `tsc` — expected: the `./*.json` export entry wins over `./*` (test in Task 2).
4. Something in core quietly uses a DOM or React API — expected: core's `tsconfig` has no `DOM`
   lib and no React types, so `tsc` fails (Task 2 Step 6).
5. A scrolling element beside a horizontal fold is reported as colliding — expected: the
   scrolling rule only compares x spans against vertical folds and ignores `none` zones (test in
   Task 3).

---

### Task 1: npm workspaces and the app in `apps/simulator`

**Files:**
- Move (git mv): `index.html`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `src/` →
  `apps/simulator/`
- Create: `apps/simulator/package.json`
- Modify: root `package.json` (becomes the workspace root), `package-lock.json` (regenerated)

**Interfaces:**
- Produces: workspace `@dobra/simulator` with scripts `dev`, `build`, `build:single`, `preview`,
  `typecheck`, `test`, `test:watch`; root scripts of the same names delegating to it.

- [ ] **Step 1: Move the app**

```bash
mkdir -p apps/simulator
git mv index.html vite.config.ts vitest.config.ts tsconfig.json src apps/simulator/
```

- [ ] **Step 2: Create `apps/simulator/package.json`** (dependencies copied from the current root
  `package.json`; versions unchanged)

```json
{
  "name": "@dobra/simulator",
  "private": true,
  "version": "0.5.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "build:single": "tsc -b && vite build --mode single",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/node": "^26.6.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2",
    "vite": "^8.3.1",
    "vite-plugin-singlefile": "^2.3.3",
    "vitest": "^4.1.11"
  }
}
```
These are the root `package.json` versions on `origin/chore/remove-brand`; do not change any.

- [ ] **Step 3: Rewrite the root `package.json`**

```json
{
  "name": "dobra",
  "private": true,
  "version": "0.5.0",
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "npm run dev -w @dobra/simulator",
    "build": "npm run build -w @dobra/simulator",
    "build:single": "npm run build:single -w @dobra/simulator",
    "preview": "npm run preview -w @dobra/simulator",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 4: Reinstall**

Run: `npm install`
Expected: exits 0; `package-lock.json` lists `apps/simulator`; `node_modules/@dobra/simulator` is a
symlink.

- [ ] **Step 5: Verify from the root**

Run: `npm test && npm run build && npm run build:single && ls apps/simulator/dist-single`
Expected: tests PASS (same count as before, 100), both builds succeed, `dist-single` holds one
`index.html`. Then `npm run dev` prints a local URL (stop it after it starts).

- [ ] **Step 6: Commit**

```bash
git add -A package.json package-lock.json apps
git commit -m "Move the simulator into an npm workspace under apps/simulator"
```

### Task 2: `packages/core` with the engine and config, shims at the old paths

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`,
  `packages/core/vitest.config.ts`, `apps/simulator/src/core.test.ts`
- Move (git mv): `apps/simulator/src/engine/*` and `apps/simulator/src/config/*` →
  `packages/core/src/engine/`, `packages/core/src/config/`
- Create shims: one file per moved non-test module at its old path
- Modify: `apps/simulator/package.json` (add `@dobra/core`, drop `zod`),
  `apps/simulator/src/sample/art.test.ts` (JSON import)

**Interfaces:**
- Produces: `@dobra/core/engine/<module>` and `@dobra/core/config/<module>` for every moved module
  (`android`, `bars`, `diff`, `environment`, `folds`, `ios`, `layout`, `modal`, `sizeClass`,
  `load`, `schema`, `types`), and `@dobra/core/config/simulator.config.json`.

- [ ] **Step 1: Write the failing test** `apps/simulator/src/core.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { splitRegions as viaShim } from './engine/folds';
import { splitRegions } from '@dobra/core/engine/folds';
import { loadConfig } from '@dobra/core/config/load';
import raw from '@dobra/core/config/simulator.config.json';

describe('@dobra/core', () => {
  it('is what the old engine path re-exports', () => {
    expect(viaShim).toBe(splitRegions);
  });

  it('serves the config JSON and a validated config', () => {
    expect(loadConfig().devices.length).toBe(raw.devices.length);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -w @dobra/simulator -- src/core.test.ts`
Expected: FAIL — `Failed to resolve import "@dobra/core/engine/folds"`.

- [ ] **Step 3: Create the package**

`packages/core/package.json`:
```json
{
  "name": "@dobra/core",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "exports": {
    "./*.json": "./src/*.json",
    "./*": "./src/*.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.6.5" },
  "devDependencies": {
    "@types/node": "^26.6.2",
    "typescript": "^7.0.2",
    "vitest": "^4.1.11"
  }
}
```

`packages/core/tsconfig.json` (no DOM lib, no React types: core must stay platform-neutral):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "vitest.config.ts"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 4: Move the modules and write the shims**

```bash
mkdir -p packages/core/src
git mv apps/simulator/src/engine packages/core/src/engine
git mv apps/simulator/src/config packages/core/src/config
mkdir -p apps/simulator/src/engine apps/simulator/src/config
for f in packages/core/src/engine/*.ts packages/core/src/config/*.ts; do
  case "$f" in *.test.ts) continue ;; esac
  dir=$(basename "$(dirname "$f")"); mod=$(basename "$f" .ts)
  printf "// Moved to @dobra/core. This re-export keeps old imports working until they are rewritten.\nexport * from '@dobra/core/%s/%s';\n" "$dir" "$mod" > "apps/simulator/src/$dir/$mod.ts"
done
```
`export *` does not re-export a default export; none of the moved modules has one (checked with
`grep -l "export default" packages/core/src -r` → no output).

- [ ] **Step 5: Point the app at the package**

In `apps/simulator/package.json` add `"@dobra/core": "*"` to `dependencies` and remove `zod`
(core owns it). In `apps/simulator/src/sample/art.test.ts` change
`import raw from '../config/simulator.config.json';` to
`import raw from '@dobra/core/config/simulator.config.json';`. Then `npm install`.

- [ ] **Step 6: Run everything**

Run: `npm test && npm run typecheck && npm run build && npm run build:single`
Expected: core runs the moved suites (`android`, `platform`, `postures`, `schema`) and passes; the
simulator runs `art` and `core` tests and passes; the total equals 100 plus the 2 new tests;
typecheck passes in both workspaces; both builds succeed.
Also run: `grep -rnE "from 'react|document\.|window\." packages/core/src` → no output.

- [ ] **Step 7: Commit** (two microcommits)

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/vitest.config.ts package-lock.json
git add -A packages/core/src apps/simulator/src/engine apps/simulator/src/config
git commit -m "Move the engine and config into @dobra/core, with re-exports at the old paths"
git add apps/simulator/package.json apps/simulator/src/core.test.ts apps/simulator/src/sample/art.test.ts package-lock.json
git commit -m "Consume @dobra/core from the simulator and test the package boundary"
```
If the first commit alone does not build (the app must depend on `@dobra/core` to resolve the
shims), fold the `apps/simulator/package.json` change into it and keep the test in the second.

### Task 3: Pure collision geometry in core, the DOM hook as an adapter

**Files:**
- Create: `packages/core/src/collisions.ts`, `packages/core/src/collisions.test.ts`
- Modify: `apps/simulator/src/sample/collisions.ts`

**Interfaces:**
- Produces (in `@dobra/core/collisions`):
  - `interface CollisionZone { label: string; rect: Rect; scrollAxis: 'x' | 'none' }`
  - `interface CollisionSubject { id: string; rect: Rect; scrolls: boolean }`
  - `interface CollisionHit { id: string; zone: string }`
  - `rectsOverlap(a: Rect, b: Rect): boolean`
  - `spansOverlap(a: number, aLength: number, b: number, bLength: number): boolean`
  - `collisionZones(env: Pick<Environment, 'folds' | 'reservedRegions'>): CollisionZone[]`
  - `findCollisions(subjects: CollisionSubject[], zones: CollisionZone[]): CollisionHit[]` —
    first matching zone per subject, in subject order.
- Consumes: `Rect` from `@dobra/core/config/types`; `Environment` from
  `@dobra/core/engine/environment`; `FoldFeature` from `@dobra/core/engine/folds`.
- Spec note: §3.2 names `findCollisions(nodes: GeoNode[], zones: Rect[])`. `GeoNode` does not
  exist until the checker slice; this slice uses `CollisionSubject`, which `GeoNode` will satisfy
  (it has `id` and `rect`).

- [ ] **Step 1: Write the failing test** `packages/core/src/collisions.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { FoldFeature } from './engine/folds';
import { collisionZones, findCollisions, rectsOverlap, spansOverlap } from './collisions';

const fold = (axis: 'vertical' | 'horizontal', separating: boolean, occludes = false): FoldFeature => ({
  axis,
  rect: axis === 'vertical' ? { x: 100, y: 0, width: 10, height: 400 } : { x: 0, y: 200, width: 300, height: 10 },
  separating,
  occludes,
  estimated: false,
});

describe('collision geometry', () => {
  it('overlaps rects and spans with exclusive edges', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, width: 11, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(true);
    expect(spansOverlap(0, 10, 10, 5)).toBe(false);
    expect(spansOverlap(0, 11, 10, 5)).toBe(true);
  });

  it('makes zones only for folds that separate or occlude, plus reserved regions', () => {
    const zones = collisionZones({
      folds: [fold('vertical', true), fold('horizontal', false), fold('horizontal', false, true)],
      reservedRegions: [{ id: 'camera', label: 'Camera', kind: 'camera', rect: { x: 0, y: 0, width: 50, height: 30 } }],
    } as never);
    expect(zones.map((z) => [z.label, z.scrollAxis])).toEqual([
      ['Folding region', 'x'],
      ['Folding region', 'none'],
      ['Camera', 'none'],
    ]);
  });

  it('checks scrolling subjects on the x span of vertical folds only', () => {
    const zones = collisionZones({ folds: [fold('vertical', true), fold('horizontal', true)], reservedRegions: [] } as never);
    const hits = findCollisions(
      [
        { id: 'scrolls-across-vertical', rect: { x: 90, y: 900, width: 40, height: 20 }, scrolls: true },
        { id: 'scrolls-over-horizontal', rect: { x: 0, y: 195, width: 50, height: 20 }, scrolls: true },
        { id: 'fixed-over-horizontal', rect: { x: 0, y: 195, width: 50, height: 20 }, scrolls: false },
        { id: 'clear', rect: { x: 0, y: 0, width: 50, height: 20 }, scrolls: false },
      ],
      zones,
    );
    expect(hits).toEqual([
      { id: 'scrolls-across-vertical', zone: 'Folding region' },
      { id: 'fixed-over-horizontal', zone: 'Folding region' },
    ]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -w @dobra/core -- src/collisions.test.ts`
Expected: FAIL — cannot resolve `./collisions`.

- [ ] **Step 3: Implement `packages/core/src/collisions.ts`**

```ts
// Which elements sit in a fold or a reserved region. Pure geometry: callers measure elements
// (DOM, Figma nodes, simulator layout) and pass rects in window coordinates.
import type { Rect } from './config/types';
import type { Environment } from './engine/environment';

export interface CollisionZone {
  label: string;
  rect: Rect;
  /** A vertical fold stays in place while content scrolls vertically, so only the x span matters. */
  scrollAxis: 'x' | 'none';
}

export interface CollisionSubject {
  id: string;
  rect: Rect;
  /** Inside a vertically scrolling container. */
  scrolls: boolean;
}

export interface CollisionHit {
  id: string;
  zone: string;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function spansOverlap(a: number, aLength: number, b: number, bLength: number): boolean {
  return a < b + bLength && a + aLength > b;
}

/** Only a fold that separates or hides content is a problem; a flat crease on a flexible display is not. */
export function collisionZones(env: Pick<Environment, 'folds' | 'reservedRegions'>): CollisionZone[] {
  const zones: CollisionZone[] = [];
  for (const fold of env.folds) {
    if (!fold.separating && !fold.occludes) continue;
    zones.push({ label: 'Folding region', rect: fold.rect, scrollAxis: fold.axis === 'vertical' ? 'x' : 'none' });
  }
  for (const region of env.reservedRegions) zones.push({ label: region.label, rect: region.rect, scrollAxis: 'none' });
  return zones;
}

/** The first zone each subject hits, in subject order. */
export function findCollisions(subjects: CollisionSubject[], zones: CollisionZone[]): CollisionHit[] {
  const hits: CollisionHit[] = [];
  for (const s of subjects) {
    const zone = zones.find((z) =>
      s.scrolls
        ? z.scrollAxis !== 'none' && spansOverlap(s.rect.x, s.rect.width, z.rect.x, z.rect.width)
        : rectsOverlap(s.rect, z.rect),
    );
    if (zone) hits.push({ id: s.id, zone: zone.label });
  }
  return hits;
}
```

- [ ] **Step 4: Run it**

Run: `npm test -w @dobra/core -- src/collisions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Make the hook an adapter** — in `apps/simulator/src/sample/collisions.ts`:
  - import `collisionZones`, `findCollisions`, `rectsOverlap`, `spansOverlap` and
    `type CollisionSubject` from `@dobra/core/collisions`;
  - delete the local `Zone` interface, the zone-building loops, and the local `rectsOverlap` /
    `spansOverlap` bodies, re-exporting the core ones instead
    (`export { rectsOverlap, spansOverlap } from '@dobra/core/collisions';`);
  - in `measure`, build `subjects: CollisionSubject[]` with `id` = the element's index in
    `elements`, keep a `byId` array of the elements, call
    `findCollisions(subjects, collisionZones(env))`, and for each hit set `data-collision` and push
    `{ region: hit.zone, element: describeElement(byId[Number(hit.id)]) }`.
  The DOM parts (selectors, ignored containers, outermost-only rule, `textRect`, scheduling,
  cleanup) stay exactly as they are.

- [ ] **Step 6: Run everything and check the behaviour**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. Then `npm run dev`, open the URL in the built-in browser, pick
`galaxy-z-fold-7` inner in book posture with the Fold overlay on, and confirm the Inspector lists
the same collisions as on `origin/chore/remove-brand` for the Home screen (compare against a
second dev server started from a checkout of that branch, or against a note taken before Step 5).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/collisions.ts packages/core/src/collisions.test.ts
git commit -m "Add pure collision geometry to @dobra/core"
git add apps/simulator/src/sample/collisions.ts
git commit -m "Make the collision hook a DOM adapter over @dobra/core"
```

### Task 4: Issue, push and PR

- [ ] **Step 1: Issue**

```bash
gh issue create -R jacksonmafra-umain/Dobra \
  --title "Extract @dobra/core into an npm workspace" --label enhancement --label area:core \
  --body "Slice 1 of docs/superpowers/specs/2026-09-25-foldable-artboards-design.md (section 12). Workspaces; the app moves to apps/simulator; engine and config move to packages/core with re-exports at the old paths; collision geometry becomes pure core. Old-path re-exports are removed in a follow-up once the Android branch has rebased."
```
Record the number as `$ISSUE`.

- [ ] **Step 2: Push** — `git push -u origin refactor/extract-core`
- [ ] **Step 3: PR** targeting `chore/remove-brand`, labels `enhancement,area:core`, body starting
  `Closes #$ISSUE`, with a Summary (the three moves), a note that old-path re-exports stay until
  the Android branch rebases, and a Test plan (test counts, typecheck, both builds, collision
  parity check). No assistant mention.
- [ ] **Step 4:** Tell agent/01 the branch name and that the shims stay until it confirms its
  rebase.
- [ ] **Step 5:** Re-verify the single-file build on the pushed head:
  `npm run build:single && ls apps/simulator/dist-single` → one `index.html`.

### Task 5 (held): Remove the old-path shims

Start only after agent/01 confirms it has rebased onto slice 1, on a new branch
`refactor/drop-core-shims` from the merged slice 1 head.

**Files:** Delete `apps/simulator/src/engine/*.ts`, `apps/simulator/src/config/*.ts`; modify every
app file that imports them; modify `apps/simulator/src/core.test.ts`.

- [ ] **Step 1: Write the failing test** — replace the shim test in `core.test.ts` with:

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

it('has no old-path re-exports left in the app', () => {
  for (const dir of ['engine', 'config']) {
    expect(existsSync(fileURLToPath(new URL(`./${dir}`, import.meta.url)))).toBe(false);
  }
});
```
and delete the `viaShim` import and its test. Run `npm test -w @dobra/simulator -- src/core.test.ts`
→ FAIL.

- [ ] **Step 2: Rewrite imports**

```bash
cd apps/simulator/src
grep -rlE "from '(\.\./)+(engine|config)/" . | xargs perl -pi -e "s#from '(?:\.\./)+(engine|config)/([\w.]+)'#from '\@dobra/core/\$1/\$2'#g"
grep -rlE "from '\./(engine|config)/" . | xargs perl -pi -e "s#from '\./(engine|config)/([\w.]+)'#from '\@dobra/core/\$1/\$2'#g"
cd - && git rm -rq apps/simulator/src/engine apps/simulator/src/config
```
Check: `grep -rnE "from '(\.\.?/)+(engine|config)/" apps/simulator/src` → no output.

- [ ] **Step 3:** `npm test && npm run typecheck && npm run build && npm run build:single` → PASS.
- [ ] **Step 4: Commit** — `git commit -am "Import @dobra/core directly and drop the old-path re-exports"`
- [ ] **Step 5:** Issue ("Drop the old-path re-exports of @dobra/core", `enhancement,area:core`),
  push, PR targeting the branch slice 1 merged into, `Closes #N`.
