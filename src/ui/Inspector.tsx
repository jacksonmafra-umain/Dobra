import type { GridComponentId, ScreenSpec, SimulatorConfig } from '../config/types';
import { capitalize, formatSizeClass, type Environment } from '../engine/environment';
import type { Layout } from '../engine/layout';
import { placeModal, type ModalKind } from '../engine/modal';
import type { Collision } from '../sample/collisions';

interface InspectorProps {
  config: SimulatorConfig;
  env: Environment;
  layout: Layout;
  screen: ScreenSpec;
  collisions: Collision[];
  modal: ModalKind | null;
  rtl: boolean;
}

export function Inspector({ config, env, layout, screen, collisions, modal, rtl }: InspectorProps) {
  const safe = env.safeArea;
  const est = env.sizeClass.estimated ? ' (estimated)' : '';
  const rows: [string, string][] = [
    ['Size', `${env.width} × ${env.height} pt`],
    ['Orientation', env.orientation],
    ['Pose', env.pose ? `${env.pose.label}${env.pose.estimated ? ' (estimated)' : ''}` : '— (foldable devices only)'],
    [
      'Available space',
      env.fold
        ? `2 regions of ${Math.round(env.fold.regions[0].width)}×${Math.round(env.fold.regions[0].height)} pt, ${env.fold.axis} fold ${env.fold.rect[env.fold.axis === 'vertical' ? 'width' : 'height']} pt`
        : `${env.width} × ${env.height} pt, one region`,
    ],
    ['Horizontal size class', env.sizeClass.horizontal + est],
    ['Vertical size class', env.sizeClass.vertical + est],
    [
      'Bar layout',
      env.barAxis === 'vertical' ? `vertical · trailing edge · rail ${layout.railWidth} pt` : 'horizontal · top and bottom',
    ],
    [
      'Screen tag',
      screen.experience === 'navigation' ? 'Navigation-focused (keeps tab bar)' : 'Task-oriented (keeps toolbar)',
    ],
    ['Compression', describeCompression(layout)],
    ['Safe area', `T${safe.top} R${safe.right} B${safe.bottom} L${safe.left} · ${safe.source}`],
    [
      'Page margins',
      `${layout.margin.left} / ${layout.margin.right} (${layout.rule.pageMargin.mode}(${layout.rule.pageMargin.base}, safe area))`,
    ],
    [
      'Grid',
      `${layout.rule.grid.columns} col · ${layout.rule.grid.gutter} gutter${layout.rule.grid.proposed ? ' (proposed)' : ''}`,
    ],
  ];
  return (
    <section className="panel">
      <h2 className="panel__title">Indicators</h2>
      <div className="rule-chip">
        <span className="rule-chip__sc">{formatSizeClass(env.sizeClass)}</span>
        <span>{layout.rule.label}</span>
        <code>{layout.rule.id}</code>
      </div>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="panel__sub">Active Sample layout rule · {screen.name}</h3>
      <dl className="kv kv--dense">
        {screen.components.map((id) => (
          <div key={id}>
            <dt>{id}</dt>
            <dd>
              {id === 'news_story_hero'
                ? `${layout.hero.variant} · ${layout.hero.bleed}`
                : describePerRow(layout, id as GridComponentId)}
            </dd>
          </div>
        ))}
        <div>
          <dt>tab_bar_26</dt>
          <dd>items {layout.tabItem}</dd>
        </div>
        <div>
          <dt>panes</dt>
          <dd>
            {layout.panes}
            {layout.panes > 1 ? ' (split views arrive in step 5)' : ''}
          </dd>
        </div>
      </dl>
      <BarsPanel layout={layout} />
      {(env.poses.length > 0 || env.reservedRegions.length > 0) && (
        <ReservedPanel env={env} layout={layout} collisions={collisions} modal={modal} rtl={rtl} />
      )}
      <h3 className="panel__sub">Design source</h3>
      <DesignSource config={config} env={env} screen={screen} />
    </section>
  );
}

function describeCompression(layout: Layout): string {
  const bars = layout.bars;
  if (bars.axis === 'horizontal') return 'none (horizontal bars fit)';
  if (bars.compression === 'none') return 'none: toolbar and tab bar both fit';
  if (bars.compression === 'toolbar-overflow') return 'active: toolbar items → overflow menu';
  return 'active: tab bar minimised';
}

function describePerRow(layout: Layout, id: GridComponentId): string {
  const wanted = layout.rule.components[id]?.perRow;
  const got = layout.perRow[id];
  if (wanted === undefined) return '—';
  return got < wanted ? `${got} per row (rule says ${wanted}; min width doesn't fit)` : `${got} per row`;
}

function BarsPanel({ layout }: { layout: Layout }) {
  const bars = layout.bars;
  const titles = (items: { title: string }[]) => items.map((i) => i.title).join(', ') || '—';
  return (
    <>
      <h3 className="panel__sub">Bars</h3>
      <dl className="kv kv--dense">
        {bars.axis === 'vertical' ? (
          <>
            <div>
              <dt>vertical toolbar</dt>
              <dd>{bars.rail.map((g) => titles(g)).join('  |  ') || '—'}</dd>
            </div>
            <div>
              <dt>horizontal bar</dt>
              <dd>{titles(bars.horizontal)}</dd>
            </div>
            <div>
              <dt>overflow menu</dt>
              <dd>{titles(bars.overflow)}</dd>
            </div>
            <div>
              <dt>tab_bar_26</dt>
              <dd>{bars.tabBar}, vertical</dd>
            </div>
            {bars.budget && (
              <div>
                <dt>rail space</dt>
                <dd>
                  {bars.budget.toolbar} + {bars.budget.tabBar} of {bars.budget.available} pt
                </dd>
              </div>
            )}
          </>
        ) : (
          <div>
            <dt>toolbar</dt>
            <dd>{titles(bars.horizontal)}</dd>
          </div>
        )}
      </dl>
      {bars.notes.length > 0 && (
        <ul className="bar-notes">
          {bars.notes.map((n, i) => (
            <li data-kind={n.kind} key={i}>
              {n.message}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReservedPanel({
  env,
  layout,
  collisions,
  modal,
  rtl,
}: {
  env: Environment;
  layout: Layout;
  collisions: Collision[];
  modal: ModalKind | null;
  rtl: boolean;
}) {
  return (
    <>
      <h3 className="panel__sub">Reserved regions &amp; fold</h3>
      <dl className="kv kv--dense">
        <div>
          <dt>reserved</dt>
          <dd>
            {env.reservedRegions
              .map((r) => `${r.label} (${Math.round(r.rect.width)}×${Math.round(r.rect.height)})`)
              .join(', ') || 'none'}
          </dd>
        </div>
        <div>
          <dt>inner camera</dt>
          <dd>{env.cameraActive ? 'active: region reserved, UI moves aside' : 'inactive: hidden behind the display'}</dd>
        </div>
        <div>
          <dt>fold</dt>
          <dd>
            {env.fold
              ? `${env.fold.axis}, ${env.fold.rect[env.fold.axis === 'vertical' ? 'width' : 'height']} pt${env.fold.estimated ? ' (est.)' : ''}`
              : 'none'}
          </dd>
        </div>
        {env.fold && (
          <div>
            <dt>margins</dt>
            <dd>
              {layout.marginsBalanced
                ? `balanced to ${layout.margin.left}/${layout.margin.right} to match the display's symmetry`
                : 'already symmetric'}
            </dd>
          </div>
        )}
        {env.fold && (
          <div>
            <dt>grids</dt>
            <dd>{layout.foldGutter ? 'even grids put their middle gutter over the fold' : '—'}</dd>
          </div>
        )}
        {modal && (
          <div>
            <dt>{modal}</dt>
            <dd>{placeModal(modal, env, layout, rtl).note}</dd>
          </div>
        )}
      </dl>
      <p className={collisions.length ? 'collisions collisions--bad' : 'collisions'}>
        {collisions.length
          ? `${collisions.length} important element${collisions.length > 1 ? 's' : ''} in the fold or a reserved region (red outline):`
          : 'No important elements in the fold or reserved regions.'}
      </p>
      {collisions.length > 0 && (
        <ul className="bar-notes">
          {collisions.slice(0, 8).map((c, i) => (
            <li data-kind="overfull" key={i}>
              {c.element} · {c.region}
            </li>
          ))}
          {collisions.length > 8 && <li>…and {collisions.length - 8} more</li>}
        </ul>
      )}
    </>
  );
}

function DesignSource({ config, env, screen }: { config: SimulatorConfig; env: Environment; screen: ScreenSpec }) {
  if (!screen.figma) return <p className="source source--warn">Not in Figma yet. {screen.source}</p>;
  const link = (node: string) => `https://www.figma.com/design/${config.figmaFile}/?node-id=${node.replace(':', '-')}`;
  const node = screen.figma[env.orientation];
  if (node) {
    return (
      <p className="source">
        Figma variant <strong>Orientation={capitalize(env.orientation)}</strong> ·{' '}
        <a href={link(node)} target="_blank" rel="noreferrer">
          {node}
        </a>
      </p>
    );
  }
  const other = screen.figma.portrait ?? screen.figma.landscape;
  return (
    <p className="source source--warn">
      No {env.orientation} variant in Figma: the rules expand the {other === screen.figma.portrait ? 'portrait' : 'landscape'}{' '}
      design
      {other && (
        <>
          {' ('}
          <a href={link(other)} target="_blank" rel="noreferrer">
            {other}
          </a>
          {')'}
        </>
      )}
      .
    </p>
  );
}
