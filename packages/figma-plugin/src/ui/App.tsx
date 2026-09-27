import { useEffect, useMemo, useState } from 'react';
import type { CoverageMatrix } from '@dobra/core/coverage';
import type { AdaptResult, Command, FrameFindings, TagCandidate, ToMain, ToUi } from '../messages';
import './app.css';

type Tab = Command;
type Target = { key: string; name: string; category: string };

const post = (msg: ToMain) => parent.postMessage({ pluginMessage: msg }, '*');
const OPEN: Record<Tab, ToMain> = {
  presets: { type: 'list-targets' },
  tag: { type: 'scan-tags' },
  coverage: { type: 'coverage' },
  check: { type: 'check', scope: 'selection' },
  adapt: { type: 'list-targets' },
  variables: { type: 'list-targets' },
};
const TAB_LABEL: Record<Tab, string> = { presets: 'Artboards', tag: 'Tag frames', coverage: 'Coverage', check: 'Check', adapt: 'Adapt', variables: 'Variables' };

export function App() {
  const [tab, setTab] = useState<Tab>('presets');
  const [targets, setTargets] = useState<Target[]>([]);
  const [candidates, setCandidates] = useState<TagCandidate[]>([]);
  const [matrix, setMatrix] = useState<CoverageMatrix | null>(null);
  const [findings, setFindings] = useState<FrameFindings[] | null>(null);
  const [visited, setVisited] = useState(0);
  const [selected, setSelected] = useState<{ id: string; name: string }[]>([]);
  const [adapted, setAdapted] = useState<AdaptResult[] | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage as ToUi | undefined;
      if (!msg) return;
      if (msg.command) setTab(msg.command);
      if (msg.type === 'targets') setTargets(msg.items);
      if (msg.type === 'tag-candidates') setCandidates(msg.frames);
      if (msg.type === 'coverage') setMatrix(msg.matrix);
      if (msg.type === 'findings') {
        setFindings(msg.frames);
        setVisited(0);
      }
      if (msg.type === 'progress') setVisited(msg.visited);
      if (msg.type === 'selection') setSelected(msg.frames);
      if (msg.type === 'adapted') setAdapted(msg.results);
      if (msg.type === 'error') setNotice({ kind: 'error', text: msg.message });
      if (msg.type === 'created') {
        setNotice({ kind: 'info', text: msg.frameIds.length ? `Created ${msg.frameIds.length} artboard(s).` : 'Nothing missing: no artboards created.' });
        post({ type: 'coverage' });
      }
    };
    window.addEventListener('message', onMessage);
    // Only now can replies be received: ask for the opening view.
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const open = (t: Tab) => {
    setTab(t);
    setNotice(null);
    post(OPEN[t]);
  };

  return (
    <main>
      <nav className="tabs">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => open(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>
      {notice && <p className={`notice notice--${notice.kind}`}>{notice.text}</p>}
      {tab === 'presets' && <Presets targets={targets} />}
      {tab === 'tag' && <TagFrames candidates={candidates} />}
      {tab === 'coverage' && <Coverage matrix={matrix} />}
      {tab === 'check' && <Check frames={findings} visited={visited} />}
      {tab === 'adapt' && <Adapt targets={targets} selected={selected} results={adapted} />}
    </main>
  );
}

/** Targets grouped by category, each with a checkbox. */
function useTargetPicker(targets: Target[]) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const byCategory = useMemo(() => {
    const groups = new Map<string, Target[]>();
    for (const t of targets) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
    return [...groups];
  }, [targets]);
  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const list = byCategory.map(([category, items]) => (
    <details key={category} open={category !== 'phone'}>
      <summary>
        {category} <span className="muted">({items.length})</span>
      </summary>
      {items.map((t) => (
        <label key={t.key} className="row">
          <input type="checkbox" checked={checked.has(t.key)} onChange={() => toggle(t.key)} />
          <span>{t.name.replace(/^Screen \/ /, '')}</span>
        </label>
      ))}
    </details>
  ));
  return { checked, list };
}

function Presets({ targets }: { targets: Target[] }) {
  const { checked, list } = useTargetPicker(targets);
  return (
    <section>
      <button className="primary" disabled={!checked.size} onClick={() => post({ type: 'create-presets', keys: [...checked] })}>
        Create {checked.size || ''} artboard{checked.size === 1 ? '' : 's'}
      </button>
      {list}
    </section>
  );
}

function Adapt({ targets, selected, results }: { targets: Target[]; selected: { id: string; name: string }[]; results: AdaptResult[] | null }) {
  const { checked, list } = useTargetPicker(targets);
  const [split, setSplit] = useState(true);
  const source = selected.length === 1 ? selected[0] : null;
  return (
    <section>
      <p>{source ? <>Adapting <strong>{source.name}</strong></> : <span className="muted">Select one frame to adapt.</span>}</p>
      <label className="row">
        <input type="checkbox" checked={split} onChange={() => setSplit(!split)} />
        <span>Split into panes at the hinge (when it separates the window)</span>
      </label>
      <button
        className="primary"
        disabled={!source || !checked.size}
        onClick={() => source && post({ type: 'adapt', frameId: source.id, keys: [...checked], split })}
      >
        Adapt to {checked.size || ''} target{checked.size === 1 ? '' : 's'}
      </button>
      {results && (
        <div className="results">
          {results.map((r) => (
            <div key={r.frameId} className="card">
              <button className="finding" onClick={() => post({ type: 'select-node', nodeId: r.frameId })}>
                <strong>{r.name}</strong> <span className="muted">({r.findings.length} findings)</span>
              </button>
              {r.plan.splitNote && <span className="muted">{r.plan.splitNote}</span>}
              {r.plan.flags.map((f, i) => (
                <button key={i} className="finding" disabled={!f.nodeId} onClick={() => post({ type: 'select-node', nodeId: f.nodeId })}>
                  🚩 {f.message}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {list}
    </section>
  );
}

function TagFrames({ candidates }: { candidates: TagCandidate[] }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  if (!candidates.length) return <p className="muted">Every frame on this page is tagged.</p>;
  return (
    <section>
      {candidates.map((c) => (
        <div key={c.id} className="card">
          <strong>{c.name}</strong>
          {c.candidates.length ? (
            <>
              <span className="muted">{c.by === 'size' ? `Matched by size (${c.candidates.length})` : 'Matched by name'}</span>
              <select value={choice[c.id] ?? c.candidates[0]} onChange={(e) => setChoice({ ...choice, [c.id]: e.target.value })}>
                {c.candidates.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <button onClick={() => post({ type: 'apply-tag', frameId: c.id, key: choice[c.id] ?? c.candidates[0] })}>Apply tag</button>
            </>
          ) : (
            <span className="muted">Unknown size{c.nearest ? ` — nearest ${c.nearest}` : ''}</span>
          )}
        </div>
      ))}
    </section>
  );
}

const STATUS = { present: '✓', 'present-by-size': '~', missing: '✗' } as const;

function Coverage({ matrix }: { matrix: CoverageMatrix | null }) {
  if (!matrix) return <p className="muted">Loading…</p>;
  return (
    <section>
      <button className="primary" onClick={() => post({ type: 'create-missing' })}>
        Create missing
      </button>
      <p className="muted">✓ tagged · ~ size only · ✗ missing</p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Posture</th>
            <th>Orientation</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {matrix.cells.map((c, i) => (
            <tr key={i} className={c.requirement.level === 'optional' ? 'muted' : undefined}>
              <td>{c.requirement.category}</td>
              <td>{c.requirement.kind}</td>
              <td>{c.requirement.orientation}</td>
              <td title={c.frames.join(', ')}>{STATUS[c.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="summary">
        {Object.entries(matrix.byCategory).map(([category, { required, present }]) => (
          <li key={category}>
            {category}: {present}/{required}
          </li>
        ))}
      </ul>
    </section>
  );
}

const SEVERITY = { error: '⛔', warn: '⚠️', info: 'ℹ️' } as const;
const SCOPES = [
  ['selection', 'Selection'],
  ['page', 'Page'],
  ['all-pages', 'All pages'],
] as const;

function Check({ frames, visited }: { frames: FrameFindings[] | null; visited: number }) {
  return (
    <section>
      <div className="row">
        {SCOPES.map(([scope, label]) => (
          <button key={scope} onClick={() => post({ type: 'check', scope })} title={scope === 'all-pages' ? 'Loads every page first' : undefined}>
            {label}
          </button>
        ))}
      </div>
      {visited > 0 && <p className="muted">Checked {visited} layers…</p>}
      {!frames ? (
        <p className="muted">Pick what to check.</p>
      ) : frames.length === 0 ? (
        <p className="muted">No artboards to check here.</p>
      ) : (
        frames.map((f) => (
          <details key={f.frameId} open={f.findings.length > 0}>
            <summary>
              {f.name} <span className="muted">({f.findings.length}{f.confidence === 'size' ? ', matched by size' : ''})</span>
            </summary>
            {f.findings.length === 0 && <p className="muted">No problems found.</p>}
            {f.findings.map((x, i) => (
              <button key={i} className="finding" onClick={() => post({ type: 'select-node', nodeId: x.nodeId })}>
                {SEVERITY[x.severity]} <strong>{x.ruleId}</strong> {x.estimated && <span className="muted">(estimated)</span>}
                <br />
                {x.message}
              </button>
            ))}
          </details>
        ))
      )}
    </section>
  );
}
