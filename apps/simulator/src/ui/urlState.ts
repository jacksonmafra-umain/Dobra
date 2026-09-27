// The whole simulator state lives in the URL so a specific cell can be linked in a ticket.
import type { DeviceSpec, Orientation, Size } from '@dobra/core/config/types';
import type { Environment, Selection } from '@dobra/core/engine/environment';
import type { TextSettings } from '@dobra/core/engine/typography';
import type { Zoom } from './DeviceFrame';
import { baseMedia, type MediaOverrides } from './media';
import type { OverlayToggles } from './Overlays';

export type Theme = 'light' | 'dark';

export interface UrlState {
  selection: Selection;
  screenId: string;
  theme: Theme;
  zoom: Zoom;
  rtl: boolean;
  overlays: OverlayToggles;
  text: TextSettings;
  /** The other platform's device when comparing platforms side by side. */
  vs?: string;
}

export const FREE_MIN: Size = { width: 280, height: 320 };
export const FREE_MAX: Size = { width: 1400, height: 1400 };

export function clampFree(width: number, height: number): Size {
  return {
    width: Math.round(Math.min(FREE_MAX.width, Math.max(FREE_MIN.width, width))),
    height: Math.round(Math.min(FREE_MAX.height, Math.max(FREE_MIN.height, height))),
  };
}

function systemTheme(): Theme {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const OVERLAY_KEYS: [keyof OverlayToggles, string][] = [
  ['safeArea', 'safe'],
  ['margins', 'margins'],
  ['grid', 'grid'],
  ['reserved', 'reserved'],
  ['fold', 'fold'],
];

const pick = <T extends string>(v: string | null, values: readonly T[]): T | undefined => values.find((x) => x === v);
const flag = (v: string | null) => (v === '1' ? true : v === '0' ? false : undefined);

function readMedia(q: URLSearchParams): MediaOverrides | undefined {
  const m: MediaOverrides = {
    pointer: pick(q.get('ptr'), ['coarse', 'fine'] as const),
    keyboard: pick(q.get('kbd'), ['virtual', 'physical'] as const),
    viewingDistance: pick(q.get('dist'), ['near', 'medium', 'far'] as const),
    hasCamera: flag(q.get('cam')),
    hasMicrophone: flag(q.get('mic')),
  };
  const set = Object.entries(m).filter(([, v]) => v !== undefined);
  return set.length ? (Object.fromEntries(set) as MediaOverrides) : undefined;
}

const MEDIA_KEYS = [
  ['pointer', 'ptr'],
  ['keyboard', 'kbd'],
  ['viewingDistance', 'dist'],
  ['hasCamera', 'cam'],
  ['hasMicrophone', 'mic'],
] as const;

export function readUrlState(search = location.search): UrlState {
  const q = new URLSearchParams(search);
  const ov = (q.get('ov') ?? 'safe').split(',');
  const free = q.get('free')?.match(/^(\d+)x(\d+)$/);
  const overlays = Object.fromEntries(OVERLAY_KEYS.map(([key, token]) => [key, ov.includes(token)])) as unknown as OverlayToggles;
  return {
    selection: {
      deviceId: q.get('device') ?? 'iphone-17',
      displayId: q.get('display') ?? 'main',
      orientation: (q.get('o') === 'landscape' ? 'landscape' : 'portrait') as Orientation,
      free: free ? clampFree(+free[1], +free[2]) : null,
      freePlatform: q.get('fp') === 'android' ? 'android' : q.get('fp') === 'ios' ? 'ios' : undefined,
      pose: q.get('pose') ?? undefined,
      cameraActive: q.get('camera') === '1',
      liveActivity: q.get('live') === '1',
      rotation: q.get('rot') === '90' ? 90 : 0,
      navMode: q.get('nav') === '3btn' ? 'three-button' : 'gesture',
      windowMode: (['fullscreen', 'split', 'freeform', 'popup', 'pip'] as const).find((m) => m === q.get('win')),
      splitRatio: q.get('ratio') ? Number(q.get('ratio')) : undefined,
      splitSide: q.get('side') === '2' ? 'secondary' : undefined,
      windowSize: (() => {
        const m = q.get('ws')?.match(/^(\d+)x(\d+)$/);
        return m ? { width: +m[1], height: +m[2] } : undefined;
      })(),
      displayScale: q.get('dsize') ?? undefined,
      rotationLock: q.get('rlock') === '1' || undefined,
      ime: q.get('kb') === '1' || undefined,
      appPortrait: q.get('portrait') === '1' || undefined,
      targetSdk: q.get('sdk') ? Number(q.get('sdk')) : undefined,
      media: readMedia(q),
    },
    screenId: q.get('screen') ?? 'home',
    theme: q.get('theme') ? (q.get('theme') === 'dark' ? 'dark' : 'light') : systemTheme(),
    zoom: q.get('zoom') === 'actual' ? 'actual' : 'fit',
    rtl: q.get('dir') === 'rtl',
    overlays,
    text: { fontScale: Number(q.get('fs') ?? 1), bold: q.get('bold') === '1', reducedMotion: q.get('motion') === 'reduced' },
    vs: q.get('vs') ?? undefined,
  };
}

export function writeUrlState(state: UrlState, env: Environment, device: DeviceSpec): string {
  const { selection: sel } = state;
  const q = new URLSearchParams();
  q.set('device', sel.deviceId);
  q.set('display', env.pose ? env.pose.display : sel.displayId);
  if (env.pose) q.set('pose', env.pose.id);
  if (sel.cameraActive) q.set('camera', '1');
  if (sel.liveActivity) q.set('live', '1');
  // Android derives orientation from the window; its control is the rotation.
  if (env.platform === 'ios' || env.isFree) q.set('o', env.orientation);
  if (env.android && !env.isFree) {
    q.set('rot', String(env.android.rotation));
    if (env.android.navMode === 'three-button') q.set('nav', '3btn');
    // Full screen is the default except on desktop devices, so write it when it was chosen.
    if (env.window.mode !== 'fullscreen' || sel.windowMode === 'fullscreen') q.set('win', env.window.mode);
    if (sel.splitRatio !== undefined) q.set('ratio', String(sel.splitRatio));
    if (sel.splitSide === 'secondary') q.set('side', '2');
    if (env.window.mode === 'freeform') q.set('ws', `${Math.round(env.width)}x${Math.round(env.height)}`);
    if (sel.displayScale && sel.displayScale !== 'default') q.set('dsize', sel.displayScale);
    if (sel.rotationLock) q.set('rlock', '1');
    if (sel.appPortrait) q.set('portrait', '1');
    if (sel.targetSdk !== undefined) q.set('sdk', String(sel.targetSdk));
  }
  if (sel.free) {
    q.set('free', `${sel.free.width}x${sel.free.height}`);
    q.set('fp', env.platform);
  }
  if (sel.ime) q.set('kb', '1');
  if (state.text.fontScale !== 1) q.set('fs', String(state.text.fontScale));
  if (state.text.bold) q.set('bold', '1');
  if (state.text.reducedMotion) q.set('motion', 'reduced');
  // An override equal to what the window would have anyway is not written, so links stay minimal.
  const base = baseMedia(device, env);
  for (const [key, token] of MEDIA_KEYS) {
    const v = sel.media?.[key];
    if (v === undefined || v === base[key]) continue;
    q.set(token, typeof v === 'boolean' ? (v ? '1' : '0') : v);
  }
  if (state.vs) q.set('vs', state.vs);
  q.set('screen', state.screenId);
  q.set('theme', state.theme);
  q.set('zoom', state.zoom);
  if (state.rtl) q.set('dir', 'rtl');
  q.set(
    'ov',
    OVERLAY_KEYS.filter(([key]) => state.overlays[key])
      .map(([, token]) => token)
      .join(','),
  );
  return `?${q}`;
}
