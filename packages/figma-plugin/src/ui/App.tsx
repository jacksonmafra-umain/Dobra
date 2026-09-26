import { useEffect, useMemo, useState } from 'react';
import type { CoverageMatrix } from '@hinge/core/coverage';
import type { TagCandidate, ToMain, ToUi } from '../messages';
import './app.css';

type Tab = 'presets' | 'tag' | 'coverage';
type Target = { key: string; name: string; category: string };

const post = (msg: ToMain) => parent.postMessage({ pluginMessage: msg }, '*');
const OPEN: Record<Tab, ToMain> = { presets: { type: 'list-targets' }, tag: { type: 'scan-tags' }, coverage: { type: 'coverage' } };
const TAB_LABEL: Record<Tab, string> = { presets: 'Artboards', tag: 'Tag frames', coverage: 'Coverage' };

export function App() {
  const [tab, setTab] = useState<Tab>('presets');
  const [targets, setTargets] = useState<Target[]>([]);
  const [candidates, setCandidates] = useState<TagCandidate[]>([]);
  const [matrix, setMatrix] = useState<CoverageMatrix | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage as (ToUi & { command?: Tab }) | undefined;
      if (!msg) return;
      if (msg.command) setTab(msg.command);
      if (msg.type === 'targets') setTargets(msg.items);
      if (msg.type === 'tag-candidates') setCandidates(msg.frames);
      if (msg.type === 'coverage') setMatrix(msg.matrix);
      if (msg.type === 'error') setNotice({ kind: 'error', text: msg.message });
      if (msg.type === 'created') {
        setNotice({ kind: 'info', text: msg.frameIds.length ? `Created ${msg.frameIds.length} artboard(s).` : 'Nothing missing: no artboards created.' });
        post({ type: 'coverage' });
      }
    };
    window.addEventListener('message', onMessage);
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
    </main>
  );
}

function Presets({ targets }: { targets: Target[] }) {
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
  return (
    <section>
      <button className="primary" disabled={!checked.size} onClick={() => post({ type: 'create-presets', keys: [...checked] })}>
        Create {checked.size || ''} artboard{checked.size === 1 ? '' : 's'}
      </button>
      {byCategory.map(([category, items]) => (
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
      ))}
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
