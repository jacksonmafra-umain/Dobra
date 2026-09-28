import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startLocalServer } from './localServer';

const handler = {
  health: () => ({ ok: true as const, mode: 'local' as const, maxTargets: null, maxSeconds: null }),
  check: async (body: unknown) =>
    (body as { url: string }).url.includes('private')
      ? { ok: false as const, status: 403 as const, error: 'private' }
      : { ok: true as const, report: { version: 1, echo: body } as never },
};

let dir: string;
let server: Awaited<ReturnType<typeof startLocalServer>>;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dobra-report-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Foldable Check</title>');
  writeFileSync(join(tmpdir(), 'dobra-secret.txt'), 'secret');
  server = await startLocalServer({ port: 0, host: '127.0.0.1', dir, handler });
});
afterAll(async () => {
  await server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('startLocalServer', () => {
  it('serves the report page at / and /report/', async () => {
    for (const p of ['/', '/report/']) {
      const r = await fetch(`${server.url}${p.slice(1)}`);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('Foldable Check');
    }
  });
  it('answers GET /api/health', async () => {
    const r = await fetch(`${server.url}api/health`);
    expect(await r.json()).toEqual({ ok: true, mode: 'local', maxTargets: null, maxSeconds: null });
  });
  it('answers POST /api/check with the report', async () => {
    const r = await fetch(`${server.url}api/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://x/' }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ version: 1, echo: { url: 'http://x/' } });
  });
  it('turns a refused check into its HTTP status', async () => {
    const r = await fetch(`${server.url}api/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://private/' }) });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'private' });
  });
  it('rejects a body that is not JSON, or too large', async () => {
    const json = { 'content-type': 'application/json' };
    expect((await fetch(`${server.url}api/check`, { method: 'POST', headers: json, body: '{nope' })).status).toBe(400);
    expect((await fetch(`${server.url}api/check`, { method: 'POST', headers: json, body: 'x'.repeat(70_000) })).status).toBe(413);
  });
  it('rejects GET on /api/check', async () => {
    expect((await fetch(`${server.url}api/check`)).status).toBe(405);
  });
  it('does not serve files outside the report folder', async () => {
    const r = await fetch(`${server.url}..%2Fdobra-secret.txt`);
    expect(r.status).toBe(404);
  });
  it('still answers the API and explains the missing build when the folder does not exist', async () => {
    const bare = await startLocalServer({ port: 0, host: '127.0.0.1', dir: join(dir, 'missing'), handler });
    try {
      const page = await fetch(bare.url);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('npm run build:report');
      expect((await fetch(`${bare.url}api/health`)).status).toBe(200);
    } finally {
      await bare.close();
    }
  });

  it('refuses a request whose Host is not this server (DNS rebinding)', async () => {
    const { request } = await import('node:http');
    const status = await new Promise<number>((done) => {
      const u = new URL(server.url);
      request({ host: u.hostname, port: u.port, path: '/api/health', headers: { host: 'evil.example' } }, (r) => done(r.statusCode ?? 0)).end();
    });
    expect(status).toBe(403);
  });
  it('refuses a check that is not sent as JSON, or comes from another site', async () => {
    expect((await fetch(`${server.url}api/check`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"url":"http://x/"}' })).status).toBe(415);
    const cross = await fetch(`${server.url}api/check`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"url":"http://x/"}' });
    expect(cross.status).toBe(403);
  });
  it('runs one check at a time', async () => {
    let release!: () => void;
    const slow = { ...handler, check: () => new Promise<never>((r) => (release = () => r({ ok: true, report: {} } as never))) };
    const busy = await startLocalServer({ port: 0, host: '127.0.0.1', dir, handler: slow as never });
    try {
      const post = () => fetch(`${busy.url}api/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"http://x/"}' });
      const first = post();
      await new Promise((r) => setTimeout(r, 50));
      expect((await post()).status).toBe(429);
      release();
      expect((await first).status).toBe(200);
    } finally {
      await busy.close();
    }
  });
});
