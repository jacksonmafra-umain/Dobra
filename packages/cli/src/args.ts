// Command-line arguments: `hinge check site <url> [options]`. Anything malformed returns the usage text.
import { parseArgs as parseNodeArgs } from 'node:util';

export type FailOn = 'error' | 'warn' | 'never';

export interface CliOptions {
  command: 'site';
  url: string;
  targets: string[] | null;
  categories: string[];
  out: string;
  md: string | null;
  wait: number;
  failOn: FailOn;
  transitions: boolean;
}

export const USAGE = `Usage: hinge check site <url> [options]

  --targets <keys>     Comma-separated target keys (device/display/posture/orientation)
  --category <name>    Every target of a category; repeat for more
  --out <file>         Report JSON path (default foldable-report.json)
  --md <file>          Also write a Markdown summary
  --wait <ms>          Settle time after load (default 500)
  --fail-on <level>    Exit 1 on findings of this level: error, warn or never (default error);
                       a target that could not load always exits 1
  --no-transitions     Skip the unfold (resize without reload) pass`;

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
        wait: { type: 'string' },
        'fail-on': { type: 'string' },
        'no-transitions': { type: 'boolean' },
        help: { type: 'boolean' },
      },
    });
  } catch {
    return { help: USAGE };
  }
  const { values: v, positionals: p } = parsed;
  if (v.help || p.length !== 3 || p[0] !== 'check' || p[1] !== 'site') return { help: USAGE };

  let url: URL;
  try {
    url = new URL(p[2]);
  } catch {
    return { help: USAGE };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { help: USAGE };

  const wait = v.wait === undefined ? 500 : Number(v.wait);
  if (!Number.isInteger(wait) || wait < 0) return { help: USAGE };
  const failOn = (v['fail-on'] ?? 'error') as FailOn;
  if (!FAIL_ON.includes(failOn)) return { help: USAGE };

  return {
    command: 'site',
    url: p[2],
    targets: v.targets ? v.targets.split(',').map((s) => s.trim()).filter(Boolean) : null,
    categories: v.category ?? [],
    out: v.out ?? 'foldable-report.json',
    md: v.md ?? null,
    wait,
    failOn,
    transitions: !v['no-transitions'],
  };
}
