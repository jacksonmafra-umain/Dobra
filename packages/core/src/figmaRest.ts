// Figma REST JSON → the core geometry tree, with the same roles as the plugin's adapter.
import type { GeoNode, GeoRole } from './geo';
import { DEFAULT_PATTERNS, IMPORTANCE_KEY, importanceOf, nameRole, parsePatterns, PATTERNS_KEY, type NamePatterns } from './namePatterns';

export const OVERLAY_NAME = '⎔ hinge-overlay';
export { DEFAULT_PATTERNS, type NamePatterns } from './namePatterns';
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
  return node.sharedPluginData?.dobra?.target ?? '';
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

/** A file's name patterns, stored by the plugin on the document; the defaults when there are none. */
export function patternsFromDocument(document: RestNode): NamePatterns {
  return parsePatterns(document.sharedPluginData?.dobra?.[PATTERNS_KEY] ?? '');
}

export function roleOfRest(n: RestNode, patterns: NamePatterns = DEFAULT_PATTERNS): GeoRole {
  if (n.type === 'TEXT') return 'text';
  const byName = nameRole(n.name, patterns);
  if (byName) return byName;
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

export function restToGeo(frame: RestNode, patterns: NamePatterns = DEFAULT_PATTERNS): GeoNode[] {
  const origin = frame.absoluteBoundingBox ?? { x: 0, y: 0, width: 0, height: 0 };
  // A layer marked not important takes everything inside it along.
  const convert = (nodes: RestNode[], ignored = false): GeoNode[] =>
    nodes.flatMap((n) => {
      if (n.visible === false || n.name === OVERLAY_NAME || !n.absoluteBoundingBox) return [];
      const b = n.absoluteBoundingBox;
      const g: GeoNode = {
        id: n.id,
        name: n.name,
        role: roleOfRest(n, patterns),
        rect: { x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height },
        scrollAxis: SCROLL[n.overflowDirection ?? ''] ?? 'none',
        layout: LAYOUT[n.layoutMode ?? ''] ?? 'none',
        ...(n.clipsContent ? { clips: true } : {}),
      };
      const mark = importanceOf(n.sharedPluginData?.dobra?.[IMPORTANCE_KEY]);
      const ignore = ignored || mark === 'ignore';
      if (mark === 'important' && !ignored) g.important = true;
      if (ignore) g.ignore = true;
      if (n.type === 'TEXT') {
        g.chars = (n.characters ?? '').length;
        if (n.style?.fontSize) g.fontSize = n.style.fontSize;
      }
      if (n.children?.length) g.children = convert(n.children, ignore);
      return [g];
    });
  return convert(frame.children ?? []);
}
