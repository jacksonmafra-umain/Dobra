// The site-check endpoint behind `dobra report` and the hosted function: validates a request,
// picks the targets, applies the policy and runs checkSite. It knows nothing about HTTP.
import type { Browser } from 'playwright';
import { loadCatalog } from '@dobra/core/catalog/load';
import type { Report } from '@dobra/core/report';
import { checkSite } from './checkSite';
import { refuseUrl, type Policy, type Resolve } from './policy';
import { chooseTargets } from './targets';

export interface CheckRequest {
  url: string;
  targets?: string[];
  categories?: string[];
}

export type CheckResult = { ok: true; report: Report } | { ok: false; status: 400 | 403 | 413 | 429 | 500; error: string };

/** What the report page learns from GET /api/health. Null limits mean none. */
export interface Health {
  ok: true;
  mode: 'local' | 'hosted';
  maxTargets: number | null;
  maxSeconds: number | null;
}

export interface HandlerDeps {
  policy: Policy;
  launch: () => Promise<Pick<Browser, 'close'>>;
  check?: typeof checkSite;
  resolve?: Resolve;
  now?: () => number;
  rateLimit?: { perMinute: number };
}

const catalog = loadCatalog();
const finite = (n: number) => (Number.isFinite(n) ? n : null);
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0];
const isStrings = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'));

function parse(body: unknown): CheckRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.url !== 'string' || !isStrings(b.targets) || !isStrings(b.categories)) return null;
  return { url: b.url.trim(), targets: b.targets as string[] | undefined, categories: b.categories as string[] | undefined };
}

export function createCheckHandler(deps: HandlerDeps) {
  const { policy } = deps;
  const check = deps.check ?? checkSite;
  const now = deps.now ?? Date.now;
  // Per process: each hosted function instance keeps its own window, so the limit is approximate.
  const seen = new Map<string, number[]>();

  function limited(ip: string): boolean {
    if (!deps.rateLimit) return false;
    const t = now();
    const recent = (seen.get(ip) ?? []).filter((x) => t - x < 60_000);
    const over = recent.length >= deps.rateLimit.perMinute;
    if (!over) recent.push(t);
    seen.set(ip, recent);
    return over;
  }

  return {
    health(): Health {
      return { ok: true, mode: policy.mode, maxTargets: finite(policy.maxTargets), maxSeconds: finite(policy.maxSeconds) };
    },

    async check(body: unknown, clientIp: string): Promise<CheckResult> {
      const req = parse(body);
      if (!req) return { ok: false, status: 400, error: 'Send {"url": "https://…"} with optional "targets" or "categories" lists.' };
      const refusal = await refuseUrl(req.url, policy, deps.resolve);
      if (refusal) {
        const badInput = /valid URL|http and https/.test(refusal);
        return { ok: false, status: badInput ? 400 : 403, error: refusal };
      }
      let targets;
      try {
        targets = chooseTargets(catalog, { targets: req.targets?.length ? req.targets : null, categories: req.categories ?? [] });
      } catch (e) {
        return { ok: false, status: 400, error: firstLine(e) };
      }
      if (!targets.length) return { ok: false, status: 400, error: 'No targets match those options.' };
      if (targets.length > policy.maxTargets)
        return { ok: false, status: 413, error: `At most ${policy.maxTargets} devices per hosted check. Run \`npm run dobra -- report\` to check more.` };
      if (limited(clientIp)) return { ok: false, status: 429, error: 'Too many checks from this address; try again in a minute.' };

      const hosted = policy.mode === 'hosted';
      const browser = await deps.launch();
      try {
        const report = await check(req.url, targets, {
          wait: 500,
          transitions: true,
          browser: browser as Browser,
          foldEmulation: policy.foldEmulation,
          ...(Number.isFinite(policy.maxSeconds) ? { deadline: now() + policy.maxSeconds * 1000 } : {}),
          ...(hosted ? { allowRequest: async (u: string) => (await refuseUrl(u, policy, deps.resolve)) === null } : {}),
        });
        return { ok: true, report };
      } catch (e) {
        return { ok: false, status: 500, error: firstLine(e) };
      } finally {
        await browser.close().catch(() => {});
      }
    },
  };
}
