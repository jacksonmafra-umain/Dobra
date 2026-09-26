// The simulated app screen: toolbar, scrolling content, navigation, system chrome and modals.
import { useRef, type ComponentType, type CSSProperties } from 'react';
import type { ScreenSpec, SimulatorConfig } from '@hinge/core/config/types';
import type { Environment } from '@hinge/core/engine/environment';
import type { Layout } from '@hinge/core/engine/layout';
import { typeScaleVars, type TextSettings } from '@hinge/core/engine/typography';
import { placeModal, type ModalKind } from '@hinge/core/engine/modal';
import { DynamicIsland, HomeIndicator, LiveActivityIsland, StatusBar } from './chrome';
import { useCollisions, type Collision } from './collisions';
import { screenVars } from './screenVars';
import { Modal } from './modal';
import { FloatingTabBar, NavigationDrawer, NavigationRail } from './navigation';
import { BagScreen } from './screens/BagScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { DealsScreen } from './screens/DealsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LocationsScreen } from './screens/LocationsScreen';
import { ProductsScreen } from './screens/ProductsScreen';
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
  locations: LocationsScreen,
  products: ProductsScreen,
};


interface ScreenProps {
  config: SimulatorConfig;
  env: Environment;
  layout: Layout;
  screen: ScreenSpec;
  rtl: boolean;
  modal: ModalKind | null;
  onCloseModal: () => void;
  onCollisions: (collisions: Collision[]) => void;
  text: TextSettings;
}

export function Screen({ config, env, layout, screen, rtl, modal, onCloseModal, onCollisions, text }: ScreenProps) {
  const root = useRef<HTMLDivElement>(null);
  useCollisions(root, env, [env, layout, screen.id, rtl, modal], onCollisions);

  const safe = env.safeArea;
  const bars = layout.bars;
  const nav = layout.navigation;
  const iosRail = nav.pattern === 'ios-rail';
  // Space the leading rail or drawer takes, including the inset it sits in.
  const leading = layout.leadingNav ? safe.left + layout.leadingNav : 0;
  const style: Record<string, string> = {
    ...screenVars(env, layout, rtl),
    ...typeScaleVars(config, env.platform, text.fontScale),
  };

  const flagged = bars ? bars.notes.filter((n) => n.kind === 'text-in-vertical').map((n) => n.itemId!) : [];
  const horizontalItems = bars ? bars.horizontal : screen.toolbar.items;
  const showToolbar =
    !iosRail || horizontalItems.length > 0 || screen.toolbar.component === 'app_toolbar' || !!screen.toolbar.title;
  const Content = SCREEN_CONTENT[screen.id];
  const columnStyle: CSSProperties = rtl
    ? { marginLeft: layout.railWidth, marginRight: leading, bottom: env.ime }
    : { marginRight: layout.railWidth, marginLeft: leading, bottom: env.ime };

  return (
    <div
      ref={root}
      className={`screen screen--${env.platform}${iosRail ? ' screen--vertical' : ''}`}
      style={style as CSSProperties}
      data-screen={screen.id}
      data-platform={env.platform}
      data-bold={text.bold || undefined}
      data-reduced-motion={text.reducedMotion || undefined}
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
        {nav.pattern === 'bar' && env.ime === 0 && (
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
      {env.platform === 'ios' && <StatusBar env={env} />}
      <DynamicIsland env={env} />
      {env.reservedRegions
        .filter((r) => r.kind === 'live-activity')
        .map((r) => (
          <LiveActivityIsland rect={r.rect} key={r.id} />
        ))}
      {modal && <Modal kind={modal} placement={placeModal(modal, env, layout, rtl)} onClose={onCloseModal} />}
      {env.ime > 0 && (
        <div className="keyboard" style={{ height: env.ime }} data-name="keyboard" aria-hidden>
          {['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row) => (
            <div className="keyboard__row" key={row}>
              {row.split('').map((k) => (
                <span key={k}>{k}</span>
              ))}
            </div>
          ))}
        </div>
      )}
      <HomeIndicator env={env} />
    </div>
  );
}
