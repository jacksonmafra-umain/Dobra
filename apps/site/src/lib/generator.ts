// The Generator page: a catalog device in, the emulator or simulator script out. The script comes
// from the same plan dobra emulator runs, so the page and the CLI always agree.
import { loadCatalog } from '@dobra/core/catalog/load';
import { emulationSupport, emulatorPlan, EmulatorPlanError, type Support } from '@dobra/core/emulator/plan';
import { renderScripts, shQuote } from '@dobra/core/emulator/script';

const catalog = loadCatalog();

export interface GeneratorResult {
  /** The dobra line for every device that can be made, or null when there are none. */
  cli: string | null;
  /** One script for the same devices, to download and run with sh, or null. */
  script: string | null;
  /** What each device's emulator can't reproduce, by device name. */
  limits: { device: string; limits: string[] }[];
  /** Devices left out, with the reason. */
  skipped: string[];
}

export interface DeviceOption {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  support: Support;
}

/** Every catalog device, grouped by category in catalog order. */
export function deviceOptions(): { category: string; devices: DeviceOption[] }[] {
  const groups = new Map<string, DeviceOption[]>();
  for (const d of emulationSupport(catalog)) {
    const list = groups.get(d.category) ?? [];
    list.push({ id: d.id, name: d.name, platform: d.platform, support: d.support });
    groups.set(d.category, list);
  }
  return [...groups].map(([category, devices]) => ({ category, devices }));
}

export function generate(deviceIds: string[], opts: { api?: number; runtime?: string }): GeneratorResult {
  const plans = [];
  const skipped: string[] = [];
  for (const id of deviceIds) {
    const device = catalog.devices.find((d) => d.id === id);
    try {
      plans.push(emulatorPlan(catalog, id, device?.platform === 'android' ? (opts.api ? { api: opts.api } : {}) : opts.runtime ? { runtime: opts.runtime } : {}));
    } catch (e) {
      if (!(e instanceof EmulatorPlanError)) throw e;
      skipped.push(e.message);
    }
  }
  if (!plans.length) return { cli: null, script: null, limits: [], skipped };
  const android = plans.some((p) => p.platform === 'android');
  const ios = plans.some((p) => p.platform === 'ios');
  const cli = [
    'dobra emulator create',
    ...plans.map((p) => p.device.id),
    ...(android && opts.api ? ['--api', String(opts.api)] : []),
    ...(ios && opts.runtime ? ['--runtime', shQuote(opts.runtime)] : []),
    '--start',
  ].join(' ');
  return {
    cli,
    script: renderScripts(plans),
    limits: plans.filter((p) => p.limits.length).map((p) => ({ device: p.device.name, limits: p.limits })),
    skipped,
  };
}
