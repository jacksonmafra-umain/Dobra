// End-to-end acceptance: builds the real `dobra` binary and runs it the way CI does, against the
// example sites, checking exit codes and the report files it writes.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseReport } from '@dobra/core/report';
import { startFixtureServer } from './test/server';

const CLI_DIR = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(CLI_DIR, 'dist/dobra.mjs');
const SITES = fileURLToPath(new URL('../../../examples/sites/', import.meta.url));
const DUO = 'surface-duo-2/spanned/spanned/landscape';
const FLIP_INNER = 'galaxy-z-flip-7/inner/open/portrait';

let server: Awaited<ReturnType<typeof startFixtureServer>>;
let out: string;

beforeAll(async () => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: CLI_DIR, stdio: 'ignore' });
  server = await startFixtureServer(SITES);
  out = mkdtempSync(join(tmpdir(), 'dobra-e2e-'));
}, 120_000);
afterAll(async () => {
  await server?.close();
  if (out) rmSync(out, { recursive: true, force: true });
});

function dobra(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { timeout: 120_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

const site = (file: string) => `${server.url}/${file}`;
const readReport = (file: string) => parseReport(JSON.parse(readFileSync(join(out, file), 'utf8')));

describe('dobra check site (built binary)', () => {
  it('exits 1 on a hinge error and writes a valid report and Markdown', async () => {
    const r = await dobra('check', 'site', site('06-hinge-content.html'), '--targets', DUO, '--out', join(out, 'hinge.json'), '--md', join(out, 'hinge.md'), '--no-transitions');
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/Coverage: \d+\/\d+ required cells/);
    const report = readReport('hinge.json');
    expect(report.source.kind).toBe('web');
    expect(report.frames.map((f) => f.targets[0])).toEqual([DUO]);
    expect(report.frames[0].findings.map((f) => f.ruleId)).toContain('hinge-content');
    const md = readFileSync(join(out, 'hinge.md'), 'utf8');
    expect(md).toMatch(/^# /);
    expect(md).toContain('hinge-content');
  });

  it('exits 0 on a page that handles the hinge', async () => {
    const r = await dobra('check', 'site', site('good.html'), '--targets', DUO, '--out', join(out, 'good.json'), '--no-transitions');
    expect(r.code).toBe(0);
    expect(readReport('good.json').frames[0].findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('lets --fail-on decide which findings fail the run', async () => {
    const never = await dobra('check', 'site', site('06-hinge-content.html'), '--targets', DUO, '--out', join(out, 'never.json'), '--fail-on', 'never', '--no-transitions');
    expect(never.code).toBe(0);
    // The unfold pass flags a page that lays itself out only on load; resize-vs-reload is a warning.
    const warn = await dobra('check', 'site', site('08-resize-vs-reload.html'), '--targets', FLIP_INNER, '--out', join(out, 'unfold.json'), '--fail-on', 'warn');
    expect(warn.code).toBe(1);
    expect(readReport('unfold.json').frames[0].findings.map((f) => f.ruleId)).toContain('resize-vs-reload');
  });

  it('exits 1 and says why when the site cannot be reached', async () => {
    const r = await dobra('check', 'site', 'http://127.0.0.1:1/', '--targets', DUO, '--out', join(out, 'down.json'), '--no-transitions');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(DUO);
    expect(readReport('down.json').unloaded).toHaveLength(1);
  });

  it('exits 2 for help, an unknown target and a bad option', async () => {
    const help = await dobra('--help');
    expect(help.code).toBe(2);
    expect(help.stdout).toMatch(/Usage: dobra check site/);
    const unknown = await dobra('check', 'site', site('good.html'), '--targets', 'nope/x/-/portrait');
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('nope/x/-/portrait');
    expect((await dobra('check', 'site', site('good.html'), '--fail-on', 'loud')).code).toBe(2);
  });
});

describe('dobra check site --zip (built binary)', () => {
  it('writes a package the report can open, with a screenshot or a reason for every frame', async () => {
    const { readReportZip } = await import('@dobra/core/reportZip');
    const zipPath = join(out, 'package.zip');
    const r = await dobra('check', 'site', site('06-hinge-content.html'), '--targets', `${DUO},${FLIP_INNER}`, '--out', join(out, 'package.json'), '--zip', zipPath, '--no-transitions');
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('package.zip');
    const opened = readReportZip(new Uint8Array(readFileSync(zipPath)));
    expect(parseReport(JSON.parse(JSON.stringify(opened.report)))).toEqual(opened.report);
    const index = JSON.parse(new TextDecoder().decode((await import('fflate')).unzipSync(new Uint8Array(readFileSync(zipPath)))['foldable-report/index.json']));
    for (const f of opened.report.frames) expect(f.ref in index.screenshots || f.ref in index.missing).toBe(true);
    expect(opened.images.size).toBe(opened.report.frames.length);
  });
});

describe('dobra report (built binary)', () => {
  it('starts, answers /api/health and checks a site through POST /api/check', async () => {
    const child = spawn(process.execPath, [BIN, 'report', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let buf = '';
        const timer = setTimeout(() => reject(new Error(`no address printed: ${buf}`)), 20_000);
        child.stdout.on('data', (c) => {
          buf += c;
          const m = buf.match(/Foldable Check: (http:\/\/\S+)/);
          if (m) {
            clearTimeout(timer);
            resolve(m[1]);
          }
        });
        child.on('exit', (code) => reject(new Error(`exited ${code}: ${buf}`)));
      });
      expect(await (await fetch(`${url}api/health`)).json()).toMatchObject({ ok: true, mode: 'local' });
      const res = await fetch(`${url}api/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: site('06-hinge-content.html'), targets: [DUO] }) });
      expect(res.status).toBe(200);
      const report = parseReport(await res.json());
      expect(report.source.kind).toBe('web');
      expect(report.frames[0].findings.map((f) => f.ruleId)).toContain('hinge-content');
    } finally {
      child.kill('SIGINT');
    }
  });
});
