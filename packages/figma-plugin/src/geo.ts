// Figma nodes → the core geometry tree. Rects are relative to the frame being checked.
import type { GeoNode, GeoRole } from '@hinge/core/geo';
import { OVERLAY_NAME } from './presets';

/** Layer names treated as tappable. Edit to match a design system's naming. */
export const INTERACTIVE_NAME = /\b(button|btn|cta|link|chip|tab(?! ?bar)|toggle|switch|checkbox|radio|input|field|fab|card)\b/i;
/** Layer names treated as system or app chrome. */
export const CHROME_NAME = /\b(nav(igation)?|tab ?bar|tool ?bar|app ?bar|bottom ?bar|status ?bar|header|footer)\b/i;

/** Instances smaller than this on either side are icons, dividers or badges, not controls. */
const MIN_CONTROL_SIDE = 32;

export function roleOf(node: SceneNode): GeoRole {
  if (node.type === 'TEXT') return 'text';
  if (CHROME_NAME.test(node.name)) return 'chrome';
  if (INTERACTIVE_NAME.test(node.name)) return 'interactive';
  if (node.type === 'INSTANCE' && Math.min(node.width, node.height) >= MIN_CONTROL_SIDE) return 'interactive';
  const fills = 'fills' in node && Array.isArray(node.fills) ? (node.fills as readonly Paint[]) : [];
  if (fills.some((f) => f.type === 'IMAGE' || f.type === 'VIDEO')) return 'media';
  return 'container';
}

function scrollOf(n: SceneNode): GeoNode['scrollAxis'] {
  if (!('overflowDirection' in n)) return 'none';
  if (n.overflowDirection === 'HORIZONTAL') return 'x';
  return n.overflowDirection === 'VERTICAL' || n.overflowDirection === 'BOTH' ? 'y' : 'none';
}

function layoutOf(n: SceneNode): GeoNode['layout'] {
  if (!('layoutMode' in n)) return 'none';
  return n.layoutMode === 'HORIZONTAL' ? 'horizontal' : n.layoutMode === 'VERTICAL' ? 'vertical' : 'none';
}

/** Walks a frame's visible layers, pausing every `yieldEvery` layers so Figma stays responsive. */
export async function toGeo(frame: FrameNode, onProgress?: (visited: number) => void, yieldEvery = 500): Promise<GeoNode[]> {
  const origin = frame.absoluteBoundingBox ?? { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  let visited = 0;
  const convert = async (nodes: readonly SceneNode[]): Promise<GeoNode[]> => {
    const out: GeoNode[] = [];
    for (const n of nodes) {
      if (!n.visible || n.name === OVERLAY_NAME) continue;
      if (++visited % yieldEvery === 0) {
        onProgress?.(visited);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const box = n.absoluteBoundingBox ?? { x: n.x, y: n.y, width: n.width, height: n.height };
      const g: GeoNode = {
        id: n.id,
        name: n.name,
        role: roleOf(n),
        rect: { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height },
        scrollAxis: scrollOf(n),
        layout: layoutOf(n),
        ...('clipsContent' in n && n.clipsContent ? { clips: true } : {}),
      };
      if (n.type === 'TEXT') {
        g.chars = n.characters.length;
        if (typeof n.fontSize === 'number') g.fontSize = n.fontSize;
      }
      // Instances are walked too, so text inside a card component is checked for legibility.
      if ('children' in n) g.children = await convert(n.children);
      out.push(g);
    }
    return out;
  };
  return convert(frame.children);
}
