// A platform-neutral tree of what is drawn in a frame. Figma nodes, DOM elements and the
// simulator's layout all become GeoNodes, so one rule engine checks all three.
import type { Rect } from './config/types';
import type { Target } from './engine/checks';

export type GeoRole = 'text' | 'interactive' | 'media' | 'container' | 'chrome';

export interface GeoNode {
  id: string;
  name: string;
  role: GeoRole;
  /** In the frame's coordinates. */
  rect: Rect;
  fontSize?: number;
  /** Text length, for text nodes. */
  chars?: number;
  /** This node scrolls its children along this axis. */
  scrollAxis?: 'x' | 'y' | 'none';
  layout?: 'horizontal' | 'vertical' | 'none';
  /** This node crops its children (Figma clipsContent, CSS overflow hidden). */
  clips?: boolean;
  children?: GeoNode[];
}

export interface Subject {
  source: 'figma' | 'web' | 'simulator';
  ref: string;
  /** More than one when the frame was matched by size only. */
  targets: Target[];
  confidence: 'tag' | 'name' | 'size';
  width: number;
  height: number;
  root: GeoNode[];
}

export interface Placed {
  node: GeoNode;
  depth: number;
  /** Axis of the nearest scrolling ancestor. */
  scrolls: 'x' | 'y' | 'none';
  /** Inside an ancestor that crops its children. */
  clipped: boolean;
  parent: GeoNode | null;
}

export function walk(root: GeoNode[]): Placed[] {
  const out: Placed[] = [];
  const visit = (nodes: GeoNode[], depth: number, scrolls: Placed['scrolls'], clipped: boolean, parent: GeoNode | null) => {
    for (const node of nodes) {
      out.push({ node, depth, scrolls, clipped, parent });
      const inner = node.scrollAxis && node.scrollAxis !== 'none' ? node.scrollAxis : scrolls;
      visit(node.children ?? [], depth + 1, inner, clipped || !!node.clips, node);
    }
  };
  visit(root, 0, 'none', false, null);
  return out;
}

/** Keeps each picked node unless an ancestor was picked too: report the card, not every button in it. */
export function outermost(placed: Placed[], pick: (n: GeoNode) => boolean): Placed[] {
  const out: Placed[] = [];
  const picked = new Set<GeoNode>();
  const parentOf = new Map<GeoNode, GeoNode | null>(placed.map((p) => [p.node, p.parent]));
  for (const p of placed) {
    if (!pick(p.node)) continue;
    let up = p.parent;
    let nested = false;
    while (up) {
      if (picked.has(up)) {
        nested = true;
        break;
      }
      up = parentOf.get(up) ?? null;
    }
    if (!nested) out.push(p);
    picked.add(p.node);
  }
  return out;
}
