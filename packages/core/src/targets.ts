// One artboard = one Target: a device display, an optional posture and an orientation.
import type { Catalog, SimulatorConfig } from './config/schema';
import type { Orientation } from './config/types';
import { offeredOrientations } from './config/orientations';
import type { Target } from './engine/checks';
import { resolveEnvironment, type EnvConfig, type Environment } from './engine/environment';

export type { Target };

/** Neutral Android manifest values for resolving windows without an app profile. */
export const DEFAULT_APP: SimulatorConfig['app'] = {
  android: {
    targetSdk: 36,
    screenOrientation: 'unspecified',
    configChanges: ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize', 'keyboardHidden'],
    source: 'android-docs',
  },
};

export function envConfigOf(catalog: Catalog, app: SimulatorConfig['app'] = DEFAULT_APP): EnvConfig {
  return { platforms: catalog.platforms, devices: catalog.devices, app };
}

const ORIENTATIONS: Orientation[] = ['portrait', 'landscape'];

export function targetKey(t: Target): string {
  return `${t.deviceId}/${t.displayId}/${t.pose ?? '-'}/${t.orientation}`;
}

export function parseTargetKey(s: string): Target | null {
  const parts = s.split('/');
  if (parts.length !== 4 || parts.some((p) => !p)) return null;
  const [deviceId, displayId, pose, orientation] = parts;
  if (!ORIENTATIONS.includes(orientation as Orientation)) return null;
  return { deviceId, displayId, ...(pose === '-' ? {} : { pose }), orientation: orientation as Orientation };
}

export function enumerateTargets(config: EnvConfig): Target[] {
  const out: Target[] = [];
  for (const d of config.devices) {
    if (!d.enabled) continue;
    if (d.platform === 'ios') {
      if (d.poses?.length) {
        for (const p of d.poses) for (const orientation of p.orientations) out.push({ deviceId: d.id, displayId: p.display, pose: p.id, orientation });
        continue;
      }
    } else if (d.postures?.length) {
      for (const p of d.postures) {
        for (const orientation of offeredOrientations(d, p.display, p.rotation)) out.push({ deviceId: d.id, displayId: p.display, pose: p.id, orientation });
      }
      continue;
    }
    for (const displayId of Object.keys(d.displays)) {
      for (const orientation of offeredOrientations(d, displayId)) out.push({ deviceId: d.id, displayId, orientation });
    }
  }
  return out;
}

const knownCache = new WeakMap<EnvConfig, Set<string>>();

/** Whether a target is one the catalog lists: its posture on that display, in an orientation it takes. */
export function isKnownTarget(config: EnvConfig, t: Target): boolean {
  let keys = knownCache.get(config);
  if (!keys) {
    keys = new Set(enumerateTargets(config).map(targetKey));
    knownCache.set(config, keys);
  }
  return keys.has(targetKey(t));
}

/** The window a target describes. Android targets rotate away from the display's natural shape when needed. */
export function resolveTarget(config: EnvConfig, t: Target): Environment {
  if (!isKnownTarget(config, t)) throw new Error(`Unknown target ${targetKey(t)}`);
  const device = config.devices.find((d) => d.id === t.deviceId)!;
  let rotation = t.rotation;
  if (device.platform === 'android' && rotation === undefined) {
    const disp = device.displays[t.displayId];
    const natural: Orientation = disp.size.width > disp.size.height ? 'landscape' : 'portrait';
    rotation = natural === t.orientation ? 0 : 90;
  }
  return resolveEnvironment(config, {
    deviceId: t.deviceId,
    displayId: t.displayId,
    orientation: t.orientation,
    free: null,
    ...(t.pose ? { pose: t.pose } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
  });
}
