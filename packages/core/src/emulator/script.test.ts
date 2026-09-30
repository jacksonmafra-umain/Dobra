import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../catalog/load';
import { emulatorPlan } from './plan';
import { renderScript, renderScripts, shQuote } from './script';

const catalog = loadCatalog();
const syntaxOk = (s: string) => execFileSync('sh', ['-n'], { input: s });

describe('shQuote', () => {
  it('single-quotes and escapes a single quote', () => {
    expect(shQuote("it's")).toBe("'it'\\''s'");
    expect(shQuote('a b')).toBe("'a b'");
  });
});

describe('renderScript', () => {
  it('writes a valid Android script that finds an image, creates the AVD and sets every key', () => {
    const s = renderScript(emulatorPlan(catalog, 'galaxy-z-fold-7'));
    syntaxOk(s);
    expect(s.startsWith('#!/bin/sh\nset -eu\n')).toBe(true);
    expect(s).toContain('"$SDK"/system-images/android-*');
    expect(s).toContain("printf 'no\\n' | \"$AVDMANAGER\" create avd -n 'dobra_galaxy-z-fold-7' -k \"$IMAGE\"");
    expect(s).toContain("set_key 'hw.sensor.hinge.areas' '984-0-0-2184'");
    expect(s).toContain('ANDROID_AVD_HOME');
    expect(s).toContain('"$EMULATOR" -avd \'dobra_galaxy-z-fold-7\'');
  });

  it('writes a valid iOS script', () => {
    const s = renderScript(emulatorPlan(catalog, 'ipad-pro-13'));
    syntaxOk(s);
    expect(s).toContain("UDID=$(xcrun simctl create 'iPad Pro 13-inch (Dobra)' 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB' \"$RUNTIME\" 2>/dev/null)");
    expect(s).toContain('xcrun simctl boot "$UDID"');
  });

  it('quotes a simulator name that needs it', () => {
    const s = renderScript(emulatorPlan(catalog, 'iphone-17', { name: "Jo's $(phone)" }));
    syntaxOk(s);
    expect(s).toContain("'Jo'\\''s $(phone)'");
  });

  it('lists the limits as notes', () => {
    expect(renderScript(emulatorPlan(catalog, 'galaxy-z-flip-7'))).toMatch(/note: The cover display isn'\\''t emulated/);
  });

  it('narrows the image search to a requested API level', () => {
    expect(renderScript(emulatorPlan(catalog, 'pixel-9', { api: 34 }))).toContain('WANT_API=34');
  });

  it('picks arm64 images on Apple silicon even under Rosetta', () => {
    expect(renderScript(emulatorPlan(catalog, 'pixel-9'))).toContain('sysctl -n hw.optional.arm64');
  });

  it('finds a minor-version image folder such as android-36.1, newest first', () => {
    const sdk = mkdtempSync(join(tmpdir(), 'dobra sdk '));
    try {
      for (const folder of ['android-35/google_apis', 'android-36.1/google_apis_playstore', 'android-36/google_apis'])
        for (const abi of ['arm64-v8a', 'x86_64']) mkdirSync(join(sdk, 'system-images', folder, abi), { recursive: true });
      const run = spawnSync('sh', ['-c', renderScript(emulatorPlan(catalog, 'pixel-9'))], { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: sdk, ANDROID_HOME: sdk }, encoding: 'utf8' });
      // No avdmanager in the fake SDK, so it stops right after choosing the image.
      expect(run.stdout).toMatch(/Using system-images;android-36\.1;google_apis_playstore;(arm64-v8a|x86_64)/);
    } finally {
      rmSync(sdk, { recursive: true, force: true });
    }
  });

  it('never creates a second iOS simulator with the same name, unless forced', () => {
    const plain = renderScript(emulatorPlan(catalog, 'iphone-17'));
    syntaxOk(plain);
    expect(plain).toMatch(/already exists\. Pass --force/);
    const forced = renderScript(emulatorPlan(catalog, 'iphone-17', { force: true }));
    syntaxOk(forced);
    expect(forced).toContain('xcrun simctl delete');
  });

  it('tries the iOS runtimes newest first until one supports the device type', () => {
    const s = renderScript(emulatorPlan(catalog, 'iphone-se'));
    syntaxOk(s);
    expect(s).toMatch(/for RUNTIME in \$RUNTIMES; do/);
  });
});

describe('renderScripts', () => {
  it('writes one valid script that runs each device in its own sh, keeps going past a failure and exits 1', () => {
    const s = renderScripts([emulatorPlan(catalog, 'pixel-9'), emulatorPlan(catalog, 'galaxy-z-fold-7')]);
    syntaxOk(s);
    expect(s.match(/^sh <<'DOBRA_DEVICE_\d+'$/gm)).toHaveLength(2);
    const sdk = mkdtempSync(join(tmpdir(), 'dobra sdk '));
    try {
      mkdirSync(join(sdk, 'system-images', 'android-36', 'google_apis', 'arm64-v8a'), { recursive: true });
      mkdirSync(join(sdk, 'system-images', 'android-36', 'google_apis', 'x86_64'), { recursive: true });
      // No avdmanager in the fake SDK: both devices fail, and the second still runs.
      const run = spawnSync('sh', ['-c', s], { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: sdk, ANDROID_HOME: sdk }, encoding: 'utf8' });
      expect(run.status).toBe(1);
      expect(run.stderr.match(/avdmanager not found/g)).toHaveLength(2);
      expect(run.stderr).toContain('Failed: Pixel 9, Galaxy Z Fold 7');
    } finally {
      rmSync(sdk, { recursive: true, force: true });
    }
  });

  it('is the single script unchanged for one device', () => {
    const plan = emulatorPlan(catalog, 'pixel-9');
    expect(renderScripts([plan])).toBe(renderScript(plan));
  });
});

