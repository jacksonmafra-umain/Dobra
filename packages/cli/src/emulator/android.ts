// Android emulators: find the SDK and a system image, create the AVD, then write the device's
// settings into its config.ini. The same rules as the script core renders.
import { join } from 'node:path';
import type { EmulatorPlan } from '@dobra/core/emulator/plan';
import { ToolError, type Runner } from './runner';

export interface AndroidPaths {
  sdk: string;
  avdHome: string;
  avdmanager: string;
  emulator: string;
}

const TAGS = ['google_apis_playstore', 'google_apis', 'default'];

export const hostAbi = (arch: string): 'arm64-v8a' | 'x86_64' => (arch === 'arm64' ? 'arm64-v8a' : 'x86_64');

export function androidPaths(r: Runner): AndroidPaths {
  const candidates = [r.env.ANDROID_HOME, r.env.ANDROID_SDK_ROOT, join(r.home, r.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk')];
  const sdk = candidates.find((p): p is string => Boolean(p) && r.exists(p!));
  if (!sdk) throw new ToolError('No Android SDK: install Android Studio or set ANDROID_HOME.');
  const avdHome = r.env.ANDROID_AVD_HOME ?? join(r.env.ANDROID_USER_HOME ?? join(r.home, '.android'), 'avd');
  const bundled = join(sdk, 'cmdline-tools/latest/bin/avdmanager');
  return { sdk, avdHome, avdmanager: r.exists(bundled) ? bundled : 'avdmanager', emulator: join(sdk, 'emulator/emulator') };
}

/** The newest installed image for this processor, as an sdkmanager package path. */
export function findImage(r: Runner, sdk: string, api: number | null): string {
  const root = join(sdk, 'system-images');
  const abi = hostAbi(r.arch);
  let best: { api: number; image: string } | null = null;
  const other: string[] = [];
  for (const folder of r.list(root)) {
    const level = /^android-(\d+)(?:-|$)/.exec(folder);
    if (!level || (api !== null && Number(level[1]) !== api)) continue;
    const tag = TAGS.find((t) => r.exists(join(root, folder, t, abi)));
    if (tag) {
      if (!best || Number(level[1]) > best.api) best = { api: Number(level[1]), image: `system-images;${folder};${tag};${abi}` };
    } else {
      for (const t of TAGS) for (const a of r.list(join(root, folder, t))) other.push(`${folder}/${t}/${a}`);
    }
  }
  if (best) return best.image;
  const lines = [
    ...(other.length ? [`Installed images are for another processor: ${other.join(', ')}.`] : []),
    `No ${abi} system image${api === null ? '' : ` for API ${api}`}. Install one with:`,
    `  "${join(sdk, 'cmdline-tools/latest/bin/sdkmanager')}" --install "system-images;android-${api ?? 36};google_apis_playstore;${abi}"`,
  ];
  throw new ToolError(lines.join('\n'));
}

/** Replaces or appends each key, keeping every other line of the AVD's own config. */
function withSettings(config: string, settings: Record<string, string>): string {
  const lines = config.split('\n').filter((l) => l !== '');
  for (const [k, v] of Object.entries(settings)) {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function createAvd(r: Runner, plan: EmulatorPlan, force: boolean): Promise<{ id: string; image: string }> {
  const paths = androidPaths(r);
  const find = plan.steps.find((s) => s.kind === 'find-image');
  const image = findImage(r, paths.sdk, find && find.platform === 'android' ? find.api : null);
  const folder = join(paths.avdHome, `${plan.name}.avd`);
  if (!force && r.exists(folder)) throw new ToolError(`An emulator named ${plan.name} already exists. Pass --force to replace it.`);
  for (const s of plan.steps) {
    if (s.kind === 'run') {
      const [tool, ...args] = s.argv.map((w) => (w === '{image}' ? image : w));
      const res = await r.exec(tool === 'avdmanager' ? paths.avdmanager : tool, args, s.input);
      if (res.code !== 0) throw new ToolError(`${tool} failed: ${(res.stderr || res.stdout).trim()}`);
    } else if (s.kind === 'write-config') {
      // Only after avdmanager succeeded, and through a temp file, so a failed run leaves no half-written config.
      const config = join(folder, 'config.ini');
      r.write(`${config}.tmp`, withSettings(r.exists(config) ? r.read(config) : '', s.settings));
      r.rename(`${config}.tmp`, config);
    }
  }
  return { id: plan.name, image };
}
