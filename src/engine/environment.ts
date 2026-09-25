import type {
  BarAxis,
  DeviceSpec,
  DisplaySpec,
  Orientation,
  PoseSpec,
  Rect,
  ReservedRegionSpec,
  SafeArea,
  SimulatorConfig,
  Size,
  UIKitSizeClass,
} from '../config/types';

/** What the user picked in the controls. */
export interface Selection {
  deviceId: string;
  displayId: string;
  orientation: Orientation;
  free: Size | null;
  pose?: string;
  cameraActive?: boolean;
  liveActivity?: boolean;
}

export interface FoldRegion {
  axis: 'vertical' | 'horizontal';
  rect: Rect;
  regions: [Rect, Rect];
  estimated: boolean;
}

export interface ReservedRegion {
  id: string;
  label: string;
  rect: Rect;
  kind: 'camera' | 'live-activity';
  estimated: boolean;
}

/** The resolved space an app gets for one selection. */
export interface Environment {
  deviceName: string;
  displayLabel: string;
  isFree: boolean;
  width: number;
  height: number;
  orientation: Orientation;
  sizeClass: UIKitSizeClass;
  barAxis: BarAxis;
  safeArea: SafeArea;
  statusBar: boolean;
  homeIndicator: boolean;
  cornerRadius: number;
  dynamicIsland: Rect | null;
  cameraRegion: number;
  estimated: boolean;
  supportedOrientations: Orientation[];
  pose: PoseSpec | null;
  poses: PoseSpec[];
  fold: FoldRegion | null;
  reservedRegions: ReservedRegion[];
  cameraActive: boolean;
  liveActivity: boolean;
}

export function findDevice(config: SimulatorConfig, id: string): DeviceSpec {
  const device = config.devices.find((d) => d.id === id);
  if (!device) throw new Error(`Unknown device "${id}" in simulator.config.json`);
  return device;
}

export function findDisplay(device: DeviceSpec, id: string): DisplaySpec {
  const display = device.displays[id] ?? Object.values(device.displays)[0];
  if (!display) throw new Error(`Device "${device.id}" has no displays`);
  return display;
}

export function resolveEnvironment(config: SimulatorConfig, sel: Selection): Environment {
  if (sel.free) return freeEnvironment(config, sel.free);

  const device = findDevice(config, sel.deviceId);
  const poses = device.poses ?? [];
  const pose = poses.length
    ? (poses.find((p) => p.id === sel.pose) ?? poses.find((p) => p.display === sel.displayId) ?? poses[0])
    : null;
  const display = findDisplay(device, pose ? pose.display : sel.displayId);
  const available = Object.keys(display.orientations) as Orientation[];
  const supported = pose ? available.filter((o) => pose.orientations.includes(o)) : available;
  const orientation = supported.includes(sel.orientation) ? sel.orientation : supported[0];
  const spec = display.orientations[orientation]!;
  const { width: pw, height: ph } = display.portraitSize;
  const width = orientation === 'portrait' ? pw : ph;
  const height = orientation === 'portrait' ? ph : pw;

  let dynamicIsland: Rect | null = null;
  const island = display.hardware.dynamicIsland;
  if (island) {
    dynamicIsland =
      orientation === 'portrait'
        ? { x: (width - island.width) / 2, y: island.offset, width: island.width, height: island.height }
        : { x: island.offset, y: (height - island.width) / 2, width: island.height, height: island.width };
  }

  let fold: FoldRegion | null = null;
  const hinge = display.hardware.fold;
  if (pose?.folded && hinge) {
    const w = hinge.width;
    fold =
      orientation === 'landscape'
        ? {
            axis: 'vertical',
            rect: { x: (width - w) / 2, y: 0, width: w, height },
            regions: [
              { x: 0, y: 0, width: (width - w) / 2, height },
              { x: (width + w) / 2, y: 0, width: (width - w) / 2, height },
            ],
            estimated: !!hinge.estimated,
          }
        : {
            axis: 'horizontal',
            rect: { x: 0, y: (height - w) / 2, width, height: w },
            regions: [
              { x: 0, y: 0, width, height: (height - w) / 2 },
              { x: 0, y: (height + w) / 2, width, height: (height - w) / 2 },
            ],
            estimated: !!hinge.estimated,
          };
  }

  const cameraActive = !!sel.cameraActive;
  const liveActivity = !!sel.liveActivity;
  const reservedRegions: ReservedRegion[] = [];
  for (const region of display.reservedRegions ?? []) {
    if (region.when === 'camera-active' && !cameraActive) continue;
    const anchor = anchorFor(region, orientation);
    const live = region.liveActivity && liveActivity ? region.liveActivity : null;
    const w = live ? live.width : region.width;
    const h = live ? live.height : region.height;
    const top = live ? live.offsetTop : region.offsetTop;
    reservedRegions.push({
      id: region.id,
      label: live ? `${region.label} · Live Activity` : region.label,
      rect: { x: anchor === 'top-right' ? width - w : 0, y: top, width: w, height: h },
      kind: live ? 'live-activity' : 'camera',
      estimated: !!region.estimated,
    });
  }

  const trailingCamera = reservedRegions.some((r) => r.kind === 'camera' && r.rect.x > 0);
  const cameraRegion =
    spec.barAxis === 'vertical' && trailingCamera ? (display.hardware.camera?.region ?? 0) : 0;

  return {
    deviceName: device.name,
    displayLabel: display.label,
    isFree: false,
    width,
    height,
    orientation,
    sizeClass: spec.sizeClass,
    barAxis: spec.barAxis,
    safeArea: spec.safeArea,
    statusBar: spec.statusBar,
    homeIndicator: display.homeIndicator,
    cornerRadius: display.cornerRadius,
    dynamicIsland,
    cameraRegion,
    estimated: display.estimated || !!spec.sizeClass.estimated || spec.safeArea.source === 'estimated',
    supportedOrientations: supported,
    pose,
    poses,
    fold,
    reservedRegions,
    cameraActive,
    liveActivity,
  };
}

function anchorFor(region: ReservedRegionSpec, orientation: Orientation) {
  return typeof region.anchor === 'string' ? region.anchor : (region.anchor[orientation] ?? 'top-right');
}

function freeEnvironment(config: SimulatorConfig, size: Size): Environment {
  const { regularWidthMin, regularHeightMin, barAxis } = config.freeResize;
  return {
    deviceName: 'Free resize',
    displayLabel: 'Custom size',
    isFree: true,
    width: size.width,
    height: size.height,
    orientation: size.width > size.height ? 'landscape' : 'portrait',
    sizeClass: {
      horizontal: size.width >= regularWidthMin ? 'regular' : 'compact',
      vertical: size.height >= regularHeightMin ? 'regular' : 'compact',
    },
    barAxis,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0, source: 'free-resize' },
    statusBar: false,
    homeIndicator: false,
    cornerRadius: 0,
    dynamicIsland: null,
    cameraRegion: 0,
    estimated: false,
    supportedOrientations: ['portrait', 'landscape'],
    pose: null,
    poses: [],
    fold: null,
    reservedRegions: [],
    cameraActive: false,
    liveActivity: false,
  };
}

export function formatSizeClass(sc: UIKitSizeClass): string {
  return `w${capitalize(sc.horizontal)} · h${capitalize(sc.vertical)}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
