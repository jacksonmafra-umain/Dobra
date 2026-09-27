// src/engine/window.ts
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
