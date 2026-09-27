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
const NO_ANSWER = (ms: number) => `The page did not respond within ${ms / 1000} s (a script may be stuck).`;

export interface CheckOptions {
  /** Settle time after the load event, in ms. The check never waits for network idle. */
  wait: number;
  transitions: boolean;
  browser?: Browser;
  onProgress?: (msg: string) => void;
  /** How long to wait for the load event before checking what is there, in ms. Default 30 000. */
  loadTimeout?: number;
  /** How long the page may take to answer the collector, in ms. Default 30 000. */
  collectTimeout?: number;
}

const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0];

/** Rejects with `message` when `promise` takes longer than `ms`: a busy page script never answers. */
function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Opens the page and waits for its load event. An unreachable URL or an HTTP error throws; a load
 * event that never comes (one slow third-party resource) returns a note and the page is checked as is.
 */
async function load(page: Page, url: string, wait: number, loadTimeout: number): Promise<string | null> {
  const res = await page.goto(url, { waitUntil: 'commit', timeout: loadTimeout });
  if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
  let note: string | null = null;
  try {
    await page.waitForLoadState('load', { timeout: loadTimeout });
  } catch {
    note = `the load event did not fire within ${loadTimeout / 1000} s; checked the page as it was`;
  }
  await page.waitForTimeout(wait);
  return note;
}

/** The cover display of the same Android device, in an orientation the catalog offers, to unfold from. */
function coverOf(t: Target): Target | null {
  const d = config.devices.find((x) => x.id === t.deviceId);
  if (!d || d.platform !== 'android') return null;
  const cover = d.postures?.find((p) => p.kind === 'cover');
  if (!cover || cover.display === t.displayId) return null;
  const candidates: Target[] = (['portrait', 'landscape'] as const).map((orientation) => ({ deviceId: d.id, displayId: cover.display, pose: cover.id, orientation }));
  return candidates.find((c) => isKnownTarget(config, c)) ?? null;
}

/** Closes a context without waiting forever on a renderer stuck in a script. */
const close = (context: { close(): Promise<void> }) => within(context.close(), 5_000, 'close timed out').catch(() => {});

export async function checkSite(url: string, targets: Target[], opts: CheckOptions): Promise<Report> {
  const browser = opts.browser ?? (await chromium.launch());
  const inputs: ReportInput[] = [];
  const extra = new Map<string, Finding[]>();
  const notes: string[] = [];
  const loadTimeout = opts.loadTimeout ?? 30_000;
  const collectTimeout = opts.collectTimeout ?? 30_000;
  try {
    for (const t of targets) {
      const key = targetKey(t);
      opts.onProgress?.(`Checking ${key}`);
      const profile = deviceProfile(config, t);
      const base = { ref: `${url}#${key}`, name: key, page: url, width: profile.width, height: profile.height, tag: key };
      // A browser that died mid-run (out of memory on a huge page) fails every later target the same way.
      if (!browser.isConnected()) {
        inputs.push({ ...base, root: null, reason: 'The browser closed unexpectedly.' });
        continue;
      }
      let opened;
      try {
        opened = await openTarget(browser, profile);
      } catch (e) {
        inputs.push({ ...base, root: null, reason: firstLine(e) });
        continue;
      }
      const { context, page, applyFold } = opened;
      try {
        await applyFold(profile.fold);
        const note = await load(page, url, opts.wait, loadTimeout);
        if (note) notes.push(`${key}: ${note}`);
        const { root, truncated } = await within(collectLayout(page, CAP), collectTimeout, NO_ANSWER(collectTimeout));
        inputs.push({ ...base, root });
        if (truncated) notes.push(`${key}: page truncated at ${CAP} elements`);
      } catch (e) {
        inputs.push({ ...base, root: null, reason: firstLine(e) });
        await close(context);
        continue;
      }
      await close(context);

      const cover = opts.transitions ? coverOf(t) : null;
      if (!cover) continue;
      opts.onProgress?.(`Unfolding ${targetKey(cover)} to ${key}`);
      const from = deviceProfile(config, cover);
      let unfold;
      try {
        unfold = await openTarget(browser, from);
      } catch (e) {
        notes.push(`${key}: the unfold pass failed (${firstLine(e)})`);
        continue;
      }
      try {
        await unfold.applyFold(from.fold);
        await load(unfold.page, url, opts.wait, loadTimeout);
        await unfold.page.setViewportSize({ width: profile.width, height: profile.height });
        await unfold.applyFold(profile.fold);
        await unfold.page.waitForTimeout(opts.wait);
        const resized = await within(collectLayout(unfold.page, CAP), collectTimeout, NO_ANSWER(collectTimeout));
        const reloaded = inputs[inputs.length - 1].root!;
        extra.set(base.ref, resizeVsReload(resized.root, reloaded, t));
      } catch (e) {
        notes.push(`${key}: the unfold pass failed (${firstLine(e)})`);
      } finally {
        await close(unfold.context);
      }
    }
  } finally {
    if (!opts.browser && browser.isConnected()) await browser.close();
  }
  const report = buildReport(catalog, { kind: 'web', ref: url, name: url }, inputs);
  for (const f of report.frames) f.findings.push(...(extra.get(f.ref) ?? []));
  return notes.length ? { ...report, notes } : report;
}
