// dobra check site --on <serial>: the site in Chrome on an Android device, posture by posture. An
// emulator is put in each catalog posture (part B); a phone is checked as it is, and with --hold
// the person folds it to each other posture. On a phone, nothing changes but a Chrome tab.
import { loadCatalog } from '@dobra/core/catalog/load';
import { emulatorPosture, posturesOf } from '@dobra/core/emulator/posture';
import type { GeoNode } from '@dobra/core/geo';
import { buildReport, type Report, type ReportInput } from '@dobra/core/report';
import type { FrameRuntime, FrameSignals } from '@dobra/core/signals';
import { resizeVsReload } from '@dobra/core/transition';
import { parseTargetKey } from '@dobra/core/targets';
import type { Finding } from '@dobra/core/engine/checks';
import type { Page } from 'playwright';
import { setEmulatorPosture } from '../emulator/android';
import type { Runner } from '../emulator/runner';
import { adbFor, deviceState, requireDevice } from './adb';
import { openChrome } from './chrome';
import { identify, phonePosture } from './identify';

/** Invalid use (exit 2), as opposed to a device or tool that failed (ToolError, exit 1). */
export class UsageError extends Error {}

export interface DeviceCheckDeps {
  runner: Runner;
  connect(port: number): Promise<{ page: Page; close(): Promise<void> }>;
  collect(page: Page): Promise<{ root: GeoNode[] }>;
  signals(page: Page, deviceState: FrameSignals['deviceState']): Promise<FrameSignals>;
  waitForEnter(prompt: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** Runs cleanup on Ctrl+C for the length of the check; returns the function that stops listening. */
  onInterrupt(cleanup: () => void): () => void;
}

export interface DeviceCheckOptions {
  wait: number;
  transitions: boolean;
  hold: boolean;
  onProgress?(m: string): void;
  capture?: { images: Map<string, Uint8Array>; missing: Record<string, string> };
}

interface Step {
  posture: string | null;
  label: string;
  display: string | null;
  orientation: 'portrait' | 'landscape' | null;
  set?: { emulator: 1 | 2 | 3; rotation: 0 | 1 | null };
}

const HOLD_TIMEOUT = 60_000;

export async function checkDevice(url: string, serial: string, opts: DeviceCheckOptions, deps: DeviceCheckDeps): Promise<Report> {
  const { runner } = deps;
  const catalog = loadCatalog();
  const adb = adbFor(runner);
  const device = await requireDevice(runner, serial);
  if (opts.hold && device.emulator) throw new UsageError('--hold is for phones: Dobra folds an emulator itself.');
  const { deviceId } = await identify(runner, adb, device, catalog);
  const runtime: FrameRuntime = { kind: 'android-chrome', serial, model: device.model, android: device.android, chrome: device.chrome ?? '', emulator: device.emulator };
  const cat = deviceId ? catalog.devices.find((d) => d.id === deviceId) : undefined;
  const postures = cat?.platform === 'android' ? (cat.postures ?? []) : [];
  const notes: string[] = [];
  const naturalOf = (displayId: string) => {
    const size = cat?.platform === 'android' ? cat.displays[displayId].size : null;
    return size && size.width > size.height ? 'landscape' : 'portrait';
  };

  // The postures to check, in catalog order.
  const steps: Step[] = [];
  if (!deviceId) {
    notes.push(`${device.model || serial} isn't in the Dobra catalog, so only the window was checked (no fold geometry).`);
    steps.push({ posture: null, label: device.model || serial, display: null, orientation: null });
  } else if (device.emulator) {
    const seen = new Map<string, string>();
    for (const id of posturesOf(catalog, deviceId)) {
      const p = postures.find((x) => x.id === id)!;
      let t;
      try {
        t = emulatorPosture(catalog, deviceId, id);
      } catch {
        continue; // rear display and the like: the emulator can't take it
      }
      const key = `${t.emulator}/${t.rotation}`;
      if (seen.has(key)) {
        notes.push(`${p.label} looks the same as ${seen.get(key)} on the emulator, so it was checked once.`);
        continue;
      }
      seen.set(key, p.label);
      steps.push({ posture: id, label: p.label, display: p.display, orientation: t.orientation ?? naturalOf(p.display), set: { emulator: t.emulator, rotation: t.rotation } });
    }
  } else {
    const now = await deviceState(runner, serial);
    const current = now.state ? phonePosture(catalog, deviceId, now.state, now.rotation) : null;
    if (current) {
      const p = postures.find((x) => x.id === current.posture)!;
      steps.push({ posture: p.id, label: p.label, display: p.display, orientation: current.orientation });
    } else {
      notes.push(`The phone's state (${now.state ?? 'unknown'}) matches no ${cat?.name ?? deviceId} posture, so only the window was checked.`);
      steps.push({ posture: null, label: device.model, display: null, orientation: null });
    }
    if (opts.hold) for (const p of postures) if (p.id !== current?.posture) steps.push({ posture: p.id, label: p.label, display: p.display, orientation: null });
  }

  const inputs: ReportInput[] = [];
  const extra = new Map<string, Finding[]>();
  const chrome = await openChrome(runner, serial, url);
  let connection: Awaited<ReturnType<DeviceCheckDeps['connect']>> | null = null;
  const stop = deps.onInterrupt(() => void chrome.close());
  try {
    connection = await deps.connect(chrome.port);
    const { page } = connection;
    let previous: Step | null = null;
    for (const [i, step] of steps.entries()) {
      if (!device.emulator && i > 0) {
        // --hold: the person folds the phone; wait until its state says so.
        await deps.waitForEnter(`Fold the phone to ${step.label}, then press Enter.`);
        const start = deps.now();
        let reached: { posture: string; orientation: 'portrait' | 'landscape' } | null = null;
        while (deps.now() - start < HOLD_TIMEOUT) {
          const s = await deviceState(runner, serial);
          const p = s.state && deviceId ? phonePosture(catalog, deviceId, s.state, s.rotation) : null;
          if (p?.posture === step.posture) {
            reached = p;
            break;
          }
          await deps.sleep(500);
        }
        if (!reached) {
          notes.push(`Skipped ${step.label}: the phone didn't reach it within 60 s.`);
          continue;
        }
        step.orientation = reached.orientation;
      }
      const tag = deviceId && step.posture && step.display && step.orientation ? `${deviceId}/${step.display}/${step.posture}/${step.orientation}` : '';
      const name = tag || `${device.model || serial} (${serial})`;
      const ref = `${url}#${tag || serial}`;
      opts.onProgress?.(`Checking ${serial} ${step.posture ?? ''}`.trim());
      try {
        let afterResize: GeoNode[] | null = null;
        if (step.set) {
          await setEmulatorPosture(runner, adb, serial, step.set);
          await deps.sleep(1500);
          // Unfolding resizes the window without a reload: compare that with a fresh load.
          const unfold = opts.transitions && previous?.posture && postures.find((p) => p.id === previous!.posture)?.kind === 'cover';
          if (unfold) afterResize = (await deps.collect(page)).root;
        }
        await page.goto(url);
        await deps.sleep(opts.wait);
        const { root } = await deps.collect(page);
        const state = (await deviceState(runner, serial)).state;
        const signals = await deps.signals(page, state);
        inputs.push({ ref, name, page: url, width: signals.viewport.width, height: signals.viewport.height, tag, root, runtime, signals, skipRules: ['frame-size-mismatch'] });
        if (afterResize && tag) {
          const target = parseTargetKey(tag);
          if (target) extra.set(ref, resizeVsReload(afterResize, root, target));
        }
        if (opts.capture) {
          try {
            opts.capture.images.set(ref, await page.screenshot({ type: 'png' }));
          } catch (e) {
            opts.capture.missing[ref] = `The screenshot failed: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      } catch (e) {
        // A device that went away ends the run; anything else fails only this frame.
        const gone = await requireDevice(runner, serial).then(
          () => false,
          () => true,
        );
        inputs.push({ ref, name, page: url, width: 0, height: 0, tag, root: null, reason: gone ? 'The device disconnected.' : e instanceof Error ? e.message : String(e) });
        if (gone) break;
      }
      previous = step;
    }
  } finally {
    stop();
    await connection?.close().catch(() => {});
    await chrome.close();
  }
  if (opts.capture) for (const i of inputs) if (!i.root) opts.capture.missing[i.ref] = i.reason ?? 'The page did not load.';
  const report = buildReport(catalog, { kind: 'web', ref: url, name: url }, inputs);
  for (const f of report.frames) f.findings.push(...(extra.get(f.ref) ?? []));
  const all = [...(report.notes ?? []), ...notes];
  return all.length ? { ...report, notes: all } : report;
}

