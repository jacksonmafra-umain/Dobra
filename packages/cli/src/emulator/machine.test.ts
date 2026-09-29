// Creates and removes a real AVD and simulator when the SDK or Xcode is on this machine. CI has
// neither, so it skips; locally it proves the plan works with the real tools. The AVD goes to a
// temporary ANDROID_AVD_HOME, so it never touches your own emulators.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runEmulator } from './command';
import { createNodeRunner } from './runner';

const sdk = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const hasSdk = !process.env.CI && existsSync(join(sdk, 'system-images')) && existsSync(join(sdk, 'cmdline-tools/latest/bin/avdmanager'));
const hasXcode = (() => {
  if (process.env.CI) return false;
  try {
    execFileSync('xcrun', ['simctl', 'help'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasSdk)('on a machine with the Android SDK', () => {
  it('creates a foldable AVD with the catalog settings', async () => {
    const avdHome = mkdtempSync(join(tmpdir(), 'dobra avd '));
    const runner = createNodeRunner({ ...process.env, ANDROID_AVD_HOME: avdHome });
    try {
      expect(await runEmulator(['create', 'galaxy-z-fold-7', '--name', 'dobra_machine_test'], { out: () => {}, err: () => {} }, runner)).toBe(0);
      const config = readFileSync(join(avdHome, 'dobra_machine_test.avd', 'config.ini'), 'utf8');
      expect(config).toContain('hw.lcd.width=1968');
      expect(config).toContain('hw.sensor.hinge.areas=984-0-0-2184');
      expect(config).toMatch(/image\.sysdir\.1=system-images\//);
    } finally {
      rmSync(avdHome, { recursive: true, force: true });
    }
  }, 180_000);
});

describe.skipIf(!hasXcode)('on a Mac with Xcode', () => {
  it('creates and removes a simulator', async () => {
    const out: string[] = [];
    const name = `Dobra test ${process.pid}`;
    expect(await runEmulator(['create', 'iphone-17', '--name', name, '--json'], { out: (s) => out.push(s), err: () => {} })).toBe(0);
    const { id } = JSON.parse(out.join('\n'));
    try {
      expect(execFileSync('xcrun', ['simctl', 'list', 'devices'], { encoding: 'utf8' })).toContain(name);
    } finally {
      execFileSync('xcrun', ['simctl', 'delete', id]);
    }
  }, 180_000);
});
