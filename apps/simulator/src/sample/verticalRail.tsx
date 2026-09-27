// iPhone Duo trailing rail: status, vertical toolbar and vertical tab bar (HIG).
import { useState, type CSSProperties } from 'react';
import type { TabItemSpec, ToolbarItemSpec, VerticalBarsSpec } from '@hinge/core/config/types';
import type { BarLayout } from '@hinge/core/engine/bars';
import type { Environment } from '@hinge/core/engine/environment';
import { asset } from './assets';
import { StatusIcons } from './chrome';
import { FallbackIcon, Icon } from './icons';
import { TabIcon } from './tabBar';

interface VerticalRailProps {
  env: Environment;
  bars: BarLayout;
  spec: VerticalBarsSpec;
  width: number;
  tabs: TabItemSpec[];
  selectedTab: string;
}

export function VerticalRail({ env, bars, spec, width, tabs, selectedTab }: VerticalRailProps) {
  const style = {
    width,
    paddingTop: env.safeArea.top,
    paddingBottom: Math.max(env.safeArea.bottom, 8),
    '--rail-item': `${spec.toolbarItem}px`,
    '--rail-gap': `${spec.groupGap}px`,
    '--rail-tab': `${spec.tabItem}px`,
    '--rail-tab-gap': `${spec.tabItemGap}px`,
  } as CSSProperties;
  return (
    <aside className="vertical-rail" style={style} data-name="vertical controls" dir="ltr">
      {env.cameraRegion > 0 && (
        <div className="vertical-rail__camera" style={{ height: env.cameraRegion }} aria-hidden>
          <span className="vertical-rail__lens" />
        </div>
      )}
      {env.statusBar && (
        <div className="vertical-rail__status" style={{ height: spec.statusRegion }} data-name="chrome" aria-hidden>
          <span className="tnum">9:41</span>
          <StatusIcons vertical />
        </div>
      )}
      <div className="vertical-rail__toolbar" data-name="toolbar (vertical)">
        {bars.rail.map((group, i) => (
          <div className="vertical-rail__group" data-group={group[0].group} key={i}>
            {group.map((item) => (
              <RailItem item={item} key={item.id} />
            ))}
          </div>
        ))}
        {bars.overflow.length > 0 && <RailOverflow items={bars.overflow} />}
      </div>
      <div className="vertical-rail__spacer" />
      {bars.tabBar === 'full' ? (
        <nav className="tab_bar_26 tab_bar_26--vertical" data-name="tab_bar_26" aria-label="Tab bar">
          {tabs.map((tab) => (
            <RailTab tab={tab} active={tab.id === selectedTab} key={tab.id} />
          ))}
        </nav>
      ) : (
        <MinimizedTabBar tab={tabs.find((t) => t.id === selectedTab) ?? tabs[0]} />
      )}
    </aside>
  );
}

function ItemSymbol({ symbol, size }: { symbol: string; size: number }) {
  return symbol === 'ic_qr_code_default_32' ? (
    <img src={asset('IcQrCodeDefault32.svg')} alt="" width={size} height={size} />
  ) : (
    <Icon name={symbol} size={size === 32 ? 24 : 20} />
  );
}

function RailItem({ item }: { item: ToolbarItemSpec }) {
  return (
    <button className="vertical-rail__item" aria-label={item.title} title={item.title} data-group={item.group}>
      {item.symbol && <ItemSymbol symbol={item.symbol} size={32} />}
      {item.badge && <span className="vertical-rail__badge" aria-label="has updates" />}
    </button>
  );
}

function RailOverflow({ items }: { items: ToolbarItemSpec[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="vertical-rail__group vertical-rail__overflow">
      <button
        className="vertical-rail__item"
        aria-label="More"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-name="overflow menu"
      >
        <FallbackIcon name="ic_ellipsis_default_32" />
        <span className="vertical-rail__count">{items.length}</span>
      </button>
      {open && (
        <div className="overflow-menu" role="menu">
          {items.map((item) => (
            <div className="overflow-menu__item t-Paragraph-Medium-Regular" role="menuitem" key={item.id}>
              <span>{item.title}</span>
              {item.symbol && <ItemSymbol symbol={item.symbol} size={22} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RailTab({ tab, active }: { tab: TabItemSpec; active: boolean }) {
  return (
    <button className="tab_item_26 tab_item_26--vertical" aria-current={active ? 'page' : undefined} data-name="tab_item_26">
      <TabIcon tab={tab} active={active} size={28} />
      <span className={active ? 't-TabBar-Selected' : 't-TabBar-Idle'}>{tab.title}</span>
    </button>
  );
}

function MinimizedTabBar({ tab }: { tab: TabItemSpec }) {
  return (
    <nav
      className="tab_bar_26 tab_bar_26--minimized"
      data-name="tab_bar_26 (minimised)"
      aria-label={`Tab bar, minimised. Current: ${tab.title}`}
    >
      <button className="tab_bar_26__single" title={`${tab.title} · tap to show all tabs`}>
        <TabIcon tab={tab} active size={28} />
      </button>
    </nav>
  );
}
