// The "Website" input of Foldable Check: a URL and devices, checked by `dobra report` or the hosted
// function when one answers, else the command to run. Unstyled: plain class names for the report's CSS.
import { useEffect, useRef, useState } from 'react';
import { DEVICE_CATEGORIES } from '@dobra/core/config/schema';
import type { Report } from '@dobra/core/report';
import { withScheme } from '@dobra/core/siteAddress';
import { actionsStep, cliCommand, runCheck, type CheckRequest, type Fetch, type Health } from './siteCheck';

export interface SiteCheckFormProps {
  /** undefined while probing, null when no endpoint answered. */
  health: Health | null | undefined;
  fetch?: Fetch;
  onReport(report: Report): void;
}

const INSTALLER_DOCS = 'https://github.com/jacksonmafra-umain/Dobra#install-on-your-mac';
const INSTALL_LINE = 'bash -c "$(curl -fsSL https://raw.githubusercontent.com/jacksonmafra-umain/Dobra/main/install.sh)"';

function Handoff({ req, reason }: { req: CheckRequest; reason?: string }) {
  return (
    <div className="site-check__handoff">
      {reason && <p className="site-check__error" role="alert">{reason}</p>}
      <p>
        Run the check on your machine, then drop the <code>foldable-report.zip</code> it writes below: it has the findings,
        the Markdown and a screenshot of each device. Or run <code>dobra report</code> and check from the page it opens.
      </p>
      <pre>
        <code>{cliCommand(req)}</code>
      </pre>
      <button className="site-check__copy" type="button" onClick={() => void navigator.clipboard?.writeText(cliCommand(req))}>
        Copy command
      </button>
      <p className="muted">
        No <code>dobra</code> command yet? Paste the{' '}
        <a href={INSTALLER_DOCS} target="_blank" rel="noopener">
          one-line installer
        </a>{' '}
        in Terminal: <code>{INSTALL_LINE}</code>
      </p>
      <p className="muted">
        In a Dobra checkout instead, once: <code>npm run build:cli &amp;&amp; npx playwright install chromium</code>, then{' '}
        <code>{cliCommand(req, 'repo')}</code>
      </p>
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
  const req: CheckRequest = { url: withScheme(url) || 'https://example.com/', ...(categories.length ? { categories } : {}) };

  if (health === undefined) return <p className="site-check site-check__probing muted">Looking for a check endpoint…</p>;

  const toggle = (c: string) => setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const fields = (
    <>
      <label>
        Website address
        <input className="site-check__url" type="url" placeholder="www.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
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
    const outcome = await runCheck(f, { url: withScheme(url), ...(categories.length ? { categories } : {}) }, health!.mode, undefined, ctrl.signal);
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
