# Foldable Check: check a website by URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foldable Check takes a website URL as well as a Figma file. A site is checked through a local `dobra report` server, a hosted Vercel function in the "dobra" project, or a copyable CLI command when neither answers.

**Architecture:** A framework-free check handler in `packages/cli` wraps the existing `checkSite` with request validation, target resolution and a policy (local or hosted). A Node `http` server (`dobra report`) and a Vercel function adapter both call that handler. The report app probes `/api/health` on its own origin, then either posts to `/api/check` or shows the CLI hand-off.

**Tech Stack:** TypeScript, Node `http` and `dns`, Playwright (local), `playwright-core` with a serverless Chromium build (hosted, settled in Task 0), React 19 and Vite (report), Vitest, esbuild.

**Spec:** `docs/superpowers/specs/2026-09-28-report-site-url-design.md`. Hosting option **A** was chosen: the functions live in the "dobra" Vercel project, on the same origin as the report.

## Global Constraints

- One page, two inputs: "Figma file" and "Website". Both end in the same report view.
- The same page and targets give the same `Report` (source kind `web`) whether checked locally, hosted or through the CLI.
- Hosted policy: `https` (and `http` for public hosts); private, loopback and link-local hosts refused (403), checked after DNS resolution and again on every request, redirects included; at most 6 targets (413); a time budget below the function's max duration, returning partial results with a note; a per-IP rate limit (429). The local policy allows everything.
- No new `Report` fields; run notes go in `Report.notes`.
- CLI rules (agreed with agent/02):
  - `run()` stays unit-testable, and only `checkSite` touches Playwright.
  - Exit codes stay 0 clean, 1 findings or unloaded, 2 bad input.
  - `e2e.test.ts` gains a `dobra report` case.
- Report UI (agreed with agent/03): `SiteCheckForm.tsx` and `siteCheck.ts` get plain class names and no styling; agent/03 places and styles them.
- `packages/cli` files: new `server.ts`, `policy.ts`, `localServer.ts` and `hosted.ts`, plus small changes to `args.ts`, `main.ts`, `checkSite.ts` and `build.mjs`. `apps/report`: new `SiteCheckForm.tsx` and `siteCheck.ts`, plus a small `ReportApp.tsx` change. Rebase the report work on agent/02's #93 when it merges.
- Workflow: one labeled issue and one PR per slice, branches from main, microcommits, CI green before asking for a merge, no assistant mention.
- Deploying to Vercel is the user's step, and so is any preview deploy in Task 0.

## Review Focus

- A URL that resolves to a public address but redirects to `127.0.0.1` or `169.254.169.254` on the hosted policy must be refused, not fetched (Task 2 tests the request guard; Task 3 tests that `checkSite` applies it).
- A host with both public and private addresses in DNS (split answers) must be refused on the hosted policy (Task 2).
- An IPv6 or IPv4-mapped literal (`http://[::1]/`, `http://[::ffff:127.0.0.1]/`) must be refused on the hosted policy (Task 2).
- A hosted request that runs out of time must return the targets already done, with a note naming the skipped ones, not a 504 with nothing (Task 3 for `checkSite`, Task 4 for the handler).
- `dobra report` started before the report app is built must still answer `/api/*`, and must serve a page that says to run `npm run build:report` rather than a 404 (Task 5).

---

## Slice 0: Spike (no merge)

### Task 0: Serverless Chromium in a Vercel function

**Goal:** Decide the package, and whether the fold emulation works in a Vercel function. The result decides Task 8.

**Files (throwaway branch `spike/serverless-chromium`, never merged):**
- Create: `spike/api/probe.mjs`, `spike/package.json`, `spike/vercel.json`

- [ ] **Step 1: Pick the candidate.** Read the README and package metadata of `@sparticuz/chromium` on npm and GitHub (a serverless Chromium build commonly used with `playwright-core`). Record its latest version, its Chromium version, and the Node runtimes it supports. If it doesn't support the Node version Vercel functions run, note that and look for the package's recommended alternative. Don't guess versions.
- [ ] **Step 2: Write the probe function.**

```js
// spike/api/probe.mjs: launches serverless Chromium and reports whether the fold override reaches the page.
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
```

```json
{ "name": "spike", "private": true, "type": "module", "dependencies": { "@sparticuz/chromium": "<version from Step 1>", "playwright-core": "<matching version>" } }
```

```json
{ "functions": { "api/probe.mjs": { "maxDuration": 60, "memory": 1769 } } }
```

- [ ] **Step 3: Deploy a preview (user step).** Ask the user to run `vercel deploy spike` into the "dobra" project, or into a scratch project, and share the preview URL. Don't deploy without their go-ahead.
- [ ] **Step 4: Measure.** Call `/api/probe` three times: once cold, twice warm. Record the function bundle size from the deployment, and the cold and warm `ms`.
  - Expected: `segments` is `[[0,537],[563,537]]` and `media` is `true`.
- [ ] **Step 5: Record the result** in the spec's §10 Risks, as a one-paragraph "Spike result", in a commit on the plan's branch.
  - If segments are not reported, Task 8 runs hosted checks size-only for folded targets and adds a note. Task 8's code already takes a `foldEmulation: boolean` for this.

---

## Slice 1: Handler and local server (packages/cli)

Issue: "Check a website from the report: CLI handler and `dobra report`" (enhancement, area:cli). Branch: `feat/cli-report-server`.

### Task 1: Arguments for `dobra report`

**Files:**
- Modify: `packages/cli/src/args.ts`
- Test: `packages/cli/src/args.test.ts`

**Interfaces:**
- Produces: `CliOptions` becomes a union:

```ts
export type CliOptions = SiteOptions | ReportOptions;
export interface SiteOptions { command: 'site'; url: string; targets: string[] | null; categories: string[]; out: string; md: string | null; wait: number; failOn: FailOn; transitions: boolean }
export interface ReportOptions { command: 'report'; port: number; host: string; dir: string | null }
```

- [ ] **Step 1: Write the failing tests** (append to `args.test.ts`):

```ts
it('parses dobra report with defaults', () => {
  expect(parseArgs(['report'])).toEqual({ command: 'report', port: 5301, host: '127.0.0.1', dir: null });
});
it('parses a port, a host and a report folder', () => {
  expect(parseArgs(['report', '--port', '0', '--host', '0.0.0.0', '--dir', 'apps/report/dist'])).toEqual({ command: 'report', port: 0, host: '0.0.0.0', dir: 'apps/report/dist' });
});
it('rejects a bad port', () => {
  expect(parseArgs(['report', '--port', 'x'])).toHaveProperty('help');
  expect(parseArgs(['report', '--port', '70000'])).toHaveProperty('help');
});
```

- [ ] **Step 2: Run** `npm test -w @dobra/cli -- src/args.test.ts`. Expected: 3 new failures.
- [ ] **Step 3: Implement.**
  - Add `port`, `host` and `dir` string options to the `parseNodeArgs` options.
  - After parsing, `if (p.length === 1 && p[0] === 'report')`: validate `port` as an integer from 0 to 65535 (default 5301), and return `{ command: 'report', port, host: v.host ?? '127.0.0.1', dir: v.dir ?? null }`.
  - Leave the `check site` branch as it is.
  - Extend `USAGE` with `dobra report [--port <n>] [--host <addr>] [--dir <folder>]`, and one line per option: "Serve Foldable Check with a local site-check endpoint".
- [ ] **Step 4: Run** the same command. Expected: all pass. Also run `npm run typecheck -w @dobra/cli`: `main.ts` narrows on `opts.command` in Task 5, so for now add `if (opts.command === 'report') { io.err('dobra report is not available yet'); return 2; }` at the top of `run()`.
- [ ] **Step 5: Commit** with `git commit -m "Parse dobra report with a port, host and report folder"`.

### Task 2: Address policy and request guard

**Files:**
- Create: `packages/cli/src/policy.ts`
- Test: `packages/cli/src/policy.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Policy { mode: 'local' | 'hosted'; maxTargets: number; maxSeconds: number; foldEmulation: boolean }
export const LOCAL: Policy;   // { mode: 'local', maxTargets: Infinity, maxSeconds: Infinity, foldEmulation: true }
export const HOSTED: Policy;  // { mode: 'hosted', maxTargets: 6, maxSeconds: 50, foldEmulation: true }
export function isPublicAddress(ip: string): boolean;
export type Resolve = (host: string) => Promise<string[]>;
/** Null when the URL may be fetched, else the reason. */
export function refuseUrl(url: string, policy: Policy, resolve?: Resolve): Promise<string | null>;
```

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from 'vitest';
import { HOSTED, LOCAL, isPublicAddress, refuseUrl } from './policy';

const dns = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700::1111'])('accepts %s', (ip) => expect(isPublicAddress(ip)).toBe(true));
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])(
    'refuses %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe('refuseUrl', () => {
  it('allows anything on the local policy', async () => {
    expect(await refuseUrl('http://127.0.0.1:5300/a.html', LOCAL)).toBeNull();
  });
  it('refuses non-http schemes everywhere', async () => {
    expect(await refuseUrl('file:///etc/passwd', LOCAL)).toMatch(/http/);
    expect(await refuseUrl('ftp://example.com/', HOSTED, dns({}))).toMatch(/http/);
  });
  it('refuses private, loopback and literal addresses on the hosted policy', async () => {
    expect(await refuseUrl('http://[::1]/', HOSTED, dns({}))).toMatch(/private/);
    expect(await refuseUrl('http://[::ffff:127.0.0.1]/', HOSTED, dns({}))).toMatch(/private/);
    expect(await refuseUrl('https://intranet.example/', HOSTED, dns({ 'intranet.example': ['10.0.0.5'] }))).toMatch(/private/);
  });
  it('refuses a host whose DNS answers mix public and private addresses', async () => {
    expect(await refuseUrl('https://split.example/', HOSTED, dns({ 'split.example': ['93.184.215.14', '127.0.0.1'] }))).toMatch(/private/);
  });
  it('refuses a host that does not resolve', async () => {
    expect(await refuseUrl('https://nowhere.example/', HOSTED, dns({}))).toMatch(/resolve/);
  });
  it('allows a public https host', async () => {
    expect(await refuseUrl('https://example.com/', HOSTED, dns({ 'example.com': ['93.184.215.14'] }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npm test -w @dobra/cli -- src/policy.test.ts`. Expected: FAIL, the module is not found.
- [ ] **Step 3: Implement.**

```ts
// Which addresses a site check may reach. The local server checks anything, including localhost;
// the hosted check refuses private networks so it can't be used to reach them.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface Policy { mode: 'local' | 'hosted'; maxTargets: number; maxSeconds: number; foldEmulation: boolean }
export const LOCAL: Policy = { mode: 'local', maxTargets: Infinity, maxSeconds: Infinity, foldEmulation: true };
export const HOSTED: Policy = { mode: 'hosted', maxTargets: 6, maxSeconds: 50, foldEmulation: true };
export type Resolve = (host: string) => Promise<string[]>;

const v4 = (ip: string) => ip.split('.').map(Number);
const privateV4 = (ip: string) => {
  const [a, b] = v4(ip);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return !privateV4(ip);
  if (kind !== 6) return false;
  const low = ip.toLowerCase();
  const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return !privateV4(mapped[1]);
  if (low === '::' || low === '::1') return false;
  return !/^(fc|fd|fe[89ab])/.test(low);
}

const defaultResolve: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

export async function refuseUrl(url: string, policy: Policy, resolve: Resolve = defaultResolve): Promise<string | null> {
  let u: URL;
  try { u = new URL(url); } catch { return 'That is not a valid URL.'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Only http and https addresses can be checked.';
  if (policy.mode === 'local') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let ips: string[];
  try { ips = isIP(host) ? [host] : await resolve(host); } catch { ips = []; }
  if (!ips.length) return `${host} does not resolve.`;
  if (!ips.every(isPublicAddress)) return 'This address is on a private network. Run `npm run dobra -- report` to check it locally.';
  return null;
}
```

- [ ] **Step 4: Run** the tests. Expected: all pass.
- [ ] **Step 5: Commit** with `git commit -m "Refuse private network addresses for hosted site checks"`.

### Task 3: `checkSite` request guard and time budget

**Files:**
- Modify: `packages/cli/src/checkSite.ts` (`CheckOptions`, the target loop and `openTarget` routing), `packages/cli/src/emulate.ts` (`openTarget` takes an optional guard)
- Test: `packages/cli/src/checkSite.test.ts`

**Interfaces:**
- Consumes: `refuseUrl` (Task 2), through the guard the handler passes.
- Produces: `CheckOptions.allowRequest?: (url: string) => Promise<boolean>`, `CheckOptions.deadline?: number` (epoch ms), `CheckOptions.foldEmulation?: boolean` (default `true`).

- [ ] **Step 1: Write the failing tests** (append; they use the existing fixture server and `layout.html`):

```ts
it('aborts requests the guard refuses and reports the target as not loaded', async () => {
  const r = await checkSite(`${server.url}/layout.html`, [PIXEL], { ...opts, browser, allowRequest: async () => false });
  expect(r.frames).toEqual([]);
  expect(r.unloaded[0].reason).toMatch(/blocked|refused|ERR_/i);
});
it('stops at the deadline and names the skipped targets in a note', async () => {
  const r = await checkSite(`${server.url}/layout.html`, [PIXEL, DUO], { ...opts, browser, deadline: Date.now() - 1 });
  expect(r.frames).toEqual([]);
  expect(r.notes?.join(' ')).toMatch(/time budget/);
  expect(r.notes?.join(' ')).toContain(targetKey(DUO));
});
it('skips the fold override when fold emulation is off, and says so', async () => {
  const r = await checkSite(`${server.url}/layout.html`, [DUO], { ...opts, browser, foldEmulation: false });
  expect(r.notes?.join(' ')).toMatch(/size only/);
});
```

- [ ] **Step 2: Run** `npm test -w @dobra/cli -- src/checkSite.test.ts`. Expected: 3 new failures.
- [ ] **Step 3: Implement.**
  - In `openTarget(browser, profile, allowRequest?)`: when `allowRequest` is set, add `await context.route('**/*', async (route) => ((await allowRequest(route.request().url())) ? route.continue() : route.abort('blockedbyclient')))`. Playwright routes every request through this, redirects included, so a redirect to a private host is refused too.
  - In `checkSite`, at the top of each loop iteration: `if (opts.deadline !== undefined && Date.now() >= opts.deadline) { skipped.push(key); continue; }`. After the loop, if `skipped.length`, add ``notes.push(`time budget reached; not checked: ${skipped.join(', ')}`)``.
  - When `opts.foldEmulation === false` and the target has a fold, call `applyFold(null)` and push ``notes.push(`${key}: fold not emulated here, size only`)``.
  - Pass `opts.allowRequest` to `openTarget`, and check the transition pass against the deadline the same way.
- [ ] **Step 4: Run** `npm test -w @dobra/cli`. Expected: all pass, the existing tests included.
- [ ] **Step 5: Commit** in two parts: `git commit -m "Let a site check refuse requests through a guard, redirects included"` (the route and its test), then `git commit -m "Stop a site check at a time budget and note what was skipped"` (the deadline, fold emulation off, and their tests).

### Task 4: Check handler

**Files:**
- Create: `packages/cli/src/server.ts`
- Test: `packages/cli/src/server.test.ts`

**Interfaces:**
- Consumes: `chooseTargets` (targets.ts), `checkSite` and `CheckOptions` (Task 3), `Policy` and `refuseUrl` (Task 2), `loadCatalog`, `Report`.
- Produces:

```ts
export interface CheckRequest { url: string; targets?: string[]; categories?: string[] }
export type CheckResult = { ok: true; report: Report } | { ok: false; status: 400 | 403 | 413 | 429 | 500; error: string };
export interface Health { ok: true; mode: 'local' | 'hosted'; maxTargets: number; maxSeconds: number }
export interface HandlerDeps { policy: Policy; launch: () => Promise<Browser>; check?: typeof checkSite; resolve?: Resolve; now?: () => number; rateLimit?: { perMinute: number } }
export function createCheckHandler(deps: HandlerDeps): { health(): Health; check(body: unknown, clientIp: string): Promise<CheckResult> };
```

- [ ] **Step 1: Write the failing tests** with a stub `check` and `launch`, so no browser runs:

```ts
import { describe, expect, it, vi } from 'vitest';
import { HOSTED, LOCAL } from './policy';
import { createCheckHandler } from './server';

const fakeReport = { version: 1, generatedAt: '', source: { kind: 'web', ref: 'u', name: 'u' }, catalogVersion: '1', frames: [], coverage: { cells: [], byCategory: {} }, unloaded: [] } as never;
const deps = (over = {}) => ({ policy: LOCAL, launch: vi.fn(async () => ({ close: async () => {} }) as never), check: vi.fn(async () => fakeReport), resolve: async () => ['93.184.215.14'], ...over });

describe('createCheckHandler', () => {
  it('reports its mode and limits', () => {
    expect(createCheckHandler(deps({ policy: HOSTED })).health()).toEqual({ ok: true, mode: 'hosted', maxTargets: 6, maxSeconds: 50 });
  });
  it('rejects a body without a URL', async () => {
    expect(await createCheckHandler(deps()).check({}, '1.2.3.4')).toMatchObject({ ok: false, status: 400 });
  });
  it('rejects an unknown target key, naming it', async () => {
    expect(await createCheckHandler(deps()).check({ url: 'https://example.com/', targets: ['nope/x/-/portrait'] }, 'ip')).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('nope/x/-/portrait') });
  });
  it('refuses a private address on the hosted policy with 403', async () => {
    expect(await createCheckHandler(deps({ policy: HOSTED, resolve: async () => ['10.0.0.1'] })).check({ url: 'https://intranet.example/' }, 'ip')).toMatchObject({ ok: false, status: 403 });
  });
  it('caps targets on the hosted policy with 413', async () => {
    const r = await createCheckHandler(deps({ policy: HOSTED })).check({ url: 'https://example.com/', categories: ['foldable-book'] }, 'ip');
    expect(r).toMatchObject({ ok: false, status: 413 });
  });
  it('rate-limits one client on the hosted policy with 429', async () => {
    const h = createCheckHandler(deps({ policy: HOSTED, rateLimit: { perMinute: 1 } }));
    const body = { url: 'https://example.com/', targets: ['pixel-9/main/-/portrait'] };
    expect((await h.check(body, 'ip')).ok).toBe(true);
    expect(await h.check(body, 'ip')).toMatchObject({ ok: false, status: 429 });
  });
  it('runs the check with a guard and a deadline on the hosted policy, and closes the browser', async () => {
    const d = deps({ policy: HOSTED, now: () => 1_000 });
    const r = await createCheckHandler(d).check({ url: 'https://example.com/', targets: ['pixel-9/main/-/portrait'] }, 'ip');
    expect(r.ok).toBe(true);
    const [, , opts] = d.check.mock.calls[0];
    expect(opts.deadline).toBe(1_000 + 50_000);
    expect(await opts.allowRequest('http://127.0.0.1/')).toBe(false);
  });
  it('uses the representative set when no targets or categories are given', async () => {
    const d = deps();
    await createCheckHandler(d).check({ url: 'http://localhost:3000/' }, 'ip');
    expect(d.check.mock.calls[0][1].length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @dobra/cli -- src/server.test.ts`. Expected: FAIL, the module is not found.
- [ ] **Step 3: Implement** `server.ts`:
  - Parse the body with a small shape check (not zod): `url` a string, and `targets` and `categories` string arrays.
  - `const refusal = await refuseUrl(url, policy, resolve)`. Map it to 400 when the URL is invalid or has the wrong scheme, and to 403 otherwise.
  - `chooseTargets(catalog, { targets: body.targets ?? null, categories: body.categories ?? [] })`. A thrown error means 400. An empty list means 400 with "No targets match those options."
  - Over `policy.maxTargets` means 413 with "At most 6 devices per hosted check. Run `npm run dobra -- report` to check more."
  - The rate limit is an in-memory `Map<ip, number[]>` of timestamps within 60 s, active only when `rateLimit` is set (the hosted adapter sets it). Document in a comment that each function instance has its own map.
  - `const browser = await launch()`, then call `check(url, targets, { wait: 500, transitions: true, browser, deadline, foldEmulation: policy.foldEmulation, allowRequest })` in `try/finally { await browser.close() }`. `deadline` is `now() + policy.maxSeconds * 1000` when finite, and `allowRequest` wraps `refuseUrl(...) === null` on the hosted policy only.
  - Any other thrown error means 500 with its first line.
- [ ] **Step 4: Run** `npm test -w @dobra/cli`. Expected: all pass.
- [ ] **Step 5: Commit** with `git commit -m "Add a site-check handler with validation, target resolution and policy limits"`.

### Task 5: `dobra report` local server

**Files:**
- Create: `packages/cli/src/localServer.ts`
- Modify: `packages/cli/src/main.ts` (route `command: 'report'`)
- Test: `packages/cli/src/localServer.test.ts`, `packages/cli/src/main.test.ts`, `packages/cli/src/e2e.test.ts`

**Interfaces:**
- Consumes: `createCheckHandler` (Task 4), `LOCAL` (Task 2), `ReportOptions` (Task 1).
- Produces: `startLocalServer(opts: { port: number; host: string; dir: string; handler: ReturnType<typeof createCheckHandler> }): Promise<{ url: string; close(): Promise<void> }>`, and `Io.serve?: typeof startLocalServer` so `run()` stays unit-testable.

- [ ] **Step 1: Write the failing tests.**
  - `localServer.test.ts`: start with a temporary `dir` holding an `index.html`, and a stub handler (`health` returns local, and `check` returns `{ ok: true, report }`). Assert:
    - `GET /` and `GET /report/` return that HTML;
    - `GET /api/health` returns the health JSON;
    - `POST /api/check` with a JSON body returns the handler's report with status 200;
    - a handler `{ ok: false, status: 403 }` becomes HTTP 403 with `{ error }`;
    - with a `dir` that doesn't exist, `GET /` returns 200 with a page containing `npm run build:report`, and `/api/health` still answers;
    - a body over 64 KB returns 413.
  - `main.test.ts`: `run(['report', '--port', '0'], io)` with `io.serve` stubbed resolves with exit code 0 after `io.serve`'s server closes, and prints the URL through `io.out`.
  - `e2e.test.ts`: spawn the built binary with `report --port 0` and read the first stdout line `Foldable Check: http://127.0.0.1:<port>/`. POST `{ url: site('06-hinge-content.html'), targets: [DUO] }` to `/api/check`, and expect status 200, `report.source.kind === 'web'`, and a `hinge-content` finding. Then kill the process.
- [ ] **Step 2: Run** `npm test -w @dobra/cli`. Expected: the new tests fail.
- [ ] **Step 3: Implement** `localServer.ts` with `node:http`:
  - Static files from `dir`: `/` and `/report/` serve `index.html`, and other paths only serve files inside `dir` (resolve, then check the prefix to block `..`).
  - `/api/health` answers GET; `/api/check` answers POST with a JSON body of at most 64 KB and a JSON response.
  - The fallback page appears when `index.html` is missing.
  - In `main.ts`, `run()` handles `command === 'report'`. It resolves `dir` (`opts.dir` or the path of `apps/report/dist` relative to the binary: `new URL('../../../apps/report/dist/', import.meta.url)`), and builds the handler with `{ policy: LOCAL, launch: () => chromium.launch() }`. `launch` is imported lazily, so `run()`'s tests never load Playwright.
  - It then calls `(io.serve ?? startLocalServer)(…)`, prints `Foldable Check: ${url}`, and resolves on SIGINT or when the server closes, returning 0.
- [ ] **Step 4: Run** `npm test -w @dobra/cli && npm run typecheck`. Expected: all pass. Then check by hand: `npm run build:report && npm run build:cli && npm run dobra -- report`. Open the printed URL; the report loads, and `curl -s localhost:5301/api/health` returns `{"ok":true,"mode":"local",…}`.
- [ ] **Step 5: Commit** in two parts: `git commit -m "Serve Foldable Check and a local site-check endpoint from dobra report"` (localServer and main), then `git commit -m "Test dobra report end to end with the built binary"` (e2e).

### Task 6: CLI docs

**Files:** Modify `packages/cli/README.md` (a "Check sites from the report" section: `dobra report`, the options, the endpoints, and that the local server can check localhost), and the root `README.md` quick start (one line).

- [ ] **Step 1:** Write the sections, using the USAGE text from Task 1.
- [ ] **Step 2:** Commit with `git commit -m "Document dobra report"`, open the slice PR (closes the slice issue), and wait for CI to pass.

---

## Slice 2: Report app (apps/report)

Issue: "Check a website from Foldable Check: form, client and hand-off" (enhancement, area:web). Branch: `feat/report-site-form`, rebased on #93.

### Task 7: Client and form

**Files:**
- Create: `apps/report/src/siteCheck.ts`, `apps/report/src/SiteCheckForm.tsx`
- Modify: `apps/report/src/ReportApp.tsx` (a "Figma file | Website" switch that renders the form, whose `onReport` calls the existing `setReport`)
- Test: `apps/report/src/siteCheck.test.ts`, `apps/report/src/SiteCheckForm.test.ts`

**Interfaces:**
- Consumes: the `/api/health` and `/api/check` contract from Task 4 (`Health`, `CheckResult`).
- Produces:

```ts
export type Fetch = typeof fetch;
export async function probe(fetch: Fetch, origin?: string): Promise<Health | null>;           // GET /api/health; null on any failure or a non-JSON answer
export async function runCheck(fetch: Fetch, req: CheckRequest): Promise<{ ok: true; report: Report } | { ok: false; message: string }>;
export function cliCommand(req: CheckRequest): string;     // npm run dobra -- check site '<url>' [--targets a,b] [--category c …] --out foldable-report.json
export function actionsStep(req: CheckRequest): string;    // a GitHub Actions `- run:` block using cliCommand
export function messageFor(status: number, error: string, mode: 'local' | 'hosted'): string;
export function SiteCheckForm(props: { health: Health | null | undefined; fetch?: Fetch; onReport(report: Report): void }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests.**
  - `siteCheck.test.ts`:
    - `probe` returns the health for a `200 {ok:true,…}`, and `null` for a 404, an HTML body, or a rejected fetch;
    - `runCheck` parses the report through `parseReport`, and maps `{status: 403}` to the message naming `npm run dobra -- report`;
    - `cliCommand({ url: "https://a.example/?q=1&x=' y" , targets: ['pixel-9/main/-/portrait'] })` shell-quotes the URL. Expected: `npm run dobra -- check site 'https://a.example/?q=1&x='\'' y' --targets pixel-9/main/-/portrait --out foldable-report.json`;
    - `actionsStep` contains `npx playwright install --with-deps chromium` and the command.
  - `SiteCheckForm.test.ts` (`renderToStaticMarkup`, like `ReportNotes.test.ts`):
    - `health: undefined` renders "Looking for a check endpoint…";
    - `health: null` renders the hand-off: the command in a `<code>`, the Actions step, and "Open a report JSON";
    - `health: { mode: 'local', … }` renders a URL input, a target picker and a "Check site" button, with class names `site-check`, `site-check__url`, `site-check__targets`, `site-check__submit` and `site-check__handoff`;
    - `health: { mode: 'hosted', maxTargets: 6 }` renders the limit ("up to 6 devices").
- [ ] **Step 2: Run** `npm test -w @dobra/report`. Expected: the new tests fail.
- [ ] **Step 3: Implement.**
  - `siteCheck.ts` follows the interfaces above. Shell quoting is `'` + `s.replaceAll("'", "'\\''")` + `'`.
  - `SiteCheckForm` holds the URL, the selected categories (chips for each category) and the "Representative set" default, plus busy and error state.
  - On submit it calls `runCheck(fetch, { url, categories })` and then `onReport`, or shows the message together with the hand-off pre-filled.
  - Plain class names, no CSS.
  - In `ReportApp`, a `useEffect` calls `probe(fetch)` once and stores the health. A two-button switch "Figma file" / "Website" toggles between the existing Figma form and `SiteCheckForm`. The report JSON file input stays below both.
- [ ] **Step 4: Run** `npm test -w @dobra/report && npm run typecheck`. Expected: all pass. Then check by hand:
  - `npm run build:report && npm run dobra -- report`: open the URL, choose Website, check `http://127.0.0.1:5300/06-hinge-content.html` served from `examples/sites`, and the report view shows the Duo findings;
  - `npm run dev:report`, which has no endpoint: the hand-off appears.
- [ ] **Step 5: Commit** in three parts: `git commit -m "Add the site-check client: probe, check, CLI command and Actions step"`, then `git commit -m "Add an unstyled website form with a CLI hand-off"`, then `git commit -m "Offer Figma file or Website in Foldable Check"`. Open the PR, pass CI, and tell agent/03 the class names.

---

## Slice 3: Hosted functions (option A, the "dobra" project)

Issue: "Host the site check on Vercel" (enhancement, area:web, area:cli). Branch: `feat/hosted-site-check`. This slice starts after Task 0's result.

### Task 8: Vercel function adapter and packaging

**Files:**
- Create: `packages/cli/src/hosted.ts`
- Modify: `packages/cli/build.mjs` (a second entry that bundles `hosted.ts` to `dist/api/check.mjs` and `dist/api/health.mjs`), `packages/cli/package.json` (the serverless Chromium package and `playwright-core` pinned to Task 0's versions), and `apps/site/scripts/copy-tools.mjs` (copy `packages/cli/dist/api/` to the site's `dist/api/`, and write `dist/package.json` with those two dependencies)
- Modify: `apps/site/public/vercel.json` (`"functions": { "api/check.mjs": { "maxDuration": 60, "memory": 1769 } }`, merged with `trailingSlash`)
- Test: `packages/cli/src/hosted.test.ts`

**Interfaces:**
- Consumes: `createCheckHandler`, `HOSTED`.
- Produces: `export function makeVercelHandlers(deps: HandlerDeps): { check(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void>; health(req, res): void }` and the two default-exported functions.

- [ ] **Step 1: Write the failing test** using `node:http` request and response mocks:
  - `health` writes 200 with `mode: 'hosted'`;
  - `check` with method GET writes 405;
  - `check` with a POST whose body is `{ url: 'https://intranet.example/' }` and `resolve → 10.0.0.1` writes 403 with `{ error }`;
  - the client IP comes from `x-forwarded-for`'s first entry, and falls back to `socket.remoteAddress`;
  - the handler is built with `{ policy: { ...HOSTED, foldEmulation: <Task 0 result> }, rateLimit: { perMinute: 5 } }`.
- [ ] **Step 2: Run** `npm test -w @dobra/cli -- src/hosted.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `hosted.ts` launches with `playwright-core` and the serverless Chromium (`executablePath: await chromium.executablePath(), args: chromium.args`). It reads the JSON body (Vercel parses it into `req.body`), gets the client IP, and maps a `CheckResult` to status and JSON.
  - Build the two entries with esbuild, keeping the Chromium package and `playwright-core` external.
  - Update `copy-tools.mjs` and `vercel.json` as listed above.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build -w @dobra/site && npm run test:dist -w @dobra/site`. Expected: all pass, and the site's `dist/api/check.mjs` exists.
- [ ] **Step 5: Hand over to the user and agent/03.**
  - Commit in two parts: `git commit -m "Add Vercel functions for the hosted site check"`, then `git commit -m "Ship the site-check functions with the static site"`.
  - Open the PR, with a "Deploy" section: the user runs `vercel deploy dist` from `apps/site`, as today, and Vercel installs the two dependencies from `dist/package.json`. If Task 0 showed that a prebuilt folder won't install dependencies, the section gives the `vercel build` plus `vercel deploy --prebuilt` sequence Task 0 used.
  - Ask agent/03 to review the `copy-tools.mjs` change.

### Task 9: Docs and spec status

**Files:**
- Modify: `apps/report/README.md` (the Website input, and the three ways a check runs)
- Modify: the spec's §8, marking option A as chosen, with the date

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Commit with `git commit -m "Document website checks in the report and record the hosting choice"`, in the slice 3 PR.
