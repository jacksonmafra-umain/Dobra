// The simulated app screen: toolbar, scrolling content, navigation, system chrome and modals.
import { useRef, type ComponentType, type CSSProperties } from 'react';
import type { ScreenSpec, SimulatorConfig } from '../config/types';
import type { Environment } from '../engine/environment';
import type { Layout } from '../engine/layout';
import { placeModal, type ModalKind } from '../engine/modal';
import { AndroidChrome } from './androidChrome';
import { DynamicIsland, HomeIndicator, LiveActivityIsland, StatusBar } from './chrome';
import { useCollisions, type Collision } from './collisions';
import { Modal } from './modal';
import { FloatingTabBar, NavigationDrawer, NavigationRail } from './navigation';
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

/** Toolbar content never sits closer than this to the window edge. */
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
  const nav = layout.navigation;
  const iosRail = nav.pattern === 'ios-rail';
  const floatingBar = nav.pattern === 'bar' && nav.floating;
  // Space the leading rail or drawer takes, including the inset it sits in.
  const leading = layout.leadingNav ? safe.left + layout.leadingNav : 0;
  const right = iosRail ? 0 : safe.right;

  // Physical LTR margins inside the content column; RTL mirrors them.
  const marginStart = layout.margin.left - leading;
  const marginEnd = layout.margin.right - layout.railWidth;
  const style: Record<string, string> = {
    '--sa-top': `${safe.top}px`,
    '--sa-right': `${right}px`,
    '--sa-bottom': `${safe.bottom}px`,
    '--sa-left': `${leading ? 0 : safe.left}px`,
    '--margin-left': `${rtl ? marginEnd : marginStart}px`,
    '--margin-right': `${rtl ? marginStart : marginEnd}px`,
    '--toolbar-inset-left': `${leading ? TOOLBAR_MIN_INSET : Math.max(TOOLBAR_MIN_INSET, safe.left)}px`,
    '--toolbar-inset-right': `${Math.max(TOOLBAR_MIN_INSET, right)}px`,
    '--camera-left': `${env.reservedRegions.find((r) => r.kind === 'camera' && r.rect.x === 0)?.rect.width ?? 0}px`,
    '--floating-bar-clearance': floatingBar ? `${nav.size + nav.inset}px` : '0px',
  };

  const flagged = bars ? bars.notes.filter((n) => n.kind === 'text-in-vertical').map((n) => n.itemId!) : [];
  const horizontalItems = bars ? bars.horizontal : screen.toolbar.items;
  const showToolbar =
    !iosRail || horizontalItems.length > 0 || screen.toolbar.component === 'app_toolbar' || !!screen.toolbar.title;
  const Content = SCREEN_CONTENT[screen.id];
  const columnStyle: CSSProperties = rtl
    ? { marginLeft: layout.railWidth, marginRight: leading }
    : { marginRight: layout.railWidth, marginLeft: leading };

  return (
    <div
      ref={root}
      className={`screen screen--${env.platform}${iosRail ? ' screen--vertical' : ''}`}
      style={style as CSSProperties}
      data-screen={screen.id}
      data-platform={env.platform}
    >
      <div className="screen__column" style={columnStyle} dir={rtl ? 'rtl' : 'ltr'}>
        <div className="screen__status-spacer" />
        {showToolbar &&
          (screen.toolbar.component === 'app_toolbar' ? (
            <AppToolbar spec={screen.toolbar} items={horizontalItems} flagged={flagged} />
          ) : (
            <Toolbar spec={screen.toolbar} items={horizontalItems} flagged={flagged} />
          ))}
        <main className="screen__scroll">{Content && <Content layout={layout} />}</main>
        {nav.pattern === 'tab-bar' && <TabBar items={config.tabBar.items} selected={screen.tab} item={layout.tabItem} />}
        {nav.pattern === 'bar' && (
          <FloatingTabBar navigation={nav} items={config.tabBar.items} selected={screen.tab} bottomInset={safe.bottom} />
        )}
      </div>
      {nav.pattern === 'rail' && (
        <div dir={rtl ? 'rtl' : 'ltr'}>
          <NavigationRail navigation={nav} items={config.tabBar.items} selected={screen.tab} top={safe.top} width={leading} />
        </div>
      )}
      {nav.pattern === 'drawer' && (
        <div dir={rtl ? 'rtl' : 'ltr'}>
          <NavigationDrawer navigation={nav} items={config.tabBar.items} selected={screen.tab} top={safe.top} width={leading} />
        </div>
      )}
      {iosRail && bars && (
        <VerticalRail
          env={env}
          bars={bars}
          spec={config.platforms.ios.verticalBars}
          width={layout.railWidth}
          tabs={config.tabBar.items}
          selectedTab={screen.tab}
        />
      )}
      {env.platform === 'ios' ? <StatusBar env={env} /> : <AndroidChrome env={env} />}
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
