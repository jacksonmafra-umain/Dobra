import { describe, expect, it } from 'vitest';
import { deviceState, listDevices, requireDevice } from './adb';
import { fakeAdb } from './fakeAdb';

const three = () =>
  fakeAdb({
    'emulator-5554': { model: 'sdk_gphone64_arm64', android: '16', emulator: true, chrome: '133.0.6943.137' },
    RZCXA15YFEJ: { model: 'SM-F741B', android: '16', chrome: '154.0.8037.57', deviceStates: ['HALF_OPENED'], rotation: 1 },
    R3GL70KLKAR: { state: 'unauthorized' },
  });

describe('listDevices', () => {
  it('lists emulators and phones with their model, Android and Chrome', async () => {
    expect(await listDevices(three())).toEqual([
      { serial: 'emulator-5554', state: 'device', emulator: true, model: 'sdk_gphone64_arm64', android: '16', chrome: '133.0.6943.137' },
      { serial: 'RZCXA15YFEJ', state: 'device', emulator: false, model: 'SM-F741B', android: '16', chrome: '154.0.8037.57' },
      { serial: 'R3GL70KLKAR', state: 'unauthorized', emulator: false, model: '', android: '', chrome: null },
    ]);
  });
  it('says when Chrome is not installed', async () => {
    expect((await listDevices(fakeAdb({ x: { model: 'm', chrome: null } })))[0].chrome).toBeNull();
  });
});

describe('requireDevice', () => {
  it('returns a ready device and explains the others', async () => {
    expect((await requireDevice(three(), 'RZCXA15YFEJ')).model).toBe('SM-F741B');
    await expect(requireDevice(three(), 'R3GL70KLKAR')).rejects.toThrow(/hasn't allowed USB debugging/);
    await expect(requireDevice(three(), 'nope')).rejects.toThrow(/No device nope/);
    await expect(requireDevice(fakeAdb({ z: { state: 'offline' } }), 'z')).rejects.toThrow(/offline/);
  });
});

describe('deviceState', () => {
  it('reads the fold state and the rotation', async () => {
    expect(await deviceState(three(), 'RZCXA15YFEJ')).toEqual({ state: 'HALF_OPENED', rotation: 1 });
  });
  it('gives null for a state it does not know', async () => {
    expect((await deviceState(fakeAdb({ x: { deviceStates: ['REAR_DISPLAY'] } }), 'x')).state).toBeNull();
  });

  it('knows an emulator whose image leaves ro.kernel.qemu empty', async () => {
    const [d] = await listDevices(fakeAdb({ 'emulator-5614': { model: 'sdk_gphone64_arm64', emulator: false } }));
    expect(d.emulator).toBe(true);
  });
});

