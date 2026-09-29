// iOS simulators: pick a runtime that supports the catalog's device type, then simctl create.
import type { EmulatorPlan } from '@dobra/core/emulator/plan';
import { ToolError, type Runner } from './runner';

interface Runtime {
  identifier: string;
  version: string;
  isAvailable: boolean;
  platform?: string;
  supportedDeviceTypes?: { identifier: string }[];
}

async function simctl(r: Runner, args: string[]): Promise<string> {
  const res = await r.exec('xcrun', ['simctl', ...args]);
  if (res.code !== 0) throw new ToolError(`xcrun simctl ${args[0]} failed: ${(res.stderr || res.stdout).trim() || 'is Xcode installed? Install it from the App Store.'}`);
  return res.stdout;
}

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

export async function createSimulator(r: Runner, plan: EmulatorPlan, force: boolean): Promise<{ id: string; image: string }> {
  const find = plan.steps.find((s) => s.kind === 'find-image');
  if (!find || find.platform !== 'ios') throw new Error('Not an iOS plan');
  const type = find.deviceType;
  const short = type.split('.').pop();
  const runtimes = (JSON.parse(await simctl(r, ['list', 'runtimes', '-j'])) as { runtimes: Runtime[] }).runtimes;
  const supports = (rt: Runtime) => rt.supportedDeviceTypes?.some((t) => t.identifier === type) ?? false;
  let runtime: Runtime | undefined;
  if (find.runtime) {
    runtime = runtimes.find((rt) => rt.identifier === find.runtime);
    if (!runtime) throw new ToolError(`No simulator runtime ${find.runtime}. Installed: ${runtimes.map((rt) => rt.identifier).join(', ') || 'none'}.`);
    if (!supports(runtime)) throw new ToolError(`${find.runtime.split('.').pop()} doesn't support ${short}. Pick another runtime with --runtime, or leave it out.`);
  } else {
    runtime = runtimes.filter((rt) => rt.isAvailable && (rt.platform ?? 'iOS') === 'iOS' && supports(rt)).sort((a, b) => newer(b.version, a.version))[0];
    if (!runtime) throw new ToolError(`No installed iOS runtime supports ${short}: a newer Xcode may be needed.`);
  }

  const devices = (JSON.parse(await simctl(r, ['list', 'devices', '-j'])) as { devices: Record<string, { name: string; udid: string }[]> }).devices;
  const same = Object.values(devices).flat().filter((d) => d.name === plan.name);
  if (same.length && !force) throw new ToolError(`A simulator named ${plan.name} already exists. Pass --force to replace it.`);
  for (const d of same) await simctl(r, ['delete', d.udid]);

  const create = plan.steps.find((s) => s.kind === 'run');
  if (!create || create.kind !== 'run') throw new Error('No create step');
  const [, ...args] = create.argv.map((w) => (w === '{runtime}' ? runtime.identifier : w));
  const udid = (await simctl(r, args.slice(1))).trim();
  return { id: udid, image: runtime.identifier };
}
