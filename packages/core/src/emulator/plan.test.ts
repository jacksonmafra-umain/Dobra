import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { avdName, emulationSupport, emulatorPlan, EmulatorPlanError } from './plan';

const catalog = loadCatalog();

describe('emulatorPlan', () => {
  it('creates an AVD, then writes the device settings', () => {
    const p = emulatorPlan(catalog, 'galaxy-z-fold-7');
    expect(p).toMatchObject({ version: 1, platform: 'android', name: 'dobra_galaxy-z-fold-7' });
    expect(p.steps.map((s) => s.kind)).toEqual(['find-image', 'run', 'write-config', 'print']);
    expect(p.steps[1]).toEqual({ kind: 'run', argv: ['avdmanager', 'create', 'avd', '-n', 'dobra_galaxy-z-fold-7', '-k', '{image}'], input: 'no\n' });
    expect(p.start).toEqual([['emulator', '-avd', 'dobra_galaxy-z-fold-7']]);
  });

  it('passes the API level, a custom name and --force through', () => {
    const p = emulatorPlan(catalog, 'pixel-9', { api: 34, name: 'my_phone', force: true });
    expect(p.steps[0]).toEqual({ kind: 'find-image', platform: 'android', api: 34 });
    expect(p.name).toBe('my_phone');
    expect((p.steps[1] as { argv: string[] }).argv).toContain('--force');
  });

  it('creates an iOS simulator from the catalog device type', () => {
    const p = emulatorPlan(catalog, 'iphone-17');
    expect(p).toMatchObject({ platform: 'ios', name: 'iPhone 17 (Dobra)' });
    expect(p.steps[1]).toEqual({ kind: 'run', argv: ['xcrun', 'simctl', 'create', 'iPhone 17 (Dobra)', 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', '{runtime}'] });
  });

  it('refuses a hypothetical iOS device', () => {
    expect(() => emulatorPlan(catalog, 'iphone-duo')).toThrow(EmulatorPlanError);
  });

  it('refuses an unknown id and suggests close ones', () => {
    let error: unknown;
    try {
      emulatorPlan(catalog, 'galaxy-fold');
    } catch (e) {
      error = e;
    }
    expect((error as EmulatorPlanError).code).toBe('unknown-device');
    expect((error as Error).message).toContain('galaxy-z-fold-7');
  });
});

describe('emulationSupport', () => {
  it('rates every catalog device', () => {
    const rows = emulationSupport(catalog);
    expect(rows).toHaveLength(catalog.devices.length);
    expect(rows.find((r) => r.id === 'pixel-9')?.support).toBe('full');
    expect(rows.find((r) => r.id === 'galaxy-z-flip-7')?.support).toBe('partial');
    expect(rows.find((r) => r.id === 'iphone-mini')?.support).toBe('full');
    expect(rows.find((r) => r.id === 'iphone-duo')?.support).toBe('none');
  });
});

describe('avdName', () => {
  it('keeps only characters an AVD name allows', () => {
    expect(avdName('galaxy-z-fold-7')).toBe('dobra_galaxy-z-fold-7');
    expect(avdName('a b/c')).toBe('dobra_a_b_c');
  });
});

describe('names and replacing', () => {
  it('refuses an Android name an AVD cannot have, instead of writing it into a script', () => {
    let error: unknown;
    try {
      emulatorPlan(catalog, 'pixel-9', { name: 'x$(touch /tmp/pwn)"y' });
    } catch (e) {
      error = e;
    }
    expect((error as EmulatorPlanError).code).toBe('bad-name');
  });

  it('carries --force into an iOS plan', () => {
    const find = emulatorPlan(catalog, 'iphone-17', { force: true }).steps[0];
    expect(find).toMatchObject({ kind: 'find-image', platform: 'ios', force: true });
  });
});

