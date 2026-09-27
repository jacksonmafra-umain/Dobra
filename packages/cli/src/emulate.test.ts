import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog } from '@dobra/core/catalog/load';
import { enumerateTargets, envConfigOf, targetKey } from '@dobra/core/targets';
import { deviceProfile, openTarget } from './emulate';
import { startFixtureServer } from './test/server';

const config = envConfigOf(loadCatalog());
const DUO = { deviceId: 'surface-duo-2', displayId: 'spanned', pose: 'spanned', orientation: 'landscape' } as const;
const PIXEL = { deviceId: 'pixel-9', displayId: 'main', orientation: 'portrait' } as const;
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

describe('emulation', () => {
  it('describes a spanned Surface Duo 2 with a vertical fold', () => {
    expect(deviceProfile(config, DUO)).toMatchObject({
      width: 1100,
      height: 756,
      deviceScaleFactor: 2.5,
      isMobile: true,
      fold: { orientation: 'vertical', offset: 537, maskLength: 26 },
    });
  });

  it('gives a phone no fold and an iPhone an iOS user agent', () => {
    expect(deviceProfile(config, PIXEL).fold).toBeNull();
    expect(deviceProfile(config, { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait' }).userAgent).toMatch(/iPhone/);
  });

  it('makes the page see two viewport segments across the hinge', async () => {
    const profile = deviceProfile(config, DUO);
    const { context, page, applyFold } = await openTarget(browser, profile);
    await applyFold(profile.fold);
    await page.goto(`${server.url}/segments.html`);
    const r = await page.evaluate(() => (window as unknown as { report(): Record<string, unknown> }).report());
    expect(r).toMatchObject({ width: 1100, height: 756, dpr: 2.5, twoSegments: true, segments: [[0, 537], [563, 537]] });
    await context.close();
  });

  it('emulates a fold whose catalog position is fractional', async () => {
    const t = { deviceId: 'pixel-9-pro-fold', displayId: 'inner', pose: 'book', orientation: 'portrait' } as const;
    const profile = deviceProfile(config, t);
    const { context, page, applyFold } = await openTarget(browser, profile);
    await applyFold(profile.fold);
    await page.goto(`${server.url}/segments.html`);
    expect(await page.evaluate(() => matchMedia('(horizontal-viewport-segments: 2)').matches)).toBe(true);
    await context.close();
  });

  it('applies the fold of every catalog target that has one', async () => {
    const failed: string[] = [];
    for (const t of enumerateTargets(config)) {
      const profile = deviceProfile(config, t);
      if (!profile.fold) continue;
      const { context, applyFold } = await openTarget(browser, profile);
      await applyFold(profile.fold).catch(() => failed.push(targetKey(t)));
      await context.close();
    }
    expect(failed).toEqual([]);
  });

  it('emulates a horizontal fold as two vertical segments', async () => {
    const t = enumerateTargets(config).find((x) => deviceProfile(config, x).fold?.orientation === 'horizontal')!;
    const profile = deviceProfile(config, t);
    const { context, page, applyFold } = await openTarget(browser, profile);
    await applyFold(profile.fold);
    await page.goto(`${server.url}/segments.html`);
    expect(await page.evaluate(() => matchMedia('(vertical-viewport-segments: 2)').matches)).toBe(true);
    expect(await page.evaluate(() => matchMedia('(horizontal-viewport-segments: 2)').matches)).toBe(false);
    await context.close();
  });

  it('keeps one segment on a phone', async () => {
    const { context, page } = await openTarget(browser, deviceProfile(config, PIXEL));
    await page.goto(`${server.url}/segments.html`);
    expect(await page.evaluate(() => matchMedia('(horizontal-viewport-segments: 2)').matches)).toBe(false);
    await context.close();
  });
});
