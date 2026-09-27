import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog } from '@hinge/core/catalog/load';
import { walk, type GeoNode } from '@hinge/core/geo';
import { check } from '@hinge/core/rules';
import { envConfigOf } from '@hinge/core/targets';
import { collectLayout } from './collect';
import { deviceProfile, openTarget } from './emulate';
import { startFixtureServer } from './test/server';

const config = envConfigOf(loadCatalog());
const DUO = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let server: Awaited<ReturnType<typeof startFixtureServer>>;
beforeAll(async () => {
  browser = await chromium.launch();
  server = await startFixtureServer();
  const profile = deviceProfile(config, DUO);
  ({ context, page } = await openTarget(browser, profile));
});
afterAll(async () => {
  await context?.close();
  await browser?.close();
  await server?.close();
});

const nodes = (root: GeoNode[]) => walk(root).map((p) => p.node);
const byName = (root: GeoNode[], start: string) => nodes(root).find((n) => n.name.startsWith(start));

describe('collectLayout', () => {
  it('gives every element the role the rules read', async () => {
    await page.goto(`${server.url}/layout.html`);
    const { root } = await collectLayout(page);
    expect(byName(root, 'header')?.role).toBe('chrome');
    expect(byName(root, 'nav')?.role).toBe('chrome');
    expect(byName(root, 'h1')).toMatchObject({ role: 'text', chars: 'Layout fixture'.length });
    expect(byName(root, 'p')).toMatchObject({ role: 'text', chars: 80 });
    expect(byName(root, 'deep')?.role).toBe('interactive');
    expect(byName(root, 'wide picture')?.role).toBe('media');
    expect(byName(root, 'scroller')?.scrollAxis).toBe('x');
    expect(byName(root, 'clip')?.clips).toBe(true);
  });

  it('records elements below the fold in document coordinates', async () => {
    await page.goto(`${server.url}/layout.html`);
    const { root, scrollWidth } = await collectLayout(page);
    expect(byName(root, 'deep')?.rect.y).toBeCloseTo(1500, 0);
    expect(scrollWidth).toBeGreaterThanOrEqual(1400);
  });

  it('stops at the node cap and says so', async () => {
    await page.goto(`${server.url}/huge.html`);
    const { root, truncated } = await collectLayout(page, 4000);
    expect(nodes(root).filter((n) => n.role === 'interactive')).toHaveLength(4000);
    expect(truncated).toBe(true);
  });

  it('feeds the shared rules: the hinge, a wide element, but not a clipped image', async () => {
    await page.goto(`${server.url}/layout.html`);
    const { root } = await collectLayout(page);
    const findings = check({ source: 'web', ref: 'layout.html', targets: [DUO], confidence: 'tag', width: 1100, height: 756, root }, config);
    const hits = (rule: string) => findings.filter((f) => f.ruleId === rule).map((f) => f.nodeId);
    expect(hits('hinge-content').some((id) => byName(root, 'deep')?.id === id)).toBe(true);
    expect(hits('overflow-x')).toEqual([byName(root, 'wide')?.id]);
    expect(hits('overflow-x')).not.toContain(byName(root, 'wide picture')?.id);
  });
});
