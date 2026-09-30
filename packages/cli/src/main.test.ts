import { describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import type { Finding } from '@dobra/core/engine/checks';
import { buildReport, parseReport, type Report } from '@dobra/core/report';
import { run } from './main';

const catalog = loadCatalog();
const DUO = 'surface-duo-2/spanned/spanned/landscape';
const TARGET = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;

function report(severity?: Finding['severity'], unloaded = false): Report {
  const r = buildReport(catalog, { kind: 'web', ref: 'https://x.test', name: 'https://x.test' }, [
    { ref: `https://x.test#${DUO}`, name: DUO, page: 'https://x.test', width: 1100, height: 756, tag: DUO, root: unloaded ? null : [], ...(unloaded ? { reason: 'HTTP 500' } : {}) },
  ]);
  if (severity) r.frames[0].findings.push({ ruleId: 'hinge-content', severity, target: TARGET, nodeId: 'n', rect: { x: 0, y: 0, width: 1, height: 1 }, message: 'm', source: 's', estimated: false });
  return r;
}

function harness(r: Report) {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();
  const io = {
    out: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
    writeFile: async (p: string, d: string) => void files.set(p, d),
    check: async () => r,
  };
  return { io, out, err, files };
}

const site = ['check', 'site', 'https://x.test', '--targets', DUO];

describe('run', () => {
  it('prints the usage for help and returns 2', async () => {
    const h = harness(report());
    expect(await run(['--help'], h.io)).toBe(2);
    expect(h.out.join('\n')).toMatch(/Usage: dobra check site/);
  });

  it('writes the report, summarises each frame and returns 0 when clean', async () => {
    const h = harness(report());
    expect(await run([...site, '--out', 'r.json'], h.io)).toBe(0);
    expect(parseReport(JSON.parse(h.files.get('r.json')!))).toBeTruthy();
    expect(h.out.join('\n')).toContain(DUO);
    expect(h.out.join('\n')).toMatch(/Coverage: \d+\/\d+ required cells/);
  });

  it('fails on findings at or above --fail-on', async () => {
    expect(await run(site, harness(report('error')).io)).toBe(1);
    expect(await run([...site, '--fail-on', 'never'], harness(report('error')).io)).toBe(0);
    expect(await run(site, harness(report('warn')).io)).toBe(0);
    expect(await run([...site, '--fail-on', 'warn'], harness(report('warn')).io)).toBe(1);
  });

  it('also writes Markdown with --md', async () => {
    const h = harness(report());
    await run([...site, '--md', 'r.md'], h.io);
    expect(h.files.get('r.md')).toMatch(/^# /);
  });

  it('lists unloaded targets and fails even with --fail-on never', async () => {
    const h = harness(report(undefined, true));
    expect(await run(site, h.io)).toBe(1);
    expect(h.err.join('\n')).toContain('HTTP 500');
    // A site that did not load is an outage, not a clean run.
    expect(await run([...site, '--fail-on', 'never'], harness(report(undefined, true)).io)).toBe(1);
    expect(await run([...site, '--fail-on', 'never'], harness(report('error')).io)).toBe(0);
  });

  it('names an unknown target and returns 2', async () => {
    const h = harness(report());
    expect(await run(['check', 'site', 'https://x.test', '--targets', 'nope/x/-/portrait'], h.io)).toBe(2);
    expect(h.err.join('\n')).toContain('nope/x/-/portrait');
  });

  it('serves dobra report until the server closes, printing its address', async () => {
    const { io, out } = harness(report());
    let started: { port: number; host: string } | undefined;
    const serve = async (o: { port: number; host: string }) => {
      started = o;
      return { url: 'http://127.0.0.1:5301/', close: async () => {}, closed: Promise.resolve() };
    };
    expect(await run(['report', '--port', '5301'], { ...io, serve } as never)).toBe(0);
    expect(started).toMatchObject({ port: 5301, host: '127.0.0.1' });
    expect(out.join('\n')).toContain('Foldable Check: http://127.0.0.1:5301/');
  });

  it('warns when dobra report listens beyond this machine', async () => {
    const { io, err } = harness(report());
    const serve = async () => ({ url: 'http://0.0.0.0:5301/', close: async () => {}, closed: Promise.resolve() });
    expect(await run(['report', '--host', '0.0.0.0'], { ...io, serve } as never)).toBe(0);
    expect(err.join('\n')).toMatch(/other machines on your network can/);
  });

  it('writes a report package with --zip', async () => {
    const { readReportZip } = await import('@dobra/core/reportZip');
    const r = report();
    const bytes: Record<string, string | Uint8Array> = {};
    const io = {
      out: () => {},
      err: () => {},
      writeFile: async (p: string, d: string | Uint8Array) => void (bytes[p] = d),
      check: async (_u: string, _t: unknown, o: { capture?: { images: Map<string, Uint8Array> } }) => {
        o.capture?.images.set(r.frames[0].ref, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]));
        return r;
      },
    };
    expect(await run(['check', 'site', 'https://x.test', '--targets', DUO, '--zip', 'r.zip'], io as never)).toBe(0);
    const opened = readReportZip(bytes['r.zip'] as Uint8Array);
    expect(opened.report).toEqual(r);
    expect(opened.images.size).toBe(1);
  });
});

describe('a rejected address', () => {
  it('prints the reason before the usage and exits 2', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(['check', 'site', 'not an address'], { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } as never);
    expect(code).toBe(2);
    expect(err.join('\n')).toMatch(/Not a web address: not an address/);
    expect(out.join('\n')).toMatch(/Usage: dobra check site/);
  });
});

describe('dobra emulator', () => {
  it('runs the emulator command, and the main usage mentions it', async () => {
    const h = harness(report());
    expect(await run(['emulator', 'list', '--json'], h.io)).toBe(0);
    expect(JSON.parse(h.out.join('\n')).version).toBe(1);
    const help = harness(report());
    expect(await run(['--help'], help.io)).toBe(2);
    expect(help.out.join('\n')).toMatch(/dobra emulator list \| create <device> \| script <device>/);
  });
});

describe('dobra check site --on', () => {
  it('runs the device check, writes the report and exits on its findings', async () => {
    const h = harness(report());
    const calls: string[] = [];
    const io = { ...h.io, checkDevice: async (url: string, serial: string) => (calls.push(`${url} ${serial}`), report()) };
    expect(await run(['check', 'site', 'https://x.test', '--on', 'emulator-5554', '--out', 'r.json', '--no-zip'], io)).toBe(0);
    expect(calls).toEqual(['https://x.test emulator-5554']);
    expect(h.files.has('r.json')).toBe(true);
  });

  it('exits 2 for invalid use and 1 when the device fails', async () => {
    const { UsageError } = await import('./device/checkDevice');
    const { ToolError } = await import('./emulator/runner');
    const usage = harness(report());
    expect(await run(['check', 'site', 'https://x.test', '--on', 'e', '--no-zip'], { ...usage.io, checkDevice: async () => Promise.reject(new UsageError('--hold is for phones')) })).toBe(2);
    const tool = harness(report());
    expect(await run(['check', 'site', 'https://x.test', '--on', 'e', '--no-zip'], { ...tool.io, checkDevice: async () => Promise.reject(new ToolError('No device e')) })).toBe(1);
    expect(tool.err.join('\n')).toContain('No device e');
  });

  it('lists connected devices for --on with no serial', async () => {
    const h = harness(report());
    const { fakeAdb } = await import('./device/fakeAdb');
    const runner = fakeAdb({ RZCXA15YFEJ: { model: 'SM-F741B', android: '16', chrome: '154.0.8037.57' }, 'emulator-5554': { emulator: true, model: 'sdk', chrome: '133.0', avd: 'dobra_galaxy-z-fold-7' } });
    expect(await run(['check', 'site', '--on'], { ...h.io, runner })).toBe(0);
    const out = h.out.join('\n');
    expect(out).toMatch(/RZCXA15YFEJ\s+phone\s+SM-F741B\s+Android 16\s+Chrome 154\.0\.8037\.57\s+galaxy-z-flip-6\s+fold APIs: yes/);
    expect(out).toMatch(/emulator-5554\s+emulator.*galaxy-z-fold-7\s+fold APIs: no/);
  });
});
