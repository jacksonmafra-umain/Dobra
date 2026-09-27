// Turns a core PresetFrame into a tagged Figma frame with a locked overlay and layout grids.
import type { PresetFrame } from '@dobra/core/presets';
import type { FigmaApi } from './api';

export const NAMESPACE = 'dobra';
export const OVERLAY_NAME = '⎔ hinge-overlay';
const GAP = 80;
const RED = { r: 0.94, g: 0.27, b: 0.27 };
const BLUE = { r: 0.23, g: 0.51, b: 0.96 };
const AMBER = { r: 0.96, g: 0.62, b: 0.04 };

type Box = { x: number; y: number; width: number; height: number };

/** The x just right of everything on the page, so new frames never land on existing ones. */
export function nextFreeX(api: FigmaApi, gap = GAP): number {
  return api.currentPage.children.reduce((x, n) => Math.max(x, n.x + n.width + gap), 0);
}

function box(api: FigmaApi, parent: FrameNode, name: string, r: Box, color: RGB, opacity: number) {
  if (r.width <= 0 || r.height <= 0) return;
  const rect = api.createRectangle();
  rect.name = name;
  rect.resize(r.width, r.height);
  parent.appendChild(rect);
  rect.x = r.x;
  rect.y = r.y;
  rect.fills = [{ type: 'SOLID', color, opacity }];
}

/** Makes a frame an artboard for a preset: tag, relaunch button, grids and a fresh locked overlay. */
export function decorate(api: FigmaApi, frame: FrameNode, p: PresetFrame, catalogVersion: string): void {
  frame.children.find((c) => c.name === OVERLAY_NAME)?.remove();
  frame.cornerRadius = p.cornerRadius;
  frame.clipsContent = true;
  frame.setSharedPluginData(NAMESPACE, 'target', p.key);
  frame.setSharedPluginData(NAMESPACE, 'catalogVersion', catalogVersion);
  frame.setRelaunchData({ check: '' });
  const grids: LayoutGrid[] = [
    { pattern: 'COLUMNS', alignment: 'STRETCH', count: p.grid.columns, gutterSize: p.grid.gutter, offset: p.grid.margin, visible: true, color: { ...BLUE, a: 0.08 } },
  ];
  if (p.paneGrid) {
    // Equal panes: a stretch grid whose gutters sit exactly on the hinges.
    grids.push({
      pattern: p.paneGrid.axis === 'vertical' ? 'COLUMNS' : 'ROWS',
      alignment: 'STRETCH',
      count: p.paneGrid.count,
      gutterSize: p.paneGrid.gutter,
      offset: 0,
      visible: true,
      color: { ...RED, a: 0.1 },
    });
  } else {
    // Uneven panes (an off-centre hinge): one grid per hinge, whose single section ends where the hinge starts.
    for (const e of p.paneEdges) {
      grids.push({
        pattern: e.axis === 'vertical' ? 'COLUMNS' : 'ROWS',
        alignment: 'MIN',
        count: 1,
        sectionSize: e.at,
        gutterSize: 0,
        offset: 0,
        visible: true,
        color: { ...RED, a: 0.1 },
      });
    }
  }
  frame.layoutGrids = grids;

  const overlay = api.createFrame();
  overlay.name = OVERLAY_NAME;
  overlay.resize(p.width, p.height);
  overlay.fills = [];
  overlay.clipsContent = false;
  frame.appendChild(overlay);
  // In an auto-layout frame the overlay must not join the flow, or it lands below the content.
  if (frame.layoutMode !== 'NONE') overlay.layoutPositioning = 'ABSOLUTE';
  overlay.x = 0;
  overlay.y = 0;
  overlay.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

  const i = p.insets;
  box(api, overlay, 'Inset top', { x: 0, y: 0, width: p.width, height: i.top }, BLUE, 0.12);
  box(api, overlay, 'Inset bottom', { x: 0, y: p.height - i.bottom, width: p.width, height: i.bottom }, BLUE, 0.12);
  box(api, overlay, 'Inset left', { x: 0, y: 0, width: i.left, height: p.height }, BLUE, 0.12);
  box(api, overlay, 'Inset right', { x: p.width - i.right, y: 0, width: i.right, height: p.height }, BLUE, 0.12);
  for (const r of p.reserved) box(api, overlay, r.label, r.rect, AMBER, 0.3);
  for (const z of p.safeZones) box(api, overlay, 'Hinge safe zone', z, RED, 0.08);
  for (const h of p.hinges) box(api, overlay, 'Hinge', h.rect, RED, 0.2);
  // A crease with no width still gets a hairline so designers can see where it runs.
  for (const h of p.hinges) {
    if (h.rect.width === 0) box(api, overlay, 'Crease', { ...h.rect, x: h.rect.x - 0.5, width: 1 }, RED, 0.5);
    else if (h.rect.height === 0) box(api, overlay, 'Crease', { ...h.rect, y: h.rect.y - 0.5, height: 1 }, RED, 0.5);
  }
  overlay.locked = true;
}

export function applyPreset(api: FigmaApi, p: PresetFrame, catalogVersion: string): FrameNode {
  const x = nextFreeX(api);
  const frame = api.createFrame();
  frame.name = p.name;
  frame.resize(p.width, p.height);
  frame.x = x;
  frame.y = 0;
  decorate(api, frame, p, catalogVersion);
  return frame;
}
