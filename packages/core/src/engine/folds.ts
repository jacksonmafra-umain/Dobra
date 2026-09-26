import type { Rect } from '../config/types';

/**
 * A hinge or fold running through the window. Platform-neutral geometry, plus the androidx.window
 * FoldingFeature fields on Android.
 */
export interface FoldFeature {
  axis: 'vertical' | 'horizontal';
  rect: Rect;
  /** Splits the window into logical areas. This, not the fold state, decides whether a layout splits. */
  separating: boolean;
  /** A physical gap hides content in `rect`. */
  occludes: boolean;
  estimated: boolean;
  android?: {
    orientation: 'VERTICAL' | 'HORIZONTAL';
    state: 'FLAT' | 'HALF_OPENED';
    occlusionType: 'NONE' | 'FULL';
    isSeparating: boolean;
  };
}

/** Splits a window into logical areas along every separating fold. */
export function splitRegions(width: number, height: number, folds: FoldFeature[]): Rect[] {
  let regions: Rect[] = [{ x: 0, y: 0, width, height }];
  for (const fold of folds.filter((f) => f.separating)) {
    regions = regions.flatMap((r) => {
      if (fold.axis === 'vertical') {
        const cut = fold.rect.x;
        const end = fold.rect.x + fold.rect.width;
        if (cut <= r.x || end >= r.x + r.width) return [r];
        return [
          { ...r, width: cut - r.x },
          { ...r, x: end, width: r.x + r.width - end },
        ];
      }
      const cut = fold.rect.y;
      const end = fold.rect.y + fold.rect.height;
      if (cut <= r.y || end >= r.y + r.height) return [r];
      return [
        { ...r, height: cut - r.y },
        { ...r, y: end, height: r.y + r.height - end },
      ];
    });
  }
  return regions;
}

/** The fold the HIG / Material rules adapt to: the first separating one. */
export function separatingFold(env: { folds: FoldFeature[] }): FoldFeature | null {
  return env.folds.find((f) => f.separating) ?? null;
}

/** Thickness of a fold across its axis. */
export function foldThickness(fold: FoldFeature): number {
  return fold.axis === 'vertical' ? fold.rect.width : fold.rect.height;
}

