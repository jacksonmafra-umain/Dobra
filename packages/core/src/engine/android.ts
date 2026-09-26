// Android devices: size classes come from the window size in dp (WindowSizeClass), and insets
// are resolved per WindowInsets type for the current rotation and navigation mode.
import type { DeviceSpec, Rect, SimulatorConfig } from '../config/types';
import type { Environment, InsetPart, Insets, Selection } from './environment';
import { splitRegions, type FoldFeature } from './folds';
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
  const postures = device.postures ?? [];
  const posture = postures.length
    ? (postures.find((p) => p.id === sel.pose) ?? postures.find((p) => p.display === sel.displayId) ?? postures[0])
    : null;
  const [, display] = findAndroidDisplay(device, posture?.display ?? sel.displayId);
  const rotationLocked = !display.rotation.supported || posture?.rotation !== undefined;
  const rotation = !display.rotation.supported ? 0 : (posture?.rotation ?? sel.rotation ?? 0);
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
  const folds = (posture?.features ?? []).map((f) => {
    const h = display.hinges!.find((x) => x.id === f.hinge)!;
    return foldFeature(h, f.state, natural, rotation);
  });

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
    pose: posture,
    poses: postures,
    folds,
    regions: splitRegions(width, height, folds),
    reservedRegions: [],
    cameraActive: false,
    liveActivity: false,
    android: {
      density: display.density,
      rotation,
      navMode,
      parts,
      statusBarHeight,
      cutout,
      navigationBar,
      coverScreen: display.coverScreen ?? null,
      rotationLocked,
    },
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

type HingeSpec = NonNullable<AndroidDisplaySpec['hinges']>[number];

/**
 * androidx.window FoldingFeature for one hinge in window coordinates. isSeparating is true when the
 * hinge is HALF_OPENED or physically occludes content; that, not the state, decides a split.
 */
export function foldFeature(
  h: HingeSpec,
  state: 'FLAT' | 'HALF_OPENED',
  natural: { width: number; height: number },
  rotation: 0 | 90,
): FoldFeature {
  const nat =
    h.axis === 'vertical'
      ? { x: h.position, y: 0, width: h.width, height: natural.height }
      : { x: 0, y: h.position, width: natural.width, height: h.width };
  // ROTATION_90: natural (x, y) lands at (y, naturalWidth - x).
  const rect = rotation === 90 ? { x: nat.y, y: natural.width - nat.x - nat.width, width: nat.height, height: nat.width } : nat;
  const axis = rotation === 90 ? (h.axis === 'vertical' ? 'horizontal' : 'vertical') : h.axis;
  const isSeparating = state === 'HALF_OPENED' || h.occlusion === 'FULL';
  return {
    axis,
    rect,
    separating: isSeparating,
    occludes: h.occlusion === 'FULL',
    estimated: !!h.estimated,
    android: {
      orientation: axis === 'vertical' ? 'VERTICAL' : 'HORIZONTAL',
      state,
      occlusionType: h.occlusion,
      isSeparating,
    },
  };
}
