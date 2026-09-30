import { describe, expect, it } from 'vitest';
import type { FrameSignals } from '@dobra/core/signals';
import type { Page } from 'playwright';
import { ToolError } from '../emulator/runner';
import { checkDevice, UsageError, type DeviceCheckDeps } from './checkDevice';
import { ADB, fakeAdb, type FakeDevice } from './fakeAdb';

const URL_ = 'http://localhost:4000/good.html';
const UNIX_READY = '0 @chrome_devtools_remote\n';
const signals = (deviceState: FrameSignals['deviceState']): FrameSignals => ({
  viewport: { width: 750, height: 680, dpr: 2.625 },
  devicePosture: 'continuous',
  segments: null,
  mq: { horizontalSegments2: false, verticalSegments2: false, postureFolded: false },
  deviceState,
});

function setup(
  devices: Record<string, FakeDevice>,
  opts: { collectThrows?: boolean; collectHangs?: boolean; clockStep?: number; unixReady?: boolean; connectThrows?: boolean; interruptOnSleep?: boolean } = {},
) {
  const runner = fakeAdb(devices, (args) => {
    const cmd = args.slice(2).join(' ');
    if (cmd.startsWith('forward tcp:0')) return { code: 0, stdout: '41817\n', stderr: '' };
    if (cmd.startsWith('shell am start')) return { code: 0, stdout: 'Starting: Intent\n', stderr: '' };
    if (cmd === 'shell cat /proc/net/unix') return { code: 0, stdout: opts.unixReady === false ? '' : UNIX_READY, stderr: '' };
    if (cmd.startsWith('emu posture') || cmd.startsWith('shell settings put')) return { code: 0, stdout: 'OK\n', stderr: '' };
    return undefined;
  });
  const events: string[] = [];
  let clock = 0;
  let interrupt: (() => void) | null = null;
  const page = {
    goto: async (u: string) => void events.push(`goto ${u}`),
    reload: async () => void events.push('reload'),
    url: () => URL_,
    screenshot: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  } as unknown as Page;
  const deps: DeviceCheckDeps = {
    runner,
    connect: async (port) => {
      events.push(`connect ${port}`);
      if (opts.connectThrows) throw new Error('browserType.connectOverCDP: Timeout 30000ms exceeded.');
      return { page, close: async () => void events.push('disconnect') };
    },
    collect: async () => {
      if (opts.collectThrows) throw new Error('collector failed');
      if (opts.collectHangs) return new Promise<never>(() => {});
      return { root: [] };
    },
    signals: async (_p, state) => signals(state),
    waitForEnter: async (prompt) => void events.push(`prompt ${prompt}`),
    sleep: async () => {
      clock += opts.clockStep ?? 0;
      if (opts.interruptOnSleep && interrupt) {
        // Ctrl+C: the handler runs, and the process exits before anything else.
        interrupt();
        throw new Error('exited');
      }
    },
    now: () => clock,
    onInterrupt: (cleanup) => {
      interrupt = cleanup;
      return () => {
        interrupt = null;
      };
    },
  };
  return { runner, deps, events };
}
const opts = { wait: 0, transitions: false, hold: false };
const sentTo = (r: ReturnType<typeof setup>['runner'], serial: string) => r.calls.filter((c) => c.file === ADB && c.args[1] === serial).map((c) => c.args.slice(2).join(' '));

describe('checkDevice on an emulator', () => {
  const fold = { 'emulator-5554': { emulator: true, model: 'sdk_gphone64_arm64', android: '16', chrome: '133.0.6943.137', avd: 'dobra_galaxy-z-fold-7' } };

  it('checks each distinct posture once, named by its target key', async () => {
    const { deps } = setup(fold);
    const r = await checkDevice(URL_, 'emulator-5554', opts, deps);
    expect(r.frames.map((f) => f.name)).toEqual([
      'galaxy-z-fold-7/cover/closed/portrait',
      'galaxy-z-fold-7/inner/open/portrait',
      'galaxy-z-fold-7/inner/book/portrait',
      'galaxy-z-fold-7/inner/tabletop/landscape',
    ]);
    expect(r.notes?.join(' ')).toMatch(/Dual-screen mode looks the same as Open, flat on the emulator/);
    expect(r.notes?.join(' ')).toMatch(/need Chrome 138/);
  });

  it('marks every frame as an emulator run and skips frame-size-mismatch', async () => {
    const { deps } = setup(fold);
    const r = await checkDevice(URL_, 'emulator-5554', opts, deps);
    for (const f of r.frames) {
      expect(f.runtime).toMatchObject({ emulator: true, serial: 'emulator-5554', chrome: '133.0.6943.137' });
      expect(f.findings.map((x) => x.ruleId)).not.toContain('frame-size-mismatch');
    }
  });

  it('refuses --hold on an emulator', async () => {
    const { deps } = setup(fold);
    await expect(checkDevice(URL_, 'emulator-5554', { ...opts, hold: true }, deps)).rejects.toThrow(UsageError);
  });

  it('removes the forward on Ctrl+C while it waits for Chrome', async () => {
    const { deps, runner } = setup(fold, { unixReady: false, interruptOnSleep: true });
    await expect(checkDevice(URL_, 'emulator-5554', opts, deps)).rejects.toThrow('exited');
    await new Promise((r) => setTimeout(r, 0));
    expect(sentTo(runner, 'emulator-5554')).toContain('forward --remove tcp:41817');
  });

  it("exits 1 with the fix when Playwright can't connect over DevTools", async () => {
    const { deps } = setup(fold, { connectThrows: true });
    const e = await checkDevice(URL_, 'emulator-5554', opts, deps).catch((x) => x);
    expect(e).toBeInstanceOf(ToolError);
    expect(e.message).toMatch(/couldn't connect to Chrome's DevTools on emulator-5554/i);
  });

  it("fails a frame whose page doesn't answer, instead of hanging", async () => {
    const { deps } = setup(fold, { collectHangs: true });
    const r = await checkDevice(URL_, 'emulator-5554', { ...opts, frameTimeoutMs: 5 }, deps);
    expect(r.frames).toHaveLength(0);
    expect(r.unloaded[0].reason).toMatch(/didn't answer within/);
  });

  it('captures one screenshot per frame', async () => {
    const { deps } = setup(fold);
    const capture = { images: new Map<string, Uint8Array>(), missing: {} as Record<string, string> };
    const r = await checkDevice(URL_, 'emulator-5554', { ...opts, capture }, deps);
    expect(capture.images.size).toBe(r.frames.length);
  });
});

describe('checkDevice on a phone', () => {
  const flip = (states: string[] = ['OPENED']) => ({ RZCXA15YFEJ: { model: 'SM-F741B', android: '16', chrome: '154.0.8037.57', deviceStates: states } });

  it('checks only the posture the phone is in, without --hold', async () => {
    const { deps } = setup(flip());
    const r = await checkDevice(URL_, 'RZCXA15YFEJ', opts, deps);
    expect(r.frames.map((f) => f.name)).toEqual(['galaxy-z-flip-6/inner/open/portrait']);
    expect(r.frames[0].runtime?.emulator).toBe(false);
  });

  it('never changes anything on a phone but a Chrome tab', async () => {
    const { deps, runner } = setup(flip(['OPENED', 'OPENED', 'HALF_OPENED']), { clockStep: 1000 });
    await checkDevice(URL_, 'RZCXA15YFEJ', { ...opts, hold: true }, deps);
    for (const cmd of sentTo(runner, 'RZCXA15YFEJ')) expect(cmd).not.toMatch(/settings put|^emu |install|\bpm\b/);
  });

  it('asks for each remaining posture with --hold, and skips one the phone never reaches', async () => {
    const { deps, events } = setup(flip(['OPENED']), { clockStep: 61_000 });
    const r = await checkDevice(URL_, 'RZCXA15YFEJ', { ...opts, hold: true }, deps);
    expect(events.filter((e) => e.startsWith('prompt'))).toEqual([
      'prompt Fold the phone to Closed (cover display), then press Enter.',
      'prompt Fold the phone to Half-open, Flex mode (tabletop), then press Enter.',
      'prompt Fold the phone to Half-open, rotated (book), then press Enter.',
    ]);
    expect(r.notes?.filter((n) => n.startsWith('Skipped'))).toHaveLength(3);
  });

  it('stops with the fix when the phone is locked', async () => {
    const { deps, events } = setup({ RZCXA15YFEJ: { ...flip().RZCXA15YFEJ, shell: { 'shell dumpsys power': '  mWakefulness=Asleep\n' } } });
    const e = await checkDevice(URL_, 'RZCXA15YFEJ', opts, deps).catch((x) => x);
    expect(e).toBeInstanceOf(ToolError);
    expect(e.message).toMatch(/unlock the phone/);
    expect(events).not.toContain('connect 41817');
  });

  it('asks with --hold only for postures a phone can report', async () => {
    const { deps, events } = setup({ P9: { model: 'Pixel 9 Pro Fold', android: '16', chrome: '154.0', deviceStates: ['OPENED'] } }, { clockStep: 61_000 });
    await checkDevice(URL_, 'P9', { ...opts, hold: true }, deps);
    const prompts = events.filter((e) => e.startsWith('prompt'));
    expect(prompts).toHaveLength(3);
    expect(prompts.join(' ')).not.toMatch(/Rear|Dual/);
  });

  it('checks an unknown phone as a window only, and says so', async () => {
    const { deps } = setup({ T5: { model: 'SM-T510', android: '11', chrome: '153.0' } });
    const r = await checkDevice(URL_, 'T5', opts, deps);
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0].targets).toEqual([]);
    expect(r.notes?.join(' ')).toMatch(/SM-T510 isn't in the Dobra catalog/);
    expect(r.notes?.join(' ')).toMatch(/no rules ran/);
  });

  it('removes the forward and closes the connection even when the check fails', async () => {
    const { deps, events, runner } = setup(flip(), { collectThrows: true });
    const r = await checkDevice(URL_, 'RZCXA15YFEJ', opts, deps);
    expect(r.unloaded).toHaveLength(1);
    expect(events).toContain('disconnect');
    expect(sentTo(runner, 'RZCXA15YFEJ')).toContain('forward --remove tcp:41817');
  });
});
