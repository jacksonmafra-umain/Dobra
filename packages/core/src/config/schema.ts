// Schemas for the device catalog (catalog/catalog.json) and an app profile (profiles/*.profile.json).
// The config is the product: it is validated on load, and any problem is reported with the path of
// the offending value.
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
  windowModes: z.strictObject({
    split: z.strictObject({ divider: nonNeg, ratios: z.array(z.number().gt(0).lt(1)).min(1), source: sourceRef }),
    freeform: z.strictObject({ captionBar: pos, minSize: size, defaultSize: size, source: sourceRef }),
    popup: z.strictObject({ scale: z.number().gt(0).lt(1), captionBar: pos, source: sourceRef }),
    pip: z.strictObject({ width: pos, aspect: z.tuple([pos, pos]), margin: nonNeg, source: sourceRef }),
  }),
  /** Settings › Display size: the user scales the density, so the same panel reports fewer or more dp. */
  displaySize: z.strictObject({
    steps: z.array(z.strictObject({ id: z.string(), label: z.string(), factor: pos })).min(1),
    source: sourceRef,
  }),
  /** Short guidance the inspector shows for Android windows. */
  notes: z.array(z.strictObject({ id: z.string(), title: z.string(), text: z.string(), source: sourceRef })),
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
  /** Software keyboard height including its suggestion bar. */
  keyboard: z.strictObject({ portrait: pos, landscape: pos, source: sourceRef }).optional(),
});

/** What a posture offers a layout; see catalog/postures.ts. */
const postureKind = z.enum(['cover', 'flat', 'book', 'tabletop', 'partial', 'dual', 'rear']);
export const POSTURE_KIND_VALUES = postureKind.options;

const iosPose = z.strictObject({
  id: z.string(),
  label: z.string(),
  kind: postureKind,
  display: z.string(),
  folded: z.boolean(),
  orientations: z.array(orientation).min(1),
  estimated: z.boolean().optional(),
});

/** Device categories (spec §3.2). Kept here, not imported from catalog/, so the schema has no dependencies. */
const category = z.enum(['phone', 'foldable-book', 'foldable-flip', 'dual-screen', 'multi-fold', 'tablet', 'desktop']);
export const DEVICE_CATEGORIES = category.options;

const iosDevice = z.strictObject({
  id: z.string(),
  platform: z.literal('ios'),
  name: z.string(),
  enabled: z.boolean(),
  category,
  displays: z.record(z.string(), iosDisplay),
  poses: z.array(iosPose).optional(),
});

// ---------------------------------------------------------------------------------------------
// Android devices. Sizes are dp in the display's natural orientation; every value names a source.

const edge = z.enum(['top', 'right', 'bottom', 'left']);

const androidInsets = z.strictObject({
  statusBar: nonNeg,
  /** Display cutout on a natural edge. Its size is the inset it produces, not the camera diameter. */
  cutout: z
    .strictObject({ edge, size: nonNeg, hole: z.strictObject({ diameter: pos, offset: z.number().min(0).max(1) }).optional() })
    .nullable(),
  navigationBar: z.strictObject({
    gesture: nonNeg,
    threeButton: nonNeg,
    /** Phones move the 3-button bar to the side in landscape; large screens keep it at the bottom (taskbar). */
    threeButtonLandscape: z.enum(['side', 'bottom']),
  }),
  /** Curved screen edges on the natural left and right. */
  waterfall: nonNeg.optional(),
  ime: z.strictObject({ portrait: pos, landscape: pos }),
  source: sourceRef,
  estimated: z.boolean().optional(),
});

/** A hinge on a display, in its natural orientation. Width 0 is a flexible display with a crease. */
const hinge = z.strictObject({
  id: z.string(),
  axis: z.enum(['vertical', 'horizontal']),
  /** Distance of the hinge's leading edge from the natural left (vertical) or top (horizontal), dp. */
  position: nonNeg,
  width: nonNeg,
  /** androidx.window FoldingFeature.OcclusionType: FULL when a physical gap hides content. */
  occlusion: z.enum(['NONE', 'FULL']),
  source: sourceRef,
  estimated: z.boolean().optional(),
});

const androidDisplay = z.strictObject({
  label: z.string(),
  size: size,
  pixels: size.optional(),
  density: pos,
  cornerRadius: nonNeg,
  rotation: z.strictObject({ supported: z.boolean() }),
  insets: androidInsets,
  hinges: z.array(hinge).optional(),
  /** Outer displays apps do not get by default. */
  /** Who decides whether an app runs on this outer display, and whether it stays there when the device closes. */
  coverScreen: z
    .strictObject({ policy: z.enum(['user-granted', 'any-app', 'allow-list']), continuity: z.boolean(), note: z.string() })
    .optional(),
  source: sourceRef,
  estimated: z.boolean(),
});

const posture = z.strictObject({
  id: z.string(),
  label: z.string(),
  kind: postureKind,
  display: z.string(),
  /** Rotation the posture implies (tabletop turns a book-style hinge horizontal). Omit to follow the user's choice. */
  rotation: z.union([z.literal(0), z.literal(90)]).optional(),
  features: z.array(z.strictObject({ hinge: z.string(), state: z.enum(['FLAT', 'HALF_OPENED']) })),
  /** WindowAreaController presentation modes. The simulator documents them; it cannot render both displays. */
  windowArea: z.enum(['rear-display', 'dual-screen']).optional(),
  note: z.string().optional(),
  estimated: z.boolean().optional(),
});

const androidDevice = z.strictObject({
  id: z.string(),
  platform: z.literal('android'),
  name: z.string(),
  enabled: z.boolean(),
  category,
  displays: z.record(z.string(), androidDisplay),
  postures: z.array(posture).optional(),
  /** Window states this device offers. The first is the default. */
  windowModes: z.array(z.enum(['fullscreen', 'split', 'freeform', 'popup', 'pip'])).min(1),
  source: sourceRef,
  estimated: z.boolean(),
});

// ---------------------------------------------------------------------------------------------
// Layout rules, keyed by either platform's size-class vocabulary.

const gridRule = z.strictObject({ perRow: z.number().int().positive(), minItemWidth: pos.optional(), maxItemWidth: pos.optional() });
const heroRule = z.strictObject({ variant: z.enum(['stacked', 'split']), bleed: z.enum(['full', 'inset']) });
const tabBarRule = z.strictObject({ item: z.enum(['stacked', 'inline']) });
const carouselRule = z.strictObject({ mode: z.literal('carousel') });

const track = z.union([
  z.strictObject({ fixed: pos }),
  z.strictObject({ fr: pos }),
  z.strictObject({ adaptive: z.strictObject({ min: pos, max: pos.optional() }) }),
]);
const gridForm = z.strictObject({
  grid: z.strictObject({ columns: z.array(track).min(1), gap: nonNeg, areas: z.record(z.string(), z.array(z.number().int().min(0)).min(1)).optional() }),
});
const flexForm = z.strictObject({
  flex: z.strictObject({
    wrap: z.boolean(),
    basis: pos,
    grow: nonNeg,
    shrink: nonNeg,
    gap: nonNeg,
    justify: z.enum(['start', 'center', 'end', 'space-between', 'space-around']).optional(),
  }),
});

const RULE_BY_KIND = { grid: z.union([gridRule, gridForm, flexForm]), hero: heroRule, 'tab-bar': tabBarRule, carousel: carouselRule } as const;
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
  /** Force one pane whatever the screen's scene asks for. */
  scene: z.literal('single').optional(),
  components: z.record(z.string(), z.union([gridRule, gridForm, flexForm, heroRule, tabBarRule, carouselRule])),
  source: sourceRef.optional(),
});

const componentSpec = z.strictObject({
  kind: z.enum(['grid', 'hero', 'tab-bar', 'carousel']),
  gap: nonNeg.optional(),
  split: z.strictObject({ imageFraction: z.number().gt(0).lt(1), textPadding: nonNeg }).optional(),
  minLegibleWidth: pos.optional(),
  /** Rule forms this component accepts. */
  forms: z.array(z.enum(['perRow', 'grid', 'flex'])).optional(),
  /** Items the sample screen shows; flex widths depend on it. */
  items: z.number().int().positive().optional(),
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
  /** Pane strategy from "scenes". Screens without one are single-pane. */
  scene: z.string().optional(),
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

const sceneSpec = z.strictObject({
  strategy: z.enum(['single', 'list-detail', 'two-pane', 'supporting-pane']),
  listFraction: z.number().gt(0).lt(1).optional(),
  listMinWidth: nonNeg.optional(),
  detailMinWidth: nonNeg.optional(),
  ratio: z.number().gt(0).lt(1).optional(),
  paneMinWidth: nonNeg.optional(),
  supportingWidth: pos.optional(),
  mainMinWidth: nonNeg.optional(),
  /** Narrowest pane text still reads in; the min-legible-width check uses it. */
  textMinWidth: pos.optional(),
  source: sourceRef,
});

const catalogShape = {
    version: z.string(),
    sources: z.record(z.string(), z.string()),
    platforms: z.strictObject({ ios: iosProfile, android: androidProfile }),
    devices: z.array(z.discriminatedUnion('platform', [iosDevice, androidDevice])).min(1),
};

const profileShape = {
    /** Figma file key the screens' frame ids live in. Required only when a screen names a frame. */
    figmaFile: z.string().optional(),
    components: z.record(z.string(), componentSpec),
    scenes: z.record(z.string(), sceneSpec).optional(),
    /** Sample type styles. Sizes are pt on iOS and sp on Android; both follow the user's text size. */
    typography: z.record(z.string(), z.strictObject({ size: pos, lineHeight: pos })),
    /** How the Sample app declares itself to each platform. */
    app: z.strictObject({
      android: z.strictObject({
        targetSdk: z.number().int().positive(),
        screenOrientation: z.enum(['unspecified', 'portrait']),
        configChanges: z.array(z.string()),
        source: sourceRef,
      }),
    }),
    layoutRules: z.array(layoutRule).min(1),
    tabBar: z.strictObject({ component: z.string(), items: z.array(tabItem).min(1) }),
    screens: z.array(screen).min(1),
};

const catalogObject = z.strictObject(catalogShape);
const configObject = z.strictObject({ ...catalogShape, ...profileShape });
type CatalogShape = z.infer<typeof catalogObject>;
type ConfigShape = z.infer<typeof configObject>;

type Issue = (path: (string | number)[], message: string) => void;

/** Shared checks for catalog and profile validation. */
function checkers(cfg: { sources: Record<string, string>; platforms: { android: z.infer<typeof androidProfile> } }, issue: Issue) {
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
  const android = cfg.platforms.android;
  const widthIds = new Set(android.sizeClasses.width.map((b) => b.id));
  const heightIds = new Set(android.sizeClasses.height.map((b) => b.id));
  const checkClasses = (ids: string[] | undefined, known: Set<string>, path: (string | number)[]) =>
    ids?.forEach((id, i) => {
      if (!known.has(id)) issue([...path, i], `Unknown window size class "${id}"; known: ${[...known].join(', ')}`);
    });
  return { checkSource, unique, android, widthIds, heightIds, checkClasses };
}

/** Checks that only need the catalog: devices, displays, postures and platform vocabularies. */
function checkCatalog(cfg: CatalogShape, issue: Issue) {
  const { checkSource, unique, android, widthIds, heightIds, checkClasses } = checkers(cfg, issue);
  unique(cfg.devices.map((d) => d.id), 'devices');

  checkSource(android.sizeClasses.source, ['platforms', 'android', 'sizeClasses', 'source']);
  android.navigation.rules.forEach((r, i) => checkSource(r.source, ['platforms', 'android', 'navigation', 'rules', i, 'source']));
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

  cfg.devices.forEach((d, di) => {
    if (d.platform === 'android') {
      checkSource(d.source, ['devices', di, 'source']);
      for (const [displayId, disp] of Object.entries(d.displays)) {
        const path = ['devices', di, 'displays', displayId];
        checkSource(disp.source, [...path, 'source']);
        checkSource(disp.insets.source, [...path, 'insets', 'source']);
        if (disp.pixels) {
          for (const axis of ['width', 'height'] as const) {
            const derived = disp.pixels[axis] / disp.density;
            if (Math.abs(derived - disp.size[axis]) > 1.5 && !disp.estimated)
              issue([...path, 'size', axis], `${disp.size[axis]} dp does not match ${disp.pixels[axis]} px / ${disp.density} = ${derived.toFixed(1)} dp; mark it estimated or fix it`);
          }
        }
      }
      d.postures?.forEach((p, pi) => {
        const path = ['devices', di, 'postures', pi];
        const disp = d.displays[p.display];
        if (!disp) return issue([...path, 'display'], `Posture uses display "${p.display}", which device "${d.id}" does not have`);
        const hinges = new Set((disp.hinges ?? []).map((h) => h.id));
        p.features.forEach((f, fi) => {
          if (!hinges.has(f.hinge)) issue([...path, 'features', fi, 'hinge'], `Display "${p.display}" has no hinge "${f.hinge}"`);
        });
      });
      for (const [displayId, disp] of Object.entries(d.displays)) {
        disp.hinges?.forEach((h, hi) => {
          const path = ['devices', di, 'displays', displayId, 'hinges', hi];
          checkSource(h.source, [...path, 'source']);
          const extent = h.axis === 'vertical' ? disp.size.width : disp.size.height;
          if (h.position + h.width > extent) issue([...path, 'position'], `Hinge runs past the display edge (${extent} dp)`);
        });
      }
      return;
    }
    for (const [displayId, disp] of Object.entries(d.displays)) {
      for (const [o, spec] of Object.entries(disp.orientations)) {
        if (spec) checkSource(spec.safeArea.source, ['devices', di, 'displays', displayId, 'orientations', o, 'safeArea', 'source']);
      }
    }
    d.poses?.forEach((p, pi) => {
      if (!d.displays[p.display]) issue(['devices', di, 'poses', pi, 'display'], `Pose uses display "${p.display}", which device "${d.id}" does not have`);
    });
  });

}

/** Checks that need the app profile: components, layout rules, scenes, the tab bar and screens. */
function checkProfile(cfg: ConfigShape, issue: Issue) {
  const { checkSource, unique, widthIds, heightIds, checkClasses } = checkers(cfg, issue);
  unique(cfg.screens.map((s) => s.id), 'screens');
  unique(cfg.layoutRules.map((r) => r.id), 'layoutRules');

  for (const [id, c] of Object.entries(cfg.components)) {
    checkSource(c.source, ['components', id, 'source']);
    if (c.kind === 'grid' && c.gap === undefined) issue(['components', id, 'gap'], 'Grid components need a gap');
  }

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
      if (!parsed.success) continue;
      const form = 'grid' in value ? 'grid' : 'flex' in value ? 'flex' : 'perRow';
      if (spec.kind === 'grid' && !(spec.forms ?? ['perRow']).includes(form))
        issue([...path, 'components', id], `Component "${id}" does not accept the ${form} form; allowed: ${(spec.forms ?? ['perRow']).join(', ')}`);
      if (form === 'grid') {
        const g = (value as z.infer<typeof gridForm>).grid;
        for (const [area, cols] of Object.entries(g.areas ?? {}))
          if (cols.some((c) => c >= g.columns.length)) issue([...path, 'components', id, 'grid', 'areas', area], `Span runs past the ${g.columns.length} tracks`);
      }
    }
    for (const id of Object.keys(r.components)) {
      if (!cfg.components[id]) issue([...path, 'components', id], `Unknown component "${id}"; add it to "components"`);
    }
  });
  for (const p of PLATFORMS) {
    if (!fallbacks.has(p)) issue(['layoutRules'], `Add a ${p} fallback rule with "match": {} after the other ${p} rules`);
  }

  cfg.screens.forEach((s, si) => {
    if (s.scene && !cfg.scenes?.[s.scene]) issue(['screens', si, 'scene'], `Unknown scene "${s.scene}"; add it to "scenes"`);
  });
  for (const [id, sc] of Object.entries(cfg.scenes ?? {})) checkSource(sc.source, ['scenes', id, 'source']);

  const tabs = new Set(cfg.tabBar.items.map((t) => t.id));
  cfg.screens.forEach((s, si) => {
    if (!tabs.has(s.tab)) issue(['screens', si, 'tab'], `Screen "${s.id}" selects tab "${s.tab}", which the tab bar does not have`);
    if (s.figma && !cfg.figmaFile) issue(['figmaFile'], `Screen "${s.id}" names Figma frames, so the config needs a "figmaFile"`);
    if (!s.figma && !s.source) issue(['screens', si, 'source'], `Screen "${s.id}" has no Figma frame, so it needs a "source" explaining where it comes from`);
    s.components.forEach((c, ci) => {
      if (!cfg.components[c]) issue(['screens', si, 'components', ci], `Unknown component "${c}"`);
    });
  });
}

/** A device catalog on its own. The plugin validates catalogs with this; it knows nothing about screens. */
export const catalogSchema = catalogObject.superRefine((cat, ctx) => {
  checkCatalog(cat, (path, message) => ctx.addIssue({ code: 'custom', path, message }));
});

/** A catalog and an app profile together: what the simulator runs on. */
export const configSchema = configObject.superRefine((cfg, ctx) => {
  const issue: Issue = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  checkCatalog(cfg, issue);
  checkProfile(cfg, issue);
});

export type Catalog = z.infer<typeof catalogSchema>;

export type SimulatorConfig = z.infer<typeof configSchema>;
export type GridRule = z.infer<typeof gridRule>;
export type GridFormRule = z.infer<typeof gridForm>;
export type FlexFormRule = z.infer<typeof flexForm>;
export type HeroRule = z.infer<typeof heroRule>;
export type TabBarRule = z.infer<typeof tabBarRule>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Config is invalid:\n${issues.map((i) => `  • ${i}`).join('\n')}`);
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

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(stripComments(raw));
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${formatPath(i.path) || '(root)'}: ${i.message}`));
  }
  return result.data;
}

/** Validates raw config JSON and throws a ConfigError listing every problem with its path. */
export function parseConfig(raw: unknown): SimulatorConfig {
  return parseWith(configSchema, raw);
}

/** Validates a catalog on its own (no app profile). */
export function parseCatalog(raw: unknown): Catalog {
  return parseWith(catalogSchema, raw);
}
