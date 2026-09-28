// The dobra command. `run` holds everything but the browser, so it is unit-tested with a fake check.
import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '@dobra/core/catalog/load';
import { toMarkdown, type Report } from '@dobra/core/report';
import { reportZip } from '@dobra/core/reportZip';
import { parseArgs } from './args';
import { checkSite } from './checkSite';
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
  const opts = parseArgs(argv);
  if ('help' in opts) {
    if (opts.error) io.err(opts.error);
    io.out(opts.help);
    return 2;
  }
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
  const capture = opts.zip ? { images: new Map<string, Uint8Array>(), missing: {} as Record<string, string> } : undefined;
  const report = await check(opts.url, targets, { wait: opts.wait, transitions: opts.transitions, onProgress: (m) => io.err(m), ...(capture ? { capture } : {}) });
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
