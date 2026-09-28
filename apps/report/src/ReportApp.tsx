import { useEffect, useMemo, useState } from 'react';
import { loadCatalog } from '@dobra/core/catalog/load';
import { representativeTarget } from '@dobra/core/coverage';
import { presetSpec } from '@dobra/core/presets';
import { presetZip } from '@dobra/core/presetZip';
import { parseReport, toMarkdown, type Report, type ReportFrame } from '@dobra/core/report';
import { envConfigOf, parseTargetKey, type Target } from '@dobra/core/targets';
import { CoverageSummary } from './CoverageSummary';
import { download } from './download';
import { FindingRow } from './FindingRow';
import { FrameOverlay } from './FrameOverlay';
import { createFigmaClient, FigmaError } from './figmaClient';
import { loadFigmaReport } from './loadReport';
import { ReportHeader } from './ReportHeader';
import { ReportNotes } from './ReportNotes';
import { PassChip } from './SeverityChip';
import { UnloadedList } from './UnloadedList';
import { tokenStore } from './tokenStore';
import { SiteCheckForm } from './SiteCheckForm';
import { probe, type Health } from './siteCheck';

const catalog = loadCatalog();
const config = envConfigOf(catalog);
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
  const [input, setInput] = useState<'figma' | 'website'>('figma');
  // undefined while probing; null when this host has no site-check endpoint.
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  useEffect(() => {
    probe(fetch.bind(globalThis)).then(setHealth);
  }, []);

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
        <div className="input-switch" role="group" aria-label="What to check">
          <button aria-pressed={input === 'figma'} onClick={() => setInput('figma')}>
            Figma file
          </button>
          <button aria-pressed={input === 'website'} onClick={() => setInput('website')}>
            Website
          </button>
        </div>
        {input === 'website' ? (
          <SiteCheckForm
            health={health}
            onReport={(r) => {
              setError(null);
              setReport(r);
              setThumbnails({});
            }}
          />
        ) : (
          <>
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
          </>
        )}
        <label className="drop">
          <span>Or open a report JSON</span>
          <span className="muted">made by the command-line checker or the simulator</span>
          <input type="file" accept="application/json,.json" aria-label="Report JSON" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
        </label>
      </section>

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="banner banner--notice">{notice}</p>}
      {report && <ReportView report={report} thumbnails={thumbnails} />}
    </main>
  );
}

function ReportView({ report, thumbnails }: { report: Report; thumbnails: Record<string, string | null> }) {
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
        {report.source.fileVersion ? ` · file version ${report.source.fileVersion}` : ''}
      </p>
      <CoverageSummary report={report} />
      <div className="row">
        <button onClick={() => download(`${slug}.foldable.json`, JSON.stringify(report, null, 2), 'application/json')}>Report JSON</button>
        <button onClick={() => download(`${slug}.foldable.md`, toMarkdown(report), 'text/markdown')}>Markdown</button>
        <button disabled={!missingTargets.length} onClick={() => download(`${slug}.presets.zip`, presetZip(config, missingTargets), 'application/zip')}>
          Presets ZIP ({missingTargets.length} missing)
        </button>
      </div>

      <h2>Coverage</h2>
      <p className="muted">✓ tagged · ~ matched by size only · ✗ missing</p>
      <div className="table-scroll">
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
              <td title={c.frames.join(', ')}>
                <span className={`chip chip--${c.status}`}>{STATUS[c.status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
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

      <UnloadedList unloaded={report.unloaded} />
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
        {preset && <FrameOverlay preset={preset} width={frame.width} height={frame.height} />}
      </div>
      <div className="card__body">
        <strong>{frame.name}</strong>
        <div className="muted">
          <span className="mono">{frame.width}×{frame.height}</span> ·{' '}
          {frame.confidence === 'none' ? `unknown size${frame.nearest ? ` — nearest ${frame.nearest}` : ''}` : `${frame.confidence}: ${frame.targets.length} target${frame.targets.length === 1 ? '' : 's'}`}
        </div>
        {frame.confidence !== 'none' && frame.findings.length === 0 && (
          <p className="finding">
            <PassChip /> <span className="muted">No problems found.</span>
          </p>
        )}
        {frame.findings.map((x, i) => (
          <FindingRow key={i} finding={x} />
        ))}
      </div>
    </article>
  );
}
