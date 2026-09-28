// A Figma frame inside the simulated window: its image at the window's width, with an invisible
// box over each important layer so the collision checker outlines what sits on the fold.
import type { GeoNode } from '@dobra/core/geo';
import type { LoadedFrame } from './loader';
import type { StoredFrame } from './store';

export interface FigmaScreenProps {
  frame: StoredFrame;
  /** undefined while loading. */
  loaded: LoadedFrame | undefined;
  windowWidth: number;
  signedIn: boolean;
  onSignIn(): void;
  onRemove(): void;
  onRetry(): void;
}

const IMPORTANT = new Set<GeoNode['role']>(['text', 'interactive']);

function hits(nodes: GeoNode[], out: GeoNode[] = []): GeoNode[] {
  for (const n of nodes) {
    if (IMPORTANT.has(n.role)) out.push(n);
    else if (n.children) hits(n.children, out);
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function FigmaScreen({ frame, loaded, windowWidth, signedIn, onSignIn, onRemove, onRetry }: FigmaScreenProps) {
  if (!loaded) {
    return (
      <div className="figma-screen figma-screen__state">
        {signedIn ? (
          <p>Loading {frame.name}…</p>
        ) : (
          <>
            <p>Sign in to load {frame.name} from Figma.</p>
            <button className="seg-single--accent" onClick={onSignIn}>
              Sign in to load
            </button>
          </>
        )}
      </div>
    );
  }
  if (!loaded.geo) {
    return (
      <div className="figma-screen figma-screen__state">
        <p>No longer in the file: {frame.name}. {loaded.reason}</p>
        <button onClick={onRemove}>Remove</button>
      </div>
    );
  }
  const factor = windowWidth / frame.width;
  const scaled = Math.abs(frame.width - windowWidth) > 1;
  return (
    <div className="figma-screen">
      {scaled && (
        <p className="figma-screen__banner">
          This frame is {Math.round(frame.width)} wide; this window is {Math.round(windowWidth)}. The frame is scaled to fit, so positions are approximate. Use the
          plugin's Adapt to make a version for this device.
        </p>
      )}
      {loaded.image ? (
        <img className="figma-screen__image" src={loaded.image} alt={frame.name} />
      ) : (
        <div className="figma-screen__state">
          <p>Image unavailable. {loaded.reason}</p>
          <button onClick={onRetry}>Retry</button>
        </div>
      )}
      {hits(loaded.geo).map((n) => (
        <div
          key={n.id}
          className="figma-screen__hit"
          data-name={n.name}
          style={{ left: `${round(n.rect.x * factor)}px`, top: `${round(n.rect.y * factor)}px`, width: `${round(n.rect.width * factor)}px`, height: `${round(n.rect.height * factor)}px` }}
        />
      ))}
    </div>
  );
}
