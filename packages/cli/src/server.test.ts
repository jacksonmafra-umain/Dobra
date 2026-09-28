import { describe, expect, it, vi } from 'vitest';
import type { Report } from '@dobra/core/report';
import { HOSTED, LOCAL } from './policy';
import { createCheckHandler, type HandlerDeps } from './server';

const fakeReport = { version: 1, generatedAt: '', source: { kind: 'web', ref: 'u', name: 'u' }, catalogVersion: '1', frames: [], coverage: { cells: [], byCategory: {} }, unloaded: [] } as unknown as Report;
const PIXEL = 'pixel-9/main/-/portrait';

function deps(over: Partial<HandlerDeps> = {}) {
  const close = vi.fn(async () => {});
  const d = {
    policy: LOCAL,
    launch: vi.fn(async () => ({ close }) as never),
    check: vi.fn(async () => fakeReport),
    resolve: async () => ['93.184.215.14'],
    ...over,
  };
  return { d, close };
}

describe('createCheckHandler', () => {
  it('reports its mode and limits', () => {
    expect(createCheckHandler(deps({ policy: HOSTED }).d).health()).toEqual({ ok: true, mode: 'hosted', maxTargets: 6, maxSeconds: 50 });
    expect(createCheckHandler(deps().d).health()).toEqual({ ok: true, mode: 'local', maxTargets: null, maxSeconds: null });
  });

  it('rejects a body without a URL, or with the wrong shapes', async () => {
    const h = createCheckHandler(deps().d);
    expect(await h.check({}, 'ip')).toMatchObject({ ok: false, status: 400 });
    expect(await h.check('nope', 'ip')).toMatchObject({ ok: false, status: 400 });
    expect(await h.check({ url: 'https://example.com/', targets: 'x' }, 'ip')).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a non-http URL with 400', async () => {
    expect(await createCheckHandler(deps().d).check({ url: 'file:///etc/passwd' }, 'ip')).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects an unknown target key, naming it', async () => {
    const r = await createCheckHandler(deps().d).check({ url: 'https://example.com/', targets: ['nope/x/-/portrait'] }, 'ip');
    expect(r).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('nope/x/-/portrait') });
  });

  it('refuses a private address on the hosted policy with 403, without launching a browser', async () => {
    const { d } = deps({ policy: HOSTED, resolve: async () => ['10.0.0.1'] });
    expect(await createCheckHandler(d).check({ url: 'https://intranet.example/' }, 'ip')).toMatchObject({ ok: false, status: 403 });
    expect(d.launch).not.toHaveBeenCalled();
  });

  it('caps targets on the hosted policy with 413', async () => {
    const r = await createCheckHandler(deps({ policy: HOSTED }).d).check({ url: 'https://example.com/', categories: ['foldable-book'] }, 'ip');
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it('rate-limits one client with 429 when a limit is set', async () => {
    const h = createCheckHandler(deps({ policy: HOSTED, rateLimit: { perMinute: 1 } }).d);
    const body = { url: 'https://example.com/', targets: [PIXEL] };
    expect((await h.check(body, 'a')).ok).toBe(true);
    expect(await h.check(body, 'a')).toMatchObject({ ok: false, status: 429 });
    expect((await h.check(body, 'b')).ok).toBe(true);
  });

  it('runs the hosted check with a guard and a deadline, and closes the browser', async () => {
    const { d, close } = deps({ policy: HOSTED, now: () => 1_000 });
    const r = await createCheckHandler(d).check({ url: 'https://example.com/', targets: [PIXEL] }, 'ip');
    expect(r.ok).toBe(true);
    const opts = d.check.mock.calls[0][2];
    expect(opts.deadline).toBe(1_000 + 50_000);
    expect(opts.allowRequest).toBeTypeOf('function');
    expect(await opts.allowRequest!('http://127.0.0.1/')).toBe(false);
    expect(await opts.allowRequest!('https://example.com/app.js')).toBe(true);
    expect(close).toHaveBeenCalled();
  });

  it('runs the local check without a guard or a deadline', async () => {
    const { d } = deps();
    await createCheckHandler(d).check({ url: 'http://localhost:3000/', targets: [PIXEL] }, 'ip');
    const opts = d.check.mock.calls[0][2];
    expect(opts.deadline).toBeUndefined();
    expect(opts.allowRequest).toBeUndefined();
  });

  it('uses the representative set when no targets or categories are given', async () => {
    const { d } = deps();
    await createCheckHandler(d).check({ url: 'http://localhost:3000/' }, 'ip');
    expect(d.check.mock.calls[0][1].length).toBeGreaterThan(0);
  });

  it('returns the partial report a timed-out check produced', async () => {
    const partial = { ...fakeReport, notes: ['time budget reached; not checked: x'] } as Report;
    const r = await createCheckHandler(deps({ check: vi.fn(async () => partial) }).d).check({ url: 'http://localhost/', targets: [PIXEL] }, 'ip');
    expect(r).toEqual({ ok: true, report: partial });
  });

  it('turns an unexpected failure into a 500 and still closes the browser', async () => {
    const { d, close } = deps({ check: vi.fn(async () => { throw new Error('boom\nstack'); }) });
    expect(await createCheckHandler(d).check({ url: 'http://localhost/', targets: [PIXEL] }, 'ip')).toEqual({ ok: false, status: 500, error: 'boom' });
    expect(close).toHaveBeenCalled();
  });
});
