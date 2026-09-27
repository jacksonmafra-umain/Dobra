// System chrome drawn on top of the app: status bar, Dynamic Island, home indicator, Live Activity.
import type { Rect } from '@dobra/core/config/types';
import type { Environment } from '@dobra/core/engine/environment';
import { ImBag } from './illustrations';

export function StatusIcons({ vertical = false }: { vertical?: boolean }) {
  return (
    <span className={`chrome-status__icons${vertical ? ' chrome-status__icons--vertical' : ''}`}>
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
      </svg>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
        <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.1-1.1A10 10 0 0 0 8 .6 10 10 0 0 0 .9 3.5L2 4.6a8.5 8.5 0 0 1 6-2.4Zm0 3.2c1.4 0 2.7.5 3.7 1.4l1.1-1.1A7 7 0 0 0 8 3.8a7 7 0 0 0-4.8 1.9l1.1 1.1A5.4 5.4 0 0 1 8 5.4Zm0 3.2c.6 0 1.1.2 1.5.6L8 10.7 6.5 9.2c.4-.4.9-.6 1.5-.6Z" />
      </svg>
      <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
        <rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".35" />
        <rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor" />
        <path d="M25 4.5v4a2 2 0 0 0 0-4Z" fill="currentColor" opacity=".4" />
      </svg>
    </span>
  );
}

export function StatusBar({ env }: { env: Environment }) {
  if (!env.statusBar || env.barAxis === 'vertical' || env.safeArea.top === 0) return null;
  return (
    <div className="chrome-status" data-name="chrome" aria-hidden>
      <span className="tnum">9:41</span>
      <StatusIcons />
    </div>
  );
}

export function DynamicIsland({ env }: { env: Environment }) {
  const island = env.dynamicIsland;
  if (!island) return null;
  return (
    <div
      className="chrome-dynamic-island"
      style={{ left: island.x, top: island.y, width: island.width, height: island.height }}
      aria-hidden
    />
  );
}

export function HomeIndicator({ env }: { env: Environment }) {
  return env.homeIndicator ? <div className="chrome-home-indicator" aria-hidden /> : null;
}

export function LiveActivityIsland({ rect }: { rect: Rect }) {
  return (
    <div
      className="live-activity-island"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      data-name="live_activity"
    >
      <ImBag size={22} />
      <span className="live-activity-island__text">
        Order ready in <b className="tnum">4 min</b>
      </span>
      <span className="live-activity-island__lens" />
    </div>
  );
}
