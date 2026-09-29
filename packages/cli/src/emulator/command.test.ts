import { describe, expect, it } from 'vitest';
import { runEmulator } from './command';
import { dir, fakeRunner, SDK } from './fakeRunner';

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out: (s: string) => void out.push(s), err: (s: string) => void err.push(s), outText: () => out.join('\n'), errText: () => err.join('\n') };
};
const withImage = () => fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis_playstore/arm64-v8a`) });

describe('dobra emulator', () => {
  it('lists every device with its support', async () => {
    const o = io();
    expect(await runEmulator(['list', '--json'], o, fakeRunner({}))).toBe(0);
    const json = JSON.parse(o.outText());
    expect(json.version).toBe(1);
    expect(json.devices.find((d: { id: string }) => d.id === 'iphone-duo').support).toBe('none');
    const text = io();
    await runEmulator(['list'], text, fakeRunner({}));
    expect(text.outText()).toMatch(/galaxy-z-flip-7\s+android\s+foldable-flip\s+partial/);
  });

  it('prints the script', async () => {
    const o = io();
    expect(await runEmulator(['script', 'pixel-9', '--api', '34'], o, fakeRunner({}))).toBe(0);
    expect(o.outText()).toMatch(/^#!\/bin\/sh/);
    expect(o.outText()).toContain('WANT_API=34');
  });

  it('creates an Android emulator and reports it as JSON', async () => {
    const o = io();
    expect(await runEmulator(['create', 'galaxy-z-fold-7', '--json'], o, withImage())).toBe(0);
    expect(JSON.parse(o.outText())).toMatchObject({
      version: 1,
      platform: 'android',
      device: { id: 'galaxy-z-fold-7' },
      name: 'dobra_galaxy-z-fold-7',
      id: 'dobra_galaxy-z-fold-7',
      image: 'system-images;android-36;google_apis_playstore;arm64-v8a',
      start: [[`${SDK}/emulator/emulator`, '-avd', 'dobra_galaxy-z-fold-7']],
    });
  });

  it('prints what it made, its limits and how to start it', async () => {
    const o = io();
    expect(await runEmulator(['create', 'galaxy-z-flip-7'], o, withImage())).toBe(0);
    expect(o.outText()).toContain('Created dobra_galaxy-z-flip-7');
    expect(o.outText()).toMatch(/Not emulated:[\s\S]*cover display/);
    expect(o.outText()).toContain(`${SDK}/emulator/emulator -avd dobra_galaxy-z-flip-7`);
  });

  it('exits 2 for an unknown device or a hypothetical one, and 1 without an SDK', async () => {
    const unknown = io();
    expect(await runEmulator(['create', 'nope'], unknown, fakeRunner({}))).toBe(2);
    expect(unknown.errText()).toMatch(/Unknown device/);
    expect(await runEmulator(['create', 'iphone-duo'], io(), fakeRunner({}))).toBe(2);
    const o = io();
    expect(await runEmulator(['create', 'pixel-9'], o, fakeRunner({}))).toBe(1);
    expect(o.errText()).toMatch(/No Android SDK/);
  });

  it('exits 2 with the usage for bad options', async () => {
    const o = io();
    expect(await runEmulator(['create', 'pixel-9', '--api', 'x'], o, fakeRunner({}))).toBe(2);
    expect(o.outText()).toMatch(/Usage: dobra emulator/);
    expect(await runEmulator([], io(), fakeRunner({}))).toBe(2);
    expect(await runEmulator(['create'], io(), fakeRunner({}))).toBe(2);
  });
});
