// Schema for simulator.config.json. The config is the product: it is validated on load, and any
// problem is reported with the path of the offending value.
import { z } from 'zod';

const size = z.strictObject({ width: z.number().positive(), height: z.number().positive() });
const sizeClassValue = z.enum(['compact', 'regular']);
const orientation = z.enum(['portrait', 'landscape']);
const barAxis = z.enum(['horizontal', 'vertical']);
const anchor = z.enum(['top-left', 'top-right']);

const safeArea = z.strictObject({
  top: z.number().min(0),
  right: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0),
  source: z.string(),
});

const uikitSizeClass = z.strictObject({
  horizontal: sizeClassValue,
  vertical: sizeClassValue,
  estimated: z.boolean().optional(),
});

const orientationSpec = z.strictObject({
  sizeClass: uikitSizeClass,
  barAxis,
  safeArea,
  statusBar: z.boolean(),
});

const reservedRegion = z.strictObject({
  id: z.string(),
  label: z.string(),
  when: z.enum(['always', 'camera-active']),
  anchor: z.union([anchor, z.strictObject({ portrait: anchor.optional(), landscape: anchor.optional() })]),
  width: z.number().positive(),
  height: z.number().positive(),
  offsetTop: z.number().min(0),
  liveActivity: z
    .strictObject({ width: z.number().positive(), height: z.number().positive(), offsetTop: z.number().min(0) })
    .optional(),
  estimated: z.boolean().optional(),
});

const display = z.strictObject({
  label: z.string(),
  portraitSize: size,
  pixels: size.optional(),
  scale: z.number().positive(),
  estimated: z.boolean(),
  cornerRadius: z.number().min(0),
  homeIndicator: z.boolean(),
  orientations: z.strictObject({ portrait: orientationSpec.optional(), landscape: orientationSpec.optional() }),
  hardware: z.strictObject({
    dynamicIsland: z.strictObject({ width: z.number(), height: z.number(), offset: z.number() }).nullable(),
    camera: z.strictObject({ diameter: z.number(), region: z.number() }).optional(),
    fold: z.strictObject({ width: z.number().min(0), estimated: z.boolean().optional() }).optional(),
  }),
  reservedRegions: z.array(reservedRegion).optional(),
});

const pose = z.strictObject({
  id: z.string(),
  label: z.string(),
  display: z.string(),
  folded: z.boolean(),
  orientations: z.array(orientation).min(1),
  estimated: z.boolean().optional(),
});

const device = z.strictObject({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  displays: z.record(z.string(), display),
  poses: z.array(pose).optional(),
});

const componentRule = z.strictObject({
  perRow: z.number().int().positive(),
  minItemWidth: z.number().positive().optional(),
  maxItemWidth: z.number().positive().optional(),
});

export const GRID_COMPONENTS = [
  'action_card',
  'shortcut_card_item',
  'news_story_card',
  'reward_card',
  'deal_card',
  'bonus_campaign_banner',
] as const;
export type GridComponentId = (typeof GRID_COMPONENTS)[number];

const layoutRule = z.strictObject({
  id: z.string(),
  label: z.string(),
  match: z.strictObject({ horizontal: sizeClassValue.optional(), vertical: sizeClassValue.optional() }),
  pageMargin: z.strictObject({ base: z.number().min(0), mode: z.enum(['max', 'add']) }),
  grid: z.strictObject({ columns: z.number().int().positive(), gutter: z.number().min(0), proposed: z.boolean().optional() }),
  panes: z.number().int().positive(),
  components: z.strictObject({
    news_story_hero: z.strictObject({ variant: z.enum(['stacked', 'split']), bleed: z.enum(['full', 'inset']) }),
    'restaurant-card-small': z.strictObject({ mode: z.literal('carousel') }),
    tab_bar_26: z.strictObject({ item: z.enum(['stacked', 'inline']) }),
    action_card: componentRule,
    shortcut_card_item: componentRule,
    news_story_card: componentRule,
    reward_card: componentRule,
    deal_card: componentRule,
    bonus_campaign_banner: componentRule,
  }),
});

const toolbarItem = z.strictObject({
  id: z.string(),
  title: z.string(),
  symbol: z.string().nullable(),
  label: z.enum(['symbol', 'text']),
  group: z.enum(['navigation', 'prominent', 'secondary']),
  priority: z.number(),
  badge: z.boolean().optional(),
});

const toolbar = z.strictObject({
  component: z.enum(['app_toolbar', 'toolbar']),
  logo: z.string().optional(),
  type: z.string().optional(),
  title: z.string().optional(),
  items: z.array(toolbarItem),
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
  toolbar,
});

const tabItem = z.strictObject({ id: z.string(), title: z.string(), icon: z.string(), iconSelected: z.string().optional() });

const verticalBars = z.strictObject({
  estimated: z.boolean(),
  railWidth: z.number(),
  statusRegion: z.number(),
  toolbarItem: z.number(),
  groupGap: z.number(),
  overflowButton: z.number(),
  tabItem: z.number(),
  tabItemGap: z.number(),
  tabBarMinimized: z.number(),
  minGapBetweenBars: z.number(),
});

export const configSchema = z
  .strictObject({
    version: z.string(),
    figmaFile: z.string(),
    sources: z.record(z.string(), z.string()),
    freeResize: z.strictObject({ regularWidthMin: z.number(), regularHeightMin: z.number(), barAxis }),
    verticalBars,
    fold: z.strictObject({
      balanceMargins: z.boolean(),
      evenGridGutterAtFold: z.boolean(),
      modalPlacement: z.strictObject({ vertical: z.string(), horizontal: z.string() }),
    }),
    devices: z.array(device).min(1),
    layoutRules: z.array(layoutRule).min(1),
    tabBar: z.strictObject({ component: z.string(), items: z.array(tabItem).min(1) }),
    screens: z.array(screen).min(1),
  })
  .superRefine((cfg, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const sources = new Set([...Object.keys(cfg.sources), 'free-resize']);
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

    cfg.devices.forEach((d, di) => {
      for (const [displayId, disp] of Object.entries(d.displays)) {
        for (const [o, spec] of Object.entries(disp.orientations)) {
          if (spec && !sources.has(spec.safeArea.source)) {
            issue(['devices', di, 'displays', displayId, 'orientations', o, 'safeArea', 'source'], `Unknown source "${spec.safeArea.source}"; add it to "sources"`);
          }
        }
      }
      d.poses?.forEach((p, pi) => {
        if (!d.displays[p.display]) issue(['devices', di, 'poses', pi, 'display'], `Pose uses display "${p.display}", which device "${d.id}" does not have`);
      });
    });

    const last = cfg.layoutRules[cfg.layoutRules.length - 1];
    if (Object.keys(last.match).length) issue(['layoutRules', cfg.layoutRules.length - 1, 'match'], 'The last layout rule must be a fallback with "match": {}');

    const tabs = new Set(cfg.tabBar.items.map((t) => t.id));
    cfg.screens.forEach((s, si) => {
      if (!tabs.has(s.tab)) issue(['screens', si, 'tab'], `Screen "${s.id}" selects tab "${s.tab}", which the tab bar does not have`);
      if (!s.figma && !s.source) issue(['screens', si, 'source'], `Screen "${s.id}" has no Figma frame, so it needs a "source" explaining where it comes from`);
    });
  });

export type SimulatorConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`simulator.config.json is invalid:\n${issues.map((i) => `  • ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Keys starting with "$" are comments ("$comment", "$balanceMargins", …) and are ignored. */
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
