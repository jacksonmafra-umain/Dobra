// The whole simulator state lives in the URL so a specific cell can be linked in a ticket.
import type { Orientation, Size } from '../config/types';
import type { Environment, Selection } from '../engine/environment';
import type { Zoom } from './DeviceFrame';
import type { OverlayToggles } from './Overlays';

export type Theme = 'light' | 'dark';

export interface UrlState {
  selection: Selection;
  screenId: string;
  theme: Theme;
  zoom: Zoom;
  rtl: boolean;
  overlays: OverlayToggles;
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
    },
    screenId: q.get('screen') ?? 'home',
    theme: q.get('theme') ? (q.get('theme') === 'dark' ? 'dark' : 'light') : systemTheme(),
    zoom: q.get('zoom') === 'actual' ? 'actual' : 'fit',
    rtl: q.get('dir') === 'rtl',
    overlays,
  };
}

export function writeUrlState(state: UrlState, env: Environment): string {
  const { selection: sel } = state;
  const q = new URLSearchParams();
  q.set('device', sel.deviceId);
  q.set('display', env.pose ? env.pose.display : sel.displayId);
  if (env.pose) q.set('pose', env.pose.id);
  if (sel.cameraActive) q.set('camera', '1');
  if (sel.liveActivity) q.set('live', '1');
  q.set('o', env.orientation);
  if (env.android && !env.isFree) {
    q.set('rot', String(env.android.rotation));
    if (env.android.navMode === 'three-button') q.set('nav', '3btn');
  }
  if (sel.free) {
    q.set('free', `${sel.free.width}x${sel.free.height}`);
    q.set('fp', env.platform);
  }
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
