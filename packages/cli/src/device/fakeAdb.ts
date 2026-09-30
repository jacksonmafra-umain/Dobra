// A fake adb for device tests: answers per serial from a table, and records every command.
import { dir, fakeRunner, SDK, type FakeRunner } from '../emulator/fakeRunner';
import type { ExecResult } from '../emulator/runner';

export const ADB = `${SDK}/platform-tools/adb`;
export interface FakeDevice {
  state?: 'device' | 'unauthorized' | 'offline';
  model?: string;
  android?: string;
  emulator?: boolean;
  chrome?: string | null;
  avd?: string;
  /** Answers for `dumpsys device_state`, consumed in order; the last one repeats. */
  deviceStates?: string[];
  rotation?: number;
  /** Extra answers: a shell command's text to its output. */
  shell?: Record<string, string>;
}
const ok = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: '' });

export function fakeAdb(devices: Record<string, FakeDevice>, extra: (args: string[]) => ExecResult | undefined = () => undefined): FakeRunner {
  const states = new Map(Object.entries(devices).map(([s, d]) => [s, [...(d.deviceStates ?? ['OPENED'])]]));
  return fakeRunner({ ...dir(SDK), [ADB]: '' }, {}, {
    exec: (file, args) => {
      if (file !== ADB) return undefined;
      const answered = extra(args);
      if (answered) return answered;
      if (args[0] === 'devices') return ok(`List of devices attached\n${Object.entries(devices).map(([s, d]) => `${s}\t${d.state ?? 'device'} model:${(d.model ?? '').replace(/ /g, '_')}`).join('\n')}\n\n`);
      const [, serial, ...rest] = args;
      const d = devices[serial];
      if (!d) return { code: 1, stdout: '', stderr: `adb: device '${serial}' not found` };
      const cmd = rest.join(' ');
      if (cmd === 'emu avd name') return ok(`${d.avd ?? ''}\r\nOK\r\n`);
      if (cmd === 'shell getprop ro.product.model') return ok(`${d.model ?? ''}\n`);
      if (cmd === 'shell getprop ro.build.version.release') return ok(`${d.android ?? ''}\n`);
      if (cmd === 'shell getprop ro.kernel.qemu') return ok(d.emulator ? '1\n' : '\n');
      if (cmd === 'shell dumpsys package com.android.chrome') return ok(d.chrome ? `    versionName=${d.chrome}\n` : 'Unable to find package: com.android.chrome\n');
      if (cmd === 'shell dumpsys device_state') {
        const q = states.get(serial)!;
        const s = q.length > 1 ? q.shift()! : q[0];
        return ok(`  mCommittedState=Optional[DeviceState{identifier=1, name='${s}', app_accessible=true}]\n`);
      }
      if (cmd === 'shell dumpsys window displays') return ok(`      mCurrentRotation=ROTATION_${(d.rotation ?? 0) * 90}\n`);
      if (d.shell?.[cmd] !== undefined) return ok(d.shell[cmd]);
      return ok('');
    },
  });
}
