import { describe, expect, it } from 'vitest';
import { runEmulator } from './command';
import { dir, fakeRunner, SDK } from './fakeRunner';

const ADB = `${SDK}/platform-tools/adb`;
const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out: (s: string) => void out.push(s), err: (s: string) => void err.push(s), outText: () => out.join('\n'), errText: () => err.join('\n') };
};

/** Two running emulators: an unrelated one and dobra_galaxy-z-fold-7. */
function adb(names: Record<string, string> = { 'emulator-5554': 'Pixel_9', 'emulator-5556': 'dobra_galaxy-z-fold-7' }) {
  return fakeRunner({ ...dir(SDK), [ADB]: '' }, {}, {
    exec: (file, args) => {
      if (file !== ADB) return undefined;
      if (args[0] === 'devices') return { code: 0, stdout: `List of devices attached\n${Object.keys(names).map((s) => `${s}\tdevice`).join('\n')}\n\n`, stderr: '' };
      if (args[0] === '-s' && args[2] === 'emu' && args[3] === 'avd' && args[4] === 'name') return { code: 0, stdout: `${names[args[1]]}\r\nOK\r\n`, stderr: '' };
      return { code: 0, stdout: 'OK\r\n', stderr: '' };
    },
  });
}
/** The commands sent to an emulator, without the lookups of each emulator's AVD name. */
const sent = (r: ReturnType<typeof adb>) =>
  r.calls.filter((c) => c.file === ADB && c.args[0] === '-s' && !(c.args[2] === 'emu' && c.args[3] === 'avd')).map((c) => c.args.slice(1).join(' '));

describe('dobra emulator posture', () => {
  it('finds the device emulator and sends the posture and the rotation', async () => {
    const r = adb();
    const o = io();
    expect(await runEmulator(['posture', 'galaxy-z-fold-7', 'tabletop', '--json'], o, r)).toBe(0);
    expect(sent(r)).toEqual([
      'emulator-5556 shell settings put system accelerometer_rotation 0',
      'emulator-5556 shell settings put system user_rotation 1',
      'emulator-5556 emu posture 2',
    ]);
    expect(JSON.parse(o.outText())).toEqual({ version: 1, device: 'galaxy-z-fold-7', posture: 'tabletop', emulator: 2, serial: 'emulator-5556', orientation: 'landscape' });
  });

  it('leaves the rotation alone when the posture has none', async () => {
    const r = adb();
    expect(await runEmulator(['posture', 'galaxy-z-fold-7', 'closed'], io(), r)).toBe(0);
    expect(sent(r)).toEqual(['emulator-5556 emu posture 1']);
  });

  it('takes --orientation, --serial and --name', async () => {
    const r = adb({ 'emulator-5558': 'my_fold' });
    expect(await runEmulator(['posture', 'galaxy-z-fold-7', 'open', '--name', 'my_fold', '--orientation', 'landscape'], io(), r)).toBe(0);
    expect(sent(r)).toContain('emulator-5558 shell settings put system user_rotation 1');
    const s = adb();
    expect(await runEmulator(['posture', 'galaxy-z-fold-7', 'book', '--serial', 'emulator-5554'], io(), s)).toBe(0);
    expect(sent(s).at(-1)).toBe('emulator-5554 emu posture 2');
  });

  it('exits 1 with the start command when the emulator is not running', async () => {
    const o = io();
    expect(await runEmulator(['posture', 'galaxy-z-fold-7', 'book'], o, adb({ 'emulator-5554': 'Pixel_9' }))).toBe(1);
    expect(o.errText()).toMatch(/dobra_galaxy-z-fold-7 isn't running[\s\S]*emulator -avd dobra_galaxy-z-fold-7/);
  });

  it('exits 2 for a posture the emulator cannot take', async () => {
    const o = io();
    expect(await runEmulator(['posture', 'pixel-9-pro-fold', 'rear-display'], o, adb())).toBe(2);
    expect(o.errText()).toMatch(/rear display/);
    expect(await runEmulator(['posture', 'iphone-17', 'open'], io(), adb())).toBe(2);
    expect(await runEmulator(['posture', 'galaxy-z-fold-7'], io(), adb())).toBe(2);
    expect(await runEmulator(['posture', 'galaxy-z-fold-7', 'book', '--orientation', 'sideways'], io(), adb())).toBe(2);
  });

  it('lists the postures of each device', async () => {
    const o = io();
    await runEmulator(['list', '--json'], o, adb());
    expect(JSON.parse(o.outText()).devices.find((d: { id: string }) => d.id === 'galaxy-z-fold-7').postures).toEqual(['closed', 'open', 'book', 'tabletop', 'dual-screen']);
  });
});
