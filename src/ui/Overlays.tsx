import type { Environment } from '../engine/environment';
import type { Layout } from '../engine/layout';

export interface OverlayToggles {
  safeArea: boolean;
  margins: boolean;
  grid: boolean;
  reserved: boolean;
  fold: boolean;
}

export function Overlays({ env, layout, show }: { env: Environment; layout: Layout; show: OverlayToggles }) {
  const safe = env.safeArea;
  const { width, height } = env;
  return (
    <div className="overlays" aria-hidden>
      {show.grid && <GridOverlay env={env} layout={layout} />}
      {show.margins && (
        <>
          <div className="ov-margin" style={{ left: 0, width: layout.margin.left }}>
            <span>{layout.margin.left}</span>
          </div>
          <div className="ov-margin" style={{ right: 0, width: layout.margin.right }}>
            <span>{layout.margin.right}</span>
          </div>
        </>
      )}
      {show.reserved &&
        env.reservedRegions.map((r) => (
          <div
            className="ov-reserved"
            style={{ left: r.rect.x, top: r.rect.y, width: r.rect.width, height: r.rect.height }}
            key={r.id}
          >
            <em>
              {r.kind === 'live-activity' ? 'Live Activity' : 'camera'}
              {r.estimated ? ' · est.' : ''}
            </em>
          </div>
        ))}
      {show.fold && env.fold && (
        <>
          {env.fold.regions.map((r, i) => (
            <div className="ov-fold-region" style={{ left: r.x, top: r.y, width: r.width, height: r.height }} key={i}>
              <em>
                {Math.round(r.width)}×{Math.round(r.height)}
              </em>
            </div>
          ))}
          <div
            className={`ov-fold ov-fold--${env.fold.axis}`}
            style={{
              left: env.fold.rect.x,
              top: env.fold.rect.y,
              width: env.fold.rect.width,
              height: env.fold.rect.height,
            }}
          >
            <em>
              fold {env.fold.rect[env.fold.axis === 'vertical' ? 'width' : 'height']}
              {env.fold.estimated ? ' · est.' : ''}
            </em>
          </div>
        </>
      )}
      {show.safeArea && (
        <>
          {safe.top > 0 && (
            <div className="ov-safe" style={{ left: 0, top: 0, width, height: safe.top }}>
              <em>top {safe.top}</em>
            </div>
          )}
          {safe.bottom > 0 && (
            <div className="ov-safe" style={{ left: 0, bottom: 0, width, height: safe.bottom }}>
              <em>bottom {safe.bottom}</em>
            </div>
          )}
          {safe.left > 0 && (
            <div
              className="ov-safe ov-safe--v"
              style={{ left: 0, top: safe.top, width: safe.left, height: height - safe.top - safe.bottom }}
            >
              <em>left {safe.left}</em>
            </div>
          )}
          {safe.right > 0 && (
            <div
              className="ov-safe ov-safe--v"
              style={{ right: 0, top: safe.top, width: safe.right, height: height - safe.top - safe.bottom }}
            >
              <em>right {safe.right}</em>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GridOverlay({ env, layout }: { env: Environment; layout: Layout }) {
  const { columns, gutter } = layout.rule.grid;
  const col = (layout.contentWidth - gutter * (columns - 1)) / columns;
  return (
    <div className="ov-grid" style={{ left: layout.margin.left, width: layout.contentWidth, height: env.height }}>
      {Array.from({ length: columns }, (_, i) => (
        <div className="ov-grid__col" style={{ left: i * (col + gutter), width: col }} key={i} />
      ))}
    </div>
  );
}
