import { describe, expect, it } from 'vitest';
import { sampleReport } from './fixtures/sampleReport';
import { actionsStep, cliCommand, messageFor, probe, runCheck } from './siteCheck';

const sample = sampleReport();

const reply = (status: number, body: unknown, type = 'application/json') =>
  (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

describe('probe', () => {
  it('returns the endpoint health', async () => {
    const health = { ok: true, mode: 'local', maxTargets: null, maxSeconds: null };
    expect(await probe(reply(200, health))).toEqual(health);
  });
  it('returns null for a 404, an HTML answer, or a failed request', async () => {
    expect(await probe(reply(404, 'not found', 'text/html'))).toBeNull();
    expect(await probe(reply(200, '<!doctype html>', 'text/html'))).toBeNull();
    expect(await probe((async () => { throw new TypeError('offline'); }) as never)).toBeNull();
  });
  it('asks the root of the origin, since the report lives under /report/', async () => {
    let asked = '';
    await probe((async (u: string) => ((asked = u), new Response('{}', { status: 404 }))) as never, 'https://dobra-five.vercel.app');
    expect(asked).toBe('https://dobra-five.vercel.app/api/health');
  });
});

describe('runCheck', () => {
  it('returns the parsed report', async () => {
    const r = await runCheck(reply(200, sample), { url: 'https://example.com/' });
    expect(r).toEqual({ ok: true, report: sample });
  });
  it('explains a refused private address with the local command', async () => {
    const r = await runCheck(reply(403, { error: 'This address is on a private network.' }), { url: 'http://10.0.0.1/' });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toContain('npm run dobra -- report');
  });
  it('reports an answer that is not a report', async () => {
    const r = await runCheck(reply(200, { nope: true }), { url: 'https://example.com/' });
    expect(r.ok).toBe(false);
  });
  it('reports a network failure', async () => {
    const r = await runCheck((async () => { throw new TypeError('Failed to fetch'); }) as never, { url: 'https://example.com/' });
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/reach/) });
  });
});

describe('cliCommand and actionsStep', () => {
  it('quotes the URL for the shell and lists the targets', () => {
    expect(cliCommand({ url: "https://a.example/?q=1&x=' y", targets: ['pixel-9/main/-/portrait'] })).toBe(
      "npm run dobra -- check site 'https://a.example/?q=1&x='\\'' y' --targets pixel-9/main/-/portrait --out foldable-report.json",
    );
  });
  it('adds one --category per category, and nothing for the representative set', () => {
    expect(cliCommand({ url: 'https://a.example/', categories: ['phone', 'tablet'] })).toBe(
      "npm run dobra -- check site 'https://a.example/' --category phone --category tablet --out foldable-report.json",
    );
    expect(cliCommand({ url: 'https://a.example/' })).toBe("npm run dobra -- check site 'https://a.example/' --out foldable-report.json");
  });
  it('builds a GitHub Actions step that installs Chromium and runs the command', () => {
    const step = actionsStep({ url: 'https://a.example/' });
    expect(step).toContain('npx playwright install --with-deps chromium');
    expect(step).toContain("check site 'https://a.example/'");
  });
});

describe('messageFor', () => {
  it('names the limit on a 413 and the wait on a 429', () => {
    expect(messageFor(413, 'At most 6 devices', 'hosted')).toMatch(/6 devices/);
    expect(messageFor(429, 'Too many', 'hosted')).toMatch(/minute/);
  });
});
