import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { emulatorPlan } from '@dobra/core/emulator/plan';
import { androidPaths, createAvd, findImage, hostAbi } from './android';
import { dir, fakeRunner, SDK } from './fakeRunner';

const catalog = loadCatalog();
const AVD = '/Users/me/.android/avd';

describe('android emulator creation', () => {
  it('finds the SDK and the newest image for this processor', () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-34/google_apis/arm64-v8a`), ...dir(`${SDK}/system-images/android-36/google_apis_playstore/arm64-v8a`), ...dir(`${SDK}/system-images/android-36/google_apis/x86_64`) });
    expect(androidPaths(r).sdk).toBe(SDK);
    expect(findImage(r, SDK, null)).toBe('system-images;android-36;google_apis_playstore;arm64-v8a');
    expect(findImage(r, SDK, 34)).toBe('system-images;android-34;google_apis;arm64-v8a');
  });

  it('says so when the installed images are for another processor', () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis/x86_64`) });
    expect(() => findImage(r, SDK, null)).toThrow(/another processor.*android-36\/google_apis\/x86_64[\s\S]*sdkmanager/);
  });

  it('uses ANDROID_SDK_ROOT and ANDROID_AVD_HOME, spaces included', () => {
    const sdk = '/opt/my sdk';
    const r = fakeRunner({ ...dir(sdk) }, { ANDROID_SDK_ROOT: sdk, ANDROID_AVD_HOME: '/data/avds here' });
    expect(androidPaths(r)).toMatchObject({ sdk, avdHome: '/data/avds here', emulator: `${sdk}/emulator/emulator` });
  });

  it('says how to get the SDK when there is none', () => {
    expect(() => androidPaths(fakeRunner({}))).toThrow(/No Android SDK/);
  });

  it('creates the AVD, then writes the settings through a temp file', async () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis_playstore/arm64-v8a`) });
    const out = await createAvd(r, emulatorPlan(catalog, 'galaxy-z-fold-7'), false);
    expect(out).toEqual({ id: 'dobra_galaxy-z-fold-7', image: 'system-images;android-36;google_apis_playstore;arm64-v8a' });
    const avdmanager = r.calls.find((c) => c.file.endsWith('avdmanager'))!;
    expect(avdmanager.args).toEqual(['create', 'avd', '-n', 'dobra_galaxy-z-fold-7', '-k', out.image]);
    expect(avdmanager.input).toBe('no\n');
    const config = r.fs.get(`${AVD}/dobra_galaxy-z-fold-7.avd/config.ini`)!;
    expect(config).toContain('hw.lcd.width=1968\n');
    expect(config).not.toContain('hw.lcd.width=320');
    expect(config).toContain('image.sysdir.1=x');
    expect(r.fs.has(`${AVD}/dobra_galaxy-z-fold-7.avd/config.ini.tmp`)).toBe(false);
  });

  it('leaves an existing emulator alone unless forced', async () => {
    const files = { ...dir(SDK), ...dir(`${SDK}/system-images/android-36/default/arm64-v8a`), ...dir(`${AVD}/dobra_pixel-9.avd`) };
    const r = fakeRunner(files);
    await expect(createAvd(r, emulatorPlan(catalog, 'pixel-9'), false)).rejects.toThrow(/already exists.*--force/);
    expect(r.calls).toHaveLength(0);
    const forced = fakeRunner(files);
    await createAvd(forced, emulatorPlan(catalog, 'pixel-9', { force: true }), true);
    expect(forced.calls.find((c) => c.file.endsWith('avdmanager'))!.args).toContain('--force');
  });

  it('writes nothing when avdmanager fails', async () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/default/arm64-v8a`) }, {}, { exec: () => ({ code: 1, stdout: '', stderr: 'Error: Package path is not valid' }) });
    await expect(createAvd(r, emulatorPlan(catalog, 'pixel-9'), false)).rejects.toThrow(/Package path is not valid/);
    expect([...r.fs.keys()].some((k) => k.endsWith('config.ini'))).toBe(false);
  });

  it('picks the ABI from the processor', () => {
    expect(hostAbi('arm64')).toBe('arm64-v8a');
    expect(hostAbi('x64')).toBe('x86_64');
  });

  it('takes a minor-version image such as android-36.1 as the newest', () => {
    const r = fakeRunner({ ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis/arm64-v8a`), ...dir(`${SDK}/system-images/android-36.1/google_apis_playstore/arm64-v8a`) });
    expect(findImage(r, SDK, null)).toBe('system-images;android-36.1;google_apis_playstore;arm64-v8a');
    expect(findImage(r, SDK, 36)).toBe('system-images;android-36.1;google_apis_playstore;arm64-v8a');
  });

  it('uses arm64 images on Apple silicon even when Node runs under Rosetta', async () => {
    const r = fakeRunner(
      { ...dir(SDK), ...dir(`${SDK}/system-images/android-36/google_apis/arm64-v8a`), ...dir(`${SDK}/system-images/android-36/google_apis/x86_64`) },
      {},
      { arch: 'x64', exec: (file, args) => (file === 'sysctl' && args.join(' ') === '-n hw.optional.arm64' ? { code: 0, stdout: '1\n', stderr: '' } : undefined) },
    );
    expect((await createAvd(r, emulatorPlan(catalog, 'pixel-9'), false)).image).toBe('system-images;android-36;google_apis;arm64-v8a');
  });
});

