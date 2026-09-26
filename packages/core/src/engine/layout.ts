import type { GridRule, HeroRule, LayoutRule, Rect, ScreenSpec, SimulatorConfig, TabBarRule } from '../config/types';
import { resolveBars, type BarLayout } from './bars';
import type { Environment } from './environment';
import { separatingFold, type FoldFeature } from './folds';

export type NavigationPattern = 'tab-bar' | 'ios-rail' | 'bar' | 'rail' | 'drawer';

/** Where the app's primary navigation goes. iOS and Android decide this differently. */
export interface Navigation {
  pattern: NavigationPattern;
  edge: 'bottom' | 'leading' | 'trailing';
  /** Height of a bottom bar, width of a rail or drawer. */
  size: number;
  /** Drawn over the content instead of taking space from it. */
  floating: boolean;
  /** Gap between a floating bar and the window edge. */
  inset: number;
  source?: string;
}

export type Posture = 'flat' | 'book' | 'tabletop';

export interface Layout {
  rule: LayoutRule;
  /** Physical page margins in LTR, including any rail or drawer. */
  margin: { left: number; right: number };
  contentWidth: number;
  panes: number;
  /** Pane rectangles in window coordinates. Split at the hinge when a fold separates the window. */
  paneRects: Rect[];
  hero: HeroRule;
  perRow: Record<string, number>;
  maxItemWidth: Record<string, number | null>;
  gap: Record<string, number>;
  tabItem: TabBarRule['item'];
  /** iOS bar compression; null on Android, where navigation takes its place. */
  bars: BarLayout | null;
  navigation: Navigation;
  /** iOS trailing rail width (iPhone Duo). */
  railWidth: number;
  /** Android rail or drawer on the leading edge. */
  leadingNav: number;
  fold: FoldFeature | null;
  posture: Posture;
  marginsBalanced: boolean;
  foldGutter: number | null;
}

export function postureOf(env: Environment): Posture {
  const fold = separatingFold(env);
  if (!fold) return 'flat';
  return fold.axis === 'horizontal' ? 'tabletop' : 'book';
}

export function ruleMatches(rule: LayoutRule, env: Environment): boolean {
  if (rule.platform !== env.platform) return false;
  const m = rule.match;
  const sc = env.sizeClass;
  if (m.orientation && m.orientation !== env.orientation) return false;
  if (sc.system === 'uikit') {
    if (m.horizontal && m.horizontal !== sc.horizontal) return false;
    if (m.vertical && m.vertical !== sc.vertical) return false;
  } else {
    if (m.width && !m.width.includes(sc.width)) return false;
    if (m.height && !m.height.includes(sc.height)) return false;
  }
  return true;
}

export function matchRule(config: SimulatorConfig, env: Environment): LayoutRule {
  const rule = config.layoutRules.find((r) => ruleMatches(r, env));
  if (!rule) throw new Error(`No ${env.platform} layout rule matched. Add a ${env.platform} rule with "match": {} as a fallback.`);
  return rule;
}

export function resolveNavigation(config: SimulatorConfig, env: Environment): Navigation {
  if (env.platform === 'ios') {
    return env.barAxis === 'vertical'
      ? { pattern: 'ios-rail', edge: 'trailing', size: config.platforms.ios.verticalBars.railWidth, floating: false, inset: 0 }
      : { pattern: 'tab-bar', edge: 'bottom', size: 0, floating: false, inset: 0 };
  }
  const nav = config.platforms.android.navigation;
  const sc = env.sizeClass;
  const posture = postureOf(env);
  const rule = nav.rules.find((r) => {
    if (r.when.posture && r.when.posture !== posture) return false;
    if (sc.system !== 'window') return false;
    if (r.when.width && !r.when.width.includes(sc.width)) return false;
    if (r.when.height && !r.when.height.includes(sc.height)) return false;
    return true;
  });
  const pattern = rule?.pattern ?? 'bar';
  if (pattern === 'bar')
    return { pattern, edge: 'bottom', size: nav.bar.height, floating: nav.bar.floating, inset: nav.bar.inset, source: rule?.source ?? nav.bar.source };
  const spec = pattern === 'rail' ? nav.rail : nav.drawer;
  return { pattern, edge: 'leading', size: spec.width, floating: false, inset: 0, source: rule?.source ?? spec.source };
}

export function resolveLayout(config: SimulatorConfig, env: Environment, screen: ScreenSpec): Layout {
  const rule = matchRule(config, env);
  const { base, mode } = rule.pageMargin;
  const marginFor = (inset: number) => (mode === 'max' ? Math.max(base, inset) : inset + base);
  const navigation = resolveNavigation(config, env);
  const ios = config.platforms.ios;

  const railWidth = navigation.pattern === 'ios-rail' ? Math.max(ios.verticalBars.railWidth, env.safeArea.right) : 0;
  const leadingNav = navigation.edge === 'leading' ? navigation.size : 0;
  const margin = {
    left: leadingNav ? env.safeArea.left + leadingNav + base : marginFor(env.safeArea.left),
    right: railWidth ? railWidth + base : marginFor(env.safeArea.right),
  };

  const fold = separatingFold(env);
  const verticalFold = fold?.axis === 'vertical' ? fold : null;
  // HIG: balance margins around the fold. Material has no such rule; Android splits at the hinge instead.
  const balance = env.platform === 'ios' && ios.fold.balanceMargins;
  const marginsBalanced = !!verticalFold && balance && margin.left !== margin.right;
  if (verticalFold && balance) {
    const m = Math.max(margin.left, margin.right);
    margin.left = m;
    margin.right = m;
  }

  const contentWidth = env.width - margin.left - margin.right;
  const foldGutter = env.platform === 'ios' && verticalFold && ios.fold.evenGridGutterAtFold ? verticalFold.rect.width : 0;

  const perRow: Record<string, number> = {};
  const maxItemWidth: Record<string, number | null> = {};
  const gap: Record<string, number> = {};
  for (const [id, spec] of Object.entries(config.components)) {
    if (spec.kind !== 'grid') continue;
    const c = rule.components[id] as GridRule;
    const g = spec.gap ?? 0;
    const fit = c.minItemWidth ? Math.max(1, Math.floor((contentWidth - foldGutter + g) / (c.minItemWidth + g))) : c.perRow;
    perRow[id] = Math.min(c.perRow, fit);
    maxItemWidth[id] = c.maxItemWidth ?? null;
    gap[id] = g;
  }

  const panes = env.regions.length > 1 ? env.regions.length : rule.panes;
  const paneRects = resolvePanes(env, margin, panes);

  return {
    rule,
    margin,
    contentWidth,
    panes,
    paneRects,
    hero: rule.components.news_story_hero as HeroRule,
    perRow,
    maxItemWidth,
    gap,
    tabItem: (rule.components.tab_bar_26 as TabBarRule).item,
    bars: env.platform === 'ios' ? resolveBars(config, env, screen) : null,
    navigation,
    railWidth,
    leadingNav,
    fold,
    posture: postureOf(env),
    marginsBalanced,
    foldGutter: foldGutter || null,
  };
}

/** Panes follow the logical areas when a fold separates the window, otherwise split the content evenly. */
function resolvePanes(env: Environment, margin: Layout['margin'], panes: number): Rect[] {
  if (env.regions.length > 1) return env.regions;
  const x = margin.left;
  const width = env.width - margin.left - margin.right;
  if (panes <= 1) return [{ x, y: 0, width, height: env.height }];
  const w = width / panes;
  return Array.from({ length: panes }, (_, i) => ({ x: x + i * w, y: 0, width: w, height: env.height }));
}
