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
});
