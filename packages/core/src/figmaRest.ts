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
