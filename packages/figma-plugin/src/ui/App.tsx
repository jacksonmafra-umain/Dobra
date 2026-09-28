import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoverageMatrix } from '@dobra/core/coverage';
import type { AdaptResult, Command, FrameFindings, TagCandidate, ToMain, ToUi } from '../messages';
import type { NamePatterns } from '@dobra/core/namePatterns';
import type { VariablesSummary } from '../variableTypes';
import { summaryLines } from './variablesSummary';
import './app.css';
import { SeverityChip } from './SeverityChip';

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
  // The message listener is registered once; these refs let it read the current tab and state.
  const tabRef = useRef<Tab>('presets');
  tabRef.current = tab;
  const variablesExistRef = useRef(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [candidates, setCandidates] = useState<TagCandidate[]>([]);
  const [matrix, setMatrix] = useState<CoverageMatrix | null>(null);
  const [findings, setFindings] = useState<FrameFindings[] | null>(null);
  const [visited, setVisited] = useState(0);
  const [selected, setSelected] = useState<{ id: string; name: string }[]>([]);
  const [adapted, setAdapted] = useState<AdaptResult[] | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [variables, setVariables] = useState<{ summary: VariablesSummary; source: string } | null>(null);
  const [variablesExist, setVariablesExistState] = useState(false);
  const setVariablesExist = (v: boolean) => {
    variablesExistRef.current = v;
    setVariablesExistState(v);
  };
  // The Variables tab's choices live here, so switching tabs doesn't lose a pasted profile or the picked devices.
  const [variablesForm, setVariablesForm] = useState<VariablesForm>(DEFAULT_VARIABLES_FORM);
  const variablesChecked = useState<Set<string>>(new Set());
  const [patterns, setPatterns] = useState<{ patterns: NamePatterns; defaults: NamePatterns } | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage as ToUi | undefined;
      if (!msg) return;
      if (msg.command) setTab(msg.command);
      if (msg.type === 'targets') {
        setTargets(msg.items);
        if (msg.command === 'variables' || tabRef.current === 'variables') post({ type: 'variables-status' });
      }
      if (msg.type === 'variables-done') {
        setVariables({ summary: msg.summary, source: msg.source });
        setVariablesExist(msg.summary.collections.length > 0 || variablesExistRef.current);
      }
      if (msg.type === 'variables-status') setVariablesExist(msg.exists);
      if (msg.type === 'targets-picked') variablesChecked[1](new Set(msg.keys));
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
      if (msg.type === 'patterns') setPatterns({ patterns: msg.patterns, defaults: msg.defaults });
      if (msg.type === 'marked') {
        const what = msg.importance === 'important' ? 'important' : msg.importance === 'ignore' ? 'not important' : 'unmarked';
        setNotice({ kind: 'info', text: `${msg.count} layer${msg.count === 1 ? '' : 's'} ${msg.importance ? `marked ${what}` : what}. Check again to see the effect.` });
      }
      if (msg.command === 'check' || msg.type === 'findings') post({ type: 'get-patterns' });
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
      {tab === 'check' && <Check frames={findings} visited={visited} patterns={patterns} />}
      {tab === 'adapt' && <Adapt targets={targets} selected={selected} results={adapted} />}
      {tab === 'variables' && <Variables targets={targets} exists={variablesExist} result={variables} form={variablesForm} setForm={setVariablesForm} checked={variablesChecked} />}
    </main>
  );
}

/** Targets grouped by category, each with a checkbox. */
/** Targets grouped by category. Pass `state` to keep the selection outside the component (it then survives tab switches). */
function useTargetPicker(targets: Target[], state?: [Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>]) {
  const own = useState<Set<string>>(new Set());
  const [checked, setChecked] = state ?? own;
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
  return { checked, setChecked, list };
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

const SCOPES = [
  ['selection', 'Selection'],
  ['page', 'Page'],
  ['all-pages', 'All pages'],
] as const;

/** Comma-separated words ↔ a list, for the name-word fields. */
const toWords = (text: string) => text.split(',').map((w) => w.trim()).filter(Boolean);

function NameWords({ patterns }: { patterns: { patterns: NamePatterns; defaults: NamePatterns } | null }) {
  const [controls, setControls] = useState('');
  const [chrome, setChrome] = useState('');
  useEffect(() => {
    if (!patterns) return;
    setControls(patterns.patterns.controls.join(', '));
    setChrome(patterns.patterns.chrome.join(', '));
  }, [patterns]);
  if (!patterns) return null;
  return (
    <details>
      <summary>Name words</summary>
      <p className="muted">Layers whose names contain these words (whole words, any case) are checked as controls or as chrome. Saved in this file for everyone, and used by the web report.</p>
      <label>
        Controls
        <input value={controls} onChange={(e) => setControls(e.target.value)} />
      </label>
      <label>
        Chrome
        <input value={chrome} onChange={(e) => setChrome(e.target.value)} />
      </label>
      <div className="row">
        <button onClick={() => post({ type: 'set-patterns', patterns: { controls: toWords(controls), chrome: toWords(chrome) } })}>Save</button>
        <button onClick={() => post({ type: 'set-patterns', patterns: null })}>Reset to defaults</button>
      </div>
    </details>
  );
}

function Check({ frames, visited, patterns }: { frames: FrameFindings[] | null; visited: number; patterns: { patterns: NamePatterns; defaults: NamePatterns } | null }) {
  return (
    <section>
      <div className="row">
        {SCOPES.map(([scope, label]) => (
          <button key={scope} onClick={() => post({ type: 'check', scope })} title={scope === 'all-pages' ? 'Loads every page first' : undefined}>
            {label}
          </button>
        ))}
      </div>
      <div className="row">
        <button onClick={() => post({ type: 'mark', importance: 'important' })} title="Always check the selected layers, whatever their names">
          Mark as important
        </button>
        <button onClick={() => post({ type: 'mark', importance: 'ignore' })} title="Skip the selected layers and what's inside them in the hinge and touch-target checks">
          Mark as not important
        </button>
        <button onClick={() => post({ type: 'mark', importance: null })}>Clear mark</button>
      </div>
      <NameWords patterns={patterns} />
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
                <SeverityChip severity={x.severity} /> <strong className="mono">{x.ruleId}</strong> {x.estimated && <span className="muted">(estimated)</span>}
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

const FOLDABLE = new Set(['foldable-book', 'foldable-flip', 'dual-screen', 'multi-fold']);

interface VariablesForm {
  sizeClasses: boolean;
  platforms: ('android' | 'ios')[];
  devices: boolean;
  profile: string;
  overwrite: boolean;
  removeStale: boolean;
}
const DEFAULT_VARIABLES_FORM: VariablesForm = { sizeClasses: true, platforms: ['android', 'ios'], devices: true, profile: '', overwrite: false, removeStale: false };

function Variables({
  targets,
  exists,
  result,
  form,
  setForm,
  checked: checkedState,
}: {
  targets: Target[];
  exists: boolean;
  result: { summary: VariablesSummary; source: string } | null;
  form: VariablesForm;
  setForm: React.Dispatch<React.SetStateAction<VariablesForm>>;
  checked: [Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>];
}) {
  const { checked, setChecked, list } = useTargetPicker(targets, checkedState);
  const { sizeClasses, devices, profile, overwrite, removeStale } = form;
  const platforms = new Set(form.platforms);
  const set = <K extends keyof VariablesForm>(key: K) => (value: VariablesForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setSizeClasses = set('sizeClasses');
  const setDevices = set('devices');
  const setProfile = set('profile');
  const setOverwrite = set('overwrite');
  const setRemoveStale = set('removeStale');

  const keys = devices ? [...checked] : [];
  // Devices on with nothing picked still runs, so an earlier run's device modes are listed (and removable).
  const chosen = (sizeClasses ? platforms.size : 0) + (devices ? Math.max(keys.length, 1) : 0);
  const togglePlatform = (p: 'android' | 'ios') =>
    setForm((f) => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] }));
  const readFile = async (file: File) => setProfile(await file.text());

  return (
    <section>
      <label className="row">
        <input type="checkbox" checked={sizeClasses} onChange={(e) => setSizeClasses(e.target.checked)} /> Size classes
      </label>
      {sizeClasses && (
        <div className="row">
          {(['android', 'ios'] as const).map((p) => (
            <label key={p} className="row">
              <input type="checkbox" checked={platforms.has(p)} onChange={() => togglePlatform(p)} /> {p === 'android' ? 'Android' : 'iOS'}
            </label>
          ))}
        </div>
      )}
      <label className="row">
        <input type="checkbox" checked={devices} onChange={(e) => setDevices(e.target.checked)} /> Devices <span className="muted">({keys.length} mode{keys.length === 1 ? '' : 's'})</span>
      </label>
      {devices && (
        <>
          <div className="row">
            <button onClick={() => post({ type: 'required-targets' })}>Required coverage</button>
            <button onClick={() => setChecked(new Set(targets.filter((t) => FOLDABLE.has(t.category)).map((t) => t.key)))}>All foldables</button>
            <button onClick={() => setChecked(new Set())}>Clear</button>
          </div>
          {list}
        </>
      )}
      <details>
        <summary>App profile (optional)</summary>
        <textarea rows={4} placeholder="Paste a profile JSON, or pick a file" value={profile} onChange={(e) => setProfile(e.target.value)} />
        <div className="row">
          <input type="file" accept=".json,application/json" aria-label="Profile JSON" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          <button disabled={!profile} onClick={() => setProfile('')}>Clear profile</button>
        </div>
      </details>
      <p className="muted">Values: {profile.trim() ? 'the pasted profile, then platform defaults' : 'platform defaults'}{result ? ` · last run: ${result.source}` : ''}</p>
      <label className="row">
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Overwrite my edits
      </label>
      <label className="row">
        <input type="checkbox" checked={removeStale} onChange={(e) => setRemoveStale(e.target.checked)} /> Remove modes no longer selected
      </label>
      <button
        className="primary"
        disabled={!chosen}
        onClick={() =>
          post({ type: 'variables', platforms: sizeClasses ? [...platforms] : [], keys, devices, profile: profile.trim() || null, overwrite, removeStale })
        }
      >
        {exists ? 'Update variables' : 'Create variables'}
      </button>
      {result && (
        <ul className="summary">
          {summaryLines(result.summary).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      <p className="muted">Bind width, padding, gap or grids to these variables, then pick a mode for the frame in the right panel. Adapt switches the modes for you.</p>
    </section>
  );
}
