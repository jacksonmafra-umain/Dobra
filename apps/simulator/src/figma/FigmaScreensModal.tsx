// "Add Figma screens": paste a file link and a token, then pick frames. Unstyled: plain classes on
// the simulator's panel and buttons; colours come from the simulator's stylesheet.
import { useEffect, useReducer, useRef, useState } from 'react';
import { createFigmaClient } from '@dobra/core/figmaClient';
import { listFrames, thumbnails, type FileListing } from './loader';
import { initialPicker, pickerReducer, visibleFrames } from './picker';

export interface FigmaScreensModalProps {
  initialUrl: string;
  token: string;
  remember: boolean;
  onToken(token: string, remember: boolean): void;
  /** Frames already on the list, ticked when the same file opens. */
  picked: string[];
  onAdd(listing: FileListing, picked: string[]): void;
  onClose(): void;
}

export function FigmaScreensModal({ initialUrl, token, remember, onToken, picked, onAdd, onClose }: FigmaScreensModalProps) {
  const [state, dispatch] = useReducer(pickerReducer, initialPicker);
  const [url, setUrl] = useState(initialUrl);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  // Each Load file counts up, so thumbnails still arriving for an earlier file are dropped.
  const request = useRef(0);

  async function load() {
    const id = ++request.current;
    dispatch({ type: 'load' });
    setThumbs({});
    try {
      const client = createFigmaClient(token);
      const listing = await listFrames(client, url.trim());
      if (id !== request.current) return;
      dispatch({ type: 'loaded', listing, picked });
      await thumbnails(client, listing.fileKey, listing.pages.flatMap((p) => p.frames.map((f) => f.id)), (part) => {
        if (id === request.current) setThumbs((t) => ({ ...t, ...part }));
      });
    } catch (e) {
      if (id === request.current) dispatch({ type: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="figma-screens" role="dialog" aria-modal="true" aria-label="Add Figma screens">
      <div className="figma-screens__step panel">
        {state.step !== 'pick' || !state.listing ? (
          <>
            <h2>Add Figma screens</h2>
            <label>
              Figma file link
              <input type="url" placeholder="https://www.figma.com/design/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label>
              Personal access token <span className="muted">(scope file_content:read; stays in this tab)</span>
              <input type="password" autoComplete="off" value={token} onChange={(e) => onToken(e.target.value, remember)} />
            </label>
            <label>
              <input type="checkbox" checked={remember} onChange={(e) => onToken(token, e.target.checked)} /> Remember for this tab
            </label>
            {state.error && (
              <p className="figma-screens__error" role="alert">
                {state.error}
              </p>
            )}
            <div className="figma-screens__actions">
              <button onClick={onClose}>Cancel</button>
              <button className="seg-single--accent" disabled={state.step === 'loading' || !url.trim() || !token.trim()} onClick={load}>
                {state.step === 'loading' ? 'Loading…' : 'Load file'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{state.listing.fileName}</h2>
            {state.listing.warnings.map((w) => (
              <p className="figma-screens__error" role="alert" key={w}>
                {w}
              </p>
            ))}
            <input className="figma-screens__search" type="search" placeholder="Search frames" value={state.search} onChange={(e) => dispatch({ type: 'search', text: e.target.value })} />
            {visibleFrames(state.listing, state.search).map((page) => (
              <section className="figma-screens__page" key={page.name}>
                <h3>{page.name}</h3>
                {page.frames.map((f) => (
                  <label className="figma-screens__frame" key={f.id}>
                    <input type="checkbox" checked={state.picked.includes(f.id)} onChange={() => dispatch({ type: 'toggle', id: f.id })} />
                    {thumbs[f.id] ? <img className="figma-screens__thumb" src={thumbs[f.id]!} alt="" loading="lazy" /> : <span className="figma-screens__thumb" />}
                    <span className="figma-screens__meta">
                      {f.name} · {Math.round(f.width)}×{Math.round(f.height)}
                      {f.match && <span className="tag">matches {f.match}</span>}
                    </span>
                  </label>
                ))}
              </section>
            ))}
            <div className="figma-screens__actions">
              <button onClick={() => dispatch({ type: 'back' })}>Back</button>
              <button onClick={onClose}>Cancel</button>
              <button className="seg-single--accent" onClick={() => onAdd(state.listing!, state.picked)}>
                {state.picked.length ? `Add ${state.picked.length} screen${state.picked.length === 1 ? '' : 's'}` : 'Keep no Figma screens'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
