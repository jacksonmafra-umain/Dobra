import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Report } from '@dobra/core/report';
import { targetKey } from '@dobra/core/targets';
import { checkSite } from './checkSite';
import { startFixtureServer } from './test/server';

const DUO = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;
const PIXEL = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' } as const;
const FOLD = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'open', orientation: 'portrait' } as const;
const opts = { wait: 100, transitions: false };
let browser: Browser;
let server: Awaited<ReturnType<typeof startFixtureServer>>;
beforeAll(async () => {
  browser = await chromium.launch();
  server = await startFixtureServer();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

const frame = (r: Report, t: { deviceId: string }) => r.frames.find((f) => f.targets[0]?.startsWith(`${t.deviceId}/`))!;
const rules = (r: Report, t: { deviceId: string }) => frame(r, t).findings.map((f) => f.ruleId);

describe('checkSite', () => {
  it('checks each target with the shared rules and counts coverage', async () => {
    const r = await checkSite(`${server.url}/layout.html`, [DUO, PIXEL], { ...opts, browser });
    expect(r.source.kind).toBe('web');
    expect(r.frames.map((f) => f.confidence)).toEqual(['tag', 'tag']);
    expect(frame(r, DUO).targets).toEqual([targetKey(DUO)]);
    expect(rules(r, DUO)).toContain('hinge-content');
    expect(rules(r, PIXEL)).not.toContain('hinge-content');
    expect(r.coverage.cells.some((c) => c.requirement.category === 'dual-screen' && c.status === 'present')).toBe(true);
  });

  it('reports a page that only lays itself out on load when the device unfolds', async () => {
    const withPass = await checkSite(`${server.url}/onload.html`, [FOLD], { ...opts, transitions: true, browser });
    expect(rules(withPass, FOLD)).toContain('resize-vs-reload');
    const without = await checkSite(`${server.url}/onload.html`, [FOLD], { ...opts, browser });
    expect(rules(without, FOLD)).not.toContain('resize-vs-reload');
  });

  it('does not flag a page that reflows on resize', async () => {
    const r = await checkSite(`${server.url}/layout.html`, [FOLD], { ...opts, transitions: true, browser });
    expect(rules(r, FOLD)).not.toContain('resize-vs-reload');
  });

  it('notes a page cut short at the element cap', async () => {
    const r = await checkSite(`${server.url}/huge.html`, [PIXEL], { ...opts, browser });
    expect(r.notes).toEqual([`${targetKey(PIXEL)}: page truncated at 4000 elements`]);
  });

  it('does not wait for a network that never goes idle', async () => {
    const start = Date.now();
    const r = await checkSite(`${server.url}/poll.html`, [PIXEL], { ...opts, browser });
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(r.frames).toHaveLength(1);
  });

  it('checks a page whose load event never fires, with a note', async () => {
    const r = await checkSite(`${server.url}/stuck.html`, [PIXEL], { ...opts, browser, loadTimeout: 1000 });
    expect(r.frames).toHaveLength(1);
    expect(r.notes?.join('\n')).toMatch(/load event did not fire/);
  });

  it('gives up on a page whose script never yields, instead of hanging', async () => {
    const start = Date.now();
    const r = await checkSite(`${server.url}/busy.html`, [PIXEL], { ...opts, browser, wait: 300, collectTimeout: 2000 });
    expect(Date.now() - start).toBeLessThan(15_000);
    expect(r.unloaded[0]?.reason).toMatch(/did not respond/);
  });

  it('unfolds a Flip from its landscape-only cover', async () => {
    const FLIP = { deviceId: 'galaxy-z-flip-7', displayId: 'inner', pose: 'open', orientation: 'portrait' } as const;
    const progress: string[] = [];
    await checkSite(`${server.url}/flip.html`, [FLIP], { ...opts, transitions: true, browser, onProgress: (m) => progress.push(m) });
    expect(progress.some((m) => m.startsWith('Unfolding galaxy-z-flip-7/cover/'))).toBe(true);
  });

  it('keeps earlier results when the browser dies mid-run', async () => {
    const own = await chromium.launch();
    const r = await checkSite(`${server.url}/layout.html`, [DUO, PIXEL, FOLD], {
      ...opts,
      browser: own,
      onProgress: (m) => {
        if (m === `Checking ${targetKey(PIXEL)}`) void own.close();
      },
    });
    expect(r.frames.map((f) => f.targets[0])).toEqual([targetKey(DUO)]);
    expect(r.unloaded.map((u) => u.name)).toEqual([targetKey(PIXEL), targetKey(FOLD)]);
  });

  it('notes a page zoomed out to fit content wider than the window', async () => {
    const wide = await checkSite(`${server.url}/zoomed.html`, [FOLD], { ...opts, browser });
    expect(wide.notes?.join('\n')).toMatch(/zoomed out/);
    const plain = await checkSite(`${server.url}/flip.html`, [FOLD], { ...opts, browser });
    expect(plain.notes ?? []).toEqual([]);
  });

  it('lists targets it could not load, with the reason, instead of throwing', async () => {
    const down = await checkSite('http://127.0.0.1:1/', [DUO, PIXEL], { ...opts, browser });
    expect(down.frames).toHaveLength(0);
    expect(down.unloaded).toHaveLength(2);
    expect(down.unloaded[0].reason).toBeTruthy();
    const missing = await checkSite(`${server.url}/missing.html`, [PIXEL], { ...opts, browser });
    expect(missing.unloaded[0].reason).toMatch(/HTTP 404/);
  });

  it('aborts requests the guard refuses and reports the target as not loaded', async () => {
    const r = await checkSite(`${server.url}/layout.html`, [PIXEL], { ...opts, browser, allowRequest: async () => false });
    expect(r.frames).toEqual([]);
    expect(r.unloaded[0].reason).toMatch(/blocked|refused|ERR_/i);
  });

  it('puts a redirect through the guard too', async () => {
    const seen: string[] = [];
    const guard = async (u: string) => (seen.push(u), !u.endsWith('/layout.html'));
    const r = await checkSite(`${server.url}/redirect?to=/layout.html`, [PIXEL], { ...opts, browser, allowRequest: guard });
    expect(seen.some((u) => u.endsWith('/layout.html'))).toBe(true);
    expect(r.frames).toEqual([]);
    expect(r.unloaded).toHaveLength(1);
  });

  it('stops at the deadline and names the skipped targets in a note', async () => {
    const r = await checkSite(`${server.url}/layout.html`, [PIXEL, DUO], { ...opts, browser, deadline: Date.now() - 1 });
    expect(r.frames).toEqual([]);
    expect(r.notes?.join(' ')).toMatch(/time budget/);
    expect(r.notes?.join(' ')).toContain(targetKey(DUO));
  });

  it('skips the fold override when fold emulation is off, and says so', async () => {
    const r = await checkSite(`${server.url}/segments.html`, [DUO], { ...opts, browser, foldEmulation: false });
    expect(r.notes?.join(' ')).toMatch(/size only/);
  });

  it('cuts a slow target short at the deadline instead of running past it', async () => {
    const t0 = Date.now();
    const r = await checkSite(`${server.url}/slow`, [PIXEL, DUO], { ...opts, browser, deadline: t0 + 7_000 });
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(r.frames).toEqual([]);
    expect(r.unloaded.map((u) => u.name)).toContain(targetKey(PIXEL));
    expect(r.notes?.join(' ')).toContain(targetKey(DUO));
  });

  it('puts WebSockets through the guard too', async () => {
    const seen: string[] = [];
    await checkSite(`${server.url}/socket.html`, [PIXEL], { ...opts, browser, allowRequest: async (u) => (seen.push(u), !u.startsWith('ws')) });
    expect(seen.some((u) => u.startsWith('ws://127.0.0.1:9/'))).toBe(true);
  });

  it('checks a window several targets share once, as one frame naming them all', async () => {
    const PORTRAIT = { deviceId: 'razr-ultra-2026', displayId: 'inner', pose: 'flex', orientation: 'portrait' } as const;
    const LANDSCAPE = { ...PORTRAIT, orientation: 'landscape' } as const;
    const progress: string[] = [];
    const capture = { images: new Map<string, Uint8Array>(), missing: {} as Record<string, string> };
    const r = await checkSite(`${server.url}/layout.html`, [PORTRAIT, PIXEL, LANDSCAPE], { ...opts, browser, capture, onProgress: (m) => progress.push(m) });
    expect(progress.filter((m) => m.startsWith('Checking'))).toEqual(['Checking razr-ultra-2026/inner/flex (portrait, landscape)', `Checking ${targetKey(PIXEL)}`]);
    expect(r.frames.map((f) => f.targets)).toEqual([[targetKey(PORTRAIT), targetKey(LANDSCAPE)], [targetKey(PIXEL)]]);
    expect(r.frames[0]).toMatchObject({ name: 'razr-ultra-2026/inner/flex (portrait, landscape)', ref: `${server.url}/layout.html#${targetKey(PORTRAIT)}`, confidence: 'tag' });
    expect([...capture.images.keys()]).toEqual(r.frames.map((f) => f.ref));
  });

  it('unfolds once into a shared window', async () => {
    const BOOK = { deviceId: 'galaxy-z-fold-7', displayId: 'inner', pose: 'book', orientation: 'portrait' } as const;
    const progress: string[] = [];
    const r = await checkSite(`${server.url}/onload.html`, [BOOK, { ...BOOK, orientation: 'landscape' }], { ...opts, transitions: true, browser, onProgress: (m) => progress.push(m) });
    expect(r.frames).toHaveLength(1);
    expect(progress.filter((m) => m.startsWith('Unfolding'))).toHaveLength(1);
    expect(r.frames[0].findings.filter((f) => f.ruleId === 'resize-vs-reload')).toHaveLength(1);
  });

  it('captures a PNG of each loaded target, and says why an unloaded one has none', async () => {
    const capture = { images: new Map<string, Uint8Array>(), missing: {} as Record<string, string> };
    const r = await checkSite(`${server.url}/layout.html`, [PIXEL], { ...opts, browser, capture });
    const png = capture.images.get(r.frames[0].ref)!;
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const down = { images: new Map<string, Uint8Array>(), missing: {} as Record<string, string> };
    const d = await checkSite('http://127.0.0.1:1/', [PIXEL], { ...opts, browser, capture: down });
    expect(down.images.size).toBe(0);
    expect(Object.keys(down.missing)).toEqual([d.unloaded[0].ref]);
  });
});
