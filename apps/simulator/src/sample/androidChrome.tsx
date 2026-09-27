// Android system chrome: status bar, punch-hole camera and the navigation bar (gesture handle or
// 3-button). Drawn in the insets the engine resolved, so they move with rotation.
import type { Environment } from '@dobra/core/engine/environment';

function AndroidStatusIcons() {
  return (
    <span className="android-status__icons">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
        <path d="M7 12.5 0 4.2A10 10 0 0 1 14 4.2Z" />
      </svg>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
        <path d="M13 1v12H1Z" />
      </svg>
      <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden>
        <path d="M2.5 0h3v1.5H7a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1h1.5Z" />
      </svg>
    </span>
  );
}

export function AndroidChrome({ env }: { env: Environment }) {
  const android = env.android;
  if (!android || env.isFree) return null;
  const nav = android.navigationBar;
  return (
    <>
      {env.statusBar && (
        <div className="android-status" style={{ height: android.statusBarHeight }} data-name="status_bar" aria-hidden>
          <span className="tnum">9:41</span>
          <AndroidStatusIcons />
        </div>
      )}
      {android.cutout && (
        <div
          className="android-cutout"
          style={{ left: android.cutout.x, top: android.cutout.y, width: android.cutout.width, height: android.cutout.height }}
          aria-hidden
        />
      )}
      {nav && nav.size > 0 && (
        <div className={`android-nav android-nav--${nav.edge} android-nav--${android.navMode}`} style={{ [nav.edge === 'bottom' ? 'height' : 'width']: nav.size }} data-name="navigation_bar (system)" aria-hidden>
          {android.navMode === 'gesture' ? (
            <span className="android-nav__handle" />
          ) : (
            <>
              <span className="android-nav__button">◀</span>
              <span className="android-nav__button">●</span>
              <span className="android-nav__button">■</span>
            </>
          )}
        </div>
      )}
    </>
  );
}
