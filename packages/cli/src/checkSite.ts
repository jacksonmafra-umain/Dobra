// hinge check site: one Chromium context per target, the same rules as the plugin and the web
// report, and an unfold pass that resizes from the cover display without reloading.
import { chromium, type Browser, type Page } from 'playwright';
import { loadCatalog } from '@hinge/core/catalog/load';
import type { Finding } from '@hinge/core/engine/checks';
import { buildReport, type Report, type ReportInput } from '@hinge/core/report';
import { envConfigOf, isKnownTarget, targetKey, type Target } from '@hinge/core/targets';
import { resizeVsReload } from '@hinge/core/transition';
import { collectLayout } from './collect';
import { deviceProfile, openTarget } from './emulate';

const catalog = loadCatalog();
const config = envConfigOf(catalog);
const CAP = 4000;

export interface CheckOptions {
  /** Settle time after the load event, in ms. The check never waits for network idle. */
  wait: number;
  transitions: boolean;
  browser?: Browser;
  onProgress?: (msg: string) => void;
}

const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0];

async function load(page: Page, url: string, wait: number): Promise<void> {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
  await page.waitForTimeout(wait);
}

/** The cover display of the same Android device, in portrait, to unfold from. */
function coverOf(t: Target): Target | null {
  const d = config.devices.find((x) => x.id === t.deviceId);
  if (!d || d.platform !== 'android') return null;
  const cover = d.postures?.find((p) => p.kind === 'cover');
  if (!cover || cover.display === t.displayId) return null;
  const from: Target = { deviceId: d.id, displayId: cover.display, pose: cover.id, orientation: 'portrait' };
  return isKnownTarget(config, from) ? from : null;
}

export async function checkSite(url: string, targets: Target[], opts: CheckOptions): Promise<Report> {
  const browser = opts.browser ?? (await chromium.launch());
  const inputs: ReportInput[] = [];
  const extra = new Map<string, Finding[]>();
  const notes: string[] = [];
  try {
    for (const t of targets) {
      const key = targetKey(t);
      opts.onProgress?.(`Checking ${key}`);
      const profile = deviceProfile(config, t);
      const base = { ref: `${url}#${key}`, name: key, page: url, width: profile.width, height: profile.height, tag: key };
      const { context, page, applyFold } = await openTarget(browser, profile);
      try {
        await applyFold(profile.fold);
        await load(page, url, opts.wait);
        const { root, truncated } = await collectLayout(page, CAP);
        inputs.push({ ...base, root });
        if (truncated) notes.push(`${key}: page truncated at ${CAP} elements`);
      } catch (e) {
        inputs.push({ ...base, root: null, reason: firstLine(e) });
        await context.close();
        continue;
      }
      await context.close();

      const cover = opts.transitions ? coverOf(t) : null;
      if (!cover) continue;
      opts.onProgress?.(`Unfolding ${targetKey(cover)} to ${key}`);
      const from = deviceProfile(config, cover);
      const unfold = await openTarget(browser, from);
      try {
        await unfold.applyFold(from.fold);
        await load(unfold.page, url, opts.wait);
        await unfold.page.setViewportSize({ width: profile.width, height: profile.height });
        await unfold.applyFold(profile.fold);
        await unfold.page.waitForTimeout(opts.wait);
        const resized = await collectLayout(unfold.page, CAP);
        const reloaded = inputs[inputs.length - 1].root!;
        extra.set(base.ref, resizeVsReload(resized.root, reloaded, t));
      } catch (e) {
        notes.push(`${key}: the unfold pass failed (${firstLine(e)})`);
      } finally {
        await unfold.context.close();
      }
    }
  } finally {
    if (!opts.browser) await browser.close();
  }
  const report = buildReport(catalog, { kind: 'web', ref: url, name: url }, inputs);
  for (const f of report.frames) f.findings.push(...(extra.get(f.ref) ?? []));
  return notes.length ? { ...report, notes } : report;
}
