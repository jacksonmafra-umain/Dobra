// dobra emulator: list the catalog's devices, create an emulator or simulator for one, or print
// the shell script that does the same. Exit 0 on success, 2 for invalid use, 1 when a tool fails.
import { loadCatalog } from '@dobra/core/catalog/load';
import { emulationSupport, emulatorPlan, EmulatorPlanError, type EmulatorPlan } from '@dobra/core/emulator/plan';
import { renderScript } from '@dobra/core/emulator/script';
import { androidPaths, createAvd } from './android';
import { parseEmulatorArgs } from './args';
import { createSimulator } from './ios';
import { nodeRunner, ToolError, type Runner } from './runner';

interface Out {
  out(s: string): void;
  err(s: string): void;
}

function list(json: boolean, io: Out): number {
  const devices = emulationSupport(loadCatalog());
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

  let plan: EmulatorPlan;
  try {
    plan = emulatorPlan(loadCatalog(), args.device, {
      ...(args.api === null ? {} : { api: args.api }),
      ...(args.runtime === null ? {} : { runtime: args.runtime }),
      ...(args.name === null ? {} : { name: args.name }),
      force: args.force,
    });
  } catch (e) {
    if (e instanceof EmulatorPlanError) {
      io.err(e.message);
      return 2;
    }
    throw e;
  }
  if (args.command === 'script') {
    io.out(renderScript(plan));
    return 0;
  }

  try {
    const made = plan.platform === 'android' ? await createAvd(runner, plan, args.force) : await createSimulator(runner, plan, args.force);
    const start = startCommands(plan, made.id, made.image, runner);
    if (args.start) {
      if (plan.platform === 'android') {
        if (!runner.exists(start[0][0])) throw new ToolError(`Created ${plan.name}, but the Android emulator isn't installed, so it can't start. Install it in Android Studio's SDK Manager (Android Emulator), then run: ${start[0].join(' ')}`);
        runner.start(start[0][0], start[0].slice(1), (m) => io.err(`The emulator didn't start: ${m}`));
      }
      else for (const [tool, ...rest] of start) await runner.exec(tool, rest);
    }
    if (args.json) {
      io.out(JSON.stringify({ version: 1, platform: plan.platform, device: plan.device, name: plan.name, id: made.id, image: made.image, applied: plan.applied, limits: plan.limits, start }, null, 2));
      return 0;
    }
    io.out(`Created ${plan.name}${plan.platform === 'ios' ? ` (${made.id})` : ''} with ${made.image.split(';').slice(1, 2).join('') || made.image}.`);
    for (const a of plan.applied) io.out(`  ${a.label}: ${a.value}${a.source === 'estimated' ? ' (estimated)' : ''}`);
    if (plan.limits.length) {
      io.out('Not emulated:');
      for (const l of plan.limits) io.out(`  ${l}`);
    }
    io.out(args.start ? 'Starting it now.' : 'Start it with:');
    if (!args.start) for (const argv of start) io.out(`  ${argv.join(' ')}`);
    return 0;
  } catch (e) {
    if (e instanceof ToolError) {
      io.err(e.message);
      return 1;
    }
    throw e;
  }
}
