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
    const r = await runCheck(reply(403, { error: 'This address is on a private network.' }), { url: 'http://10.0.0.1/' }, 'hosted');
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toContain('`dobra report`');
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

describe('hand-off and cancelling', () => {
  it('offers the hand-off only when running the check yourself would help', async () => {
    expect(await runCheck(reply(429, { error: 'A check is already running' }), { url: 'http://x/' }, 'local')).toMatchObject({ ok: false, handoff: false });
    expect(await runCheck(reply(400, { error: 'bad' }), { url: 'http://x/' }, 'local')).toMatchObject({ ok: false, handoff: false });
    expect(await runCheck(reply(403, { error: 'private' }), { url: 'http://10.0.0.1/' }, 'hosted')).toMatchObject({ ok: false, handoff: true });
  });
  it('returns an aborted outcome when the request is cancelled', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const f = (async (_u: string, init?: RequestInit) => { init?.signal?.throwIfAborted(); return new Response('{}'); }) as never;
    expect(await runCheck(f, { url: 'http://x/' }, 'local', '', ctrl.signal)).toEqual({ ok: false, aborted: true, handoff: false, message: '' });
  });
});

describe('cliCommand and actionsStep', () => {
  it('quotes the URL for the shell and lists the targets', () => {
    expect(cliCommand({ url: "https://a.example/?q=1&x=' y", targets: ['pixel-9/main/-/portrait'] })).toBe(
      "dobra check site 'https://a.example/?q=1&x='\\'' y' --targets pixel-9/main/-/portrait",
    );
  });
  it('adds one --category per category, and nothing for the representative set', () => {
    expect(cliCommand({ url: 'https://a.example/', categories: ['phone', 'tablet'] })).toBe(
      "dobra check site 'https://a.example/' --category phone --category tablet",
    );
    expect(cliCommand({ url: 'https://a.example/' })).toBe("dobra check site 'https://a.example/'");
    // The CLI writes foldable-report.json and foldable-report.zip by default, so the command names neither.
    expect(cliCommand({ url: 'www.umain.com' })).toBe("dobra check site 'https://www.umain.com'");
  });
  it('uses the installed dobra command, or the npm script inside a Dobra checkout', () => {
    expect(cliCommand({ url: 'https://a.example/' }, 'repo')).toBe("npm run dobra -- check site 'https://a.example/'");
  });
  it('builds a GitHub Actions step that installs Chromium and runs the command', () => {
    const step = actionsStep({ url: 'https://a.example/' });
    expect(step).toContain('npx playwright install --with-deps chromium');
    // Actions runs in a checkout, where only the npm script exists.
    expect(step).toContain("npm run dobra -- check site 'https://a.example/'");
  });
});

describe('messageFor', () => {
  it('tells a busy local server from a hosted rate limit', () => {
    expect(messageFor(429, 'A check is already running', 'local')).toMatch(/already running/);
    expect(messageFor(429, 'Too many', 'local')).not.toMatch(/minute/);
  });
  it('only suggests running locally when the check was not local', () => {
    expect(messageFor(403, 'Checks can only be started from this page.', 'local')).not.toContain('dobra report');
    expect(messageFor(403, 'This address is on a private network.', 'hosted')).toContain('`dobra report`');
  });
  it("drops the server's own run-locally hint, in either form, before adding its own", () => {
    for (const hint of ['Run `npm run dobra -- report` to check it.', 'Run `dobra report` to check it.'])
      expect(messageFor(403, `Private address. ${hint}`, 'hosted').match(/dobra/g)).toHaveLength(1);
  });
  it('names the limit on a 413 and the wait on a 429', () => {
    expect(messageFor(413, 'At most 6 devices', 'hosted')).toMatch(/6 devices/);
    expect(messageFor(429, 'Too many', 'hosted')).toMatch(/minute/);
  });
});

describe('a pasted Markdown link in the Website field', () => {
  // Reported: the field held "[www.umain.com](https://www.umain.com)" and the command passed it on.
  it('builds the command with the address inside the link', () => {
    expect(cliCommand({ url: '[www.umain.com](https://www.umain.com)', categories: ['foldable-book', 'foldable-flip', 'dual-screen'] })).toBe(
      "dobra check site 'https://www.umain.com' --category foldable-book --category foldable-flip --category dual-screen",
    );
  });
});
