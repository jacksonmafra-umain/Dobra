// Spike: launches serverless Chromium and reports whether the fold override reaches the page.
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';

export default async function handler(req, res) {
  const t0 = Date.now();
  const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 756 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1100, height: 756, deviceScaleFactor: 2.5, mobile: true,
    displayFeature: { orientation: 'vertical', offset: 537, maskLength: 26 },
  });
  await page.setContent('<p>probe</p>');
  const result = await page.evaluate(() => ({
    segments: window.viewport?.segments?.map((s) => [s.x, s.width]) ?? null,
    media: matchMedia('(horizontal-viewport-segments: 2)').matches,
    ua: navigator.userAgent,
  }));
  await browser.close();
  res.status(200).json({ ...result, ms: Date.now() - t0 });
}
