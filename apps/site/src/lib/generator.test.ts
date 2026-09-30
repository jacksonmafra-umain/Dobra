import { describe, expect, it } from 'vitest';
import { deviceOptions, generate } from './generator';

import { vi } from 'vitest';

// Every catalog device has an Apple simulator now, so these tests use a catalog where the iPhone
// Duo has none, to keep covering devices Apple ships no simulator for.
vi.mock('@dobra/core/catalog/load', async (importOriginal) => {
  const real = await importOriginal<typeof import('@dobra/core/catalog/load')>();
  const json = (await import('@dobra/core/catalog/catalog.json')).default as { devices: { id: string }[] };
  const withoutDuoSimulator = { ...json, devices: json.devices.map((d) => (d.id === 'iphone-duo' ? { ...d, simulator: undefined } : d)) };
  return { ...real, loadCatalog: (j: unknown = withoutDuoSimulator) => real.loadCatalog(j) };
});

describe('generator', () => {
  it('offers every catalog device, grouped by category', () => {
    const ids = deviceOptions().flatMap((g) => g.devices.map((d) => d.id));
    expect(ids).toContain('galaxy-z-fold-7');
    expect(deviceOptions().flatMap((g) => g.devices).find((d) => d.id === 'iphone-duo')?.support).toBe('none');
  });

  it('builds one dobra line and one script for several devices', () => {
    const r = generate(['galaxy-z-fold-7', 'pixel-tablet', 'iphone-17'], {});
    expect(r.cli).toBe('dobra emulator create galaxy-z-fold-7 pixel-tablet iphone-17 --start');
    expect(r.script?.match(/^sh <<'DOBRA_DEVICE_\d+'$/gm)).toHaveLength(3);
    expect(r.skipped).toEqual([]);
  });

  it('adds the API level and the runtime only for devices of that platform', () => {
    expect(generate(['galaxy-z-fold-7'], { api: 35 }).cli).toBe('dobra emulator create galaxy-z-fold-7 --api 35 --start');
    expect(generate(['iphone-17'], { api: 35, runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' }).cli).toBe(
      "dobra emulator create iphone-17 --runtime 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' --start",
    );
  });

  it('leaves out a device with no simulator and says why', () => {
    const r = generate(['iphone-duo', 'iphone-17'], {});
    expect(r.cli).toBe('dobra emulator create iphone-17 --start');
    expect(r.skipped).toEqual([expect.stringMatching(/iPhone Duo.*no simulator/)]);
  });

  it('has nothing to run with no devices, or only ones it cannot make', () => {
    expect(generate([], {})).toMatchObject({ cli: null, script: null });
    expect(generate(['iphone-duo'], {})).toMatchObject({ cli: null, script: null });
  });

  it('quotes a runtime typed with shell characters', () => {
    expect(generate(['iphone-17'], { runtime: 'x; rm -rf ~' }).cli).toContain("--runtime 'x; rm -rf ~'");
  });
});
