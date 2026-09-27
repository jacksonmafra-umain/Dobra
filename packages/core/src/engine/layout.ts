import type { FlexFormRule, GridFormRule, GridRule, HeroRule, LayoutRule, ScreenSpec, SimulatorConfig, TabBarRule } from '../config/types';
import { resolveBars, type BarLayout } from './bars';
import type { Environment } from './environment';
import { separatingFold, type FoldFeature } from './folds';
import { resolveFlex, resolveTracks, type ResolvedItems } from './gridFlex';
import { resolveScene, type SceneLayout } from './scenes';

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
  /** Resolved pane strategy; its panes replace the old pane rectangles. */
  scene: SceneLayout;
  hero: HeroRule;
  perRow: Record<string, number>;
  /** Item widths per grid component, from its perRow, grid or flex form. The width checks read these. */
  resolved: Record<string, ResolvedItems>;
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
  if (m.pointer && m.pointer !== env.media.pointer) return false;
  if (m.keyboard && m.keyboard !== env.media.keyboard) return false;
  if (m.viewingDistance && m.viewingDistance !== env.media.viewingDistance) return false;
  if (sc.system === 'uikit') {
    if (m.horizontal && m.horizontal !== sc.horizontal) return false;
    if (m.vertical && m.vertical !== sc.vertical) return false;
  } else {
    if (m.width && !m.width.includes(sc.width)) return false;
    if (m.height && !m.height.includes(sc.height)) return false;
  }
  return true;
}

/** The first layout rule that fits the window, or null when none does. */
export function matchRuleOrNull(config: SimulatorConfig, env: Environment): LayoutRule | null {
  return config.layoutRules.find((r) => ruleMatches(r, env)) ?? null;
}

export function matchRule(config: SimulatorConfig, env: Environment): LayoutRule {
  const rule = matchRuleOrNull(config, env);
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
  const resolved: Record<string, ResolvedItems> = {};
  for (const [id, spec] of Object.entries(config.components)) {
    if (spec.kind !== 'grid') continue;
    const entry = rule.components[id] as GridRule | GridFormRule | FlexFormRule;
    const g = spec.gap ?? 0;
    const count = spec.items ?? 6;
    if ('grid' in entry) {
      const columnWidths = resolveTracks(entry.grid.columns, contentWidth, entry.grid.gap);
      perRow[id] = columnWidths.length;
      maxItemWidth[id] = null;
      gap[id] = entry.grid.gap;
      resolved[id] = {
        form: 'grid',
        columnWidths,
        items: Array.from({ length: count }, (_, i) => ({ width: columnWidths[i % columnWidths.length] })),
        lines: Math.ceil(count / columnWidths.length),
        gap: entry.grid.gap,
      };
      continue;
    }
    if ('flex' in entry) {
      const { widths, lines } = resolveFlex(entry.flex, contentWidth, count);
      perRow[id] = Math.ceil(count / lines);
      maxItemWidth[id] = null;
      gap[id] = entry.flex.gap;
      resolved[id] = { form: 'flex', columnWidths: [], items: widths.map((width) => ({ width })), lines, gap: entry.flex.gap };
      continue;
    }
    const fit = entry.minItemWidth ? Math.max(1, Math.floor((contentWidth - foldGutter + g) / (entry.minItemWidth + g))) : entry.perRow;
    perRow[id] = Math.min(entry.perRow, fit);
    maxItemWidth[id] = entry.maxItemWidth ?? null;
    gap[id] = g;
    const width = Math.min((contentWidth - g * (perRow[id] - 1)) / perRow[id], entry.maxItemWidth ?? Infinity);
    resolved[id] = {
      form: 'perRow',
      columnWidths: Array(perRow[id]).fill(width),
      items: Array.from({ length: count }, () => ({ width })),
      lines: Math.ceil(count / perRow[id]),
      gap: g,
    };
  }

  const content = { x: margin.left, y: 0, width: contentWidth, height: env.height };
  // A screen without a scene keeps what its rule's pane count always meant.
  const sceneId = screen.scene ?? (rule.panes > 1 ? 'two-pane' : 'single');
  const scene = resolveScene({
    id: sceneId,
    spec: config.scenes?.[sceneId] ?? null,
    content,
    regions: env.regions.length > 1 ? env.regions : [],
    forceSingle: rule.scene === 'single',
    unit: env.unit,
  });

  return {
    rule,
    margin,
    contentWidth,
    panes: scene.panes.length,
    scene,
    hero: rule.components.news_story_hero as HeroRule,
    perRow,
    resolved,
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
