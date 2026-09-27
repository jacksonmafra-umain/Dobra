// Android navigation patterns (NavigationSuiteScaffold): bottom bar, navigation rail, navigation drawer.
// They reuse the Sample tab items; only the container changes with the window size class.
import type { CSSProperties } from 'react';
import type { TabItemSpec } from '@dobra/core/config/types';
import type { Navigation } from '@dobra/core/engine/layout';
import { TabIcon } from './tabBar';

interface NavProps {
  navigation: Navigation;
  items: TabItemSpec[];
  selected: string;
}

/** The sample app draws the bar as a floating pill over the content. */
export function FloatingTabBar({ navigation, items, selected, bottomInset }: NavProps & { bottomInset: number }) {
  const style: CSSProperties = {
    height: navigation.size - navigation.inset,
    bottom: bottomInset + navigation.inset,
  };
  return (
    <nav
      className={`nav-bar${navigation.floating ? ' nav-bar--floating' : ''}`}
      style={style}
      data-name="navigation_bar"
      data-floating={navigation.floating || undefined}
      aria-label="Navigation bar"
    >
      {items.map((tab) => {
        const active = tab.id === selected;
        return (
          <button className="nav-bar__item" aria-current={active ? 'page' : undefined} key={tab.id}>
            <TabIcon tab={tab} active={active} size={28} />
            <span className={active ? 't-TabBar-Selected' : 't-TabBar-Idle'}>{tab.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function NavigationRail({ navigation, items, selected, top, width }: NavProps & { top: number; width: number }) {
  return (
    <nav
      className="nav-rail"
      style={{ width, paddingTop: top + 12, paddingInlineStart: width - navigation.size }}
      data-name="navigation_rail"
      aria-label="Navigation rail"
    >
      {items.map((tab) => {
        const active = tab.id === selected;
        return (
          <button className="nav-rail__item" aria-current={active ? 'page' : undefined} key={tab.id}>
            <span className="nav-rail__indicator">
              <TabIcon tab={tab} active={active} size={24} />
            </span>
            <span className={active ? 't-TabBar-Selected' : 't-TabBar-Idle'}>{tab.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function NavigationDrawer({ navigation, items, selected, top, width }: NavProps & { top: number; width: number }) {
  return (
    <nav
      className="nav-drawer"
      style={{ width, paddingTop: top + 12, paddingInlineStart: width - navigation.size + 12 }}
      data-name="navigation_drawer"
      aria-label="Navigation drawer"
    >
      {items.map((tab) => {
        const active = tab.id === selected;
        return (
          <button className="nav-drawer__item t-Paragraph-Medium-Bold" aria-current={active ? 'page' : undefined} key={tab.id}>
            <TabIcon tab={tab} active={active} size={24} />
            <span>{tab.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
