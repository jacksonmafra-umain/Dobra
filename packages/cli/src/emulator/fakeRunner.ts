// A Runner over an in-memory file system, for tests. A key with a null value is a directory.
import type { ExecResult, Runner } from './runner';

export const SDK = '/Users/me/Library/Android/sdk';
export const dir = (p: string): Record<string, null> => ({ [p]: null });

export interface FakeRunner extends Runner {
  calls: { file: string; args: string[]; input?: string }[];
  started: { file: string; args: string[] }[];
  fs: Map<string, string | null>;
}

export function fakeRunner(
  files: Record<string, string | null>,
  env: Record<string, string> = {},
  opts: { arch?: string; exec?: (file: string, args: string[]) => ExecResult | undefined } = {},
): FakeRunner {
  const fs = new Map(Object.entries(files));
  const calls: FakeRunner['calls'] = [];
  const started: FakeRunner['started'] = [];
  const home = '/Users/me';
  return {
    calls,
    started,
    start: (file, args) => void started.push({ file, args }),
    fs,
    env,
    arch: opts.arch ?? 'arm64',
    platform: 'darwin',
    home,
    exists: (p) => fs.has(p) || [...fs.keys()].some((k) => k.startsWith(p + '/')),
    list: (d) => [...new Set([...fs.keys()].filter((k) => k.startsWith(d + '/')).map((k) => k.slice(d.length + 1).split('/')[0]))],
    read: (p) => fs.get(p) ?? '',
    write: (p, data) => void fs.set(p, data),
    rename: (a, b) => {
      fs.set(b, fs.get(a) ?? '');
      fs.delete(a);
    },
    exec: async (file, args, input) => {
      calls.push({ file, args, ...(input === undefined ? {} : { input }) });
      const answer = opts.exec?.(file, args);
      if (answer) return answer;
      if (file.endsWith('avdmanager') && args[0] === 'create') {
        const avdHome = env.ANDROID_AVD_HOME ?? `${home}/.android/avd`;
        fs.set(`${avdHome}/${args[args.indexOf('-n') + 1]}.avd/config.ini`, 'hw.lcd.width=320\nimage.sysdir.1=x\n');
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  };
}
