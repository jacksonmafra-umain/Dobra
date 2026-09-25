import type { CSSProperties } from 'react';
import type { TabItemSpec } from '../config/types';
import { asset } from './assets';

type IconStyle = CSSProperties & { '--icon'?: string };

/** Icon a tab shows; Home swaps the logo mask for the filled logo when selected. */
function tabIconName(tab: TabItemSpec, active: boolean): string {
  if (tab.id === 'home') return active ? 'ic_logo_filled_32' : 'ic_logo_default_mask_32';
  return active && tab.iconSelected ? tab.iconSelected : tab.icon;
}

interface TabBarProps {
  items: TabItemSpec[];
  selected: string;
  item: 'stacked' | 'inline';
}

export function TabBar({ items, selected, item }: TabBarProps) {
  return (
    <nav className={`tab_bar_26 tab_bar_26--${item}`} data-name="tab_bar_26" aria-label="Tab bar">
      <div className="tab_bar_26__buttons">
        {items.map((tab) => {
          const active = tab.id === selected;
          const icon = tabIconName(tab, active);
          return (
            <button className="tab_item_26" data-name="tab_item_26" aria-current={active ? 'page' : undefined} key={tab.id}>
              {icon === 'ic_logo_filled_32' ? (
                <span className="tab_item_26__icon tab_item_26__icon--image">
                  <img src={asset(`${icon}.svg`)} alt="" />
                </span>
              ) : (
                <span
                  className={`tab_item_26__icon${active ? ' tab_item_26__icon--active' : ''}`}
                  style={{ '--icon': `url("${asset(`${icon}.svg`)}")` } as IconStyle}
                  data-missing-icon={active && tab.id !== 'home' ? `${tab.icon}_color_filled` : undefined}
                />
              )}
              <span className={`tab_item_26__label ${active ? 't-TabBar-Selected' : 't-TabBar-Idle'}`}>{tab.title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function TabIcon({ tab, active, size }: { tab: TabItemSpec; active: boolean; size: number }) {
  const icon = tabIconName(tab, active);
  if (icon === 'ic_logo_filled_32') return <img src={asset(`${icon}.svg`)} alt="" width={size} height={size} />;
  return (
    <span
      className={`tab_item_26__icon${active ? ' tab_item_26__icon--active' : ''}`}
      style={{ width: size, height: size, '--icon': `url("${asset(`${icon}.svg`)}")` } as IconStyle}
    />
  );
}
