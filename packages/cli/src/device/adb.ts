// Connected Android devices through adb: list them, check one is usable, and read its fold state.
// Every command here only reads the device.
import { adbPath, androidPaths } from '../emulator/android';
import { ToolError, type Runner } from '../emulator/runner';

export interface ConnectedDevice {
  serial: string;
  state: 'device' | 'unauthorized' | 'offline';
  emulator: boolean;
  model: string;
  android: string;
  /** Chrome's versionName, or null when Chrome isn't installed. */
  chrome: string | null;
}

export const adbFor = (r: Runner): string => adbPath(r, androidPaths(r));

async function shell(r: Runner, adb: string, serial: string, ...args: string[]): Promise<string> {
  const res = await r.exec(adb, ['-s', serial, 'shell', ...args]);
  if (res.code !== 0) throw new ToolError(`adb on ${serial} failed: ${(res.stderr || res.stdout).trim()}`);
  return res.stdout;
}

export async function listDevices(r: Runner): Promise<ConnectedDevice[]> {
  const adb = adbFor(r);
  const res = await r.exec(adb, ['devices', '-l']);
  if (res.code !== 0) throw new ToolError(`adb devices failed: ${(res.stderr || res.stdout).trim()}`);
  const out: ConnectedDevice[] = [];
  for (const m of res.stdout.matchAll(/^(\S+)\s+(device|unauthorized|offline)\b/gm)) {
    const [, serial, state] = m as unknown as [string, string, ConnectedDevice['state']];
    if (state !== 'device') {
      out.push({ serial, state, emulator: serial.startsWith('emulator-'), model: '', android: '', chrome: null });
      continue;
    }
    const prop = async (name: string) => (await shell(r, adb, serial, 'getprop', name)).trim();
    const chrome = /versionName=(\S+)/.exec(await shell(r, adb, serial, 'dumpsys', 'package', 'com.android.chrome'))?.[1] ?? null;
    // Recent emulator images leave ro.kernel.qemu empty and set ro.boot.qemu; adb names emulators emulator-<port>.
    const emulator = serial.startsWith('emulator-') || (await prop('ro.kernel.qemu')) === '1' || (await prop('ro.boot.qemu')) === '1';
    out.push({ serial, state, emulator, model: await prop('ro.product.model'), android: await prop('ro.build.version.release'), chrome });
  }
  return out;
}

/** The device, when it's connected and has allowed this computer; otherwise what to do about it. */
export async function requireDevice(r: Runner, serial: string): Promise<ConnectedDevice> {
  const d = (await listDevices(r)).find((x) => x.serial === serial);
  if (!d) throw new ToolError(`No device ${serial}: connect it, or check adb devices.`);
  if (d.state === 'unauthorized') throw new ToolError(`${serial} hasn't allowed USB debugging from this computer: unlock it and accept the prompt.`);
  if (d.state === 'offline') throw new ToolError(`${serial} is offline: reconnect it.`);
  return d;
}

export async function deviceState(r: Runner, serial: string): Promise<{ state: 'CLOSED' | 'HALF_OPENED' | 'OPENED' | null; rotation: 0 | 1 | 2 | 3 }> {
  const adb = adbFor(r);
  const name = /mCommittedState=Optional\[DeviceState\{identifier=\d+, name='([A-Z_]+)'/.exec(await shell(r, adb, serial, 'dumpsys', 'device_state'))?.[1];
  const degrees = Number(/mCurrentRotation=ROTATION_(\d+)/.exec(await shell(r, adb, serial, 'dumpsys', 'window', 'displays'))?.[1] ?? 0);
  const state = name === 'CLOSED' || name === 'HALF_OPENED' || name === 'OPENED' ? name : null;
  return { state, rotation: ((degrees / 90) % 4) as 0 | 1 | 2 | 3 };
}
