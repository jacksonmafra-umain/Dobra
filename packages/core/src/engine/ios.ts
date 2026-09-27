// iOS devices: explicit size-class tables per orientation, safe areas, Dynamic Island and poses.
import type {
  DeviceSpec,
  DisplaySpec,
  IosDeviceSpec,
  Orientation,
  Rect,
  ReservedRegionSpec,
  SimulatorConfig,
} from '../config/types';
import type { Environment, ReservedRegion, Selection } from './environment';
import { splitRegions, type FoldFeature } from './folds';

function findDisplay(device: IosDeviceSpec, id: string): DisplaySpec {
  const display = device.displays[id] ?? Object.values(device.displays)[0];
  if (!display) throw new Error(`Device "${device.id}" has no displays`);
  return display;
}

export function resolveIosDevice(config: SimulatorConfig, spec: DeviceSpec, sel: Selection): Environment {
  const device = spec as IosDeviceSpec;
  const profile = config.platforms.ios;
  const poses = device.poses ?? [];
  const pose = poses.length
    ? (poses.find((p) => p.id === sel.pose) ?? poses.find((p) => p.display === sel.displayId) ?? poses[0])
    : null;
  const display = findDisplay(device, pose ? pose.display : sel.displayId);
  const available = Object.keys(display.orientations) as Orientation[];
  const supported = pose ? available.filter((o) => pose.orientations.includes(o)) : available;
  const orientation = supported.includes(sel.orientation) ? sel.orientation : supported[0];
  const spec2 = display.orientations[orientation]!;
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

  const folds: FoldFeature[] = [];
  const hinge = display.hardware.fold;
  if (pose?.folded && hinge) {
    const w = hinge.width;
    // The hinge runs top to bottom when the device is held like a book (landscape).
    folds.push(
      orientation === 'landscape'
        ? { axis: 'vertical', rect: { x: (width - w) / 2, y: 0, width: w, height }, separating: true, occludes: w > 0, estimated: !!hinge.estimated }
        : { axis: 'horizontal', rect: { x: 0, y: (height - w) / 2, width, height: w }, separating: true, occludes: w > 0, estimated: !!hinge.estimated },
    );
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
  const cameraRegion = spec2.barAxis === 'vertical' && trailingCamera ? (display.hardware.camera?.region ?? 0) : 0;

  const keyboard = display.keyboard;
  const ime = sel.ime && keyboard ? keyboard[orientation] : 0;
  const safeArea = ime ? { ...spec2.safeArea, bottom: Math.max(spec2.safeArea.bottom, ime) } : spec2.safeArea;

  return {
    platform: 'ios',
    unit: profile.unit,
    typeUnit: profile.typeUnit,
    deviceName: device.name,
    displayLabel: display.label,
    isFree: false,
    width,
    height,
    display: { width, height },
    window: { mode: 'fullscreen', rect: { x: 0, y: 0, width, height }, floating: false, captionBar: 0, other: null, divider: null },
    ime,
    notes: [],
    orientation,
    sizeClass: { system: 'uikit', ...spec2.sizeClass },
    barAxis: spec2.barAxis,
    safeArea,
    statusBar: spec2.statusBar,
    homeIndicator: display.homeIndicator,
    cornerRadius: display.cornerRadius,
    dynamicIsland,
    cameraRegion,
    estimated: display.estimated || !!spec2.sizeClass.estimated || spec2.safeArea.source === 'estimated',
    supportedOrientations: supported,
    pose,
    poses,
    folds,
    regions: splitRegions(width, height, folds),
    reservedRegions,
    cameraActive,
    liveActivity,
    android: null,
  };
}

function anchorFor(region: ReservedRegionSpec, orientation: Orientation) {
  return typeof region.anchor === 'string' ? region.anchor : (region.anchor[orientation] ?? 'top-right');
}
