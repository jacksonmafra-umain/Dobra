// Talks to a site-check endpoint: `dobra report` locally, or the hosted function next to the page.
// When neither answers, the page falls back to the command the user can run themselves.
import { parseReport, type Report } from '@dobra/core/report';
import { withScheme } from '@dobra/core/siteAddress';

export type Fetch = typeof fetch;

/** The endpoint's own description (GET /api/health). Null limits mean none. */
export interface Health {
  ok: true;
  mode: 'local' | 'hosted';
  maxTargets: number | null;
  maxSeconds: number | null;
}

export interface CheckRequest {
  url: string;
  targets?: string[];
  categories?: string[];
}

/** `handoff`: whether running the command yourself would help. `aborted`: the request was cancelled. */
export type CheckOutcome = { ok: true; report: Report } | { ok: false; message: string; handoff: boolean; aborted?: true };

const LOCAL_HINT = 'Run `npm run dobra -- report` to check it on your machine.';

/** The endpoint's health, or null when there is none (a static host answers 404 or with the page). */
export async function probe(fetch: Fetch, origin = globalThis.location?.origin ?? ''): Promise<Health | null> {
  try {
    const res = await fetch(`${origin}/api/health`);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const body = (await res.json()) as Partial<Health>;
    return body && body.ok === true && (body.mode === 'local' || body.mode === 'hosted') ? (body as Health) : null;
  } catch {
    return null;
  }
}

export function messageFor(status: number, error: string, mode: 'local' | 'hosted'): string {
  const hint = mode === 'hosted' ? ` ${LOCAL_HINT}` : '';
  const plain = error.replace(/ ?Run `npm run dobra -- report`.*$/, '');
  if (status === 429) return mode === 'local' ? 'A check is already running; try again when it finishes.' : 'Too many checks from this address. Wait a minute and try again.';
  if (status === 403 || status === 413) return `${plain || `The check was refused (status ${status}).`}${hint}`;
  if (status === 400) return plain || 'The check endpoint could not read that request.';
  return `The check failed: ${plain || `status ${status}`}.${hint}`;
}

/** Whether running the command yourself gets past this failure. */
const helps = (status: number, mode: 'local' | 'hosted') => status >= 500 || (mode === 'hosted' && (status === 403 || status === 413));

export async function runCheck(
  fetch: Fetch,
  req: CheckRequest,
  mode: 'local' | 'hosted' = 'local',
  origin = globalThis.location?.origin ?? '',
  signal?: AbortSignal,
): Promise<CheckOutcome> {
  let res: Response;
  try {
    res = await fetch(`${origin}/api/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal });
  } catch {
    if (signal?.aborted) return { ok: false, aborted: true, handoff: false, message: '' };
    return { ok: false, message: `Couldn't reach the check endpoint. ${LOCAL_HINT}`, handoff: true };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, message: `The check endpoint answered ${res.status} without a report.`, handoff: true };
  }
  if (!res.ok) return { ok: false, message: messageFor(res.status, String((body as { error?: unknown })?.error ?? ''), mode), handoff: helps(res.status, mode) };
  try {
    return { ok: true, report: parseReport(body) };
  } catch (e) {
    return { ok: false, message: `The check endpoint sent something that is not a report. ${e instanceof Error ? e.message : ''}`.trim(), handoff: true };
  }
}

/** Single-quotes a value for a POSIX shell. */
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

export function cliCommand(req: CheckRequest): string {
  const parts = ['npm run dobra -- check site', quote(withScheme(req.url))];
  if (req.targets?.length) parts.push('--targets', req.targets.join(','));
  for (const c of req.categories ?? []) parts.push('--category', c);
  return parts.join(' ');
}

export function actionsStep(req: CheckRequest): string {
  return [
    '- run: npm ci && npx playwright install --with-deps chromium && npm run build:cli',
    `- run: ${cliCommand(req)}`,
  ].join('\n');
}
