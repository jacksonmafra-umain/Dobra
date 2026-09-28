// One browser context per device target: size, device scale, user agent and, on Android foldables,
// the hinge through the Chrome DevTools display-feature override (spec §7.1–7.2).
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { resolveTarget, type Target } from '@dobra/core/targets';
import type { EnvConfig } from '@dobra/core/engine/environment';

export interface Fold {
  orientation: 'vertical' | 'horizontal';
  /** Where the fold starts along the axis, in CSS px. */
  offset: number;
  /** The fold's thickness, in CSS px. */
  maskLength: number;
}

export interface DeviceProfile {
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
  isMobile: boolean;
  hasTouch: boolean;
  fold: Fold | null;
}

const ANDROID_UA = (name: string, mobile: boolean) =>
  `Mozilla/5.0 (Linux; Android 16; ${name}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 ${mobile ? 'Mobile ' : ''}Safari/537.36`;
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

export function deviceProfile(config: EnvConfig, t: Target): DeviceProfile {
  const env = resolveTarget(config, t);
  const device = config.devices.find((d) => d.id === t.deviceId)!;
  const large = device.category === 'tablet' || device.category === 'desktop';
  let deviceScaleFactor: number;
  let userAgent: string;
  if (device.platform === 'android') {
    deviceScaleFactor = device.displays[t.displayId].density;
    userAgent = ANDROID_UA(device.name, !large);
  } else {
    deviceScaleFactor = device.displays[t.displayId].scale;
    userAgent = device.category === 'tablet' ? IPAD_UA : IPHONE_UA;
  }
  // WebKit cannot emulate viewport segments, so iOS targets are size-only (spec §7.2).
  // Chromium takes one display feature: the first fold that splits or hides the window.
  const f = env.platform === 'android' ? env.folds.find((x) => x.separating || x.occludes) : undefined;
  const fold: Fold | null = f
    ? f.axis === 'vertical'
      ? { orientation: 'vertical', offset: f.rect.x, maskLength: f.rect.width }
      : { orientation: 'horizontal', offset: f.rect.y, maskLength: f.rect.height }
    : null;
  return {
    // Playwright and the DevTools protocol take whole CSS px; catalog sizes can be fractional.
    width: Math.round(env.width),
    height: Math.round(env.height),
    deviceScaleFactor,
    userAgent,
    isMobile: device.category !== 'desktop',
    hasTouch: device.category !== 'desktop',
    fold,
  };
}

export interface OpenTarget {
  context: BrowserContext;
  page: Page;
  applyFold(fold: Fold | null): Promise<void>;
}

/** `allowRequest`, when given, sees every request the page makes, redirects included, and blocks the refused ones. */
export async function openTarget(browser: Browser, profile: DeviceProfile, allowRequest?: (url: string) => Promise<boolean>): Promise<OpenTarget> {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    userAgent: profile.userAgent,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    // Guarded checks: service workers' requests would skip route(), and nothing is downloaded.
    ...(allowRequest ? { serviceWorkers: 'block' as const, acceptDownloads: false } : {}),
  });
  if (allowRequest) {
    await context.route('**/*', async (route) => ((await allowRequest(route.request().url())) ? route.continue() : route.abort('blockedbyclient')));
    // WebSockets don't pass through route(); guard them separately.
    await context.routeWebSocket(/.*/, async (ws) => {
      if (await allowRequest(ws.url())) ws.connectToServer();
      else await ws.close();
    });
  }
  const page = await context.newPage();
  const cdp: CDPSession = await context.newCDPSession(page);
  return {
    context,
    page,
    async applyFold(fold) {
      // Emulation.setDisplayFeaturesOverride is accepted but ignored by Chromium 153; the
      // displayFeature field of the device metrics override is what makes the page see segments.
      const { width, height } = page.viewportSize() ?? profile;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: profile.deviceScaleFactor,
        mobile: profile.isMobile,
        // The protocol rejects fractional positions; the catalog gives some folds as 425.5 dp.
        ...(fold ? { displayFeature: { orientation: fold.orientation, offset: Math.round(fold.offset), maskLength: Math.round(fold.maskLength) } } : {}),
      });
    },
  };
}
