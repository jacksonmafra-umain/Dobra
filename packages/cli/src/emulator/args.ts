// `dobra emulator list | create <device> | script <device>`. Anything malformed returns the usage.
import { parseArgs as parseNodeArgs } from 'node:util';

export type EmulatorArgs =
  | { command: 'list'; json: boolean }
  | { command: 'create' | 'script'; device: string; api: number | null; runtime: string | null; name: string | null; start: boolean; force: boolean; json: boolean }
  | { help: string; error?: string };

export const EMULATOR_USAGE = `Usage: dobra emulator list [--json]
       dobra emulator create <device> [options]
       dobra emulator script <device> [--api <n>] [--runtime <id>] [--name <name>]

Creates an Android emulator or an iOS simulator configured like a catalog device (see list).
script prints the same steps as a shell script that needs only the Android SDK or Xcode.

  --api <n>            Android API level (default: the newest installed image)
  --runtime <id>       iOS runtime, e.g. com.apple.CoreSimulator.SimRuntime.iOS-26-4 (default: the newest)
  --name <name>        Name to create (default dobra_<device> or "<Device> (Dobra)")
  --start              Start the emulator or boot the simulator once it's created
  --force              Replace an emulator or simulator with the same name
  --json               Print the result as JSON`;

export function parseEmulatorArgs(argv: string[]): EmulatorArgs {
  let parsed;
  try {
    parsed = parseNodeArgs({
      args: argv,
      allowPositionals: true,
      options: {
        api: { type: 'string' },
        runtime: { type: 'string' },
        name: { type: 'string' },
        start: { type: 'boolean' },
        force: { type: 'boolean' },
        json: { type: 'boolean' },
        help: { type: 'boolean' },
      },
    });
  } catch (e) {
    return { help: EMULATOR_USAGE, error: e instanceof Error ? e.message : String(e) };
  }
  const { values: v, positionals: [command, device, ...extra] } = parsed;
  if (v.help || extra.length) return { help: EMULATOR_USAGE };
  if (command === 'list' && !device) return { command: 'list', json: Boolean(v.json) };
  if ((command !== 'create' && command !== 'script') || !device) return { help: EMULATOR_USAGE };
  const api = v.api === undefined ? null : Number(v.api);
  if (api !== null && (!Number.isInteger(api) || api <= 0)) return { help: EMULATOR_USAGE, error: `Not an API level: ${v.api}` };
  return {
    command,
    device,
    api,
    runtime: v.runtime ?? null,
    name: v.name ?? null,
    start: Boolean(v.start),
    force: Boolean(v.force),
    json: Boolean(v.json),
  };
}
