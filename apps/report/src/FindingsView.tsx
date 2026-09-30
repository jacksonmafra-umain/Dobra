// The Findings tab: a device sidebar (grouped by model, worst first, with search and an errors-only
// filter), then either the overview (coverage and a rule × device table) or one frame's screenshot
// with its findings grouped by rule. The selected frame lives in the URL hash, so a link opens it.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PresetFrame } from '@dobra/core/presets';
import type { Report, ReportFrame } from '@dobra/core/report';
import {
  deviceGroups,
  filterGroups,
  frameRefFromHash,
  hashForFrame,
  ruleGroups,
  ruleMatrix,
  type Counts,
  type DeviceGroup,
  type FrameEntry,
} from './findingsModel';
import { FrameOverlay } from './FrameOverlay';
import { PassChip, SeverityChip } from './SeverityChip';

export interface FindingsViewProps {
  report: Report;
  thumbnails: Record<string, string | null>;
  deviceName(id: string): string | undefined;
  presetFor(frame: ReportFrame): Pick<PresetFrame, 'safeZones' | 'hinges'> | null;
  /** The coverage table and anything else the overview shows below the rule table. */
  coverage: ReactNode;
}

function CountBadges({ counts }: { counts: Counts }) {
  if (!counts.error && !counts.warn && !counts.info) return <span className="count count--pass">✓</span>;
  return (
    <span className="counts">
      {counts.error > 0 && <span className="count count--error" title={`${counts.error} errors`}>{counts.error}</span>}
      {counts.warn > 0 && <span className="count count--warn" title={`${counts.warn} warnings`}>{counts.warn}</span>}
      {counts.info > 0 && <span className="count count--info" title={`${counts.info} notes`}>{counts.info}</span>}
    </span>
  );
}

function readHash(): string | null {
  return typeof location === 'undefined' ? null : frameRefFromHash(location.hash);
}

export function FindingsView({ report, thumbnails, deviceName, presetFor, coverage }: FindingsViewProps) {
  const groups = useMemo(() => deviceGroups(report, deviceName), [report, deviceName]);
  const entries = useMemo(() => groups.flatMap((g) => g.frames.map((f) => ({ group: g, entry: f }))), [groups]);
  const [selected, setSelected] = useState<string | null>(readHash);
  const [query, setQuery] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const visible = useMemo(() => filterGroups(groups, query, onlyErrors), [groups, query, onlyErrors]);
  const current = entries.find((e) => e.entry.frame.ref === selected) ?? null;

  useEffect(() => {
    const onHash = () => setSelected(readHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  function select(ref: string | null) {
    setSelected(ref);
    history.replaceState(null, '', ref ? hashForFrame(ref) : location.pathname + location.search);
  }

  const index = current ? entries.indexOf(current) : -1;
  const step = (d: number) => {
    const next = entries[index + d];
    if (next) select(next.entry.frame.ref);
  };

  return (
    <div className="findings">
      <aside className="findings__sidebar" aria-label="Devices">
        <button className="findings__item findings__overview" aria-current={current ? undefined : 'page'} onClick={() => select(null)}>
          Overview <span className="muted">{report.frames.length} frames</span>
        </button>
        <input className="findings__search" type="search" placeholder="Filter devices" aria-label="Filter devices" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="findings__only">
          <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Only with errors
        </label>
        <nav>
          {visible.map((g) => (
            <section key={g.id || 'unmatched'} className="findings__device">
              <h3>
                <span>{g.name}</span> <CountBadges counts={g.counts} />
              </h3>
              <ul>
                {g.frames.map((f) => (
                  <li key={f.frame.ref}>
                    <button className="findings__item" aria-current={f.frame.ref === selected ? 'page' : undefined} onClick={() => select(f.frame.ref)}>
                      <span>{f.label}</span> <CountBadges counts={f.counts} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!visible.length && <p className="muted">No device matches.</p>}
        </nav>
      </aside>

      <select className="findings__picker" aria-label="Device" value={current?.entry.frame.ref ?? ''} onChange={(e) => select(e.target.value || null)}>
        <option value="">Overview</option>
        {groups.map((g) => (
          <optgroup key={g.id || 'unmatched'} label={g.name}>
            {g.frames.map((f) => (
              <option key={f.frame.ref} value={f.frame.ref}>
                {f.label} ({f.counts.error} errors, {f.counts.warn} warnings)
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="findings__main">
        {current ? (
          <FrameDetail
            device={current.group}
            entry={current.entry}
            thumbnail={thumbnails[current.entry.frame.ref] ?? null}
            preset={presetFor(current.entry.frame)}
            onPrev={index > 0 ? () => step(-1) : undefined}
            onNext={index < entries.length - 1 ? () => step(1) : undefined}
          />
        ) : (
          <Overview groups={groups} coverage={coverage} onOpen={select} />
        )}
      </div>
    </div>
  );
}

function Overview({ groups, coverage, onOpen }: { groups: DeviceGroup[]; coverage: ReactNode; onOpen(ref: string): void }) {
  const { devices, rows } = useMemo(() => ruleMatrix(groups), [groups]);
  /** The device's frame with the most findings of a rule, or its worst frame. */
  const frameFor = (d: DeviceGroup, ruleId?: string) => {
    const score = (f: FrameEntry) => (ruleId ? f.frame.findings.filter((x) => x.ruleId === ruleId).length : f.counts.error * 1000 + f.counts.warn);
    return d.frames.reduce((best, f) => (score(f) > score(best) ? f : best), d.frames[0]).frame.ref;
  };
  return (
    <>
      <h2>Rules by device</h2>
      {rows.length === 0 ? (
        <p className="finding">
          <PassChip /> <span className="muted">No problems found on any device.</span>
        </p>
      ) : (
        <div className="table-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Total</th>
                {devices.map((d) => (
                  <th key={d.id}>
                    <button className="matrix__device" onClick={() => onOpen(frameFor(d))}>
                      {d.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ruleId}>
                  <td>
                    <SeverityChip severity={r.severity} /> <span className="mono">{r.ruleId}</span>
                  </td>
                  <td className="mono">{r.total}</td>
                  {r.perDevice.map((n, i) => (
                    <td key={devices[i].id} className="mono">
                      {n ? (
                        <button className={`matrix__cell matrix__cell--${r.severity}`} onClick={() => onOpen(frameFor(devices[i], r.ruleId))}>
                          {n}
                        </button>
                      ) : (
                        <span className="muted">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {coverage}
    </>
  );
}

export function FrameDetail({
  device,
  entry,
  thumbnail,
  preset,
  onPrev,
  onNext,
}: {
  device: DeviceGroup;
  entry: FrameEntry;
  thumbnail: string | null;
  preset: Pick<PresetFrame, 'safeZones' | 'hinges'> | null;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { frame } = entry;
  const rules = ruleGroups(frame.findings);
  return (
    <article className="detail">
      <header className="detail__head">
        <div>
          <h2>
            {device.name} <span className="muted">· {entry.label}</span>
          </h2>
          <p className="muted">
            <span className="mono">
              {frame.width}×{frame.height}
            </span>
            {frame.targets.length > 0 && <> · {frame.targets.join(', ')}</>}
            {frame.confidence === 'none' && ` · unknown size${frame.nearest ? `, nearest ${frame.nearest}` : ''}`}
          </p>
          {frame.runtime && (
            <p className="muted">
              {frame.runtime.model} · Android {frame.runtime.android} · Chrome {frame.runtime.chrome} · {frame.runtime.emulator ? 'emulator' : 'phone'} {frame.runtime.serial}
            </p>
          )}
          {frame.signals && (
            <p className="muted mono">
              viewport {frame.signals.viewport.width}×{frame.signals.viewport.height} @{frame.signals.viewport.dpr} · posture {frame.signals.devicePosture ?? 'not reported'} · segments{' '}
              {frame.signals.segments ? frame.signals.segments.length : 'none'}
            </p>
          )}
        </div>
        <div className="row">
          <button disabled={!onPrev} onClick={onPrev} aria-label="Previous frame">
            ← Previous
          </button>
          <button disabled={!onNext} onClick={onNext} aria-label="Next frame">
            Next →
          </button>
        </div>
      </header>
      <div className={`detail__body${frame.width > frame.height ? ' detail__body--wide' : ''}`}>
        <div className="detail__shot thumb" style={{ aspectRatio: `${frame.width} / ${frame.height}`, maxWidth: `calc(70vh * ${frame.width / Math.max(frame.height, 1)})` }}>
          {thumbnail && <img src={thumbnail} alt={frame.name} />}
          {preset && <FrameOverlay preset={preset} width={frame.width} height={frame.height} />}
        </div>
        <div className="detail__rules">
          {rules.length === 0 && frame.confidence !== 'none' && (
            <p className="finding">
              <PassChip /> <span className="muted">No problems found.</span>
            </p>
          )}
          {rules.map((g, i) => (
            <details key={g.ruleId} className="rule" open={i < 3}>
              <summary>
                <SeverityChip severity={g.severity} /> <strong className="mono">{g.ruleId}</strong>{' '}
                <span className="muted">
                  {g.findings.length} {g.findings.length === 1 ? 'element' : 'elements'}
                </span>
                {g.findings.some((f) => f.estimated) && <span className="badge">estimated</span>}
              </summary>
              <ul>
                {g.findings.map((f, j) => (
                  <li key={j}>{f.message}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </article>
  );
}
