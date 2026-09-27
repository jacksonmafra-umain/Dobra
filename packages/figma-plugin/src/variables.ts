// Writes Dobra's variable description (core variableSpec) into the file with figma.variables.
// Collections, modes and variables are found again by the Dobra keys stored in plugin data, never by
// name, so designers can rename them and bindings keep working. Values a designer changed are kept.
import type { SpecCollection, VariableSpec, VarValue } from '@dobra/core/variables';
import type { FigmaApi } from './api';
import { NAMESPACE } from './presets';

export interface VariablesOptions {
  overwrite: boolean;
  removeStale: boolean;
}

export interface KeptEdit {
  variable: string;
  mode: string;
  dobra: VarValue;
  current: VarValue;
}

export interface CollectionSummary {
  key: string;
  name: string;
  modes: number;
  variables: number;
  created: number;
  updated: number;
  keptEdits: KeptEdit[];
  stale: string[];
  removed: string[];
  orphanVariables: string[];
}

export interface VariablesSummary {
  collections: CollectionSummary[];
  warnings: string[];
  errors: { collection: string; message: string }[];
}

const KEY = { collection: 'var-collection', modes: 'var-modes', variable: 'var-key', written: 'var-written' } as const;

const readJson = <T>(text: string, fallback: T): T => {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

async function applyCollection(
  api: FigmaApi,
  spec: SpecCollection,
  existing: VariableCollection | undefined,
  opts: VariablesOptions,
  warnings: string[],
): Promise<CollectionSummary> {
  const isNew = !existing;
  const collection = existing ?? api.variables.createVariableCollection(spec.name);
  if (isNew) collection.setSharedPluginData(NAMESPACE, KEY.collection, spec.key);
  const summary: CollectionSummary = {
    key: spec.key,
    name: collection.name,
    modes: 0,
    variables: 0,
    created: 0,
    updated: 0,
    keptEdits: [],
    stale: [],
    removed: [],
    orphanVariables: [],
  };

  // Modes: stored key → modeId. A new collection's first mode becomes the first spec mode.
  const modeIds = readJson<Record<string, string>>(collection.getSharedPluginData(NAMESPACE, KEY.modes), {});
  const live = new Set(collection.modes.map((m) => m.modeId));
  for (const k of Object.keys(modeIds)) if (!live.has(modeIds[k])) delete modeIds[k];
  spec.modes.forEach((m, i) => {
    if (modeIds[m.key]) return;
    if (isNew && i === 0) {
      collection.renameMode(collection.modes[0].modeId, m.name);
      modeIds[m.key] = collection.modes[0].modeId;
    } else {
      modeIds[m.key] = collection.addMode(m.name);
    }
  });
  const wanted = new Set(spec.modes.map((m) => m.key));
  const nameOf = (modeId: string) => collection.modes.find((m) => m.modeId === modeId)?.name ?? modeId;
  for (const [k, modeId] of Object.entries(modeIds)) {
    if (wanted.has(k)) continue;
    const name = nameOf(modeId);
    summary.stale.push(name);
    if (!opts.removeStale) continue;
    if (collection.modes.length > 1) {
      collection.removeMode(modeId);
      delete modeIds[k];
      summary.removed.push(name);
    } else {
      warnings.push(`${collection.name} needs at least one mode; kept ${name}`);
    }
  }
  collection.setSharedPluginData(NAMESPACE, KEY.modes, JSON.stringify(modeIds));

  // Variables, by key.
  const byKey = new Map<string, Variable>();
  for (const id of collection.variableIds) {
    const v = await api.variables.getVariableByIdAsync(id);
    const key = v?.getSharedPluginData(NAMESPACE, KEY.variable);
    if (v && key) byKey.set(key, v);
  }
  for (const sv of spec.variables) {
    let v = byKey.get(sv.key);
    const created = !v;
    if (!v) {
      v = api.variables.createVariable(sv.name, collection, sv.type);
      v.setSharedPluginData(NAMESPACE, KEY.variable, sv.key);
      summary.created++;
    }
    v.scopes = sv.scopes as VariableScope[];
    if (v.description !== sv.description) v.description = sv.description;

    const written = readJson<Record<string, VarValue>>(v.getSharedPluginData(NAMESPACE, KEY.written), {});
    let changed = false;
    for (const m of spec.modes) {
      const modeId = modeIds[m.key];
      const value = sv.values[m.key];
      if (modeId === undefined || value === undefined) continue;
      const current = v.valuesByMode[modeId] as VarValue | undefined;
      const edited = !created && m.key in written && current !== undefined && current !== written[m.key];
      if (edited && !opts.overwrite) {
        // The designer's value is kept. If it already equals Dobra's, the two agree again from now on.
        if (current !== value) summary.keptEdits.push({ variable: sv.name, mode: m.name, dobra: value, current });
        else written[m.key] = value;
        continue;
      }
      if (current !== value) {
        v.setValueForMode(modeId, value);
        changed = true;
      }
      written[m.key] = value;
    }
    v.setSharedPluginData(NAMESPACE, KEY.written, JSON.stringify(written));
    if (changed && !created) summary.updated++;
  }
  const specKeys = new Set(spec.variables.map((v) => v.key));
  summary.orphanVariables = [...byKey].filter(([k]) => !specKeys.has(k)).map(([, v]) => v.name);
  summary.modes = collection.modes.length;
  summary.variables = collection.variableIds.length;
  return summary;
}

export async function applyVariables(api: FigmaApi, spec: VariableSpec, opts: VariablesOptions): Promise<VariablesSummary> {
  const out: VariablesSummary = { collections: [], warnings: [], errors: [] };
  const local = await api.variables.getLocalVariableCollectionsAsync();
  const keyOf = (c: VariableCollection) => c.getSharedPluginData?.(NAMESPACE, KEY.collection) ?? '';
  const byKey = new Map(local.filter((c) => keyOf(c)).map((c) => [keyOf(c), c]));
  for (const c of spec.collections) {
    out.collections.push(await applyCollection(api, c, byKey.get(c.key), opts, out.warnings));
  }
  return out;
}
