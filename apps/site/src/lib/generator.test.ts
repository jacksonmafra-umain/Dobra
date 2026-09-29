import { describe, expect, it } from 'vitest';
import { deviceOptions, generate } from './generator';

describe('generator', () => {
  it('offers every catalog device, grouped by category', () => {
    const groups = deviceOptions();
    const ids = groups.flatMap((g) => g.devices.map((d) => d.id));
    expect(ids).toContain('galaxy-z-fold-7');
    expect(ids).toContain('iphone-duo');
    expect(groups.find((g) => g.devices.some((d) => d.id === 'iphone-duo'))?.devices.find((d) => d.id === 'iphone-duo')?.support).toBe('none');
  });

  it('gives a script and the dobra line for an Android device', () => {
    const r = generate('galaxy-z-fold-7', { api: 35 });
    expect(r.script).toMatch(/^#!\/bin\/sh/);
    expect(r.cli).toBe('dobra emulator create galaxy-z-fold-7 --api 35');
    expect(r.error).toBeNull();
  });

  it('gives the runtime option for an iOS device and ignores an API level', () => {
    expect(generate('iphone-17', { api: 35, runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' }).cli).toBe(
      'dobra emulator create iphone-17 --runtime com.apple.CoreSimulator.SimRuntime.iOS-26-4',
    );
  });

  it('explains a device with no simulator', () => {
    const r = generate('iphone-duo', {});
    expect(r.script).toBeNull();
    expect(r.error).toMatch(/no simulator/i);
  });
});
