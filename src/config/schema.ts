// Schema for simulator.config.json. The config is the product: it is validated on load, and any
// problem is reported with the path of the offending value.
import { z } from 'zod';

const num = z.number();
const pos = z.number().positive();
const nonNeg = z.number().min(0);
const size = z.strictObject({ width: pos, height: pos });
const sourceRef = z.string();

export const PLATFORMS = ['ios', 'android'] as const;
export type Platform = (typeof PLATFORMS)[number];

// ---------------------------------------------------------------------------------------------
// Platform profiles: the vocabulary each platform brings (units, size classes, navigation).

const guidance = z.strictObject({ name: z.string(), url: z.string() });

const breakpoint = z.strictObject({ id: z.string(), label: z.string(), min: nonNeg });

const fontScale = z.strictObject({
  min: pos,
  max: pos,
  step: pos,
  /** Android 14+ scales large text less than small text (FontScaleConverter). */
  nonLinear: z
    .strictObject({
      fromSp: z.array(pos).min(2),
      tables: z.record(z.string(), z.array(pos).min(2)),
      source: sourceRef,
    })
    .optional(),
  source: sourceRef,
});

const iosProfile = z.strictObject({
  label: z.string(),
  unit: z.literal('pt'),
  typeUnit: z.literal('pt'),
  guidance,
  sizeClasses: z.strictObject({
    system: z.literal('uikit'),
    free: z.strictObject({ regularWidthMin: pos, regularHeightMin: pos }),
  }),
  freeResize: z.strictObject({ barAxis: z.enum(['horizontal', 'vertical']) }),
  verticalBars: z.strictObject({
    estimated: z.boolean(),
    railWidth: num,
    statusRegion: num,
    toolbarItem: num,
    groupGap: num,
    overflowButton: num,
    tabItem: num,
    tabItemGap: num,
    tabBarMinimized: num,
    minGapBetweenBars: num,
  }),
  fold: z.strictObject({
    balanceMargins: z.boolean(),
    evenGridGutterAtFold: z.boolean(),
    modalPlacement: z.strictObject({ vertical: z.string(), horizontal: z.string() }),
  }),
  fontScale: fontScale.optional(),
});

const navigationPattern = z.enum(['bar', 'rail', 'drawer']);

const androidProfile = z.strictObject({
  label: z.string(),
  unit: z.literal('dp'),
  typeUnit: z.literal('sp'),
  guidance,
  sizeClasses: z.strictObject({
    system: z.literal('window'),
    width: z.array(breakpoint).min(1),
    height: z.array(breakpoint).min(1),
    source: sourceRef,
  }),
  navigation: z.strictObject({
    rules: z
      .array(
        z.strictObject({
          when: z.strictObject({
            width: z.array(z.string()).optional(),
            height: z.array(z.string()).optional(),
            posture: z.enum(['tabletop', 'book']).optional(),
          }),
          pattern: navigationPattern,
          source: sourceRef,
        }),
      )
      .min(1),
    bar: z.strictObject({ height: pos, floating: z.boolean(), inset: nonNeg, source: sourceRef }),
    rail: z.strictObject({ width: pos, source: sourceRef }),
    drawer: z.strictObject({ width: pos, source: sourceRef }),
  }),
  fold: z.strictObject({
    splitAtHinge: z.boolean(),
    avoidOcclusion: z.boolean(),
    tabletop: z.strictObject({ topPane: z.string(), bottomPane: z.string(), source: sourceRef }),
    source: sourceRef,
  }),
  fontScale: fontScale.optional(),
});

// ---------------------------------------------------------------------------------------------
// iOS devices.

const sizeClassValue = z.enum(['compact', 'regular']);
const orientation = z.enum(['portrait', 'landscape']);
const anchor = z.enum(['top-left', 'top-right']);

const safeArea = z.strictObject({ top: nonNeg, right: nonNeg, bottom: nonNeg, left: nonNeg, source: sourceRef });

const iosOrientationSpec = z.strictObject({
  sizeClass: z.strictObject({ horizontal: sizeClassValue, vertical: sizeClassValue, estimated: z.boolean().optional() }),
  barAxis: z.enum(['horizontal', 'vertical']),
  safeArea,
  statusBar: z.boolean(),
});

const reservedRegion = z.strictObject({
  id: z.string(),
  label: z.string(),
  when: z.enum(['always', 'camera-active']),
  anchor: z.union([anchor, z.strictObject({ portrait: anchor.optional(), landscape: anchor.optional() })]),
  width: pos,
  height: pos,
  offsetTop: nonNeg,
  liveActivity: z.strictObject({ width: pos, height: pos, offsetTop: nonNeg }).optional(),
  estimated: z.boolean().optional(),
});

const iosDisplay = z.strictObject({
  label: z.string(),
  portraitSize: size,
  pixels: size.optional(),
  scale: pos,
  estimated: z.boolean(),
  cornerRadius: nonNeg,
  homeIndicator: z.boolean(),
  orientations: z.strictObject({ portrait: iosOrientationSpec.optional(), landscape: iosOrientationSpec.optional() }),
  hardware: z.strictObject({
    dynamicIsland: z.strictObject({ width: num, height: num, offset: num }).nullable(),
    camera: z.strictObject({ diameter: num, region: num }).optional(),
    fold: z.strictObject({ width: nonNeg, estimated: z.boolean().optional() }).optional(),
  }),
  reservedRegions: z.array(reservedRegion).optional(),
});

const iosPose = z.strictObject({
  id: z.string(),
  label: z.string(),
  display: z.string(),
  folded: z.boolean(),
  orientations: z.array(orientation).min(1),
  estimated: z.boolean().optional(),
});

const iosDevice = z.strictObject({
  id: z.string(),
  platform: z.literal('ios'),
  name: z.string(),
  enabled: z.boolean(),
  displays: z.record(z.string(), iosDisplay),
  poses: z.array(iosPose).optional(),
});

// ---------------------------------------------------------------------------------------------
// Layout rules, keyed by either platform's size-class vocabulary.

const gridRule = z.strictObject({ perRow: z.number().int().positive(), minItemWidth: pos.optional(), maxItemWidth: pos.optional() });
const heroRule = z.strictObject({ variant: z.enum(['stacked', 'split']), bleed: z.enum(['full', 'inset']) });
const tabBarRule = z.strictObject({ item: z.enum(['stacked', 'inline']) });
const carouselRule = z.strictObject({ mode: z.literal('carousel') });

const RULE_BY_KIND = { grid: gridRule, hero: heroRule, 'tab-bar': tabBarRule, carousel: carouselRule } as const;
export type ComponentKind = keyof typeof RULE_BY_KIND;

const layoutRule = z.strictObject({
  id: z.string(),
  label: z.string(),
  platform: z.enum(PLATFORMS),
  match: z.strictObject({
    // iOS (UIKit) vocabulary
    horizontal: sizeClassValue.optional(),
    vertical: sizeClassValue.optional(),
    // Android (WindowSizeClass) vocabulary
    width: z.array(z.string()).min(1).optional(),
    height: z.array(z.string()).min(1).optional(),
    // Either platform. Keying a layout on orientation is what the landscape ≠ wide check flags.
    orientation: orientation.optional(),
  }),
  pageMargin: z.strictObject({ base: nonNeg, mode: z.enum(['max', 'add']) }),
  grid: z.strictObject({ columns: z.number().int().positive(), gutter: nonNeg, proposed: z.boolean().optional() }),
  panes: z.number().int().positive(),
  components: z.record(z.string(), z.union([gridRule, heroRule, tabBarRule, carouselRule])),
  source: sourceRef.optional(),
});

const componentSpec = z.strictObject({
  kind: z.enum(['grid', 'hero', 'tab-bar', 'carousel']),
  gap: nonNeg.optional(),
  split: z.strictObject({ imageFraction: z.number().gt(0).lt(1), textPadding: nonNeg }).optional(),
  minLegibleWidth: pos.optional(),
  source: sourceRef.optional(),
});

// ---------------------------------------------------------------------------------------------
// Screens.

const toolbarItem = z.strictObject({
  id: z.string(),
  title: z.string(),
  symbol: z.string().nullable(),
  label: z.enum(['symbol', 'text']),
  group: z.enum(['navigation', 'prominent', 'secondary']),
  priority: num,
  badge: z.boolean().optional(),
});

const screen = z.strictObject({
  id: z.string(),
  name: z.string(),
  experience: z.enum(['navigation', 'task']),
  tab: z.string(),
  enabled: z.boolean(),
  figma: z.strictObject({ portrait: z.string().optional(), landscape: z.string().optional() }).nullable(),
  source: z.string().optional(),
  components: z.array(z.string()),
  toolbar: z.strictObject({
    component: z.enum(['app_toolbar', 'toolbar']),
    logo: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
    items: z.array(toolbarItem),
  }),
});

const tabItem = z.strictObject({ id: z.string(), title: z.string(), icon: z.string(), iconSelected: z.string().optional() });

// ---------------------------------------------------------------------------------------------

export const configSchema = z
  .strictObject({
    version: z.string(),
    figmaFile: z.string(),
    sources: z.record(z.string(), z.string()),
    platforms: z.strictObject({ ios: iosProfile, android: androidProfile }),
    components: z.record(z.string(), componentSpec),
    devices: z.array(iosDevice).min(1),
    layoutRules: z.array(layoutRule).min(1),
    tabBar: z.strictObject({ component: z.string(), items: z.array(tabItem).min(1) }),
    screens: z.array(screen).min(1),
  })
  .superRefine((cfg, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const sources = new Set([...Object.keys(cfg.sources), 'free-resize']);
    const checkSource = (value: string | undefined, path: (string | number)[]) => {
      if (value !== undefined && !sources.has(value)) issue(path, `Unknown source "${value}"; add it to "sources"`);
    };
    const unique = (ids: string[], path: string) => {
      const seen = new Set<string>();
      ids.forEach((id, i) => {
        if (seen.has(id)) issue([path, i, 'id'], `Duplicate id "${id}"`);
        seen.add(id);
      });
    };
    unique(cfg.devices.map((d) => d.id), 'devices');
    unique(cfg.screens.map((s) => s.id), 'screens');
    unique(cfg.layoutRules.map((r) => r.id), 'layoutRules');

    const android = cfg.platforms.android;
    checkSource(android.sizeClasses.source, ['platforms', 'android', 'sizeClasses', 'source']);
    android.navigation.rules.forEach((r, i) => checkSource(r.source, ['platforms', 'android', 'navigation', 'rules', i, 'source']));
    const widthIds = new Set(android.sizeClasses.width.map((b) => b.id));
    const heightIds = new Set(android.sizeClasses.height.map((b) => b.id));
    const checkClasses = (ids: string[] | undefined, known: Set<string>, path: (string | number)[]) =>
      ids?.forEach((id, i) => {
        if (!known.has(id)) issue([...path, i], `Unknown window size class "${id}"; known: ${[...known].join(', ')}`);
      });
    android.navigation.rules.forEach((r, i) => {
      checkClasses(r.when.width, widthIds, ['platforms', 'android', 'navigation', 'rules', i, 'when', 'width']);
      checkClasses(r.when.height, heightIds, ['platforms', 'android', 'navigation', 'rules', i, 'when', 'height']);
    });
    for (const axis of ['width', 'height'] as const) {
      const list = android.sizeClasses[axis];
      list.forEach((b, i) => {
        if (i === 0 ? b.min !== 0 : b.min <= list[i - 1].min)
          issue(['platforms', 'android', 'sizeClasses', axis, i, 'min'], i === 0 ? 'The first breakpoint must start at 0' : 'Breakpoints must increase');
      });
    }

    for (const [id, c] of Object.entries(cfg.components)) {
      checkSource(c.source, ['components', id, 'source']);
      if (c.kind === 'grid' && c.gap === undefined) issue(['components', id, 'gap'], 'Grid components need a gap');
    }

    cfg.devices.forEach((d, di) => {
      for (const [displayId, disp] of Object.entries(d.displays)) {
        for (const [o, spec] of Object.entries(disp.orientations)) {
          if (spec) checkSource(spec.safeArea.source, ['devices', di, 'displays', displayId, 'orientations', o, 'safeArea', 'source']);
        }
      }
      d.poses?.forEach((p, pi) => {
        if (!d.displays[p.display]) issue(['devices', di, 'poses', pi, 'display'], `Pose uses display "${p.display}", which device "${d.id}" does not have`);
      });
    });

    const fallbacks = new Set<string>();
    cfg.layoutRules.forEach((r, ri) => {
      const path = ['layoutRules', ri];
      checkSource(r.source, [...path, 'source']);
      const m = r.match;
      if (r.platform === 'ios' && (m.width || m.height))
        issue([...path, 'match'], 'An iOS rule is keyed by UIKit size classes (horizontal/vertical), not width/height classes');
      if (r.platform === 'android' && (m.horizontal || m.vertical))
        issue([...path, 'match'], 'An Android rule is keyed by window size classes (width/height), not compact/regular');
      checkClasses(m.width, widthIds, [...path, 'match', 'width']);
      checkClasses(m.height, heightIds, [...path, 'match', 'height']);
      if (Object.keys(m).length === 0) fallbacks.add(r.platform);
      else if (fallbacks.has(r.platform)) issue([...path], `Rule "${r.id}" comes after the ${r.platform} fallback, so it never matches`);
      for (const [id, spec] of Object.entries(cfg.components)) {
        const value = r.components[id];
        if (!value) {
          issue([...path, 'components'], `Missing settings for component "${id}"`);
          continue;
        }
        const parsed = RULE_BY_KIND[spec.kind].safeParse(value);
        if (!parsed.success) issue([...path, 'components', id], `Settings do not fit a ${spec.kind} component: ${parsed.error.issues[0].message}`);
      }
      for (const id of Object.keys(r.components)) {
        if (!cfg.components[id]) issue([...path, 'components', id], `Unknown component "${id}"; add it to "components"`);
      }
    });
    for (const p of PLATFORMS) {
      if (!fallbacks.has(p)) issue(['layoutRules'], `Add a ${p} fallback rule with "match": {} after the other ${p} rules`);
    }

    const tabs = new Set(cfg.tabBar.items.map((t) => t.id));
    cfg.screens.forEach((s, si) => {
      if (!tabs.has(s.tab)) issue(['screens', si, 'tab'], `Screen "${s.id}" selects tab "${s.tab}", which the tab bar does not have`);
      if (!s.figma && !s.source) issue(['screens', si, 'source'], `Screen "${s.id}" has no Figma frame, so it needs a "source" explaining where it comes from`);
      s.components.forEach((c, ci) => {
        if (!cfg.components[c]) issue(['screens', si, 'components', ci], `Unknown component "${c}"`);
      });
    });
  });

export type SimulatorConfig = z.infer<typeof configSchema>;
export type GridRule = z.infer<typeof gridRule>;
export type HeroRule = z.infer<typeof heroRule>;
export type TabBarRule = z.infer<typeof tabBarRule>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`simulator.config.json is invalid:\n${issues.map((i) => `  • ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Keys starting with "$" are comments ("$comment", "$note", …) and are ignored. */
export function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !k.startsWith('$'))
        .map(([k, v]) => [k, stripComments(v)]),
    );
  }
  return value;
}

export function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((out, key) => (typeof key === 'number' ? `${out}[${key}]` : out ? `${out}.${String(key)}` : String(key)), '');
}

/** Validates raw config JSON and throws a ConfigError listing every problem with its path. */
export function parseConfig(raw: unknown): SimulatorConfig {
  const result = configSchema.safeParse(stripComments(raw));
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${formatPath(i.path) || '(root)'}: ${i.message}`));
  }
  return result.data;
}
