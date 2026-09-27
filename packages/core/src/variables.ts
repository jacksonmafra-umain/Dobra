// The Figma variables Dobra writes, as plain data (spec §3). The plugin applies them; nothing here
// knows Figma. Keys are stable across runs so an update finds what an earlier run wrote.
import type { Catalog, SimulatorConfig } from './config/schema';
import type { Platform } from './config/types';
import { resolveEnvironment } from './engine/environment';
import { matchRuleOrNull } from './engine/layout';
import { presetSpec } from './presets';
import { envConfigOf, resolveTarget, targetKey, type Target } from './targets';

export type VarType = 'FLOAT' | 'BOOLEAN' | 'STRING';
export type VarValue = number | boolean | string;

export interface SpecVariable {
  key: string;
  name: string;
  type: VarType;
  scopes: string[];
  description: string;
  /** One value per mode key: Figma needs a value in every mode. */
  values: Record<string, VarValue>;
}

export interface SpecMode {
  key: string;
  name: string;
}

export interface SpecCollection {
  key: string;
  name: string;
  modes: SpecMode[];
  /** Device category per mode key, for splitting a collection that hits the plan's mode limit. */
  modeCategory?: Record<string, string>;
  variables: SpecVariable[];
}

export interface VariableSpec {
  collections: SpecCollection[];
}

export interface VariableOptions {
  profile?: SimulatorConfig;
  profileName?: string;
  platforms: Platform[];
  targets: Target[];
  /** Write the device collection even with no targets, so an earlier run's device modes are reported. */
  devices?: boolean;
}

type LayoutField = 'margin' | 'gutter' | 'columns' | 'panes';
interface ClassLayout {
  values: Record<LayoutField, number>;
  describe: (field: LayoutField) => string;
}

const PLATFORM_LABEL: Record<Platform, string> = { android: 'Android', ios: 'iOS' };
const capital = (id: string) => id[0].toUpperCase() + id.slice(1);
const LAYOUT_VARS: { field: LayoutField; scopes: string[] }[] = [
  { field: 'margin', scopes: ['GAP'] },
  { field: 'gutter', scopes: ['GAP'] },
  { field: 'columns', scopes: ['ALL_SCOPES'] },
  { field: 'panes', scopes: ['ALL_SCOPES'] },
];

/** A source's human name: the catalog's source text before its link or note. */
function sourceLabel(catalog: Catalog, id: string): string {
  return (catalog.sources[id] ?? id).split(/[:(]/)[0].trim();
}

const joinDistinct = (texts: string[]) => [...new Set(texts)].join('; ');

/** The platform default for a class, described with its source and estimate. */
export function defaultLayout(catalog: Catalog, platform: Platform, classId: string, note = ''): ClassLayout {
  const d = platform === 'android' ? catalog.layoutDefaults.android[classId] : catalog.layoutDefaults.ios[classId as 'compact' | 'regular'];
  const label = sourceLabel(catalog, d.source);
  return {
    values: { margin: d.margin, gutter: d.gutter, columns: d.columns, panes: d.panes },
    describe: (f) => `${note}${label}${d.estimated.includes(f) ? ' (estimated)' : ''}`,
  };
}

/**
 * A window inside a width class, for matching profile rules, from the catalog's breakpoints: the middle
 * of the class (its lower bound when unbounded), at a regular height (Android's medium height class,
 * iOS's regular height threshold).
 */
function representativeWindow(catalog: Catalog, platform: Platform, bound: { min: number; max: number }): { width: number; height: number } {
  const width = bound.max ? Math.floor((bound.min + bound.max) / 2) : bound.min;
  if (platform === 'ios') return { width, height: catalog.platforms.ios.sizeClasses.free.regularHeightMin };
  const heights = catalog.platforms.android.sizeClasses.height;
  const medium = heights.find((h) => h.id === 'medium') ?? heights[0];
  const next = heights[heights.indexOf(medium) + 1];
  return { width, height: next ? Math.floor((medium.min + next.min) / 2) : medium.min };
}

function profileLayout(catalog: Catalog, opts: VariableOptions, platform: Platform, classId: string, bound: { min: number; max: number }): ClassLayout {
  const profile = opts.profile!;
  const env = resolveEnvironment(profile, {
    deviceId: '',
    displayId: '',
    orientation: 'portrait',
    free: representativeWindow(catalog, platform, bound),
    freePlatform: platform,
  });
  const rule = matchRuleOrNull(profile, env);
  if (!rule) return defaultLayout(catalog, platform, classId, `Platform default for ${classId} (the profile has no rule for this class): `);
  const text = `Profile: ${opts.profileName ?? 'app profile'} (rule ${rule.id})`;
  return { values: { margin: rule.pageMargin.base, gutter: rule.grid.gutter, columns: rule.grid.columns, panes: rule.panes }, describe: () => text };
}

function sizeClassCollection(catalog: Catalog, opts: VariableOptions, platform: Platform): SpecCollection {
  const bounds: { id: string; min: number; max: number }[] =
    platform === 'android'
      ? catalog.platforms.android.sizeClasses.width.map((w, i, all) => ({ id: w.id, min: w.min, max: all[i + 1]?.min ?? 0 }))
      : (() => {
          const at = catalog.platforms.ios.sizeClasses.free.regularWidthMin;
          return [
            { id: 'compact', min: 0, max: at },
            { id: 'regular', min: at, max: 0 },
          ];
        })();
  const layouts = Object.fromEntries(bounds.map((b) => [b.id, opts.profile ? profileLayout(catalog, opts, platform, b.id, b) : defaultLayout(catalog, platform, b.id)]));
  const per = (f: (id: string) => VarValue) => Object.fromEntries(bounds.map((b) => [b.id, f(b.id)]));
  const breakpoints = `Window size class breakpoints: ${sourceLabel(catalog, platform === 'android' ? catalog.platforms.android.sizeClasses.source : 'apple-device')}`;
  return {
    key: `size-classes/${platform}`,
    name: `Dobra · Size classes · ${PLATFORM_LABEL[platform]}`,
    modes: bounds.map((b) => ({ key: b.id, name: capital(b.id) })),
    variables: [
      ...LAYOUT_VARS.map(({ field, scopes }) => ({
        key: `layout/${field}`,
        name: `layout/${field}`,
        type: 'FLOAT' as const,
        scopes,
        description: joinDistinct(bounds.map((b) => layouts[b.id].describe(field))),
        values: per((id) => layouts[id].values[field]),
      })),
      { key: 'breakpoint/min-width', name: 'breakpoint/min-width', type: 'FLOAT', scopes: ['WIDTH_HEIGHT'], description: breakpoints, values: per((id) => bounds.find((b) => b.id === id)!.min) },
      { key: 'breakpoint/max-width', name: 'breakpoint/max-width', type: 'FLOAT', scopes: ['WIDTH_HEIGHT'], description: `${breakpoints}; 0 means unbounded`, values: per((id) => bounds.find((b) => b.id === id)!.max) },
    ],
  };
}

interface DeviceRow {
  key: string;
  values: Record<string, VarValue>;
  estimated: { window: boolean; hinge: boolean };
  layout: ClassLayout;
}

function deviceRow(catalog: Catalog, opts: VariableOptions, t: Target): DeviceRow {
  const config = opts.profile ?? envConfigOf(catalog);
  const e = resolveTarget(config, t);
  const fold = e.folds.find((f) => f.separating || f.occludes);
  const width = e.sizeClass.system === 'window' ? e.sizeClass.width : e.sizeClass.horizontal;
  const height = e.sizeClass.system === 'window' ? e.sizeClass.height : e.sizeClass.vertical;
  // The exact rule for this window (height included) when a profile is loaded, else the class default.
  const rule = opts.profile ? matchRuleOrNull(opts.profile, e) : null;
  const layout: ClassLayout = rule
    ? (() => {
        const text = `Profile: ${opts.profileName ?? 'app profile'} (rule ${rule.id})`;
        return { values: { margin: rule.pageMargin.base, gutter: rule.grid.gutter, columns: rule.grid.columns, panes: rule.panes }, describe: () => text };
      })()
    : defaultLayout(catalog, e.platform, width, opts.profile ? `Platform default for ${width} (the profile has no rule for this window): ` : '');
  const mode = rule?.pageMargin.mode ?? 'max';
  const inset = Math.max(e.safeArea.left, e.safeArea.right);
  const base = layout.values.margin;
  return {
    key: targetKey(t),
    estimated: { window: e.estimated, hinge: !!fold?.estimated },
    layout,
    values: {
      'window/width': e.width,
      'window/height': e.height,
      'safe-area/top': e.safeArea.top,
      'safe-area/bottom': e.safeArea.bottom,
      'safe-area/left': e.safeArea.left,
      'safe-area/right': e.safeArea.right,
      'hinge/present': !!fold,
      'hinge/separating': !!fold?.separating,
      'hinge/x': fold?.rect.x ?? 0,
      'hinge/y': fold?.rect.y ?? 0,
      'hinge/width': fold?.rect.width ?? 0,
      'hinge/height': fold?.rect.height ?? 0,
      'layout/margin': mode === 'max' ? Math.max(base, inset) : inset + base,
      'layout/gutter': layout.values.gutter,
      'layout/columns': layout.values.columns,
      'layout/panes': layout.values.panes,
      'size-class/width': width,
      'size-class/height': height,
      'media/pointer': e.media.pointer,
      'media/keyboard': e.media.keyboard,
      'media/viewing-distance': e.media.viewingDistance,
    },
  };
}

const DEVICE_VARS: { name: string; type: VarType; scopes: string[]; group: 'window' | 'hinge' | 'layout' | 'fact' }[] = [
  { name: 'window/width', type: 'FLOAT', scopes: ['WIDTH_HEIGHT'], group: 'window' },
  { name: 'window/height', type: 'FLOAT', scopes: ['WIDTH_HEIGHT'], group: 'window' },
  ...(['top', 'bottom', 'left', 'right'] as const).map((side) => ({ name: `safe-area/${side}`, type: 'FLOAT' as const, scopes: ['GAP'], group: 'window' as const })),
  { name: 'hinge/present', type: 'BOOLEAN', scopes: ['ALL_SCOPES'], group: 'hinge' },
  { name: 'hinge/separating', type: 'BOOLEAN', scopes: ['ALL_SCOPES'], group: 'hinge' },
  ...(['x', 'y', 'width', 'height'] as const).map((f) => ({ name: `hinge/${f}`, type: 'FLOAT' as const, scopes: ['WIDTH_HEIGHT'], group: 'hinge' as const })),
  ...LAYOUT_VARS.map(({ field, scopes }) => ({ name: `layout/${field}`, type: 'FLOAT' as const, scopes, group: 'layout' as const })),
  ...['size-class/width', 'size-class/height', 'media/pointer', 'media/keyboard', 'media/viewing-distance'].map((name) => ({ name, type: 'STRING' as const, scopes: ['TEXT_CONTENT'], group: 'fact' as const })),
];

function deviceCollection(catalog: Catalog, opts: VariableOptions): SpecCollection {
  const config = opts.profile ?? envConfigOf(catalog);
  const rows = opts.targets.map((t) => deviceRow(catalog, opts, t));
  const describe = (v: (typeof DEVICE_VARS)[number]) => {
    if (v.group === 'layout') return joinDistinct(rows.map((r) => r.layout.describe(v.name.split('/')[1] as LayoutField)));
    const estimated = v.group === 'window' ? rows.some((r) => r.estimated.window) : v.group === 'hinge' ? rows.some((r) => r.estimated.hinge) : false;
    return `Dobra catalog (resolveTarget)${estimated ? ' (estimated for some devices)' : ''}`;
  };
  return {
    key: 'devices',
    name: 'Dobra · Devices',
    modes: opts.targets.map((t, i) => ({ key: rows[i].key, name: presetSpec(config, t).name.replace(/^Screen \/ /, '') })),
    modeCategory: Object.fromEntries(opts.targets.map((t, i) => [rows[i].key, config.devices.find((d) => d.id === t.deviceId)!.category])),
    variables: DEVICE_VARS.map((v) => ({
      key: v.name,
      name: v.name,
      type: v.type,
      scopes: v.scopes,
      description: describe(v),
      values: Object.fromEntries(rows.map((r) => [r.key, r.values[v.name]])),
    })),
  };
}

export function variableSpec(catalog: Catalog, opts: VariableOptions): VariableSpec {
  const collections = opts.platforms.map((p) => sizeClassCollection(catalog, opts, p));
  if (opts.targets.length || opts.devices) collections.push(deviceCollection(catalog, opts));
  return { collections };
}
