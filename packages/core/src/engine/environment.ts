import type { BarAxis, DeviceSpec, Orientation, Platform, Rect, SafeArea, SimulatorConfig, Size } from '../config/types';
import { DEFAULT_MEDIA, mediaFacts, type MediaFacts } from '../catalog/media';
import { resolveAndroidDevice } from './android';
import { resolveIosDevice } from './ios';
import type { FoldFeature } from './folds';
import { windowSizeClass, type SizeClass } from './sizeClass';
import type { WindowMode, WindowPlacement } from './window';

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
  /** Android window state. Defaults to the device's first window mode. */
  windowMode?: WindowMode;
  splitRatio?: number;
  splitSide?: 'primary' | 'secondary';
  /** Freeform window size, dp. */
  windowSize?: Size;
  /** Settings › Display size step id. */
  displayScale?: string;
  /** System rotation lock: the display stays in its natural orientation. */
  rotationLock?: boolean;
  /** Software keyboard shown. */
  ime?: boolean;
  /** The app requests portrait (screenOrientation="portrait"). Defaults to the app manifest in the config. */
  appPortrait?: boolean;
  targetSdk?: number;
  /** Media-query facts the user overrides (pointer, keyboard, …). Unset keys keep the device's value. */
  media?: Partial<MediaFacts>;
}

export type NavMode = 'gesture' | 'three-button';

/** Why the window is not what the controls would suggest. */
export interface EnvNote {
  id: string;
  text: string;
  source: string;
}

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
  coverScreen: { policy: 'user-granted' | 'any-app' | 'allow-list'; continuity: boolean; note: string } | null;
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
  /** Display area the window sits on. Equal to the window outside Android window modes. */
  display: Size;
  window: WindowPlacement;
  /** Keyboard inset at the window bottom, 0 when hidden. */
  ime: number;
  notes: EnvNote[];
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
  /** Media-query facts for this window: the device's (catalog/media.ts), then the selection's overrides. */
  media: MediaFacts;
}

/** What resolving a window reads: platforms, devices and the app's manifest. The catalog plus DEFAULT_APP satisfies it. */
export type EnvConfig = Pick<SimulatorConfig, 'platforms' | 'devices' | 'app'>;

export function findDevice(config: EnvConfig, id: string): DeviceSpec {
  const device = config.devices.find((d) => d.id === id);
  if (!device) throw new Error(`Unknown device "${id}" in the catalog`);
  return device;
}

function withMedia(base: MediaFacts, override: Partial<MediaFacts> | undefined): MediaFacts {
  const out: MediaFacts = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
}

export function resolveEnvironment(config: EnvConfig, sel: Selection): Environment {
  if (sel.free) {
    const platform = sel.freePlatform ?? findDevice(config, sel.deviceId).platform;
    // A free window has no device: it gets the phone defaults, touch first.
    return { ...freeEnvironment(config, sel.free, platform), media: withMedia(DEFAULT_MEDIA.phone, sel.media) };
  }
  const device = findDevice(config, sel.deviceId);
  const env = device.platform === 'ios' ? resolveIosDevice(config, device, sel) : resolveAndroidDevice(config, device, sel);
  return { ...env, media: withMedia(mediaFacts(device), sel.media) };
}

function freeEnvironment(config: EnvConfig, size: Size, platform: Platform): Omit<Environment, 'media'> {
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
    display: { ...size },
    window: { mode: 'fullscreen', rect: { x: 0, y: 0, ...size }, floating: false, captionBar: 0, other: null, divider: null },
    ime: 0,
    notes: [],
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
