// src/engine/checks.ts
// Layout checks that need no DOM. Findings use the Dobra shape and rule ids so the simulator, the
// Figma plugin and the CLI report the same thing.
import type { HeroRule, Orientation, Rect, ScreenSpec, SimulatorConfig } from '../config/types';
import type { Environment, Selection } from './environment';
import type { Layout } from './layout';

export type RuleId =
  | 'landscape-not-wide'
  | 'min-legible-width'
  | 'pane-split'
  | 'tabletop-controls'
  | 'touch-target'
  | 'chrome-overlap'
  | 'hinge-content'
  | 'overflow-x'
  | 'frame-size-mismatch'
  | 'resize-vs-reload'
  | 'fold-layout-missing'
  | 'fold-posture-mismatch';

export interface Target {
  deviceId: string;
  displayId: string;
  pose?: string;
  orientation: Orientation;
  rotation?: 0 | 90;
}

export interface Finding {
  ruleId: RuleId;
  severity: 'error' | 'warn' | 'info';
  target: Target;
  nodeId: string;
  rect: Rect;
  message: string;
  source: string;
  estimated: boolean;
}

/** The WindowSizeClass medium breakpoint: side-by-side layouts start here. */
const SIDE_BY_SIDE_MIN = 600;
/** Short windows where floating chrome eats the content (observed failure #3). Estimated. */
const SHORT_WINDOW = 480;

export function targetOf(sel: Selection, env: Environment): Target {
  return {
    deviceId: sel.deviceId,
    displayId: env.pose?.display ?? sel.displayId,
    ...(env.pose ? { pose: env.pose.id } : {}),
    orientation: env.orientation,
    ...(env.android ? { rotation: env.android.rotation } : {}),
  };
}

export function runLayoutChecks(
  config: SimulatorConfig,
  env: Environment,
  layout: Layout,
  screen: ScreenSpec,
  target: Target,
): Finding[] {
  const out: Finding[] = [];
  const u = env.unit;
  const whole: Rect = { x: 0, y: 0, width: env.width, height: env.height };
  const add = (f: Omit<Finding, 'target'>) => out.push({ ...f, target });
  const heroOnScreen = screen.components.includes('news_story_hero');
  const hero = layout.hero as HeroRule;

  // 1. landscape-not-wide
  if (env.width < SIDE_BY_SIDE_MIN) {
    if (heroOnScreen && hero.variant === 'split')
      add({
        ruleId: 'landscape-not-wide',
        severity: 'error',
        nodeId: 'news_story_hero',
        rect: whole,
        message: `Rule "${layout.rule.id}" puts news_story_hero side by side in a ${env.width} ${u} window (${env.orientation}); side-by-side needs ${SIDE_BY_SIDE_MIN} ${u}.`,
        source: 'androidx-window',
        estimated: false,
      });
    if (layout.scene.panes.length > 1 && env.regions.length < 2)
      add({
        ruleId: 'landscape-not-wide',
        severity: 'error',
        nodeId: `scene:${layout.scene.id}`,
        rect: whole,
        message: `${layout.scene.strategy} shows ${layout.scene.panes.length} panes in a ${env.width} ${u} window.`,
        source: 'androidx-window',
        estimated: false,
      });
  }

  // 2. min-legible-width: the width chain for the hero text and for grid items
  if (heroOnScreen && hero.variant === 'split') {
    const spec = config.components.news_story_hero;
    const split = spec?.split;
    const min = spec?.minLegibleWidth;
    if (split && min) {
      const text = Math.round(layout.contentWidth * (1 - split.imageFraction) - split.textPadding);
      if (text < min)
        add({
          ruleId: 'min-legible-width',
          severity: 'warn',
          nodeId: 'news_story_hero',
          rect: whole,
          message: `${env.width} ${u} window → ${Math.round(layout.contentWidth)} ${u} content → hero text ${text} ${u} < ${min} ${u} (margins ${layout.margin.left}/${layout.margin.right}, image ${split.imageFraction * 100}%).`,
          source: spec.source ?? 'estimated',
          estimated: true,
        });
    }
  }
  for (const id of screen.components) {
    const r = layout.resolved[id];
    const min = config.components[id]?.minLegibleWidth;
    if (!r || !min) continue;
    const narrowest = Math.min(...r.items.map((i) => i.width));
    if (narrowest < min)
      add({
        ruleId: 'min-legible-width',
        severity: 'warn',
        nodeId: id,
        rect: whole,
        message: `${id} items are ${Math.round(narrowest)} ${u} wide (${r.form}); legible from ${min} ${u}.`,
        source: config.components[id].source ?? 'estimated',
        estimated: true,
      });
  }
  const textMin = config.scenes?.[layout.scene.id]?.textMinWidth;
  if (textMin) {
    for (const pane of layout.scene.panes) {
      if (pane.rect.width < textMin)
        add({
          ruleId: 'min-legible-width',
          severity: 'warn',
          nodeId: `pane:${pane.role}`,
          rect: pane.rect,
          message: `The ${pane.role} pane is ${Math.round(pane.rect.width)} ${u} wide; its text reads from ${textMin} ${u}.`,
          source: config.scenes![layout.scene.id].source,
          estimated: true,
        });
    }
  }

  // 3. chrome-overlap
  if (layout.navigation.floating && env.height < SHORT_WINDOW)
    add({
      ruleId: 'chrome-overlap',
      severity: 'warn',
      nodeId: 'navigation_bar',
      rect: { x: 0, y: env.height - layout.navigation.size, width: env.width, height: layout.navigation.size },
      message: `A floating ${layout.navigation.size} ${u} bar covers content in a ${env.height} ${u} tall window.`,
      source: 'estimated',
      estimated: true,
    });

  // 4. pane-split: no pane may straddle a separating hinge
  for (const fold of env.folds.filter((f) => f.separating)) {
    const at = fold.axis === 'vertical' ? fold.rect.x : fold.rect.y;
    const straddles = layout.scene.panes.find((p) =>
      fold.axis === 'vertical' ? p.rect.x < at && p.rect.x + p.rect.width > at : p.rect.y < at && p.rect.y + p.rect.height > at,
    );
    if (straddles)
      add({
        ruleId: 'pane-split',
        severity: 'error',
        nodeId: `pane:${straddles.role}`,
        rect: straddles.rect,
        message: `The ${straddles.role} pane crosses a separating ${fold.axis} hinge; split at the FoldingFeature bounds.`,
        source: env.platform === 'android' ? 'androidx-window' : 'estimated',
        estimated: fold.estimated,
      });
  }

  // 5. tabletop-controls
  // A single-pane screen split by the hinge shows up as main + spare: nothing decides what goes below the fold.
  // A screen with no declared scene only inherits panes from its rule; nothing places its content by the fold.
  const unarranged = !screen.scene || layout.scene.panes.length < 2 || layout.scene.panes.some((p) => p.role === 'spare');
  if (layout.posture === 'tabletop' && unarranged)
    add({
      ruleId: 'tabletop-controls',
      severity: 'info',
      nodeId: `scene:${layout.scene.id}`,
      rect: whole,
      message: 'Tabletop posture, but this screen does not arrange content on top and controls at the bottom of the fold.',
      source: 'material3',
      estimated: true,
    });

  return out;
}
