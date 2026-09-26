import type { SimulatorConfig } from '../config/types';
import type { Environment } from './environment';
import { foldThickness } from './folds';
import type { Layout } from './layout';
import { formatSizeClass, sameSizeClass } from './sizeClass';

export interface Snapshot {
  label: string;
  env: Environment;
  layout: Layout;
}

/** Lists which rules kicked in between two states, for the "What changed" panel. */
export function describeChanges(config: SimulatorConfig, prev: Snapshot, next: Snapshot, components?: string[]): string[] {
  const out: string[] = [];
  const a = prev.env;
  const b = next.env;
  const la = prev.layout;
  const lb = next.layout;
  const u = b.unit;
  const android = config.platforms.android;

  if (a.platform !== b.platform) out.push(`Platform ${a.platform} → ${b.platform} (${a.unit} → ${b.unit})`);
  if (a.width !== b.width || a.height !== b.height) out.push(`Size ${a.width}×${a.height} ${a.unit} → ${b.width}×${b.height} ${u}`);
  if (a.orientation !== b.orientation) out.push(`Orientation ${a.orientation} → ${b.orientation}`);
  if (a.pose?.id !== b.pose?.id) out.push(`Pose ${a.pose?.label ?? '—'} → ${b.pose?.label ?? '—'}`);

  const folds = (e: Environment) =>
    e.folds.map((f) => `${f.axis} ${foldThickness(f)} ${e.unit}${f.separating ? ', separating' : ''}`).join('; ') || 'none';
  if (folds(a) !== folds(b)) out.push(`Folds ${folds(a)} → ${folds(b)}`);

  const reserved = (e: Environment) => e.reservedRegions.map((r) => r.label).join(', ') || 'none';
  if (reserved(a) !== reserved(b)) out.push(`Reserved regions ${reserved(a)} → ${reserved(b)}`);

  if (!sameSizeClass(a.sizeClass, b.sizeClass))
    out.push(`Size class ${formatSizeClass(a.sizeClass, android)} → ${formatSizeClass(b.sizeClass, android)}`);
  if (la.rule.id !== lb.rule.id) out.push(`Layout rule "${la.rule.label}" → "${lb.rule.label}"`);
  if (a.barAxis !== b.barAxis && a.barAxis && b.barAxis) out.push(`Bars ${a.barAxis} → ${b.barAxis}`);
  if (la.navigation.pattern !== lb.navigation.pattern) out.push(`Navigation ${la.navigation.pattern} → ${lb.navigation.pattern}`);

  const sa = a.safeArea;
  const sb = b.safeArea;
  if (sa.top !== sb.top || sa.right !== sb.right || sa.bottom !== sb.bottom || sa.left !== sb.left)
    out.push(`Insets T${sa.top} R${sa.right} B${sa.bottom} L${sa.left} → T${sb.top} R${sb.right} B${sb.bottom} L${sb.left}`);
  if (la.margin.left !== lb.margin.left || la.margin.right !== lb.margin.right)
    out.push(`Page margins ${la.margin.left}/${la.margin.right} → ${lb.margin.left}/${lb.margin.right}`);

  const onScreen = (id: string) => !components || components.includes(id);
  if (onScreen('news_story_hero') && (la.hero.variant !== lb.hero.variant || la.hero.bleed !== lb.hero.bleed))
    out.push(`news_story_hero ${la.hero.variant}/${la.hero.bleed} → ${lb.hero.variant}/${lb.hero.bleed}`);
  for (const id of Object.keys(lb.perRow)) {
    if (onScreen(id) && la.perRow[id] !== lb.perRow[id]) out.push(`${id} ${la.perRow[id] ?? '—'} → ${lb.perRow[id]} per row`);
  }

  const ba = la.bars;
  const bb = lb.bars;
  if (ba && bb) {
    if (a.barAxis === 'vertical' || b.barAxis === 'vertical') {
      const rail = (bars: typeof ba) => bars.rail.flat().map((i) => i.id).join(', ') || 'none';
      if (rail(ba) !== rail(bb)) out.push(`Vertical toolbar [${rail(ba)}] → [${rail(bb)}]`);
    }
    if (ba.tabBar !== bb.tabBar) out.push(`Tab bar ${ba.tabBar} → ${bb.tabBar}`);
    if (ba.compression !== bb.compression) out.push(`Bar compression ${ba.compression} → ${bb.compression}`);
    const oa = ba.overflow.map((i) => i.title).join(', ');
    const ob = bb.overflow.map((i) => i.title).join(', ');
    if (oa !== ob) out.push(`Overflow menu [${oa || 'empty'}] → [${ob || 'empty'}]`);
  }
  if (la.railWidth !== lb.railWidth) out.push(`Trailing rail ${la.railWidth} → ${lb.railWidth} ${u}`);
  if (la.leadingNav !== lb.leadingNav) out.push(`Leading ${lb.navigation.pattern} ${la.leadingNav} → ${lb.leadingNav} ${u}`);
  if (la.tabItem !== lb.tabItem && lb.navigation.edge === 'bottom') out.push(`tab_bar_26 items ${la.tabItem} → ${lb.tabItem}`);
  if (!la.foldGutter !== !lb.foldGutter)
    out.push(lb.foldGutter ? 'Even grids: middle gutter moves over the fold' : 'Grids: back to normal gutters');
  if (la.panes !== lb.panes) out.push(`Panes ${la.panes} → ${lb.panes}`);
  const sceneLabel = (l: Layout) => `${l.scene.strategy}${l.scene.fellBack ? ' (single)' : ''} · ${l.scene.panes.map((p) => p.role).join('+')}`;
  if (sceneLabel(la) !== sceneLabel(lb)) out.push(`Scene ${sceneLabel(la)} → ${sceneLabel(lb)}`);
  if (la.rule.grid.columns !== lb.rule.grid.columns) out.push(`Grid ${la.rule.grid.columns} → ${lb.rule.grid.columns} columns`);
  return out;
}
