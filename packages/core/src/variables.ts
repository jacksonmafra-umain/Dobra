// The Figma variables Dobra writes, as plain data (spec §3). The plugin applies them; nothing here
// knows Figma. Keys are stable across runs so an update finds what an earlier run wrote.
import type { Catalog, SimulatorConfig } from './config/schema';
import type { Platform } from './config/types';
import { resolveEnvironment } from './engine/environment';
import { matchRuleOrNull } from './engine/layout';
import type { Target } from './targets';

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
}

type LayoutField = 'margin' | 'gutter' | 'columns' | 'panes';
interface ClassLayout {
  values: Record<LayoutField, number>;
  describe: (field: LayoutField) => string;
}

const PLATFORM_LABEL: Record<Platform, string> = { android: 'Android', ios: 'iOS' };
const capital = (id: string) => id[0].toUpperCase() + id.slice(1);
/** A window that sits in each class, for matching profile rules: the class's lower bound, regular height. */
const REPRESENTATIVE: Record<Platform, Record<string, number>> = {
  android: { compact: 360, medium: 600, expanded: 840, large: 1200, extraLarge: 1600 },
  ios: { compact: 390, regular: 820 },
};
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

function profileLayout(catalog: Catalog, opts: VariableOptions, platform: Platform, classId: string): ClassLayout {
  const profile = opts.profile!;
  const env = resolveEnvironment(profile, {
    deviceId: '',
    displayId: '',
    orientation: 'portrait',
    free: { width: REPRESENTATIVE[platform][classId], height: 900 },
    freePlatform: platform,
  });
  const rule = matchRuleOrNull(profile, env);
  if (!rule) return defaultLayout(catalog, platform, classId, 'Platform default (the profile has no rule for this class): ');
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
  const layouts = Object.fromEntries(bounds.map((b) => [b.id, opts.profile ? profileLayout(catalog, opts, platform, b.id) : defaultLayout(catalog, platform, b.id)]));
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

export function variableSpec(catalog: Catalog, opts: VariableOptions): VariableSpec {
  return { collections: opts.platforms.map((p) => sizeClassCollection(catalog, opts, p)) };
}
