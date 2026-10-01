// Device checks against real hardware. Both are opt in: DOBRA_MACHINE_TEST=1 boots a throwaway Fold 7
// emulator in a temporary ANDROID_AVD_HOME; DOBRA_DEVICE=<serial> checks a connected phone, which
// only gets a Chrome tab. The page comes from the machine through adb reverse.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readReportZip } from '@dobra/core/reportZip';
import { runEmulator } from '../emulator/command';
import { createNodeRunner } from '../emulator/runner';
import { run } from '../main';
import { startFixtureServer } from '../test/server';

const sdk = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const adbBin = join(sdk, 'platform-tools/adb');
const SITES = fileURLToPath(new URL('../../../../examples/sites/', import.meta.url));
const emulatorOn = process.env.DOBRA_MACHINE_TEST === '1' && existsSync(adbBin);
const phone = process.env.DOBRA_DEVICE ?? '';
const quiet = { out: () => {}, err: () => {} };

async function checkOn(serial: string, env: NodeJS.ProcessEnv, extra: string[] = []) {
  const server = await startFixtureServer(SITES);
  const port = new URL(server.url).port;
  const adb = (...args: string[]) => execFileSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', env });
  const out = mkdtempSync(join(tmpdir(), 'dobra-device-'));
  try {
    adb('reverse', `tcp:${port}`, `tcp:${port}`);
    const files = new Map<string, string | Uint8Array>();
    const errors: string[] = [];
    const code = await run(['check', 'site', `http://localhost:${port}/good.html`, '--on', serial, '--out', join(out, 'r.json'), '--zip', join(out, 'r.zip'), '--no-transitions', ...extra], {
      out: () => {},
      err: (m) => void errors.push(m),
      writeFile: async (p, d) => void files.set(p, d),
      runner: createNodeRunner(env),
    });
    if (!files.has(join(out, 'r.json'))) throw new Error(`No report (exit ${code}): ${errors.join(' | ')}`);
    const report = JSON.parse(String(files.get(join(out, 'r.json'))));
    const zip = files.get(join(out, 'r.zip')) as Uint8Array;
    return { code, report, zip };
  } finally {
    try {
      adb('reverse', '--remove', `tcp:${port}`);
    } catch {
      // the device may be gone
    }
    await server.close();
    rmSync(out, { recursive: true, force: true });
  }
}

describe.skipIf(!emulatorOn)('on a real emulator', () => {
  it('checks a Fold 7 in every posture, in real Chrome, with a screenshot per frame', async () => {
    const avdHome = mkdtempSync(join(tmpdir(), 'dobra avd '));
    const env = { ...process.env, ANDROID_AVD_HOME: avdHome };
    const runner = createNodeRunner(env);
    const serial = 'emulator-5614';
    const adb = (...args: string[]) => execFileSync(adbBin, ['-s', serial, ...args], { encoding: 'utf8', env });
    try {
      expect(await runEmulator(['create', 'galaxy-z-fold-7'], quiet, runner)).toBe(0);
      runner.start(join(sdk, 'emulator/emulator'), ['-avd', 'dobra_galaxy-z-fold-7', '-port', '5614', '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim']);
      for (let i = 0; i < 90; i++) {
        try {
          if (adb('shell', 'getprop', 'sys.boot_completed').trim() === '1') break;
        } catch {
          // not up yet
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      await new Promise((r) => setTimeout(r, 15_000));
      const { code, report, zip } = await checkOn(serial, env);
      expect([0, 1]).toContain(code);
      expect(report.frames.map((f: { name: string }) => f.name)).toEqual([
        'galaxy-z-fold-7/cover/closed/portrait',
        'galaxy-z-fold-7/inner/open/portrait',
        'galaxy-z-fold-7/inner/book/portrait',
        'galaxy-z-fold-7/inner/tabletop/landscape',
      ]);
      for (const f of report.frames) {
        expect(f.runtime.chrome).not.toBe('');
        expect(f.signals.viewport.width).toBeGreaterThan(0);
      }
      expect(readReportZip(zip).images.size).toBe(report.frames.length);
    } finally {
      try {
        adb('emu', 'kill');
      } catch {
        // already gone
      }
      await new Promise((r) => setTimeout(r, 3000));
      rmSync(avdHome, { recursive: true, force: true });
    }
  }, 600_000);
});

describe.skipIf(!phone)('on a connected phone', () => {
  it('checks the phone in its current posture, and reads the fold when Chrome reports it', async () => {
    const { report } = await checkOn(phone, process.env);
    expect(report.frames).toHaveLength(1);
    expect(report.frames[0].runtime).toMatchObject({ emulator: false, serial: phone });
    const [major] = String(report.frames[0].runtime.chrome).split('.');
    if (Number(major) >= 138 && report.frames[0].signals.deviceState === 'HALF_OPENED') expect(report.frames[0].signals.segments?.length).toBe(2);
  }, 180_000);
});
