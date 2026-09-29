import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { emulatorPlan } from '@dobra/core/emulator/plan';
import { fakeRunner } from './fakeRunner';
import { createSimulator } from './ios';

const IPHONE_17 = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17';
const runtimes = {
  runtimes: [
    { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-6', version: '18.6', isAvailable: true, platform: 'iOS', supportedDeviceTypes: [{ identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16' }] },
    { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4', version: '26.4', isAvailable: true, platform: 'iOS', supportedDeviceTypes: [{ identifier: IPHONE_17 }] },
    { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0', version: '27.0', isAvailable: false, platform: 'iOS', supportedDeviceTypes: [{ identifier: IPHONE_17 }] },
  ],
};
const devices = (names: string[]) => ({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-4': names.map((name, i) => ({ name, udid: `OLD-${i}` })) } });

function simctl(existing: string[] = []) {
  return fakeRunner({}, {}, {
    exec: (file, args) => {
      if (file !== 'xcrun') return undefined;
      if (args.join(' ') === 'simctl list runtimes -j') return { code: 0, stdout: JSON.stringify(runtimes), stderr: '' };
      if (args.join(' ') === 'simctl list devices -j') return { code: 0, stdout: JSON.stringify(devices(existing)), stderr: '' };
      if (args[1] === 'create') return { code: 0, stdout: 'NEW-UDID\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
  });
}
const plan = (opts = {}) => emulatorPlan(loadCatalog(), 'iphone-17', opts);

describe('createSimulator', () => {
  it('creates it on the newest available runtime that supports the device type', async () => {
    const r = simctl();
    expect(await createSimulator(r, plan(), false)).toEqual({ id: 'NEW-UDID', image: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' });
    expect(r.calls.at(-1)!.args).toEqual(['simctl', 'create', 'iPhone 17 (Dobra)', IPHONE_17, 'com.apple.CoreSimulator.SimRuntime.iOS-26-4']);
  });

  it('refuses a name that exists, and replaces it with force', async () => {
    await expect(createSimulator(simctl(['iPhone 17 (Dobra)']), plan(), false)).rejects.toThrow(/already exists.*--force/);
    const r = simctl(['iPhone 17 (Dobra)']);
    await createSimulator(r, plan(), true);
    expect(r.calls.map((c) => c.args.slice(0, 3).join(' '))).toContain('simctl delete OLD-0');
  });

  it('says when no runtime supports the device type', async () => {
    await expect(createSimulator(simctl(), plan({ runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-6' }), false)).rejects.toThrow(/iOS-18-6 doesn't support iPhone-17/);
  });
});
