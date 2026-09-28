// The "Website" input of Foldable Check: a URL and devices, checked by `dobra report` or the hosted
// function when one answers, else the command to run. Unstyled: plain class names for the report's CSS.
import { useEffect, useRef, useState } from 'react';
import { DEVICE_CATEGORIES } from '@dobra/core/config/schema';
import type { Report } from '@dobra/core/report';
import { actionsStep, cliCommand, runCheck, type CheckRequest, type Fetch, type Health } from './siteCheck';

export interface SiteCheckFormProps {
  /** undefined while probing, null when no endpoint answered. */
  health: Health | null | undefined;
  fetch?: Fetch;
  onReport(report: Report): void;
}

function Handoff({ req, reason }: { req: CheckRequest; reason?: string }) {
  return (
    <div className="site-check__handoff">
      {reason && <p className="site-check__error" role="alert">{reason}</p>}
      <p>
        Run the check on your machine, then open the report JSON below. Or run <code>npm run dobra -- report</code> and open
        the address it prints, to check from there.
      </p>
      <p className="muted">
        From the Dobra repo, once: <code>npm run build:cli &amp;&amp; npx playwright install chromium</code>
      </p>
      <pre>
        <code>{cliCommand(req)}</code>
      </pre>
      <button className="site-check__copy" type="button" onClick={() => void navigator.clipboard?.writeText(cliCommand(req))}>
        Copy command
      </button>
      <p className="muted">In GitHub Actions:</p>
      <pre>
        <code>{actionsStep(req)}</code>
      </pre>
    </div>
  );
}

export function SiteCheckForm({ health, fetch: f = globalThis.fetch?.bind(globalThis), onReport }: SiteCheckFormProps) {
  const [url, setUrl] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; handoff: boolean } | null>(null);
  // Only the latest check may show its result; an older one is cancelled when a new one starts or
  // when the form goes away.
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const req: CheckRequest = { url: url.trim() || 'https://example.com/', ...(categories.length ? { categories } : {}) };

  if (health === undefined) return <p className="site-check site-check__probing muted">Looking for a check endpoint…</p>;

  const toggle = (c: string) => setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const fields = (
    <>
      <label>
        Website address
        <input className="site-check__url" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <fieldset className="site-check__targets">
        <legend>Devices</legend>
        <label>
          <input type="checkbox" checked={categories.length === 0} onChange={() => setCategories([])} /> Representative set
        </label>
        {DEVICE_CATEGORIES.map((c) => (
          <label key={c}>
            <input type="checkbox" checked={categories.includes(c)} onChange={() => toggle(c)} /> {c}
          </label>
        ))}
      </fieldset>
    </>
  );

  // No endpoint on this host: the same fields fill in the command to run instead.
  if (health === null)
    return (
      <div className="site-check">
        {fields}
        <Handoff req={req} />
      </div>
    );

  async function submit() {
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    setBusy(true);
    setError(null);
    const outcome = await runCheck(f, { url: url.trim(), ...(categories.length ? { categories } : {}) }, health!.mode, undefined, ctrl.signal);
    if (pending.current !== ctrl) return;
    pending.current = null;
    setBusy(false);
    if (outcome.ok) onReport(outcome.report);
    else if (!outcome.aborted) setError({ message: outcome.message, handoff: outcome.handoff });
  }

  return (
    <div className="site-check">
      {fields}
      <p className="muted">
        {health.mode === 'local'
          ? 'Checked on this machine, so local and staging addresses work.'
          : `Public addresses only, up to ${health.maxTargets ?? 'any number of'} devices per check.`}
      </p>
      <button className="site-check__submit primary" disabled={busy || !url.trim()} onClick={submit}>
        {busy ? 'Checking…' : 'Check site'}
      </button>
      {error &&
        (error.handoff ? (
          <Handoff req={req} reason={error.message} />
        ) : (
          <p className="site-check__error" role="alert">
            {error.message}
          </p>
        ))}
    </div>
  );
}
