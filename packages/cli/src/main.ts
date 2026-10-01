// The dobra command. `run` holds everything but the browser, so it is unit-tested with a fake check.
import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '@dobra/core/catalog/load';
import { toMarkdown, type Report } from '@dobra/core/report';
import { reportZip } from '@dobra/core/reportZip';
import { chromeMajor, FOLD_API_CHROME } from '@dobra/core/signals';
import { parseArgs, type SiteOptions } from './args';
import { adbFor, listDevices } from './device/adb';
import { checkDevice, Interrupted, UsageError, type DeviceCheckDeps, type DeviceCheckOptions } from './device/checkDevice';
import { pickPage } from './device/chrome';
import { identify } from './device/identify';
import { readSignals } from './device/signals';
import { runEmulator } from './emulator/command';
import { nodeRunner, ToolError, type Runner } from './emulator/runner';
import { checkSite } from './checkSite';
import { collectLayout } from './collect';
import { isLoopback, startLocalServer } from './localServer';
import { LOCAL } from './policy';
import { createCheckHandler } from './server';
import { chooseTargets } from './targets';

export interface Io {
  out(s: string): void;
  err(s: string): void;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  check?: typeof checkSite;
  serve?: typeof startLocalServer;
  /** For tests: the device check, and the machine adb runs on. */
  checkDevice?: (url: string, serial: string, opts: DeviceCheckOptions) => Promise<Report>;
  runner?: Runner;
}

/** The real dependencies of a device check: Playwright over DevTools, stdin, the clock. */
function deviceDeps(runner: Runner, url: string): DeviceCheckDeps {
  return {
    runner,
    connect: async (port) => {
      const { chromium } = await import('playwright');
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 20_000 });
      // The tab Chrome opened for the address can take a moment to appear. Never another tab.
      for (let waited = 0; ; waited += 500) {
        const pages = browser.contexts().flatMap((c) => c.pages());
        const i = pickPage(
          pages.map((p) => p.url()),
          url,
        );
        if (i >= 0) return { page: pages[i], close: () => browser.close() };
        if (waited >= 20_000) {
          await browser.close().catch(() => {});
          throw new ToolError(`Chrome on the device didn't show ${url}: unlock the phone, keep Chrome in front, and run the check again.`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    },
    collect: (page) => collectLayout(page),
    signals: readSignals,
    waitForEnter: async (prompt) => {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        await rl.question(`${prompt} `);
      } catch (e) {
        // Ctrl+C at the prompt rejects the question instead of raising SIGINT.
        if (e instanceof Error && e.name === 'AbortError') throw new Interrupted('Stopped.');
        throw e;
      } finally {
        rl.close();
      }
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    onInterrupt: (cleanup) => {
      const handler = () => {
        cleanup();
        process.exit(130);
      };
      process.once('SIGINT', handler);
      return () => process.off('SIGINT', handler);
    },
  };
}

async function listConnected(io: Io): Promise<number> {
  const runner = io.runner ?? nodeRunner;
  const catalog = loadCatalog();
  let devices;
  try {
    devices = await listDevices(runner);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 1;
  }
  if (!devices.length) io.out('No devices: connect a phone with USB debugging on, or start an emulator.');
  for (const d of devices) {
    if (d.state !== 'device') {
      io.out(`${d.serial}  ${d.state}`);
      continue;
    }
    const { deviceId } = await identify(runner, adbFor(runner), d, catalog);
    const fold = d.chrome && chromeMajor(d.chrome) >= FOLD_API_CHROME ? 'yes' : 'no';
    io.out(`${d.serial}  ${d.emulator ? 'emulator' : 'phone'}  ${d.model}  Android ${d.android}  Chrome ${d.chrome ?? 'none'}  ${deviceId ?? 'not in catalog'}  fold APIs: ${fold}`);
  }
  return 0;
}

/** The built report app, next to this package in the repo: apps/report/dist. */
const REPORT_DIR = fileURLToPath(new URL('../../../apps/report/dist/', import.meta.url));

const RANK = { info: 0, warn: 1, error: 2 } as const;

function summarise(report: Report, io: Io): void {
  for (const f of report.frames) {
    const errors = f.findings.filter((x) => x.severity === 'error').length;
    const warns = f.findings.filter((x) => x.severity === 'warn').length;
    const icon = errors ? '⛔' : warns ? '⚠️' : '✓';
    io.out(`${icon} ${f.name}: ${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`);
  }
  for (const u of report.unloaded) io.err(`✗ ${u.name}: ${u.reason}`);
  for (const n of report.notes ?? []) io.err(`note: ${n}`);
  const cats = Object.values(report.coverage.byCategory);
  const present = cats.reduce((s, c) => s + c.present, 0);
  const required = cats.reduce((s, c) => s + c.required, 0);
  io.out(`Coverage: ${present}/${required} required cells`);
}

/** Runs the command and returns the exit code: 0 clean, 1 findings or unloaded targets, 2 bad input. */
export async function run(argv: string[], io: Io): Promise<number> {
  if (argv[0] === 'emulator') return runEmulator(argv.slice(1), io);
  const opts = parseArgs(argv);
  if ('help' in opts) {
    if (opts.error) io.err(opts.error);
    io.out(opts.help);
    return 2;
  }
  if (opts.command === 'devices') return listConnected(io);
  if (opts.command === 'report') {
    const handler = createCheckHandler({
      policy: LOCAL,
      // Loaded on first use, so starting the server and its tests never need a browser.
      launch: async () => (await import('playwright')).chromium.launch(),
      ...(io.check ? { check: io.check } : {}),
    });
    const server = await (io.serve ?? startLocalServer)({ port: opts.port, host: opts.host, dir: opts.dir ?? REPORT_DIR, handler });
    io.out(`Foldable Check: ${server.url}`);
    io.out('Checks run on this machine, so local and staging addresses work. Press Ctrl+C to stop.');
    if (!isLoopback(opts.host))
      io.err(`Listening on ${opts.host}: other machines on your network can open this page and check any address, including private ones.`);
    process.once('SIGINT', () => void server.close());
    await server.closed;
    return 0;
  }
  const capture = opts.zip ? { images: new Map<string, Uint8Array>(), missing: {} as Record<string, string> } : undefined;
  let report: Report;
  if (opts.on) {
    const serial = opts.on;
    try {
      const runner = io.runner ?? nodeRunner;
      const deviceOpts: DeviceCheckOptions = { wait: opts.wait, transitions: opts.transitions, hold: opts.hold, onProgress: (m) => io.err(m), ...(capture ? { capture } : {}) };
      report = await (io.checkDevice ?? ((u, s, o) => checkDevice(u, s, o, deviceDeps(runner, u))))(opts.url, serial, deviceOpts);
    } catch (e) {
      if (e instanceof UsageError || e instanceof ToolError || e instanceof Interrupted) {
        io.err(e.message);
        return e instanceof UsageError ? 2 : e instanceof Interrupted ? 130 : 1;
      }
      throw e;
    }
    return finish(report, opts, capture, io);
  }
  let targets;
  try {
    targets = chooseTargets(loadCatalog(), opts);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 2;
  }
  if (!targets.length) {
    io.err('No targets match those options.');
    return 2;
  }
  const check = io.check ?? checkSite;
  report = await check(opts.url, targets, { wait: opts.wait, transitions: opts.transitions, onProgress: (m) => io.err(m), ...(capture ? { capture } : {}) });
  return finish(report, opts, capture, io);
}

/** Writes the report files, prints the summary and returns the exit code: the same for every kind of check. */
async function finish(report: Report, opts: SiteOptions, capture: { images: Map<string, Uint8Array>; missing: Record<string, string> } | undefined, io: Io): Promise<number> {
  await io.writeFile(opts.out, `${JSON.stringify(report, null, 2)}\n`);
  if (opts.md) await io.writeFile(opts.md, toMarkdown(report));
  let zipSize = 0;
  if (opts.zip && capture) {
    const zip = reportZip(report, capture.images, capture.missing);
    zipSize = zip.length;
    await io.writeFile(opts.zip, zip);
  }
  summarise(report, io);
  io.out(`Report: ${opts.out}${opts.md ? `, ${opts.md}` : ''}${opts.zip ? `, ${opts.zip} (${(zipSize / 1024 / 1024).toFixed(1)} MB)` : ''}`);

  // A target that did not load always fails: CI must not read an outage as a clean run.
  if (report.unloaded.length) return 1;
  if (opts.failOn === 'never') return 0;
  const floor = RANK[opts.failOn];
  return report.frames.some((f) => f.findings.some((x) => RANK[x.severity] >= floor)) ? 1 : 0;
}

const isEntry = (() => {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isEntry) {
  const io: Io = {
    out: (s) => console.log(s),
    err: (s) => console.error(s),
    writeFile: (p, d) => (typeof d === 'string' ? writeFile(p, d, 'utf8') : writeFile(p, d)),
  };
  run(process.argv.slice(2), io).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    },
  );
}
