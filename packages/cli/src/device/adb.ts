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

/** What `adb devices` lists: each serial and its state, before any device is asked anything. */
async function attached(r: Runner, adb: string): Promise<{ serial: string; state: ConnectedDevice['state'] }[]> {
  const res = await r.exec(adb, ['devices', '-l']);
  if (res.code !== 0) throw new ToolError(`adb devices failed: ${(res.stderr || res.stdout).trim()}`);
  return [...res.stdout.matchAll(/^(\S+)\s+(device|unauthorized|offline)\b/gm)].map((m) => ({ serial: m[1], state: m[2] as ConnectedDevice['state'] }));
}

/** Reads one device's model, versions and kind; a device that stops answering reads as offline. */
async function describe(r: Runner, adb: string, serial: string, state: ConnectedDevice['state']): Promise<ConnectedDevice> {
  const bare: ConnectedDevice = { serial, state, emulator: serial.startsWith('emulator-'), model: '', android: '', chrome: null };
  if (state !== 'device') return bare;
  try {
    const prop = async (name: string) => (await shell(r, adb, serial, 'getprop', name)).trim();
    const chrome = /versionName=(\S+)/.exec(await shell(r, adb, serial, 'dumpsys', 'package', 'com.android.chrome'))?.[1] ?? null;
    // Recent emulator images leave ro.kernel.qemu empty and set ro.boot.qemu; adb names emulators emulator-<port>.
    const emulator = serial.startsWith('emulator-') || (await prop('ro.kernel.qemu')) === '1' || (await prop('ro.boot.qemu')) === '1';
    return { serial, state, emulator, model: await prop('ro.product.model'), android: await prop('ro.build.version.release'), chrome };
  } catch (e) {
    if (e instanceof ToolError) return { ...bare, state: 'offline' };
    throw e;
  }
}

export async function listDevices(r: Runner): Promise<ConnectedDevice[]> {
  const adb = adbFor(r);
  const out: ConnectedDevice[] = [];
  for (const { serial, state } of await attached(r, adb)) out.push(await describe(r, adb, serial, state));
  return out;
}

/** The device, when it's connected and has allowed this computer; otherwise what to do about it. Only this device is asked. */
export async function requireDevice(r: Runner, serial: string): Promise<ConnectedDevice> {
  const adb = adbFor(r);
  const listed = (await attached(r, adb)).find((x) => x.serial === serial);
  if (!listed) throw new ToolError(`No device ${serial}: connect it, or check adb devices.`);
  const d = await describe(r, adb, serial, listed.state);
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

/** Whether a phone's screen is off or behind the lock screen, when dumpsys says so. Read-only. */
export async function screenLocked(r: Runner, serial: string): Promise<boolean> {
  const adb = adbFor(r);
  const power = await r.exec(adb, ['-s', serial, 'shell', 'dumpsys', 'power']);
  if (/mWakefulness=(Asleep|Dozing)/.test(power.stdout)) return true;
  const window = await r.exec(adb, ['-s', serial, 'shell', 'dumpsys', 'window', 'policy']);
  return /(mShowingLockscreen|mDreamingLockscreen|isKeyguardShowing)=true/.test(window.stdout);
}
