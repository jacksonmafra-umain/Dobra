// src/engine/gridFlex.ts
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
