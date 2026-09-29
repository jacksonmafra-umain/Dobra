// The Generator page: a catalog device in, the emulator or simulator script out. The script comes
// from the same plan dobra emulator runs, so the page and the CLI always agree.
import { loadCatalog } from '@dobra/core/catalog/load';
import { emulationSupport, emulatorPlan, EmulatorPlanError, type Support } from '@dobra/core/emulator/plan';
import { renderScript } from '@dobra/core/emulator/script';

const catalog = loadCatalog();

export interface GeneratorResult {
  script: string | null;
  cli: string;
  limits: string[];
  error: string | null;
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

export function generate(deviceId: string, opts: { api?: number; runtime?: string }): GeneratorResult {
  const device = catalog.devices.find((d) => d.id === deviceId);
  const option = device?.platform === 'android' ? (opts.api ? ` --api ${opts.api}` : '') : opts.runtime ? ` --runtime ${opts.runtime}` : '';
  const cli = `dobra emulator create ${deviceId}${option}`;
  try {
    const plan = emulatorPlan(catalog, deviceId, device?.platform === 'android' ? (opts.api ? { api: opts.api } : {}) : opts.runtime ? { runtime: opts.runtime } : {});
    return { script: renderScript(plan), cli, limits: plan.limits, error: null };
  } catch (e) {
    if (e instanceof EmulatorPlanError) return { script: null, cli, limits: [], error: e.message };
    throw e;
  }
}
