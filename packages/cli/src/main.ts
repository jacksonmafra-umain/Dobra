// The hinge command. `run` holds everything but the browser, so it is unit-tested with a fake check.
import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '@dobra/core/catalog/load';
import { toMarkdown, type Report } from '@dobra/core/report';
import { parseArgs } from './args';
import { checkSite } from './checkSite';
import { chooseTargets } from './targets';

export interface Io {
  out(s: string): void;
  err(s: string): void;
  writeFile(path: string, data: string): Promise<void>;
  check?: typeof checkSite;
}

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
    io.out(opts.help);
    return 2;
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
  const report = await check(opts.url, targets, { wait: opts.wait, transitions: opts.transitions, onProgress: (m) => io.err(m) });
  await io.writeFile(opts.out, `${JSON.stringify(report, null, 2)}\n`);
  if (opts.md) await io.writeFile(opts.md, toMarkdown(report));
  summarise(report, io);
  io.out(`Report: ${opts.out}${opts.md ? `, ${opts.md}` : ''}`);

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
    writeFile: (p, d) => writeFile(p, d, 'utf8'),
  };
  run(process.argv.slice(2), io).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    },
  );
}
