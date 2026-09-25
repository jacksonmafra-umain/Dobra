import { GRID_COMPONENTS, type GridComponentId, type LayoutRule, type ScreenSpec, type SimulatorConfig } from '../config/types';
import { resolveBars, type BarLayout } from './bars';
import type { Environment, FoldRegion } from './environment';

/** Gap between items of each grid component (points). */
export const COMPONENT_GAP: Record<GridComponentId, number> = {
  action_card: 12,
  shortcut_card_item: 12,
  news_story_card: 24,
  reward_card: 16,
  deal_card: 24,
  bonus_campaign_banner: 12,
};

export interface Layout {
  rule: LayoutRule;
  margin: { left: number; right: number };
  contentWidth: number;
  panes: number;
  hero: LayoutRule['components']['news_story_hero'];
  perRow: Record<GridComponentId, number>;
  maxItemWidth: Record<GridComponentId, number | null>;
  gap: Record<GridComponentId, number>;
  tabItem: LayoutRule['components']['tab_bar_26']['item'];
  restaurantMode: LayoutRule['components']['restaurant-card-small']['mode'];
  bars: BarLayout;
  railWidth: number;
  fold: FoldRegion | null;
  marginsBalanced: boolean;
  foldGutter: number | null;
}

export function matchRule(config: SimulatorConfig, env: Environment): LayoutRule {
  const rule = config.layoutRules.find(
    (r) =>
      (!r.match.horizontal || r.match.horizontal === env.sizeClass.horizontal) &&
      (!r.match.vertical || r.match.vertical === env.sizeClass.vertical),
  );
  if (!rule) throw new Error('No layout rule matched. Add a rule with "match": {} as a fallback.');
  return rule;
}

export function resolveLayout(config: SimulatorConfig, env: Environment, screen: ScreenSpec): Layout {
  const rule = matchRule(config, env);
  const { base, mode } = rule.pageMargin;
  const marginFor = (inset: number) => (mode === 'max' ? Math.max(base, inset) : inset + base);
  const railWidth = env.barAxis === 'vertical' ? Math.max(config.verticalBars.railWidth, env.safeArea.right) : 0;
  const margin = {
    left: marginFor(env.safeArea.left),
    right: railWidth ? railWidth + base : marginFor(env.safeArea.right),
  };

  const verticalFold = env.fold?.axis === 'vertical' ? env.fold : null;
  const marginsBalanced = !!verticalFold && config.fold.balanceMargins && margin.left !== margin.right;
  if (verticalFold && config.fold.balanceMargins) {
    const m = Math.max(margin.left, margin.right);
    margin.left = m;
    margin.right = m;
  }

  const contentWidth = env.width - margin.left - margin.right;
  const foldGutter = verticalFold && config.fold.evenGridGutterAtFold ? verticalFold.rect.width : 0;
  const perRow = {} as Record<GridComponentId, number>;
  const maxItemWidth = {} as Record<GridComponentId, number | null>;
  for (const id of GRID_COMPONENTS) {
    const c = rule.components[id];
    const gap = COMPONENT_GAP[id];
    const fit = c.minItemWidth
      ? Math.max(1, Math.floor((contentWidth - foldGutter + gap) / (c.minItemWidth + gap)))
      : c.perRow;
    perRow[id] = Math.min(c.perRow, fit);
    maxItemWidth[id] = c.maxItemWidth ?? null;
  }

  return {
    rule,
    margin,
    contentWidth,
    panes: rule.panes,
    hero: rule.components.news_story_hero,
    perRow,
    maxItemWidth,
    gap: COMPONENT_GAP,
    tabItem: rule.components.tab_bar_26.item,
    restaurantMode: rule.components['restaurant-card-small'].mode,
    bars: resolveBars(config, env, screen),
    railWidth,
    fold: env.fold,
    marginsBalanced,
    foldGutter: foldGutter || null,
  };
}
