// `dobra emulator list | create <device> | script <device>`. Anything malformed returns the usage.
import { parseArgs as parseNodeArgs } from 'node:util';

export type EmulatorArgs =
  | { command: 'list'; json: boolean }
  | { command: 'create' | 'script'; devices: string[]; api: number | null; runtime: string | null; name: string | null; start: boolean; force: boolean; json: boolean }
  | { command: 'posture'; device: string; posture: string; orientation: 'portrait' | 'landscape' | null; name: string | null; serial: string | null; json: boolean }
  | { help: string; error?: string };

export const EMULATOR_USAGE = `Usage: dobra emulator list [--json]
       dobra emulator create <device>... [options]
       dobra emulator script <device>... [--api <n>] [--runtime <id>] [--name <name>]
       dobra emulator posture <device> <posture> [--orientation portrait|landscape] [--name <name> | --serial <id>] [--json]

Creates an Android emulator or an iOS simulator configured like a catalog device (see list).
script prints the same steps as one shell script, to save and run with sh, that needs only the
Android SDK or Xcode. Several devices run one after another; --name takes one device only.
posture switches a running Android emulator to one of the device's catalog postures.

  --api <n>            Android API level (default: the newest installed image)
  --runtime <id>       iOS runtime, e.g. com.apple.CoreSimulator.SimRuntime.iOS-26-4 (default: the newest)
  --name <name>        Name to create (default dobra_<device> or "<Device> (Dobra)")
  --start              Start the emulator or boot the simulator once it's created
  --force              Replace an emulator or simulator with the same name
  --orientation <o>    posture: portrait or landscape (default: what the posture implies)
  --serial <id>        posture: the emulator to change, e.g. emulator-5554 (default: the one named for the device)
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
        orientation: { type: 'string' },
        serial: { type: 'string' },
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
  if (command === 'posture' && device && extra.length === 1 && !v.help) {
    const orientation = v.orientation ?? null;
    if (orientation !== null && orientation !== 'portrait' && orientation !== 'landscape') return { help: EMULATOR_USAGE, error: `Not an orientation: ${orientation}` };
    return { command: 'posture', device, posture: extra[0], orientation, name: v.name ?? null, serial: v.serial ?? null, json: Boolean(v.json) };
  }
  if (v.help) return { help: EMULATOR_USAGE };
  if (command === 'list' && !device) return { command: 'list', json: Boolean(v.json) };
  if ((command !== 'create' && command !== 'script') || !device) return { help: EMULATOR_USAGE };
  const devices = [device, ...extra];
  if (devices.length > 1 && v.name !== undefined) return { help: EMULATOR_USAGE, error: '--name names one emulator; leave it out when creating several.' };
  const api = v.api === undefined ? null : Number(v.api);
  if (api !== null && (!Number.isInteger(api) || api <= 0)) return { help: EMULATOR_USAGE, error: `Not an API level: ${v.api}` };
  return {
    command,
    devices,
    api,
    runtime: v.runtime ?? null,
    name: v.name ?? null,
    start: Boolean(v.start),
    force: Boolean(v.force),
    json: Boolean(v.json),
  };
}
