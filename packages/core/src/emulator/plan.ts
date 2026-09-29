// An emulator plan: the steps that turn a catalog device into an Android emulator (AVD) or an iOS
// simulator, as plain data. The CLI runs it and renderScript prints it as a shell script, so both
// always agree. `{image}`, `{runtime}` and `{udid}` stand for values found when the plan runs.
import type { Catalog } from '../config/schema';
import { androidSettings, type AppliedSetting } from './android';

export type { AppliedSetting } from './android';
export type Placeholder = '{image}' | '{runtime}' | '{udid}';
export type EmulatorStep =
  | { kind: 'find-image'; platform: 'android'; api: number | null }
  | { kind: 'find-image'; platform: 'ios'; runtime: string | null; deviceType: string }
  | { kind: 'run'; argv: string[]; input?: string }
  | { kind: 'write-config'; avd: string; settings: Record<string, string> }
  | { kind: 'print'; text: string };

export interface EmulatorPlan {
  version: 1;
  platform: 'android' | 'ios';
  device: { id: string; name: string; category: string };
  name: string;
  steps: EmulatorStep[];
  applied: AppliedSetting[];
  limits: string[];
  /** Commands that start what was created; they may contain placeholders. */
  start: string[][];
}

export interface PlanOptions {
  api?: number;
  runtime?: string;
  name?: string;
  force?: boolean;
}

export class EmulatorPlanError extends Error {
  constructor(
    readonly code: 'unknown-device' | 'no-simulator',
    message: string,
  ) {
    super(message);
  }
}

export const avdName = (deviceId: string) => `dobra_${deviceId}`.replace(/[^A-Za-z0-9._-]/g, '_');

function suggest(catalog: Catalog, id: string): string {
  const parts = id.toLowerCase().split(/[^a-z0-9]+/).filter((p) => p.length > 2);
  // Most matching parts first: "galaxy-fold" ranks galaxy-z-fold-7 above the other Galaxy phones.
  const hits = catalog.devices
    .map((d) => ({ id: d.id, score: parts.filter((p) => d.id.includes(p)).length }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((d) => d.id);
  return hits.length ? `Try: ${hits.join(', ')}.` : 'Run dobra emulator list to see them.';
}

export function emulatorPlan(catalog: Catalog, deviceId: string, options: PlanOptions = {}): EmulatorPlan {
  const device = catalog.devices.find((d) => d.id === deviceId);
  if (!device) throw new EmulatorPlanError('unknown-device', `Unknown device "${deviceId}". ${suggest(catalog, deviceId)}`);
  const base = { version: 1 as const, device: { id: device.id, name: device.name, category: device.category } };

  if (device.platform === 'android') {
    const name = options.name ?? avdName(device.id);
    const { settings, applied, limits } = androidSettings(device);
    return {
      ...base,
      platform: 'android',
      name,
      steps: [
        { kind: 'find-image', platform: 'android', api: options.api ?? null },
        // avdmanager asks whether to create a custom hardware profile; the settings come next instead.
        { kind: 'run', argv: ['avdmanager', 'create', 'avd', '-n', name, '-k', '{image}', ...(options.force ? ['--force'] : [])], input: 'no\n' },
        { kind: 'write-config', avd: name, settings },
        { kind: 'print', text: `Created ${name}.` },
      ],
      applied,
      limits,
      start: [['emulator', '-avd', name]],
    };
  }

  if (!device.simulator) throw new EmulatorPlanError('no-simulator', `${device.name} is hypothetical: Apple has no simulator for it.`);
  const { simulator } = device;
  const name = options.name ?? `${device.name} (Dobra)`;
  const display = Object.values(device.displays)[0];
  return {
    ...base,
    platform: 'ios',
    name,
    steps: [
      { kind: 'find-image', platform: 'ios', runtime: options.runtime ?? null, deviceType: simulator.deviceType },
      { kind: 'run', argv: ['xcrun', 'simctl', 'create', name, simulator.deviceType, '{runtime}'] },
      { kind: 'print', text: `Created ${name}.` },
    ],
    applied: [
      { label: 'Simulator', value: `${simulator.deviceType.split('.').pop()}${simulator.estimated ? ' (closest model)' : ''}`, source: simulator.source },
      { label: 'Points', value: `${display.portraitSize.width}×${display.portraitSize.height} @${display.scale}x`, source: 'catalog' },
    ],
    limits: simulator.estimated ? [`${device.name} is a generic size; the simulator is the closest Apple model.`] : [],
    start: [['xcrun', 'simctl', 'boot', '{udid}'], ['open', '-a', 'Simulator']],
  };
}

export type Support = 'full' | 'partial' | 'none';
export interface SupportRow {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  category: string;
  support: Support;
  limits: string[];
}

/** How well each catalog device can be emulated. A closest-model iOS mapping still counts as full. */
export function emulationSupport(catalog: Catalog): SupportRow[] {
  return catalog.devices.map((d) => {
    const row = { id: d.id, name: d.name, platform: d.platform, category: d.category };
    try {
      const plan = emulatorPlan(catalog, d.id);
      const limits = plan.platform === 'android' ? plan.limits : [];
      return { ...row, support: limits.length ? 'partial' : 'full', limits: plan.limits };
    } catch (e) {
      if (e instanceof EmulatorPlanError) return { ...row, support: 'none', limits: [e.message] };
      throw e;
    }
  });
}
