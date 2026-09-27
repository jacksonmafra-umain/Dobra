// Android devices: size classes come from the window size in dp (WindowSizeClass), and insets
// are resolved per WindowInsets type for the current rotation and navigation mode.
import type { DeviceSpec, Rect } from '../config/types';
import type { AndroidDetails, EnvNote, Environment, InsetPart, Insets, Selection, EnvConfig } from './environment';
import { splitRegions, type FoldFeature } from './folds';
import { windowSizeClass } from './sizeClass';
import { clipParts, imeOverlap, placeWindow, translateFold } from './window';

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

export function resolveAndroidDevice(config: EnvConfig, spec: DeviceSpec, sel: Selection): Omit<Environment, 'media'> {
  const device = spec as AndroidDeviceSpec;
  const profile = config.platforms.android;
  const app = config.app.android;
  const notes: EnvNote[] = [];
  const postures = device.postures ?? [];
  const posture = postures.length
    ? (postures.find((p) => p.id === sel.pose) ?? postures.find((p) => p.display === sel.displayId) ?? postures[0])
    : null;
  const [, display] = findAndroidDisplay(device, posture?.display ?? sel.displayId);

  // Settings › Display size scales the density: the same panel reports fewer dp.
  const step = profile.displaySize.steps.find((s) => s.id === sel.displayScale) ?? profile.displaySize.steps.find((s) => s.factor === 1)!;
  const factor = step.factor;
  const natural = { width: Math.round(display.size.width / factor), height: Math.round(display.size.height / factor) };
  const density = display.density * factor;

  const canRotate = display.rotation.supported && posture?.rotation === undefined;
  let rotation: 0 | 90 = !display.rotation.supported ? 0 : (posture?.rotation ?? sel.rotation ?? 0);
  if (canRotate && sel.rotationLock && rotation !== 0) {
    rotation = 0;
    notes.push({ id: 'rotation-locked', text: 'Rotation lock is on: the display stays in its natural orientation and a rotate button appears in the navigation bar.', source: 'android-docs' });
  }

  // Window state. Cover screens and devices without the mode fall back to full screen.
  const offered = display.coverScreen ? ['fullscreen'] : device.windowModes;
  let mode = sel.windowMode ?? device.windowModes[0];
  if (!offered.includes(mode)) {
    notes.push({ id: 'window-mode-unavailable', text: `${device.name} does not offer ${mode} here; showing full screen.`, source: device.source });
    mode = 'fullscreen';
  }

  // screenOrientation="portrait": honoured on small screens, letterboxed on large ones before targetSdk 36.
  // Multi-window modes ignore orientation requests.
  const appPortrait = sel.appPortrait ?? app.screenOrientation === 'portrait';
  const targetSdk = sel.targetSdk ?? app.targetSdk;
  const sizeAt = (r: 0 | 90) => (r === 90 ? { width: natural.height, height: natural.width } : { ...natural });
  let letterbox = false;
  if (appPortrait && mode === 'fullscreen') {
    const d = sizeAt(rotation);
    const smallest = Math.min(d.width, d.height);
    if (d.width > d.height) {
      if (smallest >= 600 && targetSdk >= 36) {
        notes.push({ id: 'target-sdk-36', text: profile.notes.find((n) => n.id === 'target-sdk-36')?.text ?? 'targetSdk 36 ignores the orientation request.', source: 'android-docs' });
      } else if (smallest < 600 && canRotate) {
        rotation = rotation === 90 ? 0 : 90;
        notes.push({ id: 'portrait-request', text: 'The app requests portrait, so the system keeps the display in portrait for it.', source: 'android-docs' });
      } else if (smallest >= 600) {
        letterbox = true;
        notes.push({ id: 'letterboxed', text: `The app requests portrait below targetSdk 36, so it is letterboxed in a portrait window.`, source: 'estimated' });
      }
    }
  }

  const navMode = sel.navMode ?? 'gesture';
  const { width: W, height: H } = sizeAt(rotation);
  const displaySize = { width: W, height: H };
  const place = (naturalEdge: Edge): Edge => (rotation === 90 ? ROTATED_EDGE[naturalEdge] : naturalEdge);
  const ins = display.insets;
  const source = ins.source;

  const displayParts: InsetPart[] = [];
  if (ins.statusBar) displayParts.push({ kind: 'statusBar', insets: edgeInsets('top', ins.statusBar), source });
  let cutout: Rect | null = null;
  if (ins.cutout) {
    const edge = place(ins.cutout.edge);
    displayParts.push({ kind: 'displayCutout', insets: edgeInsets(edge, ins.cutout.size), source });
    if (ins.cutout.hole) cutout = holeRect(ins.cutout.hole, ins.cutout.size, edge, W, H);
  }
  if (ins.waterfall) {
    const w = ins.waterfall;
    displayParts.push({ kind: 'waterfall', insets: { ...NO_INSETS, [place('left')]: w, [place('right')]: w }, source });
  }
  const nav = ins.navigationBar;
  const navigationBar: AndroidDetails['navigationBar'] =
    navMode === 'gesture'
      ? { edge: 'bottom', size: nav.gesture }
      : { edge: rotation === 90 && nav.threeButtonLandscape === 'side' ? 'right' : 'bottom', size: nav.threeButton };
  if (navigationBar.size) displayParts.push({ kind: 'navigationBar', insets: edgeInsets(navigationBar.edge, navigationBar.size), source });

  const bottomReserved = navigationBar.edge === 'bottom' ? navigationBar.size : 0;
  let placement = placeWindow(profile.windowModes, displaySize, bottomReserved, {
    mode,
    splitRatio: sel.splitRatio,
    splitSide: sel.splitSide,
    size: sel.windowSize,
  });
  if (letterbox && mode === 'fullscreen') {
    const width = Math.round((H * H) / W);
    placement = { ...placement, rect: { x: (W - width) / 2, y: 0, width, height: H } };
  }
  const rect = placement.rect;

  const parts: InsetPart[] = placement.floating ? [] : clipParts(displayParts, displaySize, rect);
  if (placement.captionBar) parts.push({ kind: 'captionBar', insets: edgeInsets('top', placement.captionBar), source: profile.windowModes.freeform.source });
  const imeHeight = sel.ime && mode !== 'pip' ? ins.ime[W > H ? 'landscape' : 'portrait'] : 0;
  const ime = imeOverlap(displaySize, rect, imeHeight);
  if (ime) parts.push({ kind: 'ime', insets: edgeInsets('bottom', ime), source });

  const union = unionInsets(parts);
  const width = rect.width;
  const height = rect.height;
  const folds = (posture?.features ?? [])
    .map((f) => foldFeature(display.hinges!.find((x) => x.id === f.hinge)!, f.state, natural, rotation))
    .map((f) => translateFold(f, rect))
    .filter((f): f is NonNullable<typeof f> => !!f);

  return {
    platform: 'android',
    unit: profile.unit,
    typeUnit: profile.typeUnit,
    deviceName: device.name,
    displayLabel: display.label,
    isFree: false,
    width,
    height,
    display: displaySize,
    window: placement,
    ime,
    notes,
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
      density,
      rotation,
      navMode,
      parts,
      statusBarHeight: Math.max(ins.statusBar, unionInsets(displayParts).top),
      cutout,
      navigationBar,
      coverScreen: display.coverScreen ?? null,
      rotationLocked: !canRotate,
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
