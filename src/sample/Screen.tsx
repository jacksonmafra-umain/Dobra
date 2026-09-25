// The simulated app screen: toolbar, scrolling content, bars, system chrome and modals.
import { useRef, type ComponentType, type CSSProperties } from 'react';
import type { ScreenSpec, SimulatorConfig } from '../config/types';
import type { Environment } from '../engine/environment';
import type { Layout } from '../engine/layout';
import { placeModal, type ModalKind } from '../engine/modal';
import { DynamicIsland, HomeIndicator, LiveActivityIsland, StatusBar } from './chrome';
import { useCollisions, type Collision } from './collisions';
import { Modal } from './modal';
import { BagScreen } from './screens/BagScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { DealsScreen } from './screens/DealsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { TabBar } from './tabBar';
import { AppToolbar, Toolbar } from './toolbars';
import { VerticalRail } from './verticalRail';

const SCREEN_CONTENT: Record<string, ComponentType<{ layout: Layout }>> = {
  home: HomeScreen,
  deals: DealsScreen,
  rewards: RewardsScreen,
  bag: BagScreen,
  checkout: CheckoutScreen,
};

/** Toolbar content never sits closer than this to the screen edge (points). */
const TOOLBAR_MIN_INSET = 16;

interface ScreenProps {
  config: SimulatorConfig;
  env: Environment;
  layout: Layout;
  screen: ScreenSpec;
  rtl: boolean;
  modal: ModalKind | null;
  onCloseModal: () => void;
  onCollisions: (collisions: Collision[]) => void;
}

export function Screen({ config, env, layout, screen, rtl, modal, onCloseModal, onCollisions }: ScreenProps) {
  const root = useRef<HTMLDivElement>(null);
  useCollisions(root, env, [env, layout, screen.id, rtl, modal], onCollisions);

  const safe = env.safeArea;
  const bars = layout.bars;
  const vertical = bars.axis === 'vertical';
  const right = vertical ? 0 : safe.right;
  const style = {
    '--sa-top': `${safe.top}px`,
    '--sa-right': `${right}px`,
    '--sa-bottom': `${safe.bottom}px`,
    '--sa-left': `${safe.left}px`,
    '--margin-left': `${layout.margin.left}px`,
    '--margin-right': `${layout.margin.right - layout.railWidth}px`,
    '--toolbar-inset-left': `${Math.max(TOOLBAR_MIN_INSET, safe.left)}px`,
    '--toolbar-inset-right': `${Math.max(TOOLBAR_MIN_INSET, right)}px`,
    '--camera-left': `${env.reservedRegions.find((r) => r.kind === 'camera' && r.rect.x === 0)?.rect.width ?? 0}px`,
  } as Record<string, string>;
  if (rtl) {
    style['--margin-left'] = `${layout.margin.right - layout.railWidth}px`;
    style['--margin-right'] = `${layout.margin.left}px`;
  }

  const flagged = bars.notes.filter((n) => n.kind === 'text-in-vertical').map((n) => n.itemId!);
  const horizontalItems = bars.horizontal;
  const showToolbar =
    !vertical || horizontalItems.length > 0 || screen.toolbar.component === 'app_toolbar' || !!screen.toolbar.title;
  const Content = SCREEN_CONTENT[screen.id];

  return (
    <div ref={root} className={`screen${vertical ? ' screen--vertical' : ''}`} style={style as CSSProperties} data-screen={screen.id}>
      <div className="screen__column" style={{ marginRight: layout.railWidth }} dir={rtl ? 'rtl' : 'ltr'}>
        <div className="screen__status-spacer" />
        {showToolbar &&
          (screen.toolbar.component === 'app_toolbar' ? (
            <AppToolbar spec={screen.toolbar} items={horizontalItems} flagged={flagged} />
          ) : (
            <Toolbar spec={screen.toolbar} items={horizontalItems} flagged={flagged} />
          ))}
        <main className="screen__scroll">{Content && <Content layout={layout} />}</main>
        {!vertical && <TabBar items={config.tabBar.items} selected={screen.tab} item={layout.tabItem} />}
      </div>
      {vertical && (
        <VerticalRail
          env={env}
          bars={bars}
          spec={config.verticalBars}
          width={layout.railWidth}
          tabs={config.tabBar.items}
          selectedTab={screen.tab}
        />
      )}
      <StatusBar env={env} />
      <DynamicIsland env={env} />
      {env.reservedRegions
        .filter((r) => r.kind === 'live-activity')
        .map((r) => (
          <LiveActivityIsland rect={r.rect} key={r.id} />
        ))}
      {modal && <Modal kind={modal} placement={placeModal(modal, env, layout, rtl)} onClose={onCloseModal} />}
      <HomeIndicator env={env} />
    </div>
  );
}
