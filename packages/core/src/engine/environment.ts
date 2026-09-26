import type { BarAxis, DeviceSpec, Orientation, Platform, Rect, SafeArea, SimulatorConfig, Size } from '../config/types';
import { resolveAndroidDevice } from './android';
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
  /** Android: display rotation from its natural orientation. */
  rotation?: 0 | 90;
  /** Android: system navigation mode. The bottom inset differs between the two. */
  navMode?: NavMode;
}

export type NavMode = 'gesture' | 'three-button';

/** A pose (iOS) or posture (Android) the device can be put in. */
export interface PoseInfo {
  id: string;
  label: string;
  display: string;
  estimated?: boolean;
  note?: string;
  windowArea?: 'rear-display' | 'dual-screen';
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type InsetKind = 'statusBar' | 'navigationBar' | 'displayCutout' | 'waterfall' | 'captionBar' | 'ime';

/** One WindowInsets type and the edges it occupies. */
export interface InsetPart {
  kind: InsetKind;
  insets: Insets;
  source: string;
}

/** Android-only facts about the resolved window. */
export interface AndroidDetails {
  density: number;
  rotation: 0 | 90;
  navMode: NavMode;
  /** Insets by WindowInsets type; safeArea is their union. */
  parts: InsetPart[];
  statusBarHeight: number;
  cutout: Rect | null;
  navigationBar: { edge: 'bottom' | 'right' | 'left'; size: number } | null;
  /** The display is a cover screen the user must allow apps on (Samsung). */
  coverScreen: { userGranted: boolean; note: string } | null;
  /** Rotation is fixed by the posture or the display. */
  rotationLocked: boolean;
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
  pose: PoseInfo | null;
  poses: PoseInfo[];
  folds: FoldFeature[];
  /** Logical areas of the window after separating folds split it. One area when nothing separates. */
  regions: Rect[];
  reservedRegions: ReservedRegion[];
  cameraActive: boolean;
  liveActivity: boolean;
  android: AndroidDetails | null;
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
  return device.platform === 'ios' ? resolveIosDevice(config, device, sel) : resolveAndroidDevice(config, device, sel);
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
    android: platform === 'android' ? freeAndroidDetails() : null,
  };
}

function freeAndroidDetails(): AndroidDetails {
  return {
    density: 1,
    rotation: 0,
    navMode: 'gesture',
    parts: [],
    statusBarHeight: 0,
    cutout: null,
    navigationBar: null,
    coverScreen: null,
    rotationLocked: false,
  };
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
