# Android Adaptive Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Android window states and add scenes, Grid/FlexBox layout forms and checks that emit Dobra findings, without changing how existing rules resolve.

**Architecture:** Every new capability is a pure engine module in `src/engine` (window placement, typography, scenes, grid/flex resolution, checks) with table tests, wired into `resolveEnvironment` / `resolveLayout`, then rendered by the sample app. The config schema grows only optional fields; existing rules keep their `perRow` form.

**Tech Stack:** TypeScript 7, React 19, Vite 8, zod 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-25-android-adaptive-model-design.md`

## Global Constraints

- One engine, two platform profiles; nothing that varies per device, platform or breakpoint is hardcoded in a component.
- Every new number in the config has a `source` key that exists in `sources`; guesses carry `estimated: true`.
- Android layout values are in dp, type in sp; iOS in pt. UI labels use `env.unit` / `env.typeUnit`, never a literal "pt".
- Existing layout rules resolve exactly as before (all current tests keep passing unchanged).
- No brand strings anywhere: the repo is de-branded, and the brand scan from the de-branding slice must stay empty.
- Findings use the Dobra shape: `{ ruleId, severity: 'error' | 'warn' | 'info', target, nodeId, rect, message, source, estimated }`.
- Dobra rule ids only: `landscape-not-wide`, `min-legible-width`, `pane-split`, `tabletop-controls`, `touch-target`, `chrome-overlap`, `hinge-content`.
- New devices, cover-screen `policy`/`continuity` and media-fact schema fields are added by Dobra's Catalog slice, not here (Task 11 waits for it).
- Microcommits in English, no assistant attribution, one focused change per commit, every commit builds (`npx tsc -b`) and passes `npx vitest run`.
- Stage files by name. Never `git add -A`: the untracked legacy export `*-simulator-v0.4.0-*.html` and `CLAUDE.md` must not be committed.
- Dobra slice 1 moves `src/engine` and `src/config` to `packages/core/src`. If it has landed when you start a task, rebase first and use the new paths; imports keep working through its shims.

## Review Focus

1. **Window insets on a split window** — a window in the bottom half of a portrait split must lose the status-bar and cutout insets and keep the navigation bar; a test in Task 1 pins it.
2. **Flip cover (rotation locked) with a portrait-only app** — the request must not rotate a display that cannot rotate; a test in Task 2 pins it.
3. **Font scale exactly on a table key and above the max** — 1.3 must return the 1.3 table verbatim and 2.5 must clamp to the 2.0 table; tests in Task 4 pin both.
4. **Adaptive grid track wider than the container** — `min` larger than the available width must still yield one column no wider than the container; a test in Task 7 pins it.
5. **List-detail on a tri-fold with two separating hinges** — three regions must yield list, detail and one `spare` pane, not drop a region; a test in Task 5 pins it.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/engine/window.ts` (create) | Place a window inside a display for a window mode; clip display insets to the window; IME overlap; translate folds into window coordinates |
| `packages/core/src/engine/window.test.ts` (create) | Table tests for window placement and clipping |
| `packages/core/src/engine/android.ts` (modify) | Use window placement, display-size factor, rotation lock, portrait-only requests, IME |
| `packages/core/src/engine/ios.ts` (modify) | Fill `display`, `window`, IME from the display keyboard |
| `packages/core/src/engine/environment.ts` (modify) | New `Selection` fields, `Environment.display/window/ime/notes` |
| `packages/core/src/engine/typography.ts` (create) | sp/pt → px with Android's non-linear font scaling; CSS variables per type style |
| `packages/core/src/engine/scenes.ts` (create) | Scene resolution: single, list-detail, two-pane, supporting-pane, hinge splits, fallback |
| `packages/core/src/engine/gridFlex.ts` (create) | Grid track and FlexBox resolution to item widths |
| `packages/core/src/engine/checks.ts` (create) | Layout checks emitting Dobra findings |
| `packages/core/src/engine/fixtures/observed.ts` (create) | Config variants that reproduce observed failures #1, #2, #5 |
| `packages/core/src/engine/layout.ts` (modify) | Scene and grid/flex integration; `Layout.scene`, `Layout.resolved` |
| `packages/core/src/config/schema.ts` (modify) | Optional `scenes`, screen `scene`, rule `scene`, grid/flex component forms, registry `forms` and `items` |
| `packages/core/src/config/simulator.config.json` (modify) | Scenes block, sample screen scene declarations, one grid and one flex rule entry |
| `src/ui/DeviceFrame.tsx` (modify) | Render the display, then the window inside it; split placeholder, caption bar, freeform resize handles |
| `src/ui/App.tsx` (modify) | Window, display-size, app-request, keyboard and text controls |
| `src/ui/urlState.ts` (modify) | New URL parameters |
| `src/ui/Inspector.tsx` (modify) | Window, scene and findings panels |
| `src/sample/Screen.tsx` (modify) | Type-scale variables, keyboard overlay, scene panes |
| `src/sample/components.tsx` (modify) | `RuleGrid` renders grid and flex forms |
| `src/sample/screens/LocationsScreen.tsx` (create) | List-detail sample screen |
| `src/sample/screens/ProductsScreen.tsx` (create) | Grid sample screen |
| `src/styles/sample-app.css` (modify) | Type styles read CSS variables; keyboard, caption bar, split placeholder, panes |

---

### Task 1: Window placement engine

**Files:**
- Create: `packages/core/src/engine/window.ts`
- Test: `packages/core/src/engine/window.test.ts`

**Interfaces:**
- Consumes: `AndroidProfile['windowModes']` from `packages/core/src/config/types.ts`; `InsetPart`, `Insets` from `packages/core/src/engine/environment.ts`; `FoldFeature` from `packages/core/src/engine/folds.ts`; `Rect`, `Size` from `packages/core/src/config/types.ts`.
- Produces:
  - `type WindowMode = 'fullscreen' | 'split' | 'freeform' | 'popup' | 'pip'`
  - `interface WindowRequest { mode: WindowMode; splitRatio?: number; splitSide?: 'primary' | 'secondary'; size?: Size }`
  - `interface WindowPlacement { mode: WindowMode; rect: Rect; floating: boolean; captionBar: number; other: Rect | null; divider: Rect | null }`
  - `placeWindow(modes, display: Size, bottomReserved: number, req: WindowRequest): WindowPlacement`
  - `clipParts(parts: InsetPart[], display: Size, rect: Rect): InsetPart[]`
  - `imeOverlap(display: Size, rect: Rect, imeHeight: number): number`
  - `translateFold(fold: FoldFeature, rect: Rect): FoldFeature | null`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/engine/window.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import type { InsetPart } from './environment';
import type { FoldFeature } from './folds';
import { clipParts, imeOverlap, placeWindow, translateFold } from './window';

const modes = parseConfig(raw).platforms.android.windowModes;
const phone = { width: 411, height: 923 };
const tablet = { width: 1280, height: 800 };

const parts: InsetPart[] = [
  { kind: 'statusBar', insets: { top: 24, right: 0, bottom: 0, left: 0 }, source: 'estimated' },
  { kind: 'displayCutout', insets: { top: 48, right: 0, bottom: 0, left: 0 }, source: 'estimated' },
  { kind: 'navigationBar', insets: { top: 0, right: 0, bottom: 24, left: 0 }, source: 'estimated' },
];

describe('placeWindow', () => {
  it('fills the display in full screen', () => {
    expect(placeWindow(modes, phone, 0, { mode: 'fullscreen' }).rect).toEqual({ x: 0, y: 0, width: 411, height: 923 });
  });

  it('stacks a portrait split and gives the primary window the top part', () => {
    const w = placeWindow(modes, phone, 0, { mode: 'split', splitRatio: 0.5, splitSide: 'primary' });
    expect(w.rect).toEqual({ x: 0, y: 0, width: 411, height: 457.5 });
    expect(w.divider).toEqual({ x: 0, y: 457.5, width: 411, height: 8 });
    expect(w.other).toEqual({ x: 0, y: 465.5, width: 411, height: 457.5 });
  });

  it('splits a landscape display side by side', () => {
    const w = placeWindow(modes, tablet, 0, { mode: 'split', splitRatio: 0.333, splitSide: 'secondary' });
    expect(w.rect.y).toBe(0);
    expect(w.rect.height).toBe(800);
    expect(Math.round(w.rect.x + w.rect.width)).toBe(1280);
  });

  it('centres a freeform window above the taskbar and adds a caption bar', () => {
    const w = placeWindow(modes, tablet, 48, { mode: 'freeform', size: { width: 700, height: 500 } });
    expect(w.rect).toEqual({ x: 290, y: 126, width: 700, height: 500 });
    expect(w.floating).toBe(true);
    expect(w.captionBar).toBe(modes.freeform.captionBar);
  });

  it('clamps a freeform window to the minimum and to the display', () => {
    expect(placeWindow(modes, tablet, 48, { mode: 'freeform', size: { width: 10, height: 10 } }).rect.width).toBe(modes.freeform.minSize.width);
    expect(placeWindow(modes, tablet, 48, { mode: 'freeform', size: { width: 5000, height: 5000 } }).rect).toMatchObject({ width: 1280, height: 752 });
  });

  it('puts picture-in-picture in the bottom-right corner at 16:9', () => {
    const w = placeWindow(modes, phone, 24, { mode: 'pip' });
    expect(w.rect.width).toBe(modes.pip.width);
    expect(w.rect.height).toBe(135);
    expect(w.rect.x + w.rect.width).toBe(411 - modes.pip.margin);
    expect(w.rect.y + w.rect.height).toBe(923 - 24 - modes.pip.margin);
    expect(w.captionBar).toBe(0);
  });
});

describe('clipParts', () => {
  it('drops top insets for the bottom window of a split and keeps the navigation bar', () => {
    const rect = { x: 0, y: 465.5, width: 411, height: 457.5 };
    const kinds = clipParts(parts, phone, rect).map((p) => p.kind);
    expect(kinds).toEqual(['navigationBar']);
  });

  it('keeps every inset for a full-screen window', () => {
    expect(clipParts(parts, phone, { x: 0, y: 0, width: 411, height: 923 })).toHaveLength(3);
  });
});

describe('imeOverlap', () => {
  it('is the part of the window the keyboard covers', () => {
    expect(imeOverlap(phone, { x: 0, y: 0, width: 411, height: 923 }, 290)).toBe(290);
    expect(imeOverlap(phone, { x: 0, y: 0, width: 411, height: 457.5 }, 290)).toBe(0);
  });
});

describe('translateFold', () => {
  const fold: FoldFeature = {
    axis: 'vertical',
    rect: { x: 425.5, y: 0, width: 0, height: 883 },
    separating: true,
    occludes: false,
    estimated: true,
  };
  it('moves a fold into window coordinates', () => {
    expect(translateFold(fold, { x: 100, y: 50, width: 700, height: 600 })?.rect).toEqual({ x: 325.5, y: 0, width: 0, height: 600 });
  });
  it('drops a fold outside the window', () => {
    expect(translateFold(fold, { x: 0, y: 0, width: 420, height: 883 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/window.test.ts`
Expected: FAIL with "Failed to resolve import './window'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/engine/window.ts
// Android window states that are not postures: split-screen, desktop windowing, pop-up view and
// picture-in-picture. Each places a window inside the display; the app only gets the insets of the
// display edges its window touches.
import type { AndroidProfile, Rect, Size } from '../config/types';
import type { InsetPart } from './environment';
import type { FoldFeature } from './folds';

export type WindowMode = 'fullscreen' | 'split' | 'freeform' | 'popup' | 'pip';

export interface WindowRequest {
  mode: WindowMode;
  splitRatio?: number;
  splitSide?: 'primary' | 'secondary';
  /** Freeform window size, dp. */
  size?: Size;
}

export interface WindowPlacement {
  mode: WindowMode;
  /** Window rectangle in display coordinates. */
  rect: Rect;
  /** Drawn above other windows instead of tiling the display. */
  floating: boolean;
  /** WindowInsets.Type.captionBar() height, 0 when the mode has none. */
  captionBar: number;
  /** The other app of a split, for the placeholder. */
  other: Rect | null;
  divider: Rect | null;
}

type Modes = AndroidProfile['windowModes'];

export function placeWindow(modes: Modes, display: Size, bottomReserved: number, req: WindowRequest): WindowPlacement {
  const { width: W, height: H } = display;
  const full: Rect = { x: 0, y: 0, width: W, height: H };
  const base = { mode: req.mode, floating: false, captionBar: 0, other: null, divider: null };
  switch (req.mode) {
    case 'fullscreen':
      return { ...base, rect: full };
    case 'split': {
      const ratio = req.splitRatio ?? modes.split.ratios[0];
      const d = modes.split.divider;
      const sideBySide = W >= H;
      const length = (sideBySide ? W : H) - d;
      const first = length * ratio;
      const firstRect: Rect = sideBySide ? { x: 0, y: 0, width: first, height: H } : { x: 0, y: 0, width: W, height: first };
      const divider: Rect = sideBySide ? { x: first, y: 0, width: d, height: H } : { x: 0, y: first, width: W, height: d };
      const secondRect: Rect = sideBySide
        ? { x: first + d, y: 0, width: length - first, height: H }
        : { x: 0, y: first + d, width: W, height: length - first };
      const primary = (req.splitSide ?? 'primary') === 'primary';
      return { ...base, rect: primary ? firstRect : secondRect, other: primary ? secondRect : firstRect, divider };
    }
    case 'freeform': {
      const f = modes.freeform;
      const want = req.size ?? f.defaultSize;
      const width = clamp(want.width, f.minSize.width, W);
      const height = clamp(want.height, f.minSize.height, H - bottomReserved);
      return {
        ...base,
        floating: true,
        captionBar: f.captionBar,
        rect: { x: (W - width) / 2, y: Math.max(0, (H - bottomReserved - height) / 2), width, height },
      };
    }
    case 'popup': {
      const p = modes.popup;
      const width = Math.round(W * p.scale);
      const height = Math.round(H * p.scale);
      return { ...base, floating: true, captionBar: p.captionBar, rect: { x: (W - width) / 2, y: (H - height) / 2, width, height } };
    }
    case 'pip': {
      const p = modes.pip;
      const width = p.width;
      const height = Math.round((width * p.aspect[1]) / p.aspect[0]);
      return {
        ...base,
        floating: true,
        rect: { x: W - width - p.margin, y: H - bottomReserved - height - p.margin, width, height },
      };
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const EPS = 0.5;

/** Keeps each inset only on the display edges the window touches. */
export function clipParts(parts: InsetPart[], display: Size, rect: Rect): InsetPart[] {
  const touches = {
    top: rect.y <= EPS,
    left: rect.x <= EPS,
    right: rect.x + rect.width >= display.width - EPS,
    bottom: rect.y + rect.height >= display.height - EPS,
  };
  return parts
    .map((p) => ({
      ...p,
      insets: {
        top: touches.top ? p.insets.top : 0,
        right: touches.right ? p.insets.right : 0,
        bottom: touches.bottom ? p.insets.bottom : 0,
        left: touches.left ? p.insets.left : 0,
      },
    }))
    .filter((p) => p.insets.top || p.insets.right || p.insets.bottom || p.insets.left);
}

/** How much of the window the keyboard covers from the display bottom. */
export function imeOverlap(display: Size, rect: Rect, imeHeight: number): number {
  const keyboardTop = display.height - imeHeight;
  return Math.max(0, rect.y + rect.height - keyboardTop);
}

/** A display-coordinate fold in window coordinates, or null when it misses the window. */
export function translateFold(fold: FoldFeature, rect: Rect): FoldFeature | null {
  const r = fold.rect;
  const x0 = Math.max(r.x, rect.x);
  const y0 = Math.max(r.y, rect.y);
  const x1 = Math.min(r.x + r.width, rect.x + rect.width);
  const y1 = Math.min(r.y + r.height, rect.y + rect.height);
  // A zero-width crease still counts when it lies strictly inside the window.
  const inside = fold.axis === 'vertical' ? r.x > rect.x && r.x < rect.x + rect.width : r.y > rect.y && r.y < rect.y + rect.height;
  if (!inside || x1 < x0 || y1 < y0) return null;
  return { ...fold, rect: { x: x0 - rect.x, y: y0 - rect.y, width: x1 - x0, height: y1 - y0 } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/engine/window.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/window.ts packages/core/src/engine/window.test.ts
git commit -m "Place Android windows for split-screen, desktop windowing, pop-up view and picture-in-picture"
```

---

### Task 2: Android environment uses windows, display size, rotation lock, portrait-only requests and the IME

**Files:**
- Modify: `packages/core/src/engine/environment.ts` (Selection, Environment, freeEnvironment)
- Modify: `packages/core/src/engine/android.ts` (resolveAndroidDevice)
- Modify: `packages/core/src/engine/ios.ts` (return value)
- Test: `packages/core/src/engine/windowStates.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `placeWindow`, `clipParts`, `imeOverlap`, `translateFold`, `WindowMode`, `WindowPlacement`.
- Produces on `Selection` (all optional): `windowMode?: WindowMode`, `splitRatio?: number`, `splitSide?: 'primary' | 'secondary'`, `windowSize?: Size`, `displayScale?: string`, `rotationLock?: boolean`, `ime?: boolean`, `appPortrait?: boolean`, `targetSdk?: number`.
- Produces on `Environment`: `display: Size`, `window: WindowPlacement`, `ime: number`, `notes: EnvNote[]`, and `interface EnvNote { id: string; text: string; source: string }`.
- `AndroidDetails.cutout` and `navigationBar` stay in **display** coordinates (the system draws them on the display); `safeArea`, `folds` and `regions` are in **window** coordinates.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/engine/windowStates.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment, type Selection } from './environment';

const config = parseConfig(raw);
const sel = (deviceId: string, extra: Partial<Selection> = {}): Selection => ({
  deviceId,
  displayId: '',
  orientation: 'portrait',
  free: null,
  ...extra,
});

describe('Android window states', () => {
  it('sizes the window, not the display, in split-screen', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { windowMode: 'split', splitRatio: 0.5 }));
    expect(env.display).toEqual({ width: 411, height: 923 });
    expect(env.height).toBe(457.5);
    expect(env.sizeClass).toEqual({ system: 'window', width: 'compact', height: 'compact' });
    expect(env.safeArea.bottom).toBe(0);
    expect(env.safeArea.top).toBe(48);
  });

  it('gives a freeform window a caption bar inset and no system bar insets', () => {
    const env = resolveEnvironment(config, sel('pixel-tablet', { windowMode: 'freeform', windowSize: { width: 700, height: 500 } }));
    expect(env).toMatchObject({ width: 700, height: 500 });
    expect(env.android?.parts.map((p) => p.kind)).toEqual(['captionBar']);
    expect(env.safeArea.top).toBe(config.platforms.android.windowModes.freeform.captionBar);
  });

  it('falls back to full screen for a mode the device does not offer', () => {
    const env = resolveEnvironment(config, sel('galaxy-z-flip-7', { pose: 'closed', windowMode: 'split' }));
    expect(env.window.mode).toBe('fullscreen');
    expect(env.notes.map((n) => n.id)).toContain('window-mode-unavailable');
  });

  it('shrinks dp when the user picks a larger display size', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { displayScale: 'larger' }));
    expect(env.width).toBe(Math.round(411 / 1.3));
    expect(env.android?.density).toBeCloseTo(2.625 * 1.3);
  });

  it('keeps a phone in its natural orientation when rotation is locked', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { rotation: 90, rotationLock: true }));
    expect(env.orientation).toBe('portrait');
    expect(env.notes.map((n) => n.id)).toContain('rotation-locked');
  });

  it('keeps a portrait-only app in portrait on a phone', () => {
    const env = resolveEnvironment(config, sel('pixel-9', { rotation: 90, appPortrait: true, targetSdk: 35 }));
    expect(env.orientation).toBe('portrait');
  });

  it('letterboxes a portrait-only app on a large screen below targetSdk 36', () => {
    const env = resolveEnvironment(config, sel('pixel-tablet', { appPortrait: true, targetSdk: 35 }));
    expect(env.display).toEqual({ width: 1280, height: 800 });
    expect(env.width).toBe(500);
    expect(env.notes.map((n) => n.id)).toContain('letterboxed');
  });

  it('ignores the orientation request on a large screen at targetSdk 36', () => {
    const env = resolveEnvironment(config, sel('pixel-tablet', { appPortrait: true, targetSdk: 36 }));
    expect(env.width).toBe(1280);
    expect(env.notes.map((n) => n.id)).toContain('target-sdk-36');
  });

  it('does not rotate a display that cannot rotate for a portrait-only app', () => {
    const env = resolveEnvironment(config, sel('galaxy-z-flip-7', { pose: 'closed', appPortrait: true, targetSdk: 35 }));
    expect(env).toMatchObject({ width: 352, height: 339 });
  });

  it('adds an IME inset without changing the window size class', () => {
    const plain = resolveEnvironment(config, sel('pixel-9'));
    const typing = resolveEnvironment(config, sel('pixel-9', { ime: true }));
    expect(typing.ime).toBe(290);
    expect(typing.safeArea.bottom).toBe(290);
    expect(typing.sizeClass).toEqual(plain.sizeClass);
  });

  it('moves folds into the window in split-screen', () => {
    const env = resolveEnvironment(config, sel('pixel-9-pro-fold', { pose: 'book', windowMode: 'split', splitRatio: 0.5 }));
    expect(env.folds).toHaveLength(0);
    expect(env.regions).toHaveLength(1);
  });
});

describe('iOS window fields', () => {
  it('fills display and window and uses the display keyboard', () => {
    const env = resolveEnvironment(config, sel('iphone-17', { displayId: 'main', ime: true }));
    expect(env.display).toEqual({ width: 402, height: 874 });
    expect(env.window.mode).toBe('fullscreen');
    expect(env.ime).toBe(336);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/windowStates.test.ts`
Expected: FAIL (`env.display` is undefined, TypeScript errors on the new Selection fields)

- [ ] **Step 3: Extend the environment types**

In `packages/core/src/engine/environment.ts`:

```ts
// add to imports
import type { WindowMode, WindowPlacement } from './window';

// add inside `interface Selection`, after `navMode?: NavMode;`
  /** Android window state. Defaults to the device's first window mode. */
  windowMode?: WindowMode;
  splitRatio?: number;
  splitSide?: 'primary' | 'secondary';
  /** Freeform window size, dp. */
  windowSize?: Size;
  /** Settings › Display size step id. */
  displayScale?: string;
  /** System rotation lock: the display stays in its natural orientation. */
  rotationLock?: boolean;
  /** Software keyboard shown. */
  ime?: boolean;
  /** The app requests portrait (screenOrientation="portrait"). Defaults to the app manifest in the config. */
  appPortrait?: boolean;
  targetSdk?: number;

// add after `export type NavMode ...`
/** Why the window is not what the controls would suggest. */
export interface EnvNote {
  id: string;
  text: string;
  source: string;
}

// add inside `interface Environment`, after `height: number;`
  /** Display area the window sits on. Equal to the window outside Android window modes. */
  display: Size;
  window: WindowPlacement;
  /** Keyboard inset at the window bottom, 0 when hidden. */
  ime: number;
  notes: EnvNote[];
```

In `freeEnvironment`, add to the returned object after `height: size.height,`:

```ts
    display: { ...size },
    window: { mode: 'fullscreen', rect: { x: 0, y: 0, ...size }, floating: false, captionBar: 0, other: null, divider: null },
    ime: 0,
    notes: [],
```

- [ ] **Step 4: Fill the iOS fields**

In `packages/core/src/engine/ios.ts`, before `return {` in `resolveIosDevice` add:

```ts
  const keyboard = display.keyboard;
  const ime = sel.ime && keyboard ? keyboard[orientation] : 0;
  const safeArea = ime ? { ...spec2.safeArea, bottom: Math.max(spec2.safeArea.bottom, ime) } : spec2.safeArea;
```

and in the returned object replace `safeArea: spec2.safeArea,` with `safeArea,` and add after `height,`:

```ts
    display: { width, height },
    window: { mode: 'fullscreen', rect: { x: 0, y: 0, width, height }, floating: false, captionBar: 0, other: null, divider: null },
    ime,
    notes: [],
```

- [ ] **Step 5: Rewrite the Android resolver around the window**

Replace the body of `resolveAndroidDevice` in `packages/core/src/engine/android.ts` with:

```ts
export function resolveAndroidDevice(config: SimulatorConfig, spec: DeviceSpec, sel: Selection): Environment {
  const device = spec as AndroidDeviceSpec;
  const profile = config.platforms.android;
  const app = config.app.android;
  const notes: EnvNote[] = [];
  const postures = device.postures ?? [];
  const posture = postures.length
    ? (postures.find((p) => p.id === sel.pose) ?? postures.find((p) => p.display === sel.displayId) ?? postures[0])
    : null;
  const [, display] = findAndroidDisplay(device, posture?.display ?? sel.displayId);

  // Settings › Display size scales the density: the same panel reports fewer dp.
  const step = profile.displaySize.steps.find((s) => s.id === sel.displayScale) ?? profile.displaySize.steps.find((s) => s.factor === 1)!;
  const factor = step.factor;
  const natural = { width: Math.round(display.size.width / factor), height: Math.round(display.size.height / factor) };
  const density = display.density * factor;

  const canRotate = display.rotation.supported && posture?.rotation === undefined;
  let rotation: 0 | 90 = !display.rotation.supported ? 0 : (posture?.rotation ?? sel.rotation ?? 0);
  if (canRotate && sel.rotationLock && rotation !== 0) {
    rotation = 0;
    notes.push({ id: 'rotation-locked', text: 'Rotation lock is on: the display stays in its natural orientation and a rotate button appears in the navigation bar.', source: 'android-docs' });
  }

  // screenOrientation="portrait": honoured on small screens, letterboxed on large ones before targetSdk 36.
  const appPortrait = sel.appPortrait ?? app.screenOrientation === 'portrait';
  const targetSdk = sel.targetSdk ?? app.targetSdk;
  const sizeAt = (r: 0 | 90) => (r === 90 ? { width: natural.height, height: natural.width } : { ...natural });
  let letterbox = false;
  if (appPortrait) {
    const d = sizeAt(rotation);
    const smallest = Math.min(d.width, d.height);
    if (d.width > d.height) {
      if (smallest >= 600 && targetSdk >= 36) {
        notes.push({ id: 'target-sdk-36', text: profile.notes.find((n) => n.id === 'target-sdk-36')?.text ?? 'targetSdk 36 ignores the orientation request.', source: 'android-docs' });
      } else if (smallest < 600 && canRotate) {
        rotation = rotation === 90 ? 0 : 90;
        notes.push({ id: 'portrait-request', text: 'The app requests portrait, so the system keeps the display in portrait for it.', source: 'android-docs' });
      } else if (smallest >= 600) {
        letterbox = true;
        notes.push({ id: 'letterboxed', text: `The app requests portrait below targetSdk 36, so it is letterboxed in a portrait window.`, source: 'estimated' });
      }
    }
  }

  const navMode = sel.navMode ?? 'gesture';
  const { width: W, height: H } = sizeAt(rotation);
  const displaySize = { width: W, height: H };
  const place = (naturalEdge: Edge): Edge => (rotation === 90 ? ROTATED_EDGE[naturalEdge] : naturalEdge);
  const ins = display.insets;
  const source = ins.source;

  const displayParts: InsetPart[] = [];
  if (ins.statusBar) displayParts.push({ kind: 'statusBar', insets: edgeInsets('top', ins.statusBar), source });
  let cutout: Rect | null = null;
  if (ins.cutout) {
    const edge = place(ins.cutout.edge);
    displayParts.push({ kind: 'displayCutout', insets: edgeInsets(edge, ins.cutout.size), source });
    if (ins.cutout.hole) cutout = holeRect(ins.cutout.hole, ins.cutout.size, edge, W, H);
  }
  if (ins.waterfall) {
    const w = ins.waterfall;
    displayParts.push({ kind: 'waterfall', insets: { ...NO_INSETS, [place('left')]: w, [place('right')]: w }, source });
  }
  const nav = ins.navigationBar;
  const navigationBar: AndroidDetails['navigationBar'] =
    navMode === 'gesture'
      ? { edge: 'bottom', size: nav.gesture }
      : { edge: rotation === 90 && nav.threeButtonLandscape === 'side' ? 'right' : 'bottom', size: nav.threeButton };
  if (navigationBar.size) displayParts.push({ kind: 'navigationBar', insets: edgeInsets(navigationBar.edge, navigationBar.size), source });

  // Window state. Cover screens and devices without the mode fall back to full screen.
  const offered = display.coverScreen ? ['fullscreen'] : device.windowModes;
  let mode = sel.windowMode ?? device.windowModes[0];
  if (!offered.includes(mode)) {
    notes.push({ id: 'window-mode-unavailable', text: `${device.name} does not offer ${mode} here; showing full screen.`, source: device.source });
    mode = 'fullscreen';
  }
  const bottomReserved = navigationBar.edge === 'bottom' ? navigationBar.size : 0;
  let placement = placeWindow(profile.windowModes, displaySize, bottomReserved, {
    mode,
    splitRatio: sel.splitRatio,
    splitSide: sel.splitSide,
    size: sel.windowSize,
  });
  if (letterbox && mode === 'fullscreen') {
    const width = Math.round((H * H) / W);
    placement = { ...placement, rect: { x: (W - width) / 2, y: 0, width, height: H } };
  }
  const rect = placement.rect;

  const parts: InsetPart[] = placement.floating ? [] : clipParts(displayParts, displaySize, rect);
  if (placement.captionBar) parts.push({ kind: 'captionBar', insets: edgeInsets('top', placement.captionBar), source: profile.windowModes.freeform.source });
  const imeHeight = sel.ime && mode !== 'pip' ? ins.ime[W > H ? 'landscape' : 'portrait'] : 0;
  const ime = imeOverlap(displaySize, rect, imeHeight);
  if (ime) parts.push({ kind: 'ime', insets: edgeInsets('bottom', ime), source });

  const union = unionInsets(parts);
  const width = rect.width;
  const height = rect.height;
  const folds = (posture?.features ?? [])
    .map((f) => foldFeature(display.hinges!.find((x) => x.id === f.hinge)!, f.state, natural, rotation))
    .map((f) => translateFold(f, rect))
    .filter((f): f is NonNullable<typeof f> => !!f);

  return {
    platform: 'android',
    unit: profile.unit,
    typeUnit: profile.typeUnit,
    deviceName: device.name,
    displayLabel: display.label,
    isFree: false,
    width,
    height,
    display: displaySize,
    window: placement,
    ime,
    notes,
    orientation: width > height ? 'landscape' : 'portrait',
    sizeClass: windowSizeClass(profile, width, height),
    barAxis: null,
    safeArea: { ...union, source },
    statusBar: ins.statusBar > 0,
    homeIndicator: false,
    cornerRadius: display.cornerRadius,
    dynamicIsland: null,
    cameraRegion: 0,
    estimated: display.estimated || !!ins.estimated,
    supportedOrientations: ['portrait', 'landscape'],
    pose: posture,
    poses: postures,
    folds,
    regions: splitRegions(width, height, folds),
    reservedRegions: [],
    cameraActive: false,
    liveActivity: false,
    android: {
      density,
      rotation,
      navMode,
      parts,
      statusBarHeight: Math.max(ins.statusBar, unionInsets(displayParts).top),
      cutout,
      navigationBar,
      coverScreen: display.coverScreen ?? null,
      rotationLocked: !canRotate,
    },
  };
}
```

Update the imports at the top of `packages/core/src/engine/android.ts`:

```ts
import type { AndroidDetails, EnvNote, Environment, InsetPart, Insets, Selection } from './environment';
import { splitRegions, type FoldFeature } from './folds';
import { windowSizeClass } from './sizeClass';
import { clipParts, imeOverlap, placeWindow, translateFold } from './window';
```

- [ ] **Step 6: Run all tests**

Run: `npx tsc -b && npx vitest run`
Expected: PASS, including every test in `android.test.ts`, `postures.test.ts` and `platform.test.ts` unchanged. If `platform.test.ts` or the UI fail to compile because `Environment` gained fields, add the four fields to any other object literal typed `Environment` the compiler names.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine/environment.ts packages/core/src/engine/android.ts packages/core/src/engine/ios.ts packages/core/src/engine/windowStates.test.ts
git commit -m "Resolve Android windows inside the display: window modes, display size, rotation lock, portrait requests and the IME"
```

---

### Task 3: Render the display and the window, with the new controls and URL state

**Files:**
- Modify: `src/ui/DeviceFrame.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/urlState.ts`
- Modify: `src/ui/Inspector.tsx`
- Modify: `src/sample/Screen.tsx`
- Modify: `src/styles/sample-app.css`, `src/styles/app.css`
- Test: `src/ui/urlState.test.ts` (create)

**Interfaces:**
- Consumes: Task 2 `Environment.display`, `window`, `ime`, `notes`; `Selection` fields.
- Produces: URL keys `win` (`split|freeform|popup|pip`), `ratio`, `side` (`2` for secondary), `ws` (`WxH`), `dsize`, `rlock`, `kb`, `portrait`, `sdk`.

- [ ] **Step 1: Write the failing URL round-trip test**

```ts
// src/ui/urlState.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment } from '../engine/environment';
import { readUrlState, writeUrlState } from './urlState';

const config = parseConfig(raw);

describe('URL state', () => {
  it('round-trips the window state fields', () => {
    const search =
      '?device=pixel-tablet&display=main&rot=0&win=freeform&ws=700x500&dsize=large&rlock=1&kb=1&portrait=1&sdk=35&screen=home&theme=light&zoom=fit&ov=safe';
    const state = readUrlState(search);
    expect(state.selection).toMatchObject({
      windowMode: 'freeform',
      windowSize: { width: 700, height: 500 },
      displayScale: 'large',
      rotationLock: true,
      ime: true,
      appPortrait: true,
      targetSdk: 35,
    });
    const env = resolveEnvironment(config, state.selection);
    const again = readUrlState(writeUrlState(state, env));
    expect(again.selection).toMatchObject(state.selection);
  });

  it('writes split ratio and side', () => {
    const state = readUrlState('?device=pixel-9&win=split&ratio=0.333&side=2&screen=home');
    expect(state.selection).toMatchObject({ windowMode: 'split', splitRatio: 0.333, splitSide: 'secondary' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/urlState.test.ts`
Expected: FAIL (`windowMode` undefined)

- [ ] **Step 3: Read and write the new URL keys**

In `src/ui/urlState.ts` `readUrlState`, add to `selection` after `navMode`:

```ts
      windowMode: (['split', 'freeform', 'popup', 'pip'] as const).find((m) => m === q.get('win')),
      splitRatio: q.get('ratio') ? Number(q.get('ratio')) : undefined,
      splitSide: q.get('side') === '2' ? 'secondary' : undefined,
      windowSize: (() => {
        const m = q.get('ws')?.match(/^(\d+)x(\d+)$/);
        return m ? { width: +m[1], height: +m[2] } : undefined;
      })(),
      displayScale: q.get('dsize') ?? undefined,
      rotationLock: q.get('rlock') === '1' || undefined,
      ime: q.get('kb') === '1' || undefined,
      appPortrait: q.get('portrait') === '1' || undefined,
      targetSdk: q.get('sdk') ? Number(q.get('sdk')) : undefined,
```

In `writeUrlState`, inside the `if (env.android && !env.isFree)` block add:

```ts
    if (env.window.mode !== 'fullscreen') q.set('win', env.window.mode);
    if (sel.splitRatio !== undefined) q.set('ratio', String(sel.splitRatio));
    if (sel.splitSide === 'secondary') q.set('side', '2');
    if (env.window.mode === 'freeform') q.set('ws', `${Math.round(env.width)}x${Math.round(env.height)}`);
    if (sel.displayScale && sel.displayScale !== 'default') q.set('dsize', sel.displayScale);
    if (sel.rotationLock) q.set('rlock', '1');
    if (sel.appPortrait) q.set('portrait', '1');
    if (sel.targetSdk !== undefined) q.set('sdk', String(sel.targetSdk));
```

and outside it (both platforms) add `if (sel.ime) q.set('kb', '1');`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/urlState.test.ts`
Expected: PASS

- [ ] **Step 5: Render display and window separately**

Replace the screen block in `src/ui/DeviceFrame.tsx` so the bezel wraps the **display** and the app sits in the **window** rect. Change sizing to use `env.display`:

```tsx
  const outerW = env.display.width + BEZEL * 2;
  const outerH = env.display.height + BEZEL * 2;
```

and replace the `device__screen` element with:

```tsx
          <div
            className={`device__screen${env.window.floating ? ' device__screen--desktop' : ''}`}
            style={{ width: env.display.width, height: env.display.height, borderRadius: env.cornerRadius || 4 }}
          >
            {env.window.other && (
              <div className="window-other" style={rectStyle(env.window.other)}>
                Other app
              </div>
            )}
            {env.window.divider && <div className="window-divider" style={rectStyle(env.window.divider)} />}
            <div
              className={`window${env.window.floating ? ' window--floating' : ''}`}
              style={rectStyle(env.window.rect)}
              data-window-mode={env.window.mode}
            >
              {env.window.captionBar > 0 && (
                <div className="caption-bar" style={{ height: env.window.captionBar }} aria-hidden>
                  <span>{env.deviceName}</span>
                  <span className="caption-bar__buttons">— ▢ ✕</span>
                </div>
              )}
              {children}
              {overlay}
            </div>
            {displayChrome}
          </div>
```

Add the prop `displayChrome?: ReactNode` to `DeviceFrameProps`, the helper

```tsx
const rectStyle = (r: { x: number; y: number; width: number; height: number }) => ({
  left: r.x,
  top: r.y,
  width: r.width,
  height: r.height,
});
```

and, when `env.window.mode === 'freeform'` and `onResizeWindow` is passed, render the same three resize handles (`resize-handle--x/y/xy`) inside the `.window` element, calling `onResizeWindow(w, h)` with the dragged size in dp. Change the caption text to `` ` · ${env.width}×${env.height} ${env.unit}${env.window.mode !== 'fullscreen' ? ` window on ${env.display.width}×${env.display.height}` : ''}` ``.

Add to `src/styles/app.css`:

```css
.device__screen--desktop {
  background: linear-gradient(135deg, #3f3f46, #18181b);
}
.window {
  position: absolute;
  overflow: hidden;
}
.window--floating {
  border-radius: 12px;
  box-shadow: 0 12px 40px #00000066;
}
.window-other {
  position: absolute;
  display: grid;
  place-items: center;
  background: repeating-linear-gradient(45deg, #e4e4e7 0 8px, #d4d4d8 8px 16px);
  color: #52525b;
  font: 600 12px/1 ui-monospace, Menlo, monospace;
}
.window-divider {
  position: absolute;
  background: #18181b;
}
.caption-bar {
  position: absolute;
  inset: 0 0 auto;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #27272a;
  color: #fafafa;
  font: 600 12px/1 system-ui, sans-serif;
}
```

- [ ] **Step 6: Draw Android chrome on the display, the keyboard in the window**

In `src/sample/Screen.tsx` remove `<AndroidChrome env={env} />` (keep the iOS `StatusBar`): replace `{env.platform === 'ios' ? <StatusBar env={env} /> : <AndroidChrome env={env} />}` with `{env.platform === 'ios' && <StatusBar env={env} />}` and delete the `AndroidChrome` import. In `src/ui/App.tsx` pass `displayChrome={<AndroidChrome env={env} />}` to `DeviceFrame` (import it from `../sample/androidChrome`). `AndroidChrome` already draws in display coordinates.

Add the keyboard overlay at the end of the `.screen` element in `Screen.tsx`:

```tsx
      {env.ime > 0 && (
        <div className="keyboard" style={{ height: env.ime }} data-name="keyboard" aria-hidden>
          {['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row) => (
            <div className="keyboard__row" key={row}>
              {row.split('').map((k) => (
                <span key={k}>{k}</span>
              ))}
            </div>
          ))}
        </div>
      )}
```

and set the column's bottom so content shrinks above the keyboard: add `bottom: env.ime` to `columnStyle`. Hide the floating bar while typing by rendering `FloatingTabBar` only when `env.ime === 0`.

Add to `src/styles/sample-app.css`:

```css
.keyboard {
  position: absolute;
  inset: auto 0 0;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 8px 4px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--stroke-primary);
}
.keyboard__row {
  display: flex;
  justify-content: center;
  gap: 4px;
}
.keyboard__row span {
  flex: 0 1 34px;
  display: grid;
  place-items: center;
  height: 40px;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--fg-primary);
  font: 400 16px/1 system-ui, sans-serif;
}
```

- [ ] **Step 7: Add the controls**

In `src/ui/App.tsx`, inside the Android-only fragment after "System navigation", add:

```tsx
              <div className="control">
                <span>Window</span>
                <div className="seg">
                  {(['fullscreen', 'split', 'freeform', 'popup', 'pip'] as const).map((m) => (
                    <button
                      aria-pressed={env.window.mode === m}
                      disabled={device.platform !== 'android' || !device.windowModes.includes(m)}
                      onClick={() => setSel((s) => ({ ...s, windowMode: m }))}
                      key={m}
                    >
                      {WINDOW_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              {env.window.mode === 'split' && (
                <div className="control">
                  <span>Split</span>
                  <div className="seg">
                    {config.platforms.android.windowModes.split.ratios.map((r) => (
                      <button aria-pressed={(sel.splitRatio ?? 0.5) === r} onClick={() => setSel((s) => ({ ...s, splitRatio: r }))} key={r}>
                        {Math.round(r * 100)}%
                      </button>
                    ))}
                    <button onClick={() => setSel((s) => ({ ...s, splitSide: s.splitSide === 'secondary' ? 'primary' : 'secondary' }))}>
                      {sel.splitSide === 'secondary' ? 'Other half' : 'This half'}
                    </button>
                  </div>
                </div>
              )}
              <label className="control">
                <span>Display size</span>
                <select value={sel.displayScale ?? 'default'} onChange={(e) => setSel((s) => ({ ...s, displayScale: e.target.value }))}>
                  {config.platforms.android.displaySize.steps.map((st) => (
                    <option value={st.id} key={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="control">
                <span>App</span>
                <div className="seg">
                  <button aria-pressed={!!sel.rotationLock} onClick={() => setSel((s) => ({ ...s, rotationLock: !s.rotationLock }))}>
                    Rotation lock
                  </button>
                  <button aria-pressed={!!sel.appPortrait} onClick={() => setSel((s) => ({ ...s, appPortrait: !s.appPortrait }))}>
                    Portrait only
                  </button>
                  <button
                    aria-pressed={(sel.targetSdk ?? config.app.android.targetSdk) >= 36}
                    onClick={() => setSel((s) => ({ ...s, targetSdk: (s.targetSdk ?? config.app.android.targetSdk) >= 36 ? 35 : 36 }))}
                  >
                    targetSdk {(sel.targetSdk ?? config.app.android.targetSdk) >= 36 ? 36 : 35}
                  </button>
                </div>
              </div>
```

with `const WINDOW_LABEL = { fullscreen: 'Full screen', split: 'Split', freeform: 'Desktop', popup: 'Pop-up', pip: 'PiP' } as const;` at module level. Add a "Keyboard" toggle for both platforms next to "Present":

```tsx
          <div className="control">
            <span>Keyboard</span>
            <button className="seg-single" aria-pressed={!!sel.ime} onClick={() => setSel((s) => ({ ...s, ime: !s.ime }))}>
              {sel.ime ? 'Shown' : 'Hidden'}
            </button>
          </div>
```

Pass `onResizeWindow={env.window.mode === 'freeform' ? (w, h) => setSel((s) => ({ ...s, windowSize: { width: Math.round(w), height: Math.round(h) } })) : undefined}` to `DeviceFrame`.

- [ ] **Step 8: Show window facts and notes in the inspector**

In `src/ui/Inspector.tsx`, add to `rows` after `'Size'`:

```ts
  if (env.window.mode !== 'fullscreen' || env.display.width !== env.width || env.display.height !== env.height)
    rows.push(['Window', `${env.window.mode} · ${env.width}×${env.height} ${u} on a ${env.display.width}×${env.display.height} ${u} display`]);
  if (env.ime) rows.push(['Keyboard', `${env.ime} ${u}: ${env.height - env.safeArea.top - env.ime} ${u} left for content; the window size class does not change`]);
```

and render `env.notes` as a list under the indicators:

```tsx
      {env.notes.length > 0 && (
        <ul className="bar-notes">
          {env.notes.map((n) => (
            <li data-kind="compression" key={n.id}>
              {n.text} <span className="muted">({n.source})</span>
            </li>
          ))}
        </ul>
      )}
```

- [ ] **Step 9: Verify in the browser**

Run `npx tsc -b && npx vitest run`, then `npx vite --port 5199` and open each of these; check the frame and inspector and that the console has no errors:
- `http://localhost:5199/?device=pixel-9&win=split&ratio=0.5&screen=home` — two stacked windows, divider, "Other app", status bar only on the top window.
- `http://localhost:5199/?device=pixel-tablet&win=freeform&ws=700x500&screen=home` — floating window with caption bar; drag the corner handle and watch the width size class change in the inspector.
- `http://localhost:5199/?device=pixel-9&kb=1&screen=checkout` — keyboard at the bottom, content above it, inspector says the size class does not change.
- `http://localhost:5199/?device=pixel-tablet&portrait=1&sdk=35&screen=home` — letterboxed portrait window with the note; with `sdk=36` it fills the display with the targetSdk 36 note.

- [ ] **Step 10: Commit**

```bash
git add src/ui/urlState.ts src/ui/urlState.test.ts
git commit -m "Link window mode, display size, rotation lock, portrait request and keyboard state in the URL"
git add src/ui/DeviceFrame.tsx src/styles/app.css
git commit -m "Draw the window inside the display with split placeholder, caption bar and freeform resize"
git add src/sample/Screen.tsx src/styles/sample-app.css src/ui/App.tsx src/ui/Inspector.tsx
git commit -m "Add window-state controls, a keyboard overlay and window notes in the inspector"
```

---

### Task 4: Text size (sp and Dynamic Type) and bold text

**Files:**
- Create: `packages/core/src/engine/typography.ts`
- Test: `packages/core/src/engine/typography.test.ts`
- Modify: `src/sample/Screen.tsx`, `src/styles/sample-app.css`, `src/ui/App.tsx`, `src/ui/urlState.ts`

**Interfaces:**
- Consumes: `config.typography` (`Record<string, { size, lineHeight }>`), `config.platforms[p].fontScale`.
- Produces:
  - `scaledTextSize(scale: FontScaleSpec | undefined, size: number, fontScale: number): number`
  - `typeScaleVars(config: SimulatorConfig, platform: Platform, fontScale: number): Record<string, string>` returning `--t-<Style>-size` and `--t-<Style>-lh` in px
  - `interface TextSettings { fontScale: number; bold: boolean; reducedMotion: boolean }`
  - URL keys `fs` (e.g. `1.3`), `bold=1`, `motion=reduced`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/engine/typography.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { scaledTextSize, typeScaleVars } from './typography';

const config = parseConfig(raw);
const android = config.platforms.android.fontScale;
const ios = config.platforms.ios.fontScale;

describe('Android non-linear font scaling', () => {
  it('is linear at 1.0', () => expect(scaledTextSize(android, 14, 1)).toBe(14));
  it('returns the table verbatim on a table key', () => {
    expect(scaledTextSize(android, 14, 1.3)).toBeCloseTo(18.8);
    expect(scaledTextSize(android, 30, 2)).toBeCloseTo(38);
  });
  it('grows large text less than small text', () => {
    expect(scaledTextSize(android, 32, 2) / 32).toBeLessThan(scaledTextSize(android, 12, 2) / 12);
  });
  it('interpolates between tables', () => {
    const v = scaledTextSize(android, 14, 1.4);
    expect(v).toBeGreaterThan(18.8);
    expect(v).toBeLessThan(22);
  });
  it('clamps above the largest table', () => expect(scaledTextSize(android, 14, 2.5)).toBeCloseTo(26));
  it('interpolates inside a table between sp points', () => expect(scaledTextSize(android, 16, 1.5)).toBeCloseTo(23));
});

describe('iOS text size', () => {
  it('scales linearly', () => expect(scaledTextSize(ios, 17, 1.5)).toBeCloseTo(25.5));
});

describe('typeScaleVars', () => {
  it('emits size and line height per type style', () => {
    const vars = typeScaleVars(config, 'android', 2);
    expect(vars['--t-H1-size']).toBe(`${scaledTextSize(android, 32, 2)}px`);
    expect(Number.parseFloat(vars['--t-H1-lh'])).toBeCloseTo((35 * scaledTextSize(android, 32, 2)) / 32);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/typography.test.ts`
Expected: FAIL with "Failed to resolve import './typography'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/engine/typography.ts
// Type scales with the user's text size: sp through Android's non-linear FontScaleConverter, pt
// linearly on iOS. Spacing (dp, pt) never scales with it.
import type { Platform, SimulatorConfig } from '../config/types';

type FontScaleSpec = NonNullable<SimulatorConfig['platforms']['android']['fontScale']>;

/** Android 14+ applies the non-linear tables from this scale up. */
const MIN_NON_LINEAR = 1.03;

export interface TextSettings {
  fontScale: number;
  bold: boolean;
  reducedMotion: boolean;
}

export function scaledTextSize(scale: FontScaleSpec | undefined, size: number, fontScale: number): number {
  const f = Math.min(scale?.max ?? fontScale, Math.max(scale?.min ?? fontScale, fontScale));
  const nl = scale?.nonLinear;
  if (!nl || f < MIN_NON_LINEAR) return size * f;
  const keys = Object.keys(nl.tables)
    .map(Number)
    .sort((a, b) => a - b);
  const lookup = (key: number) => (key === 1 ? size : interpolate(nl.fromSp, nl.tables[String(key)] ?? nl.tables[key.toFixed(2)], size));
  if (f >= keys[keys.length - 1]) return lookup(keys[keys.length - 1]);
  const upperIndex = keys.findIndex((k) => k >= f);
  const hi = keys[upperIndex];
  const lo = upperIndex === 0 ? 1 : keys[upperIndex - 1];
  if (hi === f) return lookup(hi);
  const t = (f - lo) / (hi - lo);
  return lookup(lo) + (lookup(hi) - lookup(lo)) * t;
}

function interpolate(from: number[], to: number[], sp: number): number {
  if (sp <= from[0]) return (sp * to[0]) / from[0];
  const last = from.length - 1;
  if (sp >= from[last]) return (sp * to[last]) / from[last];
  const i = from.findIndex((v) => v >= sp);
  if (from[i] === sp) return to[i];
  const t = (sp - from[i - 1]) / (from[i] - from[i - 1]);
  return to[i - 1] + (to[i] - to[i - 1]) * t;
}

export function typeScaleVars(config: SimulatorConfig, platform: Platform, fontScale: number): Record<string, string> {
  const scale = config.platforms[platform].fontScale;
  const vars: Record<string, string> = {};
  for (const [name, style] of Object.entries(config.typography)) {
    const size = scaledTextSize(scale, style.size, fontScale);
    vars[`--t-${name}-size`] = `${size}px`;
    vars[`--t-${name}-lh`] = `${(style.lineHeight * size) / style.size}px`;
  }
  return vars;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/engine/typography.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Make the type styles read the variables**

In `src/styles/sample-app.css`, change every type class to use its variables with the current values as fallbacks. Exact replacements (style → key):

```css
.t-H0 { font: 700 var(--t-H0-size, 56px) / var(--t-H0-lh, 62px) var(--typeface-primary); letter-spacing: -1px; }
.t-H1 { font: 700 var(--t-H1-size, 32px) / var(--t-H1-lh, 35px) var(--typeface-primary); letter-spacing: -0.6px; }
.t-H2 { font: 700 var(--t-H2-size, 24px) / var(--t-H2-lh, 26px) var(--typeface-primary); letter-spacing: -0.5px; }
.t-H3 { font: 700 var(--t-H3-size, 17px) / var(--t-H3-lh, 19px) var(--typeface-primary); letter-spacing: -0.3px; }
.t-H4 { font: 700 var(--t-H4-size, 14px) / var(--t-H4-lh, 16px) var(--typeface-primary); letter-spacing: 0; }
.t-Paragraph-Medium-Regular { font: 400 var(--t-Paragraph-Medium-size, 14px) / var(--t-Paragraph-Medium-lh, 18px) var(--typeface-primary); }
.t-Paragraph-Medium-Bold { font: 700 var(--t-Paragraph-Medium-size, 14px) / var(--t-Paragraph-Medium-lh, 18px) var(--typeface-primary); }
.t-Paragraph-Small-Regular { font: 400 var(--t-Paragraph-Small-size, 12px) / var(--t-Paragraph-Small-lh, 15px) var(--typeface-primary); }
.t-Paragraph-Small-Bold { font: 700 var(--t-Paragraph-Small-size, 12px) / var(--t-Paragraph-Small-lh, 15px) var(--typeface-primary); }
.t-Paragraph-XSmall-Regular { font: 400 var(--t-Paragraph-XSmall-size, 10px) / var(--t-Paragraph-XSmall-lh, 16px) var(--typeface-primary); }
.t-Button { font: 700 var(--t-Button-size, 16px) / var(--t-Button-lh, 19px) var(--typeface-primary); }
.t-Badge { font: 700 var(--t-Badge-size, 12px) / var(--t-Badge-lh, 16px) var(--typeface-primary); }
.t-TabBar-Idle { font: 400 var(--t-TabBar-size, 11px) / var(--t-TabBar-lh, 14px) var(--typeface-primary); }
.t-TabBar-Selected { font: 700 var(--t-TabBar-size, 11px) / var(--t-TabBar-lh, 14px) var(--typeface-primary); }
.screen[data-bold] .t-Paragraph-Medium-Regular,
.screen[data-bold] .t-Paragraph-Small-Regular,
.screen[data-bold] .t-Paragraph-XSmall-Regular,
.screen[data-bold] .t-TabBar-Idle { font-weight: 700; }
.screen[data-reduced-motion] *,
.screen[data-reduced-motion] *::before,
.screen[data-reduced-motion] *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
.modal-sheet { animation: sheet-in 240ms ease-out; }
@keyframes sheet-in { from { transform: translateY(40px); opacity: 0; } }
```

- [ ] **Step 6: Wire text settings through the screen and controls**

In `src/sample/Screen.tsx` add prop `text: TextSettings`, spread `typeScaleVars(config, env.platform, text.fontScale)` into `style`, and set `data-bold={text.bold || undefined}` and `data-reduced-motion={text.reducedMotion || undefined}` on the `.screen` element.

In `src/ui/App.tsx` keep `const [text, setText] = useState<TextSettings>(initial.text)`, pass `text` to `Screen`, and add a control group:

```tsx
          <div className="control">
            <span>Text size · {env.typeUnit}</span>
            <div className="free-resize">
              <input
                type="range"
                min={config.platforms[env.platform].fontScale?.min ?? 1}
                max={config.platforms[env.platform].fontScale?.max ?? 2}
                step={config.platforms[env.platform].fontScale?.step ?? 0.05}
                value={text.fontScale}
                onChange={(e) => setText((t) => ({ ...t, fontScale: Number(e.target.value) }))}
                aria-label="Font scale"
              />
              <span className="tnum">{text.fontScale.toFixed(2)}×</span>
              <button className="seg-single" onClick={() => setText((t) => ({ ...t, fontScale: config.platforms[env.platform].fontScale?.max ?? 2 }))}>
                Large text
              </button>
            </div>
          </div>
          <div className="control">
            <span>Accessibility</span>
            <div className="seg">
              <button aria-pressed={text.bold} onClick={() => setText((t) => ({ ...t, bold: !t.bold }))}>Bold text</button>
              <button aria-pressed={text.reducedMotion} onClick={() => setText((t) => ({ ...t, reducedMotion: !t.reducedMotion }))}>Reduced motion</button>
            </div>
          </div>
```

In `src/ui/urlState.ts` add `text: TextSettings` to `UrlState`; read `{ fontScale: Number(q.get('fs') ?? 1), bold: q.get('bold') === '1', reducedMotion: q.get('motion') === 'reduced' }`; write `fs` when not 1, `bold=1`, `motion=reduced`. Add `text` to the `writeUrlState` call and effect dependencies in `App.tsx`.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc -b && npx vitest run`, then open `http://localhost:5199/?device=galaxy-z-flip-7&pose=closed&fs=2&screen=home` and confirm headings grow less than body text and spacing stays the same.

```bash
git add packages/core/src/engine/typography.ts packages/core/src/engine/typography.test.ts
git commit -m "Scale type with Android's non-linear font scale and a linear iOS text size"
git add src/styles/sample-app.css src/sample/Screen.tsx src/ui/App.tsx src/ui/urlState.ts
git commit -m "Add text size, bold text, reduced motion and a large-text preset to the screen and URL"
```

---

### Task 5: Scenes engine and schema

**Files:**
- Create: `packages/core/src/engine/scenes.ts`
- Test: `packages/core/src/engine/scenes.test.ts`
- Modify: `packages/core/src/config/schema.ts` (root `scenes`, screen `scene`, rule `scene`)
- Modify: `packages/core/src/config/simulator.config.json` (scenes block)

**Interfaces:**
- Consumes: `Environment.regions`, `separatingFold` from `folds.ts`, `Posture` from `layout.ts`.
- Produces:
  - `type SceneStrategy = 'single' | 'list-detail' | 'two-pane' | 'supporting-pane'`
  - `type PaneRole = 'main' | 'list' | 'detail' | 'primary' | 'secondary' | 'supporting' | 'spare'`
  - `interface ScenePane { role: PaneRole; rect: Rect }`
  - `interface SceneLayout { id: string; strategy: SceneStrategy; fellBack: boolean; reason: string | null; panes: ScenePane[] }`
  - `type SceneSpec = SimulatorConfig['scenes'][string]`
  - `resolveScene(input: { id: string; spec: SceneSpec | null; content: Rect; regions: Rect[]; forceSingle: boolean; unit: string }): SceneLayout`

- [ ] **Step 1: Add the schema and config (no behaviour yet)**

In `packages/core/src/config/schema.ts`, before `export const configSchema`, add:

```ts
const sceneSpec = z.strictObject({
  strategy: z.enum(['single', 'list-detail', 'two-pane', 'supporting-pane']),
  listFraction: z.number().gt(0).lt(1).optional(),
  listMinWidth: nonNeg.optional(),
  detailMinWidth: nonNeg.optional(),
  ratio: z.number().gt(0).lt(1).optional(),
  paneMinWidth: nonNeg.optional(),
  supportingWidth: pos.optional(),
  mainMinWidth: nonNeg.optional(),
  /** Narrowest pane text still reads in; the min-legible-width check uses it. */
  textMinWidth: pos.optional(),
  source: sourceRef,
});
```

Add `scenes: z.record(z.string(), sceneSpec).optional(),` to the root object after `components`, `scene: z.string().optional(),` to `screen`, and `scene: z.literal('single').optional(),` to `layoutRule`. In `superRefine` add:

```ts
    cfg.screens.forEach((s, si) => {
      if (s.scene && !cfg.scenes?.[s.scene]) issue(['screens', si, 'scene'], `Unknown scene "${s.scene}"; add it to "scenes"`);
    });
    for (const [id, sc] of Object.entries(cfg.scenes ?? {})) checkSource(sc.source, ['scenes', id, 'source']);
```

Add to `packages/core/src/config/simulator.config.json` after `components`:

```json
  "scenes": {
    "$comment": "Pane strategies named after Navigation 3 SceneStrategy. A screen declares one; the engine splits at a separating hinge, splits by the parameters when both minimum widths fit, and otherwise falls back to one pane.",
    "list-detail": { "strategy": "list-detail", "listFraction": 0.4, "listMinWidth": 320, "detailMinWidth": 360, "textMinWidth": 240, "source": "material3" },
    "two-pane": { "strategy": "two-pane", "ratio": 0.5, "paneMinWidth": 320, "source": "material3" },
    "supporting-pane": { "strategy": "supporting-pane", "supportingWidth": 360, "mainMinWidth": 400, "source": "material3" }
  },
```

Run: `npx tsc -b && npx vitest run` — Expected: PASS (schema accepts the block).

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/src/engine/scenes.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveScene } from './scenes';

const scenes = parseConfig(raw).scenes!;
const content = (width: number, height = 800) => ({ x: 24, y: 0, width, height });
const base = { id: 'list-detail', spec: scenes['list-detail'], regions: [] as { x: number; y: number; width: number; height: number }[], forceSingle: false, unit: 'dp' };

describe('resolveScene', () => {
  it('splits list-detail when both minimum widths fit', () => {
    const s = resolveScene({ ...base, content: content(1000) });
    expect(s.fellBack).toBe(false);
    expect(s.panes.map((p) => p.role)).toEqual(['list', 'detail']);
    expect(s.panes[0].rect.width).toBe(400);
    expect(s.panes[1].rect.x).toBe(424);
  });

  it('keeps the list at its minimum when the fraction is too narrow', () => {
    const s = resolveScene({ ...base, content: content(700) });
    expect(s.panes[0].rect.width).toBe(320);
    expect(s.panes[1].rect.width).toBe(380);
  });

  it('falls back to the detail pane with a reason when the minimums do not fit', () => {
    const s = resolveScene({ ...base, content: content(352) });
    expect(s).toMatchObject({ strategy: 'list-detail', fellBack: true });
    expect(s.panes).toEqual([{ role: 'detail', rect: content(352) }]);
    expect(s.reason).toBe('list-detail → single: 320 + 360 dp minimum does not fit 352 dp');
  });

  it('splits at the hinge when a fold separates the window', () => {
    const regions = [
      { x: 0, y: 0, width: 425.5, height: 883 },
      { x: 425.5, y: 0, width: 425.5, height: 883 },
    ];
    const s = resolveScene({ ...base, content: content(803), regions });
    expect(s.panes.map((p) => p.rect)).toEqual(regions);
  });

  it('stacks panes in tabletop', () => {
    const regions = [
      { x: 0, y: 0, width: 883, height: 425.5 },
      { x: 0, y: 425.5, width: 883, height: 425.5 },
    ];
    expect(resolveScene({ ...base, content: content(835), regions }).panes[1].rect.y).toBe(425.5);
  });

  it('marks a third tri-fold region as spare', () => {
    const regions = [0, 1, 2].map((i) => ({ x: i * 274, y: 0, width: 274, height: 603 }));
    const s = resolveScene({ ...base, content: content(775), regions });
    expect(s.panes.map((p) => p.role)).toEqual(['list', 'detail', 'spare']);
  });

  it('obeys a rule that forces a single pane', () => {
    const s = resolveScene({ ...base, content: content(1000), forceSingle: true });
    expect(s.panes).toHaveLength(1);
    expect(s.reason).toBe('The layout rule forces a single pane');
  });

  it('treats a screen without a scene as single', () => {
    expect(resolveScene({ ...base, id: 'single', spec: null, content: content(1000) }).panes).toEqual([{ role: 'main', rect: content(1000) }]);
  });

  it('keeps a supporting pane at its width', () => {
    const s = resolveScene({ ...base, id: 'supporting-pane', spec: scenes['supporting-pane'], content: content(1000) });
    expect(s.panes.map((p) => [p.role, p.rect.width])).toEqual([
      ['main', 640],
      ['supporting', 360],
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/scenes.test.ts`
Expected: FAIL with "Failed to resolve import './scenes'"

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/core/src/engine/scenes.ts
// Pane strategies modelled on Navigation 3's SceneStrategy (Android) and NavigationSplitView (iOS).
import type { Rect, SimulatorConfig } from '../config/types';

export type SceneStrategy = 'single' | 'list-detail' | 'two-pane' | 'supporting-pane';
export type PaneRole = 'main' | 'list' | 'detail' | 'primary' | 'secondary' | 'supporting' | 'spare';
export type SceneSpec = NonNullable<SimulatorConfig['scenes']>[string];

export interface ScenePane {
  role: PaneRole;
  rect: Rect;
}

export interface SceneLayout {
  id: string;
  strategy: SceneStrategy;
  fellBack: boolean;
  reason: string | null;
  panes: ScenePane[];
}

const ROLES: Record<SceneStrategy, PaneRole[]> = {
  single: ['main'],
  'list-detail': ['list', 'detail'],
  'two-pane': ['primary', 'secondary'],
  'supporting-pane': ['main', 'supporting'],
};

interface SceneInput {
  id: string;
  spec: SceneSpec | null;
  /** Content box in window coordinates (page margins removed). */
  content: Rect;
  /** Logical areas after separating folds; one or none when nothing separates. */
  regions: Rect[];
  forceSingle: boolean;
  unit: string;
}

export function resolveScene({ id, spec, content, regions, forceSingle, unit }: SceneInput): SceneLayout {
  const strategy: SceneStrategy = spec?.strategy ?? 'single';
  const roles = ROLES[strategy];
  const single = (reason: string | null, fellBack: boolean): SceneLayout => ({
    id,
    strategy,
    fellBack,
    reason,
    // Navigation 3 shows the top of the back stack: the detail over the list.
    panes: [{ role: roles[roles.length - 1], rect: content }],
  });

  if (strategy === 'single') return single(null, false);
  if (forceSingle) return single('The layout rule forces a single pane', true);

  if (regions.length > 1) {
    return {
      id,
      strategy,
      fellBack: false,
      reason: null,
      panes: regions.map((rect, i) => ({ role: roles[i] ?? 'spare', rect })),
    };
  }

  const w = content.width;
  const at = (x: number, width: number): Rect => ({ x: content.x + x, y: content.y, width, height: content.height });
  let mins: number[];
  let first: number;
  switch (strategy) {
    case 'list-detail': {
      mins = [spec!.listMinWidth ?? 0, spec!.detailMinWidth ?? 0];
      first = Math.min(Math.max(w * (spec!.listFraction ?? 0.4), mins[0]), w - mins[1]);
      break;
    }
    case 'two-pane': {
      const m = spec!.paneMinWidth ?? 0;
      mins = [m, m];
      first = w * (spec!.ratio ?? 0.5);
      break;
    }
    case 'supporting-pane': {
      const sw = spec!.supportingWidth ?? 360;
      mins = [spec!.mainMinWidth ?? 0, sw];
      first = w - sw;
      break;
    }
  }
  if (mins[0] + mins[1] > w) {
    return single(`${strategy} → single: ${mins[0]} + ${mins[1]} ${unit} minimum does not fit ${Math.round(w)} ${unit}`, true);
  }
  return {
    id,
    strategy,
    fellBack: false,
    reason: null,
    panes: [
      { role: roles[0], rect: at(0, first) },
      { role: roles[1], rect: at(first, w - first) },
    ],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/core/src/engine/scenes.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts packages/core/src/config/simulator.config.json
git commit -m "Describe Navigation 3-style scenes in the config"
git add packages/core/src/engine/scenes.ts packages/core/src/engine/scenes.test.ts
git commit -m "Resolve scenes: split at the hinge, split when both panes fit, otherwise fall back with a reason"
```

---

### Task 6: Layout uses scenes; sample Locations screen; inspector and diff

**Files:**
- Modify: `packages/core/src/engine/layout.ts` (replace `paneRects` with `scene`)
- Modify: `packages/core/src/engine/diff.ts`, `src/ui/Inspector.tsx`
- Create: `src/sample/screens/LocationsScreen.tsx`
- Modify: `src/sample/Screen.tsx` (register the screen), `packages/core/src/config/simulator.config.json` (screen entry), `src/styles/sample-app.css`
- Test: `packages/core/src/engine/postures.test.ts` (update two assertions), `packages/core/src/engine/sceneLayout.test.ts` (create)

**Interfaces:**
- Consumes: Task 5 `resolveScene`, `SceneLayout`.
- Produces: `Layout.scene: SceneLayout`; `Layout.panes` stays (equals `scene.panes.length`); `Layout.paneRects` is removed.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/engine/sceneLayout.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment } from './environment';
import { resolveLayout } from './layout';

const config = parseConfig(raw);
const locations = config.screens.find((s) => s.id === 'locations')!;
const layoutFor = (deviceId: string, pose?: string) =>
  resolveLayout(config, resolveEnvironment(config, { deviceId, displayId: '', orientation: 'portrait', free: null, pose }), locations);

describe('scene in the layout', () => {
  it('shows only the detail on a phone', () => {
    const l = layoutFor('pixel-9');
    expect(l.scene.fellBack).toBe(true);
    expect(l.panes).toBe(1);
  });
  it('splits list and detail on an open Pixel Fold', () => {
    expect(layoutFor('pixel-9-pro-fold', 'open').scene.panes.map((p) => p.role)).toEqual(['list', 'detail']);
  });
  it('splits at the crease in book posture', () => {
    expect(layoutFor('pixel-9-pro-fold', 'book').scene.panes[0].rect.width).toBe(425.5);
  });
  it('keeps screens without a scene single', () => {
    const home = config.screens.find((s) => s.id === 'home')!;
    const env = resolveEnvironment(config, { deviceId: 'pixel-tablet', displayId: '', orientation: 'portrait', free: null });
    expect(resolveLayout(config, env, home).scene.strategy).toBe('single');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/sceneLayout.test.ts`
Expected: FAIL (no `locations` screen, `scene` undefined)

- [ ] **Step 3: Add the screen to the config**

Append to `screens` in `packages/core/src/config/simulator.config.json`:

```json
    {
      "id": "locations",
      "name": "Locations",
      "experience": "navigation",
      "tab": "order",
      "enabled": true,
      "scene": "list-detail",
      "figma": null,
      "source": "built from sample app components; list-detail canonical layout (Material 3)",
      "components": [],
      "toolbar": { "component": "toolbar", "type": "H3", "title": "Locations", "items": [] }
    }
```

- [ ] **Step 4: Put the scene on the layout**

In `packages/core/src/engine/layout.ts`: import `resolveScene, type SceneLayout` from `./scenes`; add `scene: SceneLayout;` to `Layout` and remove `paneRects: Rect[];`; delete `resolvePanes`; replace the `panes`/`paneRects` lines in `resolveLayout` with:

```ts
  const content = { x: margin.left, y: 0, width: contentWidth, height: env.height };
  const sceneId = screen.scene ?? (rule.panes > 1 ? 'two-pane' : 'single');
  const scene = resolveScene({
    id: sceneId,
    spec: config.scenes?.[sceneId] ?? null,
    content,
    regions: env.regions.length > 1 ? env.regions : [],
    forceSingle: rule.scene === 'single',
    unit: env.unit,
  });
```

and in the returned object replace `panes,` / `paneRects,` with `panes: scene.panes.length,` and `scene,`.

In `packages/core/src/engine/postures.test.ts`, change the book-posture assertions from `layout.paneRects[0].width` to `layout.scene.panes[0].rect.width`.

- [ ] **Step 5: Report the scene**

In `packages/core/src/engine/diff.ts` add after the panes line:

```ts
  const sceneLabel = (l: Layout) => `${l.scene.strategy}${l.scene.fellBack ? ' (single)' : ''} · ${l.scene.panes.map((p) => p.role).join('+')}`;
  if (sceneLabel(la) !== sceneLabel(lb)) out.push(`Scene ${sceneLabel(la)} → ${sceneLabel(lb)}`);
```

In `src/ui/Inspector.tsx` replace the `panes` row content with:

```tsx
          <dt>scene</dt>
          <dd>
            {layout.scene.strategy} · {layout.scene.panes.map((p) => `${p.role} ${Math.round(p.rect.width)}`).join(' + ')} {u}
            {layout.scene.reason ? ` — ${layout.scene.reason}` : ''}
            {env.platform === 'ios' && layout.scene.panes.length > 1 ? ' (NavigationSplitView columns)' : ''}
          </dd>
```

- [ ] **Step 6: Build the Locations screen**

```tsx
// src/sample/screens/LocationsScreen.tsx
import type { Layout } from '../../engine/layout';
import { MapCard, RestaurantCardSmall, SectionHeader } from '../components';
import { RESTAURANTS } from '../content';

/** List-detail: store list and store detail (map). One pane shows the detail, as Navigation 3 does. */
export function LocationsScreen({ layout }: { layout: Layout }) {
  const panes = layout.scene.panes;
  const origin = layout.margin.left;
  return (
    <div className="scene" data-scene={layout.scene.strategy} data-name=".Content/Locations">
      {panes.map((pane, i) => (
        <section
          className={`scene__pane scene__pane--${pane.role}`}
          style={{ left: pane.rect.x - (panes.length > 1 && pane.rect.x < origin ? 0 : origin), width: pane.rect.width }}
          data-role={pane.role}
          key={i}
        >
          {pane.role === 'list' && (
            <div className="page-pad section-pad">
              <SectionHeader title="Nearby" />
              {RESTAURANTS.map((r) => (
                <RestaurantCardSmall restaurant={r} key={r.name} />
              ))}
              <p className="t-Paragraph-Medium-Regular empty-state" data-text-block>
                You have not saved any favourite locations yet. Tap the heart on a location to find it here faster next time.
              </p>
            </div>
          )}
          {(pane.role === 'detail' || pane.role === 'main') && (
            <div className="page-pad section-pad">
              <SectionHeader title={RESTAURANTS[0].name} />
              <MapCard restaurants={RESTAURANTS} />
            </div>
          )}
          {pane.role === 'spare' && <div className="scene__spare">Spare area (no Navigation 3 strategy for three panes)</div>}
        </section>
      ))}
    </div>
  );
}
```

Register it in `src/sample/Screen.tsx`: `import { LocationsScreen } from './screens/LocationsScreen';` and add `locations: LocationsScreen,` to `SCREEN_CONTENT`. Add to `src/styles/sample-app.css`:

```css
.scene {
  position: relative;
  min-height: 100%;
}
.scene__pane {
  position: absolute;
  top: 0;
  bottom: 0;
  overflow: auto;
  border-inline-end: 1px solid var(--stroke-primary);
}
.scene[data-scene="single"] .scene__pane,
.scene__pane:only-child {
  position: relative;
}
.scene__spare {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--fg-secondary);
}
.empty-state {
  color: var(--fg-secondary);
}
```

- [ ] **Step 7: Run tests and verify in the browser**

Run: `npx tsc -b && npx vitest run` — Expected: PASS.
Open `http://localhost:5199/?device=pixel-9-pro-fold&pose=book&screen=locations&ov=fold` (two panes split at the crease) and `http://localhost:5199/?device=pixel-9&screen=locations` (detail only, inspector shows the fallback reason).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/engine/layout.ts packages/core/src/engine/postures.test.ts packages/core/src/engine/sceneLayout.test.ts packages/core/src/config/simulator.config.json
git commit -m "Put the resolved scene on the layout in place of the pane rectangles"
git add packages/core/src/engine/diff.ts src/ui/Inspector.tsx
git commit -m "Show the scene and its fallback reason in the inspector and What changed"
git add src/sample/screens/LocationsScreen.tsx src/sample/Screen.tsx src/styles/sample-app.css
git commit -m "Add a list-detail Locations sample screen"
```

---

### Task 7: Grid and FlexBox resolution

**Files:**
- Create: `packages/core/src/engine/gridFlex.ts`
- Test: `packages/core/src/engine/gridFlex.test.ts`

**Interfaces:**
- Produces:
  - `type Track = { fixed: number } | { fr: number } | { adaptive: { min: number; max?: number } }`
  - `interface GridForm { grid: { columns: Track[]; gap: number; areas?: Record<string, number[]> } }`
  - `interface FlexForm { flex: { wrap: boolean; basis: number; grow: number; shrink: number; gap: number; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' } }`
  - `interface ResolvedItems { form: 'perRow' | 'grid' | 'flex'; columnWidths: number[]; items: { width: number }[]; lines: number; gap: number }`
  - `resolveTracks(tracks: Track[], available: number, gap: number): number[]`
  - `resolveFlex(cfg: FlexForm['flex'], available: number, count: number): { widths: number[]; lines: number }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/engine/gridFlex.test.ts
import { describe, expect, it } from 'vitest';
import { resolveFlex, resolveTracks } from './gridFlex';

describe('resolveTracks', () => {
  it('repeats an adaptive track as many times as fit', () => {
    expect(resolveTracks([{ adaptive: { min: 320 } }], 1000, 24)).toHaveLength(3);
    expect(resolveTracks([{ adaptive: { min: 320 } }], 600, 24)).toEqual([600]);
  });
  it('caps adaptive tracks at max', () => {
    expect(resolveTracks([{ adaptive: { min: 320, max: 400 } }], 1000, 24)).toEqual([400, 400]);
  });
  it('keeps one adaptive column no wider than the container when min exceeds it', () => {
    expect(resolveTracks([{ adaptive: { min: 500 } }], 352, 24)).toEqual([352]);
  });
  it('shares the rest between fr tracks after fixed ones', () => {
    expect(resolveTracks([{ fixed: 100 }, { fr: 1 }, { fr: 3 }], 524, 12)).toEqual([100, 100, 300]);
  });
});

describe('resolveFlex', () => {
  const cfg = { wrap: true, basis: 96, grow: 1, shrink: 1, gap: 12 };
  it('fits as many items per line as the basis allows and grows them', () => {
    const r = resolveFlex(cfg, 352, 3);
    expect(r.lines).toBe(1);
    expect(r.widths[0]).toBeCloseTo((352 - 24) / 3);
  });
  it('wraps onto new lines when the basis does not fit', () => {
    expect(resolveFlex(cfg, 200, 3).lines).toBe(2);
  });
  it('shrinks items on one line when wrapping is off', () => {
    const r = resolveFlex({ ...cfg, wrap: false, grow: 0 }, 200, 3);
    expect(r.lines).toBe(1);
    expect(r.widths.every((w) => w < 96)).toBe(true);
    expect(r.widths.reduce((a, b) => a + b, 0) + 24).toBeCloseTo(200);
  });
  it('does not grow items when grow is 0', () => {
    expect(resolveFlex({ ...cfg, grow: 0 }, 400, 2).widths).toEqual([96, 96]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/gridFlex.test.ts`
Expected: FAIL with "Failed to resolve import './gridFlex'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/engine/gridFlex.ts
// Grid tracks (Compose Grid, SwiftUI Grid / LazyVGrid(.adaptive)) and FlexBox lines (Compose FlexBox,
// SwiftUI stacks) resolved to item widths, so checks and rendering use the same numbers.

export type Track = { fixed: number } | { fr: number } | { adaptive: { min: number; max?: number } };

export interface GridForm {
  grid: { columns: Track[]; gap: number; areas?: Record<string, number[]> };
}

export interface FlexForm {
  flex: {
    wrap: boolean;
    basis: number;
    grow: number;
    shrink: number;
    gap: number;
    justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  };
}

export interface ResolvedItems {
  form: 'perRow' | 'grid' | 'flex';
  columnWidths: number[];
  items: { width: number }[];
  lines: number;
  gap: number;
}

export function resolveTracks(tracks: Track[], available: number, gap: number): number[] {
  if (tracks.length === 1 && 'adaptive' in tracks[0]) {
    const { min, max } = tracks[0].adaptive;
    const count = Math.max(1, Math.floor((available + gap) / (min + gap)));
    const width = Math.min((available - gap * (count - 1)) / count, max ?? Infinity);
    return Array.from({ length: count }, () => Math.min(width, available));
  }
  const gaps = gap * (tracks.length - 1);
  const fixed = tracks.reduce((sum, t) => sum + ('fixed' in t ? t.fixed : 'adaptive' in t ? t.adaptive.min : 0), 0);
  const frTotal = tracks.reduce((sum, t) => sum + ('fr' in t ? t.fr : 0), 0);
  const free = Math.max(0, available - gaps - fixed);
  return tracks.map((t) => ('fixed' in t ? t.fixed : 'adaptive' in t ? t.adaptive.min : frTotal ? (free * t.fr) / frTotal : 0));
}

export function resolveFlex(cfg: FlexForm['flex'], available: number, count: number): { widths: number[]; lines: number } {
  // Build lines from the basis (step 3 of the FlexBox algorithm).
  const perLine = cfg.wrap ? Math.max(1, Math.floor((available + cfg.gap) / (cfg.basis + cfg.gap))) : count;
  const widths: number[] = [];
  let lines = 0;
  for (let start = 0; start < count; start += perLine) {
    lines++;
    const n = Math.min(perLine, count - start);
    const free = available - cfg.gap * (n - 1) - cfg.basis * n;
    // Grow shares extra space; shrink absorbs a deficit weighted by basis (step 4).
    const each =
      free > 0 ? cfg.basis + (cfg.grow ? free / n : 0) : free < 0 && cfg.shrink ? cfg.basis + free / n : cfg.basis;
    for (let i = 0; i < n; i++) widths.push(each);
  }
  return { widths, lines };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/engine/gridFlex.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/gridFlex.ts packages/core/src/engine/gridFlex.test.ts
git commit -m "Resolve Grid tracks and FlexBox lines to item widths"
```

---

### Task 8: Grid and flex forms in rules, layout and rendering; Products sample screen

**Files:**
- Modify: `packages/core/src/config/schema.ts` (component forms, registry `forms` and `items`)
- Modify: `packages/core/src/config/simulator.config.json` (shortcuts flex on Android compact; product_card grid; products screen)
- Modify: `packages/core/src/engine/layout.ts` (`Layout.resolved`)
- Modify: `src/sample/components.tsx` (`RuleGrid`)
- Create: `src/sample/screens/ProductsScreen.tsx`
- Modify: `src/sample/Screen.tsx`
- Test: `packages/core/src/engine/gridFlexLayout.test.ts` (create), `packages/core/src/config/schema.test.ts` (add cases)

**Interfaces:**
- Consumes: Task 7 `resolveTracks`, `resolveFlex`, `GridForm`, `FlexForm`, `ResolvedItems`.
- Produces: `Layout.resolved: Record<string, ResolvedItems>` for every `kind: 'grid'` component; registry fields `forms?: ('perRow' | 'grid' | 'flex')[]` (default `['perRow']`) and `items?: number` (sample count, default 6).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/engine/gridFlexLayout.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment } from './environment';
import { resolveLayout } from './layout';

const config = parseConfig(raw);
const layout = (deviceId: string, screenId: string) =>
  resolveLayout(
    config,
    resolveEnvironment(config, { deviceId, displayId: '', orientation: 'portrait', free: null }),
    config.screens.find((s) => s.id === screenId)!,
  );

describe('grid and flex forms', () => {
  it('keeps perRow components resolving exactly as before', () => {
    const l = layout('iphone-17', 'rewards');
    expect(l.resolved.reward_card.form).toBe('perRow');
    expect(l.perRow.reward_card).toBe(2);
  });
  it('resolves an adaptive grid for products', () => {
    expect(layout('pixel-9', 'products').resolved.product_card.columnWidths).toHaveLength(1);
    expect(layout('pixel-tablet', 'products').resolved.product_card.columnWidths.length).toBeGreaterThan(2);
  });
  it('resolves a wrapping flex for shortcuts on Android', () => {
    const r = layout('android-compact-phone', 'home').resolved.shortcut_card_item;
    expect(r.form).toBe('flex');
    expect(r.items).toHaveLength(config.components.shortcut_card_item.items ?? 6);
  });
});
```

Add to `packages/core/src/config/schema.test.ts`:

```ts
  it('rejects a grid form on a component that does not allow it', () => {
    const cfg = clone();
    cfg.layoutRules[0].components.reward_card = { grid: { columns: [{ fr: 1 }], gap: 16 } };
    expect(issuesOf(cfg).join('\n')).toMatch(/layoutRules\[0\]\.components\.reward_card: .*grid/);
  });

  it('rejects an empty track list', () => {
    const cfg = clone();
    const rule = cfg.layoutRules.find((r: { id: string }) => r.id === 'android-expanded');
    rule.components.product_card = { grid: { columns: [], gap: 16 } };
    expect(issuesOf(cfg).join('\n')).toMatch(/product_card/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/engine/gridFlexLayout.test.ts src/config/schema.test.ts`
Expected: FAIL (`resolved` undefined, no `products` screen, schema tests fail)

- [ ] **Step 3: Extend the schema**

In `packages/core/src/config/schema.ts`:

```ts
const track = z.union([
  z.strictObject({ fixed: pos }),
  z.strictObject({ fr: pos }),
  z.strictObject({ adaptive: z.strictObject({ min: pos, max: pos.optional() }) }),
]);
const gridForm = z.strictObject({
  grid: z.strictObject({ columns: z.array(track).min(1), gap: nonNeg, areas: z.record(z.string(), z.array(z.number().int().min(0)).min(1)).optional() }),
});
const flexForm = z.strictObject({
  flex: z.strictObject({
    wrap: z.boolean(),
    basis: pos,
    grow: nonNeg,
    shrink: nonNeg,
    gap: nonNeg,
    justify: z.enum(['start', 'center', 'end', 'space-between', 'space-around']).optional(),
  }),
});
```

Change `RULE_BY_KIND.grid` to `z.union([gridRule, gridForm, flexForm])`, add `gridForm, flexForm` to the `layoutRule.components` union, and add to `componentSpec`:

```ts
  /** Rule forms this component accepts. */
  forms: z.array(z.enum(['perRow', 'grid', 'flex'])).optional(),
  /** Items the sample screen shows; flex widths depend on it. */
  items: z.number().int().positive().optional(),
```

In `superRefine`, inside the rule/component loop, after the kind check:

```ts
        const form = 'grid' in value ? 'grid' : 'flex' in value ? 'flex' : 'perRow';
        if (spec.kind === 'grid' && !(spec.forms ?? ['perRow']).includes(form))
          issue([...path, 'components', id], `Component "${id}" does not accept the ${form} form; allowed: ${(spec.forms ?? ['perRow']).join(', ')}`);
        if (form === 'grid') {
          const g = (value as z.infer<typeof gridForm>).grid;
          for (const [area, cols] of Object.entries(g.areas ?? {}))
            if (cols.some((c) => c >= g.columns.length)) issue([...path, 'components', id, 'grid', 'areas', area], `Span runs past the ${g.columns.length} tracks`);
        }
```

Export the types: `export type GridFormRule = z.infer<typeof gridForm>; export type FlexFormRule = z.infer<typeof flexForm>;`.

- [ ] **Step 4: Add the config entries**

In `components`:

```json
    "product_card": { "kind": "grid", "gap": 16, "minLegibleWidth": 150, "forms": ["perRow", "grid"], "items": 8, "source": "estimated" },
```

and add `"forms": ["perRow", "flex"], "items": 3` to `shortcut_card_item`. In every layout rule add a `product_card` entry: `{ "perRow": 2, "minItemWidth": 150 }` for iOS rules and the Android fallback, and for `android-compact`, `android-compact-short`, `android-wide-short`, `android-medium` and `android-expanded`:

```json
        "product_card": { "grid": { "columns": [{ "adaptive": { "min": 160, "max": 240 } }], "gap": 16 } }
```

In `android-compact` and `android-compact-short` replace `shortcut_card_item` with:

```json
        "shortcut_card_item": { "flex": { "wrap": true, "basis": 96, "grow": 1, "shrink": 1, "gap": 12, "justify": "space-between" } }
```

Append the screen:

```json
    {
      "id": "products",
      "name": "Products",
      "experience": "navigation",
      "tab": "food",
      "enabled": true,
      "figma": null,
      "source": "built from sample app components; adaptive product grid",
      "components": ["product_card"],
      "toolbar": { "component": "toolbar", "type": "H3", "title": "Burgers", "items": [] }
    }
```

- [ ] **Step 5: Resolve forms in the layout**

In `packages/core/src/engine/layout.ts`, import `resolveFlex, resolveTracks, type ResolvedItems` from `./gridFlex`, add `resolved: Record<string, ResolvedItems>;` to `Layout`, and replace the component loop body with:

```ts
  const resolved: Record<string, ResolvedItems> = {};
  for (const [id, spec] of Object.entries(config.components)) {
    if (spec.kind !== 'grid') continue;
    const entry = rule.components[id] as GridRule | GridFormRule | FlexFormRule;
    const g = spec.gap ?? 0;
    const count = spec.items ?? 6;
    if ('grid' in entry) {
      const columnWidths = resolveTracks(entry.grid.columns, contentWidth, entry.grid.gap);
      perRow[id] = columnWidths.length;
      maxItemWidth[id] = null;
      gap[id] = entry.grid.gap;
      resolved[id] = {
        form: 'grid',
        columnWidths,
        items: Array.from({ length: count }, (_, i) => ({ width: columnWidths[i % columnWidths.length] })),
        lines: Math.ceil(count / columnWidths.length),
        gap: entry.grid.gap,
      };
      continue;
    }
    if ('flex' in entry) {
      const { widths, lines } = resolveFlex(entry.flex, contentWidth, count);
      perRow[id] = Math.ceil(count / lines);
      maxItemWidth[id] = null;
      gap[id] = entry.flex.gap;
      resolved[id] = { form: 'flex', columnWidths: [], items: widths.map((width) => ({ width })), lines, gap: entry.flex.gap };
      continue;
    }
    const fit = entry.minItemWidth ? Math.max(1, Math.floor((contentWidth - foldGutter + g) / (entry.minItemWidth + g))) : entry.perRow;
    perRow[id] = Math.min(entry.perRow, fit);
    maxItemWidth[id] = entry.maxItemWidth ?? null;
    gap[id] = g;
    const width = Math.min((contentWidth - g * (perRow[id] - 1)) / perRow[id], entry.maxItemWidth ?? Infinity);
    resolved[id] = { form: 'perRow', columnWidths: Array(perRow[id]).fill(width), items: Array.from({ length: count }, () => ({ width })), lines: Math.ceil(count / perRow[id]), gap: g };
  }
```

(import `GridFormRule`, `FlexFormRule` types from `../config/types`, re-exported there from `schema.ts`), and add `resolved,` to the returned object.

- [ ] **Step 6: Render the forms**

In `src/sample/components.tsx` `RuleGrid`, before building `style`, add:

```tsx
  const r = layout.resolved[component];
  if (r?.form === 'grid') {
    return (
      <div
        className={`rule-grid ${className}`}
        style={{ gridTemplateColumns: r.columnWidths.map((w) => `${w}px`).join(' '), gap: `${r.gap}px` }}
        data-component={component}
        data-form="grid"
      >
        {children}
      </div>
    );
  }
  if (r?.form === 'flex') {
    const entry = layout.rule.components[component] as FlexFormRule;
    return (
      <div
        className={`rule-flex ${className}`}
        style={{ gap: `${r.gap}px`, flexWrap: entry.flex.wrap ? 'wrap' : 'nowrap', justifyContent: entry.flex.justify ?? 'start' }}
        data-component={component}
        data-form="flex"
      >
        {Children.toArray(children).map((child, i) => (
          <div style={{ flex: `${entry.flex.grow} ${entry.flex.shrink} ${entry.flex.basis}px`, minWidth: 0 }} key={i}>
            {child}
          </div>
        ))}
      </div>
    );
  }
```

Add `.rule-flex { display: flex; }` to `src/styles/sample-app.css`.

Create the screen:

```tsx
// src/sample/screens/ProductsScreen.tsx
import type { Layout } from '../../engine/layout';
import { asset } from '../assets';
import { DealCard, RuleGrid } from '../components';

const PRODUCTS = ['Classic burger', 'Double burger', 'Chicken burger', 'Veggie burger', 'Fish burger', 'Cheeseburger', 'Bacon burger', 'Kids burger'];

export function ProductsScreen({ layout }: { layout: Layout }) {
  return (
    <div className="content-stack content-stack--white" data-name=".Content/Products">
      <RuleGrid layout={layout} component="product_card" className="page-pad section-pad">
        {PRODUCTS.map((name) => (
          <DealCard name={name} image={asset('deal_mcmuffin_meal.png')} expiresSoon={false} key={name} />
        ))}
      </RuleGrid>
    </div>
  );
}
```

If `asset('deal_mcmuffin_meal.png')` no longer exists after de-branding, use the name `DealsScreen.tsx` uses for its deal image. Register `products: ProductsScreen` in `SCREEN_CONTENT` in `src/sample/Screen.tsx`.

- [ ] **Step 7: Run tests and verify**

Run: `npx tsc -b && npx vitest run` — Expected: PASS (every existing test unchanged).
Open `http://localhost:5199/?device=pixel-tablet&screen=products&ov=grid` and drag a freeform window (`&win=freeform`) narrower: the column count drops at each 176 dp step. Open `?device=android-compact-phone&screen=home` and check the three shortcuts share one line.

- [ ] **Step 8: Commit**

```bash
git add src/config/schema.ts src/config/schema.test.ts
git commit -m "Accept Grid track and FlexBox forms in layout rules, limited per component"
git add packages/core/src/engine/layout.ts packages/core/src/engine/gridFlexLayout.test.ts packages/core/src/config/simulator.config.json
git commit -m "Resolve grid and flex rule forms in the layout and use them for products and shortcuts"
git add src/sample/components.tsx src/sample/screens/ProductsScreen.tsx src/sample/Screen.tsx src/styles/sample-app.css
git commit -m "Render grid and flex forms and add a Products sample screen"
```

---

### Task 9: Layout checks emitting Dobra findings, with observed-failure fixtures

**Files:**
- Create: `packages/core/src/engine/checks.ts`
- Create: `packages/core/src/engine/fixtures/observed.ts`
- Test: `packages/core/src/engine/checks.test.ts`

**Interfaces:**
- Consumes: `Environment`, `Layout` (`scene`, `resolved`, `hero`, `navigation`, `contentWidth`), `ScreenSpec`, `config.components`, `config.scenes`.
- Produces:
  - `type RuleId = 'landscape-not-wide' | 'min-legible-width' | 'pane-split' | 'tabletop-controls' | 'touch-target' | 'chrome-overlap' | 'hinge-content'`
  - `interface Target { deviceId: string; displayId: string; pose?: string; orientation: Orientation; rotation?: 0 | 90 }`
  - `interface Finding { ruleId: RuleId; severity: 'error' | 'warn' | 'info'; target: Target; nodeId: string; rect: Rect; message: string; source: string; estimated: boolean }`
  - `targetOf(sel: Selection, env: Environment): Target`
  - `runLayoutChecks(config: SimulatorConfig, env: Environment, layout: Layout, screen: ScreenSpec, target: Target): Finding[]`
  - `observedConfig(base: SimulatorConfig, failure: 1 | 2 | 5): SimulatorConfig`

- [ ] **Step 1: Write the fixtures**

```ts
// packages/core/src/engine/fixtures/observed.ts
// Config variants that reproduce failures observed on a physical Galaxy Z Flip 7 and a Pixel 9 Pro
// Fold emulator. Tests only: the shipped config must not trigger them.
import type { SimulatorConfig } from '../../config/types';

export function observedConfig(base: SimulatorConfig, failure: 1 | 2 | 5): SimulatorConfig {
  const cfg: SimulatorConfig = structuredClone(base);
  const android = cfg.layoutRules.filter((r) => r.platform === 'android');
  const short = android.find((r) => r.id === 'android-compact-short')!;
  switch (failure) {
    case 1:
      // Side-by-side chosen from orientation == landscape: the hero splits on the 352 dp cover.
      short.match = { orientation: 'landscape' };
      short.components.news_story_hero = { variant: 'split', bleed: 'inset' };
      break;
    case 2:
      // Stacked landscape branches: wide page gutters plus the split hero leave the text column tiny.
      short.pageMargin = { base: 62, mode: 'max' };
      short.components.news_story_hero = { variant: 'split', bleed: 'inset' };
      break;
    case 5:
      // Text that fits in one column and not in a 40% pane.
      cfg.scenes!['list-detail'] = { ...cfg.scenes!['list-detail'], listMinWidth: 0, detailMinWidth: 0 };
      break;
  }
  return cfg;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/src/engine/checks.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { runLayoutChecks, targetOf } from './checks';
import { resolveEnvironment, type Selection } from './environment';
import { observedConfig } from './fixtures/observed';
import { resolveLayout } from './layout';

const base = parseConfig(raw);
const flipCover: Selection = { deviceId: 'galaxy-z-flip-7', displayId: 'cover', orientation: 'portrait', free: null, pose: 'closed' };

function findings(config: typeof base, sel: Selection, screenId: string) {
  const env = resolveEnvironment(config, sel);
  const screen = config.screens.find((s) => s.id === screenId)!;
  return runLayoutChecks(config, env, resolveLayout(config, env, screen), screen, targetOf(sel, env));
}

describe('shipped config', () => {
  it('raises no errors on the Flip cover home screen', () => {
    expect(findings(base, flipCover, 'home').filter((f) => f.severity === 'error')).toEqual([]);
  });
});

describe('observed failure #1: landscape is not wide', () => {
  it('flags a side-by-side hero on the 352 dp cover', () => {
    const f = findings(observedConfig(base, 1), flipCover, 'home');
    expect(f).toContainEqual(
      expect.objectContaining({ ruleId: 'landscape-not-wide', severity: 'error', nodeId: 'news_story_hero', source: 'androidx-window' }),
    );
    expect(f[0].target).toEqual({ deviceId: 'galaxy-z-flip-7', displayId: 'cover', pose: 'closed', orientation: 'landscape', rotation: 0 });
  });
});

describe('observed failure #2: cumulative width loss', () => {
  it('flags the hero text column below its legible width', () => {
    const f = findings(observedConfig(base, 2), flipCover, 'home').find((x) => x.ruleId === 'min-legible-width');
    expect(f).toMatchObject({ nodeId: 'news_story_hero', estimated: true });
    expect(f!.message).toMatch(/352 dp window → 228 dp content → hero text 66 dp < 200 dp/);
  });
});

describe('observed failure #5: text in a 40% pane', () => {
  it('flags the list pane on a 600 dp window', () => {
    const sel: Selection = { deviceId: 'pixel-tablet', displayId: 'main', orientation: 'portrait', free: null, windowMode: 'split', splitRatio: 0.5 };
    const f = findings(observedConfig(base, 5), sel, 'locations').find((x) => x.ruleId === 'min-legible-width');
    expect(f).toMatchObject({ nodeId: 'pane:list', severity: 'warn' });
  });
});

describe('other layout checks', () => {
  it('warns about a floating bar on a short window', () => {
    const f = findings(base, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait', free: null, rotation: 90, windowMode: 'split' }, 'home');
    expect(f.map((x) => x.ruleId)).not.toContain('chrome-overlap');
    const short = findings(base, { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait', free: null, windowMode: 'split' }, 'home');
    expect(short).toContainEqual(expect.objectContaining({ ruleId: 'chrome-overlap', estimated: true }));
  });

  it('flags panes that do not follow the hinge', () => {
    const cfg = structuredClone(base);
    const env = resolveEnvironment(cfg, { deviceId: 'pixel-9-pro-fold', displayId: '', orientation: 'portrait', free: null, pose: 'book' });
    const screen = cfg.screens.find((s) => s.id === 'locations')!;
    const layout = resolveLayout(cfg, env, screen);
    layout.scene.panes[0].rect = { ...layout.scene.panes[0].rect, width: 300 };
    const f = runLayoutChecks(cfg, env, layout, screen, targetOf({ deviceId: 'pixel-9-pro-fold', displayId: 'inner', orientation: 'portrait', free: null, pose: 'book' }, env));
    expect(f).toContainEqual(expect.objectContaining({ ruleId: 'pane-split', severity: 'error' }));
  });

  it('notes a single pane in tabletop', () => {
    const f = findings(base, { deviceId: 'pixel-9-pro-fold', displayId: '', orientation: 'portrait', free: null, pose: 'tabletop' }, 'home');
    expect(f).toContainEqual(expect.objectContaining({ ruleId: 'tabletop-controls', severity: 'info' }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/checks.test.ts`
Expected: FAIL with "Failed to resolve import './checks'"

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/core/src/engine/checks.ts
// Layout checks that need no DOM. Findings use the Dobra shape and rule ids so the simulator, the
// Figma plugin and the CLI report the same thing.
import type { HeroRule, Orientation, Rect, ScreenSpec, SimulatorConfig } from '../config/types';
import type { Environment, Selection } from './environment';
import type { Layout } from './layout';

export type RuleId =
  | 'landscape-not-wide'
  | 'min-legible-width'
  | 'pane-split'
  | 'tabletop-controls'
  | 'touch-target'
  | 'chrome-overlap'
  | 'hinge-content';

export interface Target {
  deviceId: string;
  displayId: string;
  pose?: string;
  orientation: Orientation;
  rotation?: 0 | 90;
}

export interface Finding {
  ruleId: RuleId;
  severity: 'error' | 'warn' | 'info';
  target: Target;
  nodeId: string;
  rect: Rect;
  message: string;
  source: string;
  estimated: boolean;
}

/** The WindowSizeClass medium breakpoint: side-by-side layouts start here. */
const SIDE_BY_SIDE_MIN = 600;
/** Short windows where floating chrome eats the content (observed failure #3). Estimated. */
const SHORT_WINDOW = 480;

export function targetOf(sel: Selection, env: Environment): Target {
  return {
    deviceId: sel.deviceId,
    displayId: env.pose?.display ?? sel.displayId,
    ...(env.pose ? { pose: env.pose.id } : {}),
    orientation: env.orientation,
    ...(env.android ? { rotation: env.android.rotation } : {}),
  };
}

export function runLayoutChecks(
  config: SimulatorConfig,
  env: Environment,
  layout: Layout,
  screen: ScreenSpec,
  target: Target,
): Finding[] {
  const out: Finding[] = [];
  const u = env.unit;
  const whole: Rect = { x: 0, y: 0, width: env.width, height: env.height };
  const add = (f: Omit<Finding, 'target'>) => out.push({ ...f, target });
  const heroOnScreen = screen.components.includes('news_story_hero');
  const hero = layout.hero as HeroRule;

  // 1. landscape-not-wide
  if (env.width < SIDE_BY_SIDE_MIN) {
    if (heroOnScreen && hero.variant === 'split')
      add({
        ruleId: 'landscape-not-wide',
        severity: 'error',
        nodeId: 'news_story_hero',
        rect: whole,
        message: `Rule "${layout.rule.id}" puts news_story_hero side by side in a ${env.width} ${u} window (${env.orientation}); side-by-side needs ${SIDE_BY_SIDE_MIN} ${u}.`,
        source: 'androidx-window',
        estimated: false,
      });
    if (layout.scene.panes.length > 1 && env.regions.length < 2)
      add({
        ruleId: 'landscape-not-wide',
        severity: 'error',
        nodeId: `scene:${layout.scene.id}`,
        rect: whole,
        message: `${layout.scene.strategy} shows ${layout.scene.panes.length} panes in a ${env.width} ${u} window.`,
        source: 'androidx-window',
        estimated: false,
      });
  }

  // 2. min-legible-width: the width chain for the hero text and for grid items
  if (heroOnScreen && hero.variant === 'split') {
    const spec = config.components.news_story_hero;
    const split = spec?.split;
    const min = spec?.minLegibleWidth;
    if (split && min) {
      const text = Math.round(layout.contentWidth * (1 - split.imageFraction) - split.textPadding);
      if (text < min)
        add({
          ruleId: 'min-legible-width',
          severity: 'warn',
          nodeId: 'news_story_hero',
          rect: whole,
          message: `${env.width} ${u} window → ${Math.round(layout.contentWidth)} ${u} content → hero text ${text} ${u} < ${min} ${u} (margins ${layout.margin.left}/${layout.margin.right}, image ${split.imageFraction * 100}%).`,
          source: spec.source ?? 'estimated',
          estimated: true,
        });
    }
  }
  for (const id of screen.components) {
    const r = layout.resolved[id];
    const min = config.components[id]?.minLegibleWidth;
    if (!r || !min) continue;
    const narrowest = Math.min(...r.items.map((i) => i.width));
    if (narrowest < min)
      add({
        ruleId: 'min-legible-width',
        severity: 'warn',
        nodeId: id,
        rect: whole,
        message: `${id} items are ${Math.round(narrowest)} ${u} wide (${r.form}); legible from ${min} ${u}.`,
        source: config.components[id].source ?? 'estimated',
        estimated: true,
      });
  }
  const textMin = config.scenes?.[layout.scene.id]?.textMinWidth;
  if (textMin) {
    for (const pane of layout.scene.panes) {
      if (pane.rect.width < textMin)
        add({
          ruleId: 'min-legible-width',
          severity: 'warn',
          nodeId: `pane:${pane.role}`,
          rect: pane.rect,
          message: `The ${pane.role} pane is ${Math.round(pane.rect.width)} ${u} wide; its text reads from ${textMin} ${u}.`,
          source: config.scenes![layout.scene.id].source,
          estimated: true,
        });
    }
  }

  // 3. chrome-overlap
  if (layout.navigation.floating && env.height < SHORT_WINDOW)
    add({
      ruleId: 'chrome-overlap',
      severity: 'warn',
      nodeId: 'navigation_bar',
      rect: { x: 0, y: env.height - layout.navigation.size, width: env.width, height: layout.navigation.size },
      message: `A floating ${layout.navigation.size} ${u} bar covers content in a ${env.height} ${u} tall window.`,
      source: 'estimated',
      estimated: true,
    });

  // 4. pane-split: panes must follow the hinge bounds
  if (env.regions.length > 1 && layout.scene.panes.length > 1) {
    const aligned = layout.scene.panes.every((p, i) => {
      const r = env.regions[i];
      return r && Math.abs(p.rect.x - r.x) < 0.5 && Math.abs(p.rect.width - r.width) < 0.5 && Math.abs(p.rect.y - r.y) < 0.5;
    });
    if (!aligned)
      add({
        ruleId: 'pane-split',
        severity: 'error',
        nodeId: `scene:${layout.scene.id}`,
        rect: whole,
        message: 'The panes do not follow the hinge bounds; split at the FoldingFeature, not at a ratio.',
        source: 'androidx-window',
        estimated: false,
      });
  }

  // 5. tabletop-controls
  if (layout.posture === 'tabletop' && layout.scene.panes.length < 2)
    add({
      ruleId: 'tabletop-controls',
      severity: 'info',
      nodeId: `scene:${layout.scene.id}`,
      rect: whole,
      message: 'Tabletop posture with one pane: content and controls are not split across the fold (content on top, controls at the bottom).',
      source: 'material3',
      estimated: true,
    });

  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/core/src/engine/checks.test.ts`
Expected: PASS. If the #2 message numbers differ, recompute: the Flip cover margins at base 62 are 62/62, so content = 352 − 124 = 228 and the text column = 228 × 0.5 − 48 = 66. Fix the implementation, not the expected string.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine/fixtures/observed.ts
git commit -m "Add config fixtures that reproduce observed foldable failures 1, 2 and 5"
git add packages/core/src/engine/checks.ts packages/core/src/engine/checks.test.ts
git commit -m "Check layouts for landscape-not-wide, min-legible-width, chrome-overlap, pane-split and tabletop-controls"
```

---

### Task 10: Findings in the inspector, including hinge-content from the collision checker

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/Inspector.tsx`
- Modify: `src/sample/collisions.ts` (export a mapper)
- Test: `src/sample/collisions.test.ts` (create)

**Interfaces:**
- Consumes: Task 9 `runLayoutChecks`, `targetOf`, `Finding`; existing `Collision { region: string; element: string }`.
- Produces: `collisionsToFindings(collisions: Collision[], target: Target, env: Environment): Finding[]` in `src/sample/collisions.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/sample/collisions.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { resolveEnvironment } from '../engine/environment';
import { collisionsToFindings } from './collisions';

const config = parseConfig(raw);

describe('collisionsToFindings', () => {
  it('reports each collision as a hinge-content error on the fold', () => {
    const env = resolveEnvironment(config, { deviceId: 'pixel-9-pro-fold', displayId: '', orientation: 'portrait', free: null, pose: 'book' });
    const target = { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'book', orientation: env.orientation, rotation: 0 as const };
    const [f] = collisionsToFindings([{ region: 'Folding region', element: 'action_card "Deals"' }], target, env);
    expect(f).toMatchObject({ ruleId: 'hinge-content', severity: 'error', nodeId: 'action_card "Deals"', source: 'androidx-window' });
    expect(f.rect).toEqual(env.folds[0].rect);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sample/collisions.test.ts`
Expected: FAIL (`collisionsToFindings` is not exported)

- [ ] **Step 3: Implement the mapper**

Append to `src/sample/collisions.ts`:

```ts
import type { Finding, Target } from '../engine/checks';

/** The DOM collision checker's results as Dobra hinge-content findings. */
export function collisionsToFindings(collisions: Collision[], target: Target, env: Environment): Finding[] {
  return collisions.map((c) => {
    const fold = c.region === 'Folding region' ? env.folds.find((f) => f.separating || f.occludes) : null;
    const region = env.reservedRegions.find((r) => r.label === c.region);
    return {
      ruleId: 'hinge-content',
      severity: 'error',
      target,
      nodeId: c.element,
      rect: fold?.rect ?? region?.rect ?? { x: 0, y: 0, width: env.width, height: env.height },
      message: `${c.element} sits in ${c.region.toLowerCase()}.`,
      source: fold ? 'androidx-window' : 'apple-device',
      estimated: fold?.estimated ?? region?.estimated ?? false,
    };
  });
}
```

(Move the new `import type` line to the top of the file with the other imports.)

- [ ] **Step 4: Show findings**

In `src/ui/App.tsx` compute:

```ts
  const target = targetOf(sel, env);
  const findings = [...runLayoutChecks(config, env, layout, screen, target), ...collisionsToFindings(collisions, target, env)];
```

and pass `findings` to `Inspector`. In `src/ui/Inspector.tsx` add a `findings: Finding[]` prop and a panel after the indicators:

```tsx
      <h3 className="panel__sub">Checks · {findings.length ? `${findings.length} finding${findings.length > 1 ? 's' : ''}` : 'none'}</h3>
      {findings.length > 0 && (
        <ul className="bar-notes">
          {findings.map((f, i) => (
            <li data-kind={f.severity === 'error' ? 'overfull' : 'text-in-vertical'} key={i}>
              <code>{f.ruleId}</code> {f.message} <span className="muted">({f.source}{f.estimated ? ', estimated' : ''})</span>
            </li>
          ))}
        </ul>
      )}
```

- [ ] **Step 5: Run tests and verify**

Run: `npx tsc -b && npx vitest run` — Expected: PASS.
Open `http://localhost:5199/?device=pixel-9-pro-fold&pose=book&screen=home&ov=fold` and confirm `hinge-content` findings list the cards on the crease. Open `?device=pixel-9&win=split&screen=home` and confirm the `chrome-overlap` warning.

- [ ] **Step 6: Commit**

```bash
git add src/sample/collisions.ts src/sample/collisions.test.ts
git commit -m "Report collision-checker hits as hinge-content findings"
git add src/ui/App.tsx src/ui/Inspector.tsx
git commit -m "List layout and hinge findings in the inspector"
```

---

### Task 11: Media-fact consumers (starts after Dobra's Catalog slice merges)

**Precondition:** Dobra's Catalog slice has merged and the schema has per-device `pointerPrecision`, `keyboardKind`, `viewingDistance`, `hasCamera`, `hasMicrophone` (names as agreed in the spec, §3.3). Rebase this branch onto it first. If the Catalog slice uses different field names or nests them (for example under `media`), use its names everywhere below and keep the URL keys and behaviour the same.

**Files:**
- Modify: `packages/core/src/engine/environment.ts` (`Selection.media`, `Environment.media`)
- Modify: `packages/core/src/engine/android.ts`, `packages/core/src/engine/ios.ts` (fill `media` from the device with overrides)
- Modify: `packages/core/src/config/schema.ts` (rule `match` keys for media facts)
- Modify: `packages/core/src/engine/layout.ts` (`ruleMatches`)
- Modify: `packages/core/src/engine/checks.ts` (`touch-target`)
- Modify: `src/ui/urlState.ts`, `src/ui/App.tsx`, `src/ui/Inspector.tsx`
- Test: `packages/core/src/engine/media.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface MediaFacts { pointerPrecision: 'Fine' | 'Coarse' | 'Blunt' | 'None'; keyboardKind: 'Physical' | 'Virtual' | 'None'; viewingDistance: 'Near' | 'Medium' | 'Far'; hasCamera: boolean; hasMicrophone: boolean; windowPosture: 'Flat' | 'Book' | 'Tabletop' }`
  - `Selection.media?: Partial<Omit<MediaFacts, 'windowPosture'>>`, `Environment.media: MediaFacts`
  - URL keys `ptr`, `kbd`, `dist`, `cam` (`0`/`1`), `mic` (`0`/`1`)
  - Rule match keys `pointerPrecision?: string[]`, `keyboardKind?: string[]`, `viewingDistance?: string[]`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/engine/media.test.ts
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { parseConfig } from '../config/schema';
import { runLayoutChecks, targetOf } from './checks';
import { resolveEnvironment, type Selection } from './environment';
import { resolveLayout, ruleMatches } from './layout';

const config = parseConfig(raw);
const sel = (deviceId: string, extra: Partial<Selection> = {}): Selection => ({ deviceId, displayId: '', orientation: 'portrait', free: null, ...extra });

describe('media facts', () => {
  it('defaults phones to coarse, virtual, near', () => {
    expect(resolveEnvironment(config, sel('pixel-9')).media).toMatchObject({ pointerPrecision: 'Coarse', keyboardKind: 'Virtual', viewingDistance: 'Near' });
  });
  it('defaults desktops to fine, physical, medium', () => {
    expect(resolveEnvironment(config, sel('chromebook')).media).toMatchObject({ pointerPrecision: 'Fine', keyboardKind: 'Physical', viewingDistance: 'Medium' });
  });
  it('applies overrides', () => {
    expect(resolveEnvironment(config, sel('pixel-tablet', { media: { pointerPrecision: 'Fine' } })).media.pointerPrecision).toBe('Fine');
  });
  it('derives windowPosture from the folds', () => {
    expect(resolveEnvironment(config, sel('pixel-9-pro-fold', { pose: 'tabletop' })).media.windowPosture).toBe('Tabletop');
  });
  it('lets rules match on pointer precision', () => {
    const rule = { ...config.layoutRules.find((r) => r.id === 'android-medium')!, match: { pointerPrecision: ['Fine'] } };
    expect(ruleMatches(rule, resolveEnvironment(config, sel('chromebook')))).toBe(true);
    expect(ruleMatches(rule, resolveEnvironment(config, sel('pixel-tablet')))).toBe(false);
  });
  it('checks touch targets only for coarse pointers', () => {
    const run = (s: Selection) => {
      const env = resolveEnvironment(config, s);
      const screen = config.screens[0];
      return runLayoutChecks(config, env, resolveLayout(config, env, screen), screen, targetOf(s, env)).map((f) => f.ruleId);
    };
    expect(run(sel('chromebook'))).not.toContain('touch-target');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/engine/media.test.ts`
Expected: FAIL (`media` undefined)

- [ ] **Step 3: Implement**

In `packages/core/src/engine/environment.ts` add the `MediaFacts` interface above, `media?: Partial<Omit<MediaFacts, 'windowPosture'>>;` to `Selection` and `media: MediaFacts;` to `Environment`, plus:

```ts
const CATEGORY_DEFAULTS: Record<string, Omit<MediaFacts, 'windowPosture'>> = {
  desktop: { pointerPrecision: 'Fine', keyboardKind: 'Physical', viewingDistance: 'Medium', hasCamera: true, hasMicrophone: true },
  default: { pointerPrecision: 'Coarse', keyboardKind: 'Virtual', viewingDistance: 'Near', hasCamera: true, hasMicrophone: true },
};

/** Device facts from the catalog, then category defaults, then the user's overrides. */
export function resolveMedia(
  device: { category?: string; pointerPrecision?: string; keyboardKind?: string; viewingDistance?: string; hasCamera?: boolean; hasMicrophone?: boolean },
  folds: FoldFeature[],
  overrides: Selection['media'],
): MediaFacts {
  const base = CATEGORY_DEFAULTS[device.category === 'desktop' ? 'desktop' : 'default'];
  const sep = folds.find((f) => f.separating);
  return {
    ...base,
    ...(device.pointerPrecision ? { pointerPrecision: device.pointerPrecision as MediaFacts['pointerPrecision'] } : {}),
    ...(device.keyboardKind ? { keyboardKind: device.keyboardKind as MediaFacts['keyboardKind'] } : {}),
    ...(device.viewingDistance ? { viewingDistance: device.viewingDistance as MediaFacts['viewingDistance'] } : {}),
    ...(device.hasCamera !== undefined ? { hasCamera: device.hasCamera } : {}),
    ...(device.hasMicrophone !== undefined ? { hasMicrophone: device.hasMicrophone } : {}),
    ...overrides,
    windowPosture: !sep ? 'Flat' : sep.axis === 'horizontal' ? 'Tabletop' : 'Book',
  };
}
```

Set `media: resolveMedia(device, folds, sel.media)` in `resolveAndroidDevice` and `resolveIosDevice`, and `media: resolveMedia({}, [], undefined)` in `freeEnvironment`.

In `packages/core/src/config/schema.ts` add to `layoutRule.match`:

```ts
    pointerPrecision: z.array(z.enum(['Fine', 'Coarse', 'Blunt', 'None'])).min(1).optional(),
    keyboardKind: z.array(z.enum(['Physical', 'Virtual', 'None'])).min(1).optional(),
    viewingDistance: z.array(z.enum(['Near', 'Medium', 'Far'])).min(1).optional(),
```

In `ruleMatches` (`packages/core/src/engine/layout.ts`), before `return true`:

```ts
  if (m.pointerPrecision && !m.pointerPrecision.includes(env.media.pointerPrecision)) return false;
  if (m.keyboardKind && !m.keyboardKind.includes(env.media.keyboardKind)) return false;
  if (m.viewingDistance && !m.viewingDistance.includes(env.media.viewingDistance)) return false;
```

In `packages/core/src/engine/checks.ts` add the `touch-target` check, skipped unless `env.media.pointerPrecision` is `'Coarse'` or `'Blunt'`. It flags the navigation bar item width when `layout.navigation.edge === 'bottom'` and `env.width / config.tabBar.items.length < min`, where `min` is 48 on Android and 44 on iOS:

```ts
  if (env.media.pointerPrecision === 'Coarse' || env.media.pointerPrecision === 'Blunt') {
    const min = env.platform === 'android' ? 48 : 44;
    const each = env.width / config.tabBar.items.length;
    if (layout.navigation.edge === 'bottom' && each < min)
      add({
        ruleId: 'touch-target',
        severity: 'warn',
        nodeId: 'tab_bar',
        rect: whole,
        message: `Tab items get ${Math.round(each)} ${u} each; touch targets need ${min} ${u}.`,
        source: env.platform === 'android' ? 'material3' : 'apple-device',
        estimated: false,
      });
  }
```

In `src/ui/urlState.ts` read `ptr`, `kbd`, `dist`, `cam`, `mic` into `selection.media` (skip absent keys) and write them only when overridden. In `src/ui/App.tsx` add a "Pointer" select (`Fine | Coarse | Blunt | None`) and a "Keyboard kind" select setting `sel.media`. In `src/ui/Inspector.tsx` add a row `['Media', `${m.pointerPrecision} pointer · ${m.keyboardKind} keyboard · ${m.viewingDistance} · camera ${m.hasCamera ? 'yes' : 'no'} · mic ${m.hasMicrophone ? 'yes' : 'no'} · ${m.windowPosture}`]` with `const m = env.media`.

- [ ] **Step 4: Run tests and verify**

Run: `npx tsc -b && npx vitest run` — Expected: PASS.
Open `http://localhost:5199/?device=chromebook&win=freeform&screen=home` (inspector shows Fine / Physical / Medium) and `?device=pixel-tablet&ptr=Fine` (override round-trips).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/environment.ts packages/core/src/engine/android.ts packages/core/src/engine/ios.ts packages/core/src/engine/media.test.ts
git commit -m "Resolve media-query facts per device with category defaults and overrides"
git add src/config/schema.ts packages/core/src/engine/layout.ts packages/core/src/engine/checks.ts
git commit -m "Let rules match on pointer, keyboard and viewing distance, and check touch targets"
git add src/ui/urlState.ts src/ui/App.tsx src/ui/Inspector.tsx
git commit -m "Show and override media facts in the inspector, controls and URL"
```

---

## Self-review notes

- Spec §3 (devices, cover policy, media schema) is delivered by Dobra's Catalog slice; Task 11 consumes it. §4 scenes → Tasks 5–6. §5 Grid/FlexBox → Tasks 7–8. §6 checks → Tasks 9–10 (`touch-target` in Task 11 because it needs pointer precision). §7 validation → schema steps in Tasks 5 and 8. §8 fixtures #1, #2, #5 → Task 9. §9 window states → Tasks 1–4.
- Types used across tasks: `WindowPlacement` (T1→T2, T3), `EnvNote` (T2→T3), `SceneLayout` (T5→T6, T9), `ResolvedItems` (T7→T8, T9), `Finding`/`Target` (T9→T10, T11), `MediaFacts` (T11).
