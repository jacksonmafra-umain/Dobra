// What Chrome on a real Android device reports about a checked frame: where it ran (runtime) and
// what it said about the window and the fold (signals), and the rules that read those signals.
import type { Finding, Target } from './engine/checks';
import { walk, type GeoNode } from './geo';

export interface FrameRuntime {
  kind: 'android-chrome';
  serial: string;
  model: string;
  android: string;
  chrome: string;
  emulator: boolean;
}

export interface FrameSignals {
  viewport: { width: number; height: number; dpr: number };
  devicePosture: 'continuous' | 'folded' | null;
  segments: { x: number; y: number; width: number; height: number }[] | null;
  mq: { horizontalSegments2: boolean; verticalSegments2: boolean; postureFolded: boolean };
  /** The committed device state when the frame was read, for fold-posture-mismatch. */
  deviceState: 'CLOSED' | 'HALF_OPENED' | 'OPENED' | null;
}

/** How close, in CSS px, an element's edge must be to the fold to count as laid out along it. This design's choice, like the thresholds in rules.ts. */
export const FOLD_EDGE_TOLERANCE = 8;
/** Chrome reports viewport segments and devicePosture from this version. */
export const FOLD_API_CHROME = 138;

export const chromeMajor = (version: string): number => Number(/^(\d+)/.exec(version)?.[1] ?? 0);

/** The fold-API rules for one frame: only on Chrome that reports the fold. */
export function signalFindings(signals: FrameSignals, runtime: FrameRuntime, root: GeoNode[], target: Target): Finding[] {
  if (chromeMajor(runtime.chrome) < FOLD_API_CHROME) return [];
  const out: Finding[] = [];
  const segs = signals.segments;
  if (segs && segs.length === 2) {
    const [a, b] = segs;
    const sideBySide = b.x > a.x;
    const edges = sideBySide ? [a.x + a.width, b.x] : [a.y + a.height, b.y];
    const along = sideBySide ? Math.min(a.height, b.height) : Math.min(a.width, b.width);
    const lined = walk(root).some(({ node: { rect: r } }) => {
      const [start, end, length] = sideBySide ? [r.x, r.x + r.width, r.height] : [r.y, r.y + r.height, r.width];
      return length >= along / 2 && [start, end].some((e) => edges.some((f) => Math.abs(e - f) <= FOLD_EDGE_TOLERANCE));
    });
    if (!lined) {
      const gap = sideBySide ? { x: edges[0], y: 0, width: edges[1] - edges[0], height: along } : { x: 0, y: edges[0], width: along, height: edges[1] - edges[0] };
      out.push({
        ruleId: 'fold-layout-missing',
        severity: 'warn',
        target,
        nodeId: 'page',
        rect: gap,
        message: 'Chrome reports the window as two segments, but nothing on the page lines up with the fold: the layout ignores it.',
        source: 'estimated',
        estimated: true,
      });
    }
  }
  if (signals.deviceState === 'HALF_OPENED' && signals.devicePosture !== 'folded') {
    out.push({
      ruleId: 'fold-posture-mismatch',
      severity: 'info',
      target,
      nodeId: 'page',
      rect: { x: 0, y: 0, width: signals.viewport.width, height: signals.viewport.height },
      message: `The device is half-open, but navigator.devicePosture says "${signals.devicePosture ?? 'nothing'}": the page may be overriding it, or the API is off.`,
      source: 'estimated',
      estimated: true,
    });
  }
  return out;
}
