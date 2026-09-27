import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Report } from '@hinge/core/report';
import { targetKey } from '@hinge/core/targets';
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

  it('lists targets it could not load, with the reason, instead of throwing', async () => {
    const down = await checkSite('http://127.0.0.1:1/', [DUO, PIXEL], { ...opts, browser });
    expect(down.frames).toHaveLength(0);
    expect(down.unloaded).toHaveLength(2);
    expect(down.unloaded[0].reason).toBeTruthy();
    const missing = await checkSite(`${server.url}/missing.html`, [PIXEL], { ...opts, browser });
    expect(missing.unloaded[0].reason).toMatch(/HTTP 404/);
  });
});
