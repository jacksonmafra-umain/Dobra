import { formatSizeClass, type Environment } from './environment';
import type { Layout } from './layout';

export interface Snapshot {
  label: string;
  env: Environment;
  layout: Layout;
}

/** Lists which rules kicked in between two states, for the "What changed" panel. */
export function describeChanges(prev: Snapshot, next: Snapshot, components?: string[]): string[] {
  const out: string[] = [];
  const a = prev.env;
  const b = next.env;
  const la = prev.layout;
  const lb = next.layout;

  if (a.width !== b.width || a.height !== b.height) out.push(`Size ${a.width}×${a.height} → ${b.width}×${b.height} pt`);
  if (a.orientation !== b.orientation) out.push(`Orientation ${a.orientation} → ${b.orientation}`);
  if (a.pose?.id !== b.pose?.id) out.push(`Pose ${a.pose?.label ?? '—'} → ${b.pose?.label ?? '—'}`);

  const fold = (e: Environment) =>
    e.fold ? `${e.fold.axis} (${e.fold.rect[e.fold.axis === 'vertical' ? 'width' : 'height']} pt)` : 'none';
  if (fold(a) !== fold(b)) out.push(`Folding region ${fold(a)} → ${fold(b)}`);

  const reserved = (e: Environment) => e.reservedRegions.map((r) => r.label).join(', ') || 'none';
  if (reserved(a) !== reserved(b)) out.push(`Reserved regions ${reserved(a)} → ${reserved(b)}`);

  if (a.sizeClass.horizontal !== b.sizeClass.horizontal || a.sizeClass.vertical !== b.sizeClass.vertical)
    out.push(`Size class ${formatSizeClass(a.sizeClass)} → ${formatSizeClass(b.sizeClass)}`);
  if (la.rule.id !== lb.rule.id) out.push(`Layout rule "${la.rule.label}" → "${lb.rule.label}"`);
  if (a.barAxis !== b.barAxis) out.push(`Bars ${a.barAxis} → ${b.barAxis}`);

  const sa = a.safeArea;
  const sb = b.safeArea;
  if (sa.top !== sb.top || sa.right !== sb.right || sa.bottom !== sb.bottom || sa.left !== sb.left)
    out.push(`Safe area T${sa.top} R${sa.right} B${sa.bottom} L${sa.left} → T${sb.top} R${sb.right} B${sb.bottom} L${sb.left}`);
  if (la.margin.left !== lb.margin.left || la.margin.right !== lb.margin.right)
    out.push(`Page margins ${la.margin.left}/${la.margin.right} → ${lb.margin.left}/${lb.margin.right}`);

  const onScreen = (id: string) => !components || components.includes(id);
  if (onScreen('news_story_hero') && (la.hero.variant !== lb.hero.variant || la.hero.bleed !== lb.hero.bleed))
    out.push(`news_story_hero ${la.hero.variant}/${la.hero.bleed} → ${lb.hero.variant}/${lb.hero.bleed}`);
  for (const id of Object.keys(la.perRow) as (keyof Layout['perRow'])[]) {
    if (onScreen(id) && la.perRow[id] !== lb.perRow[id]) out.push(`${id} ${la.perRow[id]} → ${lb.perRow[id]} per row`);
  }

  const ba = la.bars;
  const bb = lb.bars;
  if (a.barAxis === 'vertical' || b.barAxis === 'vertical') {
    const rail = (l: Layout) =>
      l.bars.rail
        .flat()
        .map((i) => i.id)
        .join(', ') || 'none';
    if (rail(la) !== rail(lb)) out.push(`Vertical toolbar [${rail(la)}] → [${rail(lb)}]`);
  }
  if (ba.tabBar !== bb.tabBar) out.push(`Tab bar ${ba.tabBar} → ${bb.tabBar}`);
  if (ba.compression !== bb.compression) out.push(`Bar compression ${ba.compression} → ${bb.compression}`);
  const oa = ba.overflow.map((i) => i.title).join(', ');
  const ob = bb.overflow.map((i) => i.title).join(', ');
  if (oa !== ob) out.push(`Overflow menu [${oa || 'empty'}] → [${ob || 'empty'}]`);
  if (la.railWidth !== lb.railWidth) out.push(`Trailing rail ${la.railWidth} → ${lb.railWidth} pt`);
  if (la.tabItem !== lb.tabItem && b.barAxis === 'horizontal') out.push(`tab_bar_26 items ${la.tabItem} → ${lb.tabItem}`);
  if (!la.foldGutter !== !lb.foldGutter)
    out.push(lb.foldGutter ? 'Even grids: middle gutter moves over the fold' : 'Grids: back to normal gutters');
  if (la.panes !== lb.panes) out.push(`Panes ${la.panes} → ${lb.panes}`);
  if (la.rule.grid.columns !== lb.rule.grid.columns)
    out.push(`Grid ${la.rule.grid.columns} → ${lb.rule.grid.columns} columns`);
  return out;
}
