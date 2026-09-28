import { useMemo, useState } from 'react';
import { loadCatalog } from '@dobra/core/catalog/load';
import { representativeTarget } from '@dobra/core/coverage';
import { presetSpec } from '@dobra/core/presets';
import { presetZip } from '@dobra/core/presetZip';
import { parseReport, toMarkdown, type Report, type ReportFrame } from '@dobra/core/report';
import { envConfigOf, parseTargetKey, type Target } from '@dobra/core/targets';
import { download } from './download';
import { createFigmaClient, FigmaError } from './figmaClient';
import { loadFigmaReport } from './loadReport';
import { ReportHeader } from './ReportHeader';
import { ReportNotes } from './ReportNotes';
import { tokenStore } from './tokenStore';

const catalog = loadCatalog();
const config = envConfigOf(catalog);
const ICON = { error: '⛔', warn: '⚠️', info: 'ℹ️' } as const;
const STATUS = { present: '✓', 'present-by-size': '~', missing: '✗' } as const;

function sessionTokens() {
  try {
    return tokenStore(sessionStorage);
  } catch {
    return tokenStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  }
}
const tokens = sessionTokens();

export function ReportApp() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState(tokens.read);
  const [remember, setRemember] = useState(() => tokens.read() !== '');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});

  async function checkFile() {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (remember) tokens.remember(token);
    try {
      const result = await loadFigmaReport(createFigmaClient(token), url.trim());
      setReport(result.report);
      setThumbnails(result.thumbnails);
      setNotice(result.notice ?? null);
    } catch (e) {
      // FigmaError messages are already redacted; anything else is shown without the token.
      const message = e instanceof Error ? e.message : String(e);
      setError(e instanceof FigmaError ? message : message.split(token.trim() || '\u0000').join('•••'));
    } finally {
      setBusy(false);
    }
  }

  async function openFile(file: File) {
    setError(null);
    try {
      setReport(parseReport(JSON.parse(await file.text())));
      setThumbnails({});
    } catch (e) {
      setError(`That file is not a foldable check report. ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <main>
      <ReportHeader catalogVersion={catalog.version} />

      <section className="panel inputs">
        <label>
          Figma file link
          <input type="url" placeholder="https://www.figma.com/design/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Personal access token <span className="muted">(scope file_content:read; stays in this tab)</span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <div className="row">
          <label className="row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                setRemember(e.target.checked);
                if (e.target.checked) tokens.remember(token);
                else tokens.forget();
              }}
            />{' '}
            Remember for this tab
          </label>
          <button className="primary" disabled={busy || !url.trim() || !token.trim()} onClick={checkFile}>
            {busy ? 'Checking…' : 'Check file'}
          </button>
        </div>
        <label className="drop">
          <span>Or open a report JSON</span>
          <span className="muted">made by the command-line checker or the simulator</span>
          <input type="file" accept="application/json,.json" aria-label="Report JSON" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
        </label>
      </section>

      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="banner">{notice}</p>}
      {report && <ReportView report={report} thumbnails={thumbnails} />}
    </main>
  );
}

function ReportView({ report, thumbnails }: { report: Report; thumbnails: Record<string, string | null> }) {
  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const f of report.frames) for (const x of f.findings) c[x.severity]++;
    return c;
  }, [report]);
  const missing = report.coverage.cells.filter((c) => c.requirement.level === 'required' && c.status === 'missing');
  const missingTargets = missing.map((c) => representativeTarget(catalog, c.requirement)).filter((t): t is Target => t !== null);
  const slug = report.source.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'report';

  return (
    <>
      <h2>
        {report.source.name} <span className="muted">· {report.frames.length} frames</span>
      </h2>
      <p className="muted">
        Generated {new Date(report.generatedAt).toLocaleString()} · catalog {report.catalogVersion}
        {report.source.fileVersion ? ` · file version ${report.source.fileVersion}` : ''} · {ICON.error} {counts.error} · {ICON.warn} {counts.warn} · {ICON.info} {counts.info}
      </p>
      <div className="row">
        <button onClick={() => download(`${slug}.foldable.json`, JSON.stringify(report, null, 2), 'application/json')}>Report JSON</button>
        <button onClick={() => download(`${slug}.foldable.md`, toMarkdown(report), 'text/markdown')}>Markdown</button>
        <button disabled={!missingTargets.length} onClick={() => download(`${slug}.presets.zip`, presetZip(config, missingTargets), 'application/zip')}>
          Presets ZIP ({missingTargets.length} missing)
        </button>
      </div>

      <h2>Coverage</h2>
      <p className="muted">✓ tagged · ~ matched by size only · ✗ missing</p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Posture</th>
            <th>Orientation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {report.coverage.cells.map((c, i) => (
            <tr key={i} className={c.requirement.level === 'optional' ? 'muted' : undefined}>
              <td>{c.requirement.category}</td>
              <td>{c.requirement.kind}</td>
              <td>{c.requirement.orientation}</td>
              <td title={c.frames.join(', ')}>{STATUS[c.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {Object.entries(report.coverage.byCategory).map(([category, v]) => (
          <span key={category} className="badge">
            {category} {v.present}/{v.required}
          </span>
        ))}
      </p>

      <h2>Frames</h2>
      <div className="cards">
        {report.frames.map((f) => (
          <FrameCard key={f.ref} frame={f} thumbnail={thumbnails[f.ref] ?? null} />
        ))}
      </div>

      {report.unloaded.length > 0 && (
        <>
          <h2>Could not load</h2>
          <ul>
            {report.unloaded.map((u) => (
              <li key={u.ref}>
                {u.name}: <span className="muted">{u.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ReportNotes notes={report.notes} />
    </>
  );
}

function FrameCard({ frame, thumbnail }: { frame: ReportFrame; thumbnail: string | null }) {
  const target = frame.targets.length ? parseTargetKey(frame.targets[0]) : null;
  const preset = useMemo(() => {
    if (!target) return null;
    try {
      return presetSpec(config, target);
    } catch {
      return null;
    }
  }, [frame.targets[0]]);
  return (
    <article className="card">
      <div className="thumb" style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>
        {thumbnail && <img src={thumbnail} alt={frame.name} loading="lazy" />}
        {preset && (
          <svg viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" aria-hidden>
            {preset.safeZones.map((z, i) => (
              <rect key={`z${i}`} x={z.x} y={z.y} width={z.width} height={z.height} fill="#ef4444" fillOpacity={0.1} />
            ))}
            {preset.hinges.map((h, i) => (
              <rect key={`h${i}`} x={h.rect.x} y={h.rect.y} width={Math.max(h.rect.width, 2)} height={Math.max(h.rect.height, 2)} fill="#ef4444" fillOpacity={0.35} />
            ))}
          </svg>
        )}
      </div>
      <div className="card__body">
        <strong>{frame.name}</strong>
        <div className="muted">
          {frame.width}×{frame.height} ·{' '}
          {frame.confidence === 'none' ? `unknown size${frame.nearest ? ` — nearest ${frame.nearest}` : ''}` : `${frame.confidence}: ${frame.targets.length} target${frame.targets.length === 1 ? '' : 's'}`}
        </div>
        {frame.confidence !== 'none' && frame.findings.length === 0 && <p className="muted">No problems found.</p>}
        {frame.findings.map((x, i) => (
          <div key={i} className="finding">
            {ICON[x.severity]} <strong>{x.ruleId}</strong>
            {x.estimated && <span className="badge">estimated</span>} {x.message}
          </div>
        ))}
      </div>
    </article>
  );
}
