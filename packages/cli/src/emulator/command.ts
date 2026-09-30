// dobra emulator: list the catalog's devices, create an emulator or simulator for one, or print
// the shell script that does the same. Exit 0 on success, 2 for invalid use, 1 when a tool fails.
import { loadCatalog } from '@dobra/core/catalog/load';
import { avdName, emulationSupport, emulatorPlan, EmulatorPlanError, type EmulatorPlan } from '@dobra/core/emulator/plan';
import { emulatorPosture, posturesOf } from '@dobra/core/emulator/posture';
import { renderScripts } from '@dobra/core/emulator/script';
import { adbPath, androidPaths, createAvd, findEmulator } from './android';
import { parseEmulatorArgs } from './args';
import { createSimulator } from './ios';
import { nodeRunner, ToolError, type Runner } from './runner';

interface Out {
  out(s: string): void;
  err(s: string): void;
}

function list(json: boolean, io: Out): number {
  const catalog = loadCatalog();
  const devices = emulationSupport(catalog).map((d) => ({ ...d, postures: posturesOf(catalog, d.id) }));
  if (json) {
    io.out(JSON.stringify({ version: 1, devices }, null, 2));
    return 0;
  }
  const width = Math.max(...devices.map((d) => d.id.length));
  const catWidth = Math.max(...devices.map((d) => d.category.length));
  for (const d of devices) {
    io.out(`${d.id.padEnd(width)}  ${d.platform.padEnd(7)}  ${d.category.padEnd(catWidth)}  ${d.support}`);
    if (d.support !== 'full') for (const l of d.limits) io.out(`${' '.repeat(width + 2)}${l}`);
  }
  return 0;
}

/** The start commands with the real tool path and ids in place of the plan's placeholders. */
function startCommands(plan: EmulatorPlan, id: string, image: string, runner: Runner): string[][] {
  const emulator = plan.platform === 'android' ? androidPaths(runner).emulator : 'emulator';
  return plan.start.map((argv) =>
    argv.map((w, i) => (w === '{udid}' ? id : w === '{image}' || w === '{runtime}' ? image : i === 0 && w === 'emulator' ? emulator : w)),
  );
}

export async function runEmulator(argv: string[], io: Out, runner: Runner = nodeRunner): Promise<number> {
  const args = parseEmulatorArgs(argv);
  if ('help' in args) {
    if (args.error) io.err(args.error);
    io.out(args.help);
    return 2;
  }
  if (args.command === 'list') return list(args.json, io);
  if (args.command === 'posture') return posture(args, io, runner);

  // Every device is checked before anything is created, so a typo creates nothing.
  const plans: EmulatorPlan[] = [];
  try {
    for (const device of args.devices)
      plans.push(
        emulatorPlan(loadCatalog(), device, {
          ...(args.api === null ? {} : { api: args.api }),
          ...(args.runtime === null ? {} : { runtime: args.runtime }),
          ...(args.name === null ? {} : { name: args.name }),
          force: args.force,
        }),
      );
  } catch (e) {
    if (e instanceof EmulatorPlanError) {
      io.err(e.message);
      return 2;
    }
    throw e;
  }
  if (args.command === 'script') {
    io.out(renderScripts(plans));
    return 0;
  }

  const results: Record<string, unknown>[] = [];
  for (const plan of plans) {
    try {
      results.push(await createOne(plan, args, io, runner));
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      io.err(plans.length > 1 ? `${plan.device.name}: ${e.message}` : e.message);
      results.push({ version: 1, platform: plan.platform, device: plan.device, name: plan.name, error: e.message });
    }
  }
  if (args.json) io.out(JSON.stringify(results.length === 1 ? results[0] : { version: 1, results }, null, 2));
  return results.some((r) => 'error' in r) ? 1 : 0;
}

type PostureArgs = Extract<ReturnType<typeof parseEmulatorArgs>, { command: 'posture' }>;

/** Switches a running emulator to a catalog posture: exit 0, 2 for a posture it can't take, 1 when adb or the emulator isn't there. */
async function posture(args: PostureArgs, io: Out, runner: Runner): Promise<number> {
  let target;
  try {
    target = emulatorPosture(loadCatalog(), args.device, args.posture, args.orientation ?? undefined);
  } catch (e) {
    if (e instanceof EmulatorPlanError) {
      io.err(e.message);
      return 2;
    }
    throw e;
  }
  try {
    const paths = androidPaths(runner);
    const adb = adbPath(runner, paths);
    const name = args.name ?? avdName(args.device);
    const serial = args.serial ?? (await findEmulator(runner, adb, name));
    if (!serial) throw new ToolError(`${name} isn't running. Start it with:\n  ${paths.emulator} -avd ${name}`);
    const send = async (argv: string[]) => {
      const res = await runner.exec(adb, ['-s', serial, ...argv]);
      if (res.code !== 0 || /^KO/m.test(res.stdout)) throw new ToolError(`adb ${argv.join(' ')} failed on ${serial}: ${(res.stderr || res.stdout).trim()}`);
    };
    if (target.rotation !== null) {
      // Absolute rotation: auto-rotate off, then USER_ROTATION (0 natural, 1 turned 90°), then the posture.
      await send(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
      await send(['shell', 'settings', 'put', 'system', 'user_rotation', String(target.rotation)]);
    }
    await send(['emu', 'posture', String(target.emulator)]);
    const { orientation } = target;
    if (args.json) {
      io.out(JSON.stringify({ version: 1, device: target.device, posture: target.posture, emulator: target.emulator, serial, orientation }, null, 2));
      return 0;
    }
    const state = { 1: 'closed', 2: 'half-open', 3: 'open' }[target.emulator];
    io.out(`${serial}: ${target.posture} (${state}${orientation ? `, ${orientation}` : ''}).`);
    if (target.note) io.out(`  ${target.note}`);
    return 0;
  } catch (e) {
    if (e instanceof ToolError) {
      io.err(e.message);
      return 1;
    }
    throw e;
  }
}

/** Creates one emulator or simulator, starts it when asked, and prints what it made unless the output is JSON. */
async function createOne(plan: EmulatorPlan, { start, json, force }: { start: boolean; json: boolean; force: boolean }, io: Out, runner: Runner): Promise<Record<string, unknown>> {
  const made = plan.platform === 'android' ? await createAvd(runner, plan, force) : await createSimulator(runner, plan, force);
  const commands = startCommands(plan, made.id, made.image, runner);
  if (start) {
    if (plan.platform === 'android') {
      if (!runner.exists(commands[0][0])) throw new ToolError(`Created ${plan.name}, but the Android emulator isn't installed, so it can't start. Install it in Android Studio's SDK Manager (Android Emulator), then run: ${commands[0].join(' ')}`);
      runner.start(commands[0][0], commands[0].slice(1), (m) => io.err(`The emulator didn't start: ${m}`));
    } else for (const [tool, ...rest] of commands) await runner.exec(tool, rest);
  }
  if (!json) {
    io.out(`Created ${plan.name}${plan.platform === 'ios' ? ` (${made.id})` : ''} with ${made.image.split(';').slice(1, 2).join('') || made.image}.`);
    for (const a of plan.applied) io.out(`  ${a.label}: ${a.value}${a.source === 'estimated' ? ' (estimated)' : ''}`);
    if (plan.limits.length) {
      io.out('Not emulated:');
      for (const l of plan.limits) io.out(`  ${l}`);
    }
    io.out(start ? 'Starting it now.' : 'Start it with:');
    if (!start) for (const argv of commands) io.out(`  ${argv.join(' ')}`);
  }
  return { version: 1, platform: plan.platform, device: plan.device, name: plan.name, id: made.id, image: made.image, applied: plan.applied, limits: plan.limits, start: commands };
}

