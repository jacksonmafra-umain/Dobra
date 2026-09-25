import type { ScreenSpec, SimulatorConfig, ToolbarGroup, ToolbarItemSpec } from '../config/types';
import type { Environment } from './environment';

export type BarNoteKind = 'text-in-vertical' | 'compression' | 'overflow' | 'overfull';

export interface BarNote {
  kind: BarNoteKind;
  itemId?: string;
  message: string;
}

export interface BarLayout {
  axis: 'horizontal' | 'vertical';
  /** Items that stay in a horizontal bar. */
  horizontal: ToolbarItemSpec[];
  /** Vertical toolbar groups, top to bottom. */
  rail: ToolbarItemSpec[][];
  overflow: ToolbarItemSpec[];
  tabBar: 'full' | 'minimized';
  compression: 'none' | 'tab-bar-minimized' | 'toolbar-overflow';
  experience: ScreenSpec['experience'];
  budget: { available: number; toolbar: number; tabBar: number } | null;
  notes: BarNote[];
}

const GROUP_ORDER: ToolbarGroup[] = ['navigation', 'prominent', 'secondary'];

/** Decides where toolbar items and the tab bar go (HIG bar compression on iPhone Duo). */
export function resolveBars(config: SimulatorConfig, env: Environment, screen: ScreenSpec, unit = 'pt'): BarLayout {
  const items = screen.toolbar.items;
  const experience = screen.experience;
  if (env.barAxis === 'horizontal') {
    return {
      axis: 'horizontal',
      horizontal: items,
      rail: [],
      overflow: [],
      tabBar: 'full',
      compression: 'none',
      experience,
      budget: null,
      notes: [],
    };
  }

  const spec = config.verticalBars;
  const notes: BarNote[] = [];
  const textItems = items.filter((i) => i.label !== 'symbol' || !i.symbol);
  for (const item of textItems) {
    notes.push({
      kind: 'text-in-vertical',
      itemId: item.id,
      message: `"${item.title}" has a text label, so it stays in a horizontal bar instead of moving to the vertical toolbar.`,
    });
  }
  const railItems = GROUP_ORDER.flatMap((g) => items.filter((i) => i.group === g && !textItems.includes(i)));
  const tabCount = config.tabBar.items.length;
  const fullTabBar = tabCount * spec.tabItem + (tabCount - 1) * spec.tabItemGap;
  const available = env.height - env.safeArea.top - env.safeArea.bottom - env.cameraRegion - spec.statusRegion;

  const toolbarLength = (list: ToolbarItemSpec[], withOverflow: boolean) => {
    const groups = new Set(list.map((i) => i.group)).size;
    return (
      list.length * spec.toolbarItem +
      Math.max(0, groups - 1) * spec.groupGap +
      (withOverflow ? spec.overflowButton + (list.length ? spec.groupGap : 0) : 0)
    );
  };
  const fits = (list: ToolbarItemSpec[], withOverflow: boolean, tabBar: number) =>
    toolbarLength(list, withOverflow) + (list.length || withOverflow ? spec.minGapBetweenBars : 0) + tabBar <= available;

  let tabBar: BarLayout['tabBar'] = 'full';
  let compression: BarLayout['compression'] = 'none';
  let kept = railItems;
  let overflow: ToolbarItemSpec[] = [];

  if (!fits(railItems, false, fullTabBar)) {
    if (experience === 'task') {
      tabBar = 'minimized';
      compression = 'tab-bar-minimized';
      notes.push({
        kind: 'compression',
        message: 'Task-oriented screen: the tab bar is minimised so the toolbar actions stay visible.',
      });
    } else {
      compression = 'toolbar-overflow';
      notes.push({
        kind: 'compression',
        message: 'Navigation-focused screen: the tab bar stays; toolbar items move into the overflow menu.',
      });
    }
    const tabLength = tabBar === 'full' ? fullTabBar : spec.tabBarMinimized;
    kept = [...railItems];
    const weight = (i: ToolbarItemSpec) => (i.badge ? 1000 : 0) + i.priority;
    while (kept.length && !fits(kept, true, tabLength)) {
      let drop = kept[kept.length - 1];
      for (let i = kept.length - 1; i >= 0; i--) if (weight(kept[i]) < weight(drop)) drop = kept[i];
      kept = kept.filter((i) => i !== drop);
      overflow = [drop, ...overflow];
    }
    for (const item of overflow) {
      notes.push({
        kind: 'overflow',
        itemId: item.id,
        message: `"${item.title}" moved to the overflow menu (priority ${item.priority}${item.badge ? ', badged' : ''}).`,
      });
    }
  }

  const tabLength = tabBar === 'full' ? fullTabBar : spec.tabBarMinimized;
  const used =
    toolbarLength(kept, overflow.length > 0) + (kept.length || overflow.length ? spec.minGapBetweenBars : 0) + tabLength;
  if (used > available) {
    notes.push({
      kind: 'overfull',
      message: `Rail is ${used - available} ${unit} over budget (${used} of ${available} ${unit}) even after compression. With these estimated sizes the tab bar would also have to shrink. Check rail sizes in Device Hub.`,
    });
  }

  const rail = GROUP_ORDER.map((g) => kept.filter((i) => i.group === g)).filter((g) => g.length);
  return {
    axis: 'vertical',
    horizontal: textItems,
    rail,
    overflow,
    tabBar,
    compression,
    experience,
    budget: { available, toolbar: toolbarLength(kept, overflow.length > 0), tabBar: tabLength },
    notes,
  };
}
