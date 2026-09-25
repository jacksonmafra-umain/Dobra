import type { BarAxis, DeviceSpec, Orientation, Platform, PoseSpec, Rect, SafeArea, SimulatorConfig, Size } from '../config/types';
import { resolveIosDevice } from './ios';
import type { FoldFeature } from './folds';
import { windowSizeClass, type SizeClass } from './sizeClass';

export type { FoldFeature } from './folds';
export type { SizeClass } from './sizeClass';

/** What the user picked in the controls. */
export interface Selection {
  deviceId: string;
  displayId: string;
  orientation: Orientation;
  /** Device-less window. Its platform decides the vocabulary. */
  free: Size | null;
  freePlatform?: Platform;
  pose?: string;
  cameraActive?: boolean;
  liveActivity?: boolean;
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
  platform: Platform;
  /** Layout unit: pt on iOS, dp on Android. */
  unit: string;
  /** Type unit: pt on iOS, sp on Android. */
  typeUnit: string;
  deviceName: string;
  displayLabel: string;
  isFree: boolean;
  width: number;
  height: number;
  orientation: Orientation;
  sizeClass: SizeClass;
  /** iOS bar placement (iPhone Duo moves bars to the trailing edge). Android navigation is resolved by the layout. */
  barAxis: BarAxis | null;
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
  folds: FoldFeature[];
  /** Logical areas of the window after separating folds split it. One area when nothing separates. */
  regions: Rect[];
  reservedRegions: ReservedRegion[];
  cameraActive: boolean;
  liveActivity: boolean;
}

export function findDevice(config: SimulatorConfig, id: string): DeviceSpec {
  const device = config.devices.find((d) => d.id === id);
  if (!device) throw new Error(`Unknown device "${id}" in simulator.config.json`);
  return device;
}

export function resolveEnvironment(config: SimulatorConfig, sel: Selection): Environment {
  if (sel.free) {
    const platform = sel.freePlatform ?? findDevice(config, sel.deviceId).platform;
    return freeEnvironment(config, sel.free, platform);
  }
  const device = findDevice(config, sel.deviceId);
  return resolveIosDevice(config, device, sel);
}

function freeEnvironment(config: SimulatorConfig, size: Size, platform: Platform): Environment {
  const profile = config.platforms[platform];
  let sizeClass: SizeClass;
  let barAxis: BarAxis | null = null;
  if (platform === 'ios') {
    const { regularWidthMin, regularHeightMin } = config.platforms.ios.sizeClasses.free;
    sizeClass = {
      system: 'uikit',
      horizontal: size.width >= regularWidthMin ? 'regular' : 'compact',
      vertical: size.height >= regularHeightMin ? 'regular' : 'compact',
    };
    barAxis = config.platforms.ios.freeResize.barAxis;
  } else {
    sizeClass = windowSizeClass(config.platforms.android, size.width, size.height);
  }
  return {
    platform,
    unit: profile.unit,
    typeUnit: profile.typeUnit,
    deviceName: `Free resize · ${profile.label}`,
    displayLabel: 'Custom size',
    isFree: true,
    width: size.width,
    height: size.height,
    orientation: size.width > size.height ? 'landscape' : 'portrait',
    sizeClass,
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
    folds: [],
    regions: [{ x: 0, y: 0, width: size.width, height: size.height }],
    reservedRegions: [],
    cameraActive: false,
    liveActivity: false,
  };
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
