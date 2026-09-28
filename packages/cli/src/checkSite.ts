// dobra check site: one Chromium context per window, the same rules as the plugin and the web
// report, and an unfold pass that resizes from the cover display without reloading. Targets that
// share a window are checked once, as one frame that lists them all.
import { chromium, type Browser, type Page } from 'playwright';
import { loadCatalog } from '@dobra/core/catalog/load';
import type { Finding } from '@dobra/core/engine/checks';
import { buildReport, type Report, type ReportInput } from '@dobra/core/report';
import { envConfigOf, isKnownTarget, targetKey, type Target } from '@dobra/core/targets';
import { resizeVsReload } from '@dobra/core/transition';
import { collectLayout } from './collect';
import { deviceProfile, openTarget } from './emulate';
import { groupByWindow, windowName } from './targets';

const catalog = loadCatalog();
const config = envConfigOf(catalog);
const CAP = 4000;
/** The least time a target needs to be worth starting under a deadline. */
const MIN_TARGET_MS = 3_000;
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
  /** Sees every request, redirects included; refused ones are blocked. Hosted checks use it to stay off private networks. */
  allowRequest?: (url: string) => Promise<boolean>;
  /** Epoch ms after which no further target is started; the skipped ones are named in a note. */
  deadline?: number;
  /** False where the browser can't emulate a fold: folded targets are then checked for size only. Default true. */
  foldEmulation?: boolean;
  /** When given, filled with a PNG of each loaded target's window, or the reason it has none, by frame ref. */
  capture?: { images: Map<string, Uint8Array>; missing: Record<string, string> };
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
  const skipped: string[] = [];
  // With a deadline, every wait is capped by the time left, and a target isn't started without enough of it.
  const left = () => (opts.deadline === undefined ? Infinity : opts.deadline - Date.now());
  const pastDeadline = () => left() < MIN_TARGET_MS;
  const capped = (ms: number) => Math.max(1, Math.min(ms, left()));
  const fold = (f: Parameters<Awaited<ReturnType<typeof openTarget>>['applyFold']>[0]) => (opts.foldEmulation === false ? null : f);
  try {
    for (const group of groupByWindow(config, targets)) {
      // The first target stands for the window: its key makes the frame's ref and tag.
      const t = group[0];
      const name = windowName(group);
      if (pastDeadline()) {
        skipped.push(name);
        continue;
      }
      opts.onProgress?.(`Checking ${name}`);
      const profile = deviceProfile(config, t);
      const tags = group.length > 1 ? { tags: group.map(targetKey) } : {};
      const base = { ref: `${url}#${targetKey(t)}`, name, page: url, width: profile.width, height: profile.height, tag: targetKey(t), ...tags };
      // A browser that died mid-run (out of memory on a huge page) fails every later target the same way.
      if (!browser.isConnected()) {
        inputs.push({ ...base, root: null, reason: 'The browser closed unexpectedly.' });
        continue;
      }
      let opened;
      try {
        opened = await openTarget(browser, profile, opts.allowRequest);
      } catch (e) {
        inputs.push({ ...base, root: null, reason: firstLine(e) });
        continue;
      }
      const { context, page, applyFold } = opened;
      try {
        await applyFold(fold(profile.fold));
        if (profile.fold && opts.foldEmulation === false) notes.push(`${name}: fold not emulated here, size only`);
        const note = await load(page, url, opts.wait, capped(loadTimeout));
        if (note) notes.push(`${name}: ${note}`);
        const { root, truncated, scale } = await within(collectLayout(page, CAP), capped(collectTimeout), NO_ANSWER(collectTimeout));
        inputs.push({ ...base, root });
        if (opts.capture) {
          // Within the budget like every other wait; a failed capture never fails the check.
          try {
            opts.capture.images.set(base.ref, await page.screenshot({ type: 'png', timeout: capped(10_000) }));
          } catch (e) {
            opts.capture.missing[base.ref] = `The screenshot failed: ${firstLine(e)}`;
            notes.push(`${name}: the screenshot failed (${firstLine(e)})`);
          }
        }
        if (truncated) notes.push(`${name}: page truncated at ${CAP} elements`);
        if (scale < 0.99)
          notes.push(`${name}: the page is zoomed out to ${Math.round(scale * 100)}% to fit content wider than the window, so hinge positions are approximate`);
      } catch (e) {
        inputs.push({ ...base, root: null, reason: firstLine(e) });
        await close(context);
        continue;
      }
      await close(context);

      const cover = opts.transitions && !pastDeadline() ? coverOf(t) : null;
      if (!cover) continue;
      opts.onProgress?.(`Unfolding ${targetKey(cover)} to ${name}`);
      const from = deviceProfile(config, cover);
      let unfold;
      try {
        unfold = await openTarget(browser, from, opts.allowRequest);
      } catch (e) {
        notes.push(`${name}: the unfold pass failed (${firstLine(e)})`);
        continue;
      }
      try {
        await unfold.applyFold(fold(from.fold));
        await load(unfold.page, url, opts.wait, capped(loadTimeout));
        await unfold.page.setViewportSize({ width: profile.width, height: profile.height });
        await unfold.applyFold(fold(profile.fold));
        await unfold.page.waitForTimeout(opts.wait);
        const resized = await within(collectLayout(unfold.page, CAP), capped(collectTimeout), NO_ANSWER(collectTimeout));
        const reloaded = inputs[inputs.length - 1].root!;
        extra.set(base.ref, resizeVsReload(resized.root, reloaded, t));
      } catch (e) {
        notes.push(`${name}: the unfold pass failed (${firstLine(e)})`);
      } finally {
        await close(unfold.context);
      }
    }
  } finally {
    if (!opts.browser && browser.isConnected()) await browser.close();
  }
  if (skipped.length) notes.push(`time budget reached; not checked: ${skipped.join(', ')}`);
  if (opts.capture) for (const i of inputs) if (!i.root) opts.capture.missing[i.ref] = i.reason ?? 'The page did not load.';
  const report = buildReport(catalog, { kind: 'web', ref: url, name: url }, inputs);
  for (const f of report.frames) f.findings.push(...(extra.get(f.ref) ?? []));
  return notes.length ? { ...report, notes } : report;
}
