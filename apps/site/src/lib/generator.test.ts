import { describe, expect, it } from 'vitest';
import { deviceOptions, generate } from './generator';

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
