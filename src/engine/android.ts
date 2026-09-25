// Android devices: size classes come from the window size in dp (WindowSizeClass), and insets
// are resolved per WindowInsets type for the current rotation and navigation mode.
import type { DeviceSpec, Rect, SimulatorConfig } from '../config/types';
import type { Environment, InsetPart, Insets, Selection } from './environment';
import { splitRegions } from './folds';
import { windowSizeClass } from './sizeClass';

type AndroidDeviceSpec = Extract<DeviceSpec, { platform: 'android' }>;
export type AndroidDisplaySpec = AndroidDeviceSpec['displays'][string];
type Edge = keyof Insets;

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Where a natural edge ends up after rotating the display 90° (ROTATION_90). */
const ROTATED_EDGE: Record<Edge, Edge> = { top: 'left', left: 'bottom', bottom: 'right', right: 'top' };

export function findAndroidDisplay(device: AndroidDeviceSpec, id: string | undefined): [string, AndroidDisplaySpec] {
  const entries = Object.entries(device.displays);
  const found = entries.find(([key]) => key === id) ?? entries[0];
  if (!found) throw new Error(`Device "${device.id}" has no displays`);
  return found;
}

function edgeInsets(edge: Edge, size: number): Insets {
  return { ...NO_INSETS, [edge]: size };
}

export function unionInsets(parts: InsetPart[]): Insets {
  const out = { ...NO_INSETS };
  for (const p of parts) {
    for (const e of ['top', 'right', 'bottom', 'left'] as const) out[e] = Math.max(out[e], p.insets[e]);
  }
  return out;
}

export function resolveAndroidDevice(config: SimulatorConfig, spec: DeviceSpec, sel: Selection): Environment {
  const device = spec as AndroidDeviceSpec;
  const profile = config.platforms.android;
  const [, display] = findAndroidDisplay(device, sel.displayId);
  const rotation = display.rotation.supported ? (sel.rotation ?? 0) : 0;
  const navMode = sel.navMode ?? 'gesture';
  const natural = display.size;
  const width = rotation === 90 ? natural.height : natural.width;
  const height = rotation === 90 ? natural.width : natural.height;
  const place = (naturalEdge: Edge): Edge => (rotation === 90 ? ROTATED_EDGE[naturalEdge] : naturalEdge);
  const ins = display.insets;
  const source = ins.source;

  const parts: InsetPart[] = [];
  // The status bar is always along the top of the current orientation.
  if (ins.statusBar) parts.push({ kind: 'statusBar', insets: edgeInsets('top', ins.statusBar), source });

  let cutout: Rect | null = null;
  if (ins.cutout) {
    const edge = place(ins.cutout.edge);
    parts.push({ kind: 'displayCutout', insets: edgeInsets(edge, ins.cutout.size), source });
    if (ins.cutout.hole) cutout = holeRect(ins.cutout.hole, ins.cutout.size, edge, width, height);
  }

  if (ins.waterfall) {
    const w = ins.waterfall;
    parts.push({ kind: 'waterfall', insets: { ...NO_INSETS, [place('left')]: w, [place('right')]: w }, source });
  }

  let navigationBar: { edge: 'bottom' | 'right' | 'left'; size: number } | null = null;
  const nav = ins.navigationBar;
  if (navMode === 'gesture') {
    navigationBar = { edge: 'bottom', size: nav.gesture };
  } else {
    const side = rotation === 90 && nav.threeButtonLandscape === 'side';
    navigationBar = { edge: side ? 'right' : 'bottom', size: nav.threeButton };
  }
  if (navigationBar.size) parts.push({ kind: 'navigationBar', insets: edgeInsets(navigationBar.edge, navigationBar.size), source });

  const union = unionInsets(parts);
  const statusBarHeight = Math.max(ins.statusBar, union.top);
  const folds = [] as Environment['folds'];

  return {
    platform: 'android',
    unit: profile.unit,
    typeUnit: profile.typeUnit,
    deviceName: device.name,
    displayLabel: display.label,
    isFree: false,
    width,
    height,
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
    pose: null,
    poses: [],
    folds,
    regions: splitRegions(width, height, folds),
    reservedRegions: [],
    cameraActive: false,
    liveActivity: false,
    android: { density: display.density, rotation, navMode, parts, statusBarHeight, cutout, navigationBar },
  };
}

/** The punch-hole camera, centred in the cutout inset on its edge. */
function holeRect(
  hole: { diameter: number; offset: number },
  inset: number,
  edge: Edge,
  width: number,
  height: number,
): Rect {
  const d = hole.diameter;
  const across = (inset - d) / 2;
  switch (edge) {
    case 'top':
      return { x: width * hole.offset - d / 2, y: across, width: d, height: d };
    case 'bottom':
      return { x: width * (1 - hole.offset) - d / 2, y: height - across - d, width: d, height: d };
    case 'left':
      return { x: across, y: height * (1 - hole.offset) - d / 2, width: d, height: d };
    case 'right':
      return { x: width - across - d, y: height * hole.offset - d / 2, width: d, height: d };
  }
}
