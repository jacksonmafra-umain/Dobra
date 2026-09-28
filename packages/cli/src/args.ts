// Command-line arguments: `dobra check site <url> [options]` and `dobra report [options]`. Anything
// malformed returns the usage text.
import { parseArgs as parseNodeArgs } from 'node:util';
import { withScheme } from '@dobra/core/siteAddress';

export type FailOn = 'error' | 'warn' | 'never';

export type CliOptions = SiteOptions | ReportOptions;

export interface ReportOptions {
  command: 'report';
  port: number;
  host: string;
  /** The built report app to serve; null means the one next to this package. */
  dir: string | null;
}

export interface SiteOptions {
  command: 'site';
  url: string;
  targets: string[] | null;
  categories: string[];
  out: string;
  md: string | null;
  /** A report package: JSON, Markdown and a screenshot per target. */
  zip: string | null;
  wait: number;
  failOn: FailOn;
  transitions: boolean;
}

export const USAGE = `Usage: dobra check site <url> [options]
       dobra report [--port <n>] [--host <addr>] [--dir <folder>]

  --targets <keys>     Comma-separated target keys (device/display/posture/orientation)
  --category <name>    Every target of a category; repeat for more
  --out <file>         Report JSON path (default foldable-report.json)
  --md <file>          Also write a Markdown summary
  --zip <file>         Report package path: JSON, Markdown and a screenshot per target
                       (default: the --out name with .zip)
  --no-zip             Skip the report package and its screenshots
  --wait <ms>          Settle time after load (default 500)
  --fail-on <level>    Exit 1 on findings of this level: error, warn or never (default error);
                       a target that could not load always exits 1
  --no-transitions     Skip the unfold (resize without reload) pass

dobra report serves Foldable Check with a local site-check endpoint:
  --port <n>           Port to listen on (default 5301; 0 picks a free one)
  --host <addr>        Address to listen on (default 127.0.0.1)
  --dir <folder>       The built report app to serve (default apps/report/dist)`;

/** The package sits next to the report JSON: `out/r.json` becomes `out/r.zip`. */
const packageNameFor = (out: string) => out.replace(/\.json$/i, '') + '.zip';

const FAIL_ON: readonly FailOn[] = ['error', 'warn', 'never'];

export function parseArgs(argv: string[]): CliOptions | { help: string } {
  let parsed;
  try {
    parsed = parseNodeArgs({
      args: argv,
      allowPositionals: true,
      options: {
        targets: { type: 'string' },
        category: { type: 'string', multiple: true },
        out: { type: 'string' },
        md: { type: 'string' },
        zip: { type: 'string' },
        'no-zip': { type: 'boolean' },
        wait: { type: 'string' },
        'fail-on': { type: 'string' },
        'no-transitions': { type: 'boolean' },
        port: { type: 'string' },
        host: { type: 'string' },
        dir: { type: 'string' },
        help: { type: 'boolean' },
      },
    });
  } catch {
    return { help: USAGE };
  }
  const { values: v, positionals: p } = parsed;
  if (!v.help && p.length === 1 && p[0] === 'report') {
    const port = v.port === undefined ? 5301 : Number(v.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) return { help: USAGE };
    return { command: 'report', port, host: v.host ?? '127.0.0.1', dir: v.dir ?? null };
  }
  if (v.help || p.length !== 3 || p[0] !== 'check' || p[1] !== 'site') return { help: USAGE };

  const address = withScheme(p[2]);
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { help: USAGE };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { help: USAGE };

  const wait = v.wait === undefined ? 500 : Number(v.wait);
  if (!Number.isInteger(wait) || wait < 0) return { help: USAGE };
  const failOn = (v['fail-on'] ?? 'error') as FailOn;
  if (!FAIL_ON.includes(failOn)) return { help: USAGE };
  if (v.zip !== undefined && v['no-zip']) return { help: USAGE };
  const out = v.out ?? 'foldable-report.json';

  return {
    command: 'site',
    url: address,
    targets: v.targets ? v.targets.split(',').map((s) => s.trim()).filter(Boolean) : null,
    categories: v.category ?? [],
    out,
    md: v.md ?? null,
    zip: v['no-zip'] ? null : (v.zip ?? packageNameFor(out)),
    wait,
    failOn,
    transitions: !v['no-transitions'],
  };
}
