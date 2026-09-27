// Writes Dobra's variable description (core variableSpec) into the file with figma.variables.
// Collections, modes and variables are found again by the Dobra keys stored in plugin data, never by
// name, so designers can rename them and bindings keep working. Values a designer changed are kept.
import type { SpecCollection, VariableSpec, VarValue } from '@dobra/core/variables';
import type { CollectionSummary, VariablesOptions, VariablesSummary } from './variableTypes';
import type { FigmaApi } from './api';
import { NAMESPACE } from './presets';

export type { CollectionSummary, KeptEdit, VariablesOptions, VariablesSummary } from './variableTypes';

const KEY = { collection: 'var-collection', modes: 'var-modes', variable: 'var-key', written: 'var-written', scopes: 'var-scopes' } as const;

const EDIT_ACCESS = 'You need edit access to create variables';

/** Figma refused another mode: the plan's limit per collection. */
class ModeLimit extends Error {
  constructor(
    /** Modes the collection held when Figma refused one more. */
    readonly limit: number,
    /** How many of this spec's modes the collection now holds (and keeps). */
    readonly fit: number,
    /** The collection existed before this run, so it stays and keeps the modes that fit. */
    readonly existed: boolean,
    message: string,
  ) {
    super(message);
  }
}

class NoEditAccess extends Error {}

/** Ids of collections this run created, so a failed or split attempt can take them back. */
interface Run {
  created: Set<string>;
  /** Names of collections Dobra did not create; Dobra never reuses them. */
  foreignNames: Set<string>;
}

const readJson = <T>(text: string, fallback: T): T => {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

function createCollection(api: FigmaApi, spec: SpecCollection, run: Run, warnings: string[]): VariableCollection {
  let name = spec.name;
  if (run.foreignNames.has(name)) {
    name = `${spec.name} (Dobra)`;
    warnings.push(`The file already has a collection named "${spec.name}"; Dobra wrote "${name}"`);
  }
  let collection: VariableCollection;
  try {
    collection = api.variables.createVariableCollection(name);
  } catch (e) {
    // Only a refusal to write means missing edit access; anything else is reported as it is.
    const message = e instanceof Error ? e.message : String(e);
    if (run.created.size === 0 && /read.?only|edit access|permission|not allowed|cannot write/i.test(message)) throw new NoEditAccess(EDIT_ACCESS);
    throw e;
  }
  run.created.add(collection.id);
  collection.setSharedPluginData(NAMESPACE, KEY.collection, spec.key);
  return collection;
}

async function applyCollection(
  api: FigmaApi,
  spec: SpecCollection,
  existing: VariableCollection | undefined,
  opts: VariablesOptions,
  warnings: string[],
  run: Run,
): Promise<CollectionSummary> {
  const isNew = !existing;
  const collection = existing ?? createCollection(api, spec, run, warnings);
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
  const saveModes = () => collection.setSharedPluginData(NAMESPACE, KEY.modes, JSON.stringify(modeIds));

  // Modes no longer selected go first, so removing them frees room for new ones.
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
  spec.modes.forEach((m, i) => {
    if (modeIds[m.key]) return;
    if (isNew && i === 0) {
      collection.renameMode(collection.modes[0].modeId, m.name);
      modeIds[m.key] = collection.modes[0].modeId;
      return;
    }
    try {
      modeIds[m.key] = collection.addMode(m.name);
    } catch (e) {
      // Any refusal once the collection holds a mode is treated as the plan's limit (spec §9 risk 4).
      // The modes added so far are kept and saved, so no mode is left without its key.
      saveModes();
      const message = e instanceof Error ? e.message : String(e);
      if (collection.modes.length < 1) throw e;
      throw new ModeLimit(collection.modes.length, spec.modes.filter((x) => modeIds[x.key]).length, !isNew, message);
    }
  });
  saveModes();

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
    // Scopes are rewritten only when Dobra's own change, so a designer's scope edits are kept.
    const scopes = sv.scopes.join(',');
    if (created || v.getSharedPluginData(NAMESPACE, KEY.scopes) !== scopes) {
      v.scopes = sv.scopes as VariableScope[];
      v.setSharedPluginData(NAMESPACE, KEY.scopes, scopes);
    }
    // A collection with no selected modes carries no description worth keeping over the last one.
    if (spec.modes.length && v.description !== sv.description) v.description = sv.description;

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

const categoryLabel = (id: string) => capital(id.replace(/-/g, ' '));
function capital(text: string) {
  return text[0].toUpperCase() + text.slice(1);
}

/** The same collection with only some of its modes. */
function subset(spec: SpecCollection, key: string, name: string, modeKeys: string[]): SpecCollection {
  const keep = new Set(modeKeys);
  return {
    key,
    name,
    modes: spec.modes.filter((m) => keep.has(m.key)),
    ...(spec.modeCategory ? { modeCategory: Object.fromEntries(Object.entries(spec.modeCategory).filter(([k]) => keep.has(k))) } : {}),
    variables: spec.variables.map((v) => ({ ...v, values: Object.fromEntries(Object.entries(v.values).filter(([k]) => keep.has(k))) })),
  };
}

/** One collection per device category. */
function byCategory(spec: SpecCollection): SpecCollection[] {
  const groups = new Map<string, string[]>();
  for (const m of spec.modes) {
    const cat = spec.modeCategory![m.key];
    groups.set(cat, [...(groups.get(cat) ?? []), m.key]);
  }
  return [...groups].map(([cat, keys]) => subset(spec, `${spec.key}/${cat}`, `${spec.name} · ${categoryLabel(cat)}`, keys));
}

/**
 * The first `first` modes keep the key and name (the collection that already holds them); the rest go
 * into parts of at most `limit` modes, numbered from 2.
 */
function chunks(spec: SpecCollection, first: number, limit: number): SpecCollection[] {
  const keys = spec.modes.map((m) => m.key);
  const out = [subset(spec, spec.key, spec.name, keys.slice(0, first))];
  for (let i = first, n = 2; i < keys.length; i += limit, n++) out.push(subset(spec, `${spec.key}/${n}`, `${spec.name} ${n}`, keys.slice(i, i + limit)));
  return out;
}

const canSplitByCategory = (spec: SpecCollection) => !!spec.modeCategory && new Set(Object.values(spec.modeCategory)).size > 1;

export async function applyVariables(api: FigmaApi, spec: VariableSpec, opts: VariablesOptions): Promise<VariablesSummary> {
  const out: VariablesSummary = { collections: [], warnings: [], errors: [] };
  if (api.editorType === 'dev') return { ...out, errors: [{ collection: '*', message: EDIT_ACCESS }] };
  const local = await api.variables.getLocalVariableCollectionsAsync();
  const keyOf = (c: VariableCollection) => c.getSharedPluginData?.(NAMESPACE, KEY.collection) ?? '';
  const byKey = new Map(local.filter((c) => keyOf(c)).map((c) => [keyOf(c), c]));
  const run: Run = { created: new Set(), foreignNames: new Set(local.filter((c) => !keyOf(c)).map((c) => c.name)) };
  // Collections finished in this run, by id: a later failure never takes them back.
  const done = new Set<string>();
  /** Removes collections this run created but did not finish: a failed attempt or one that is being split. */
  const takeBack = async () => {
    for (const c of await api.variables.getLocalVariableCollectionsAsync()) {
      if (run.created.has(c.id) && !done.has(c.id)) {
        run.created.delete(c.id);
        c.remove();
      }
    }
  };

  const applied = new Set<string>();
  /** Parts an earlier run split `base` into by category: `devices/phone`, not `devices/2`. */
  const categoryParts = (base: string) =>
    [...byKey.keys()].filter((k) => {
      const rest = k.startsWith(`${base}/`) ? k.slice(base.length + 1) : '';
      return rest && !rest.includes('/') && !/^\d+$/.test(rest);
    });

  const apply = async (c: SpecCollection): Promise<void> => {
    applied.add(c.key);
    // Nothing selected and nothing written before: don't create an empty collection.
    if (!c.modes.length && !byKey.has(c.key)) return;
    // A collection split by category on an earlier run keeps that form, even for one category now.
    // A collection an earlier run split into numbered parts: fill the parts directly, sized by the
    // first part, instead of hitting the limit again (and warning again) on every run.
    const first = byKey.get(c.key);
    if (first && byKey.has(`${c.key}/2`) && c.modes.length > first.modes.length) {
      for (const part of chunks(c, first.modes.length, first.modes.length)) await apply(part);
      return;
    }
    const earlier = c.modeCategory && !byKey.has(c.key) ? categoryParts(c.key) : [];
    if (earlier.length) {
      const parts = byCategory(c);
      for (const key of earlier) if (!parts.some((p) => p.key === key)) parts.push(subset(c, key, byKey.get(key)!.name, []));
      for (const part of parts) await apply(part);
      return;
    }
    try {
      const summary = await applyCollection(api, c, byKey.get(c.key), opts, out.warnings, run);
      for (const id of run.created) done.add(id);
      out.collections.push(summary);
    } catch (e) {
      if (!(e instanceof ModeLimit)) throw e;
      await takeBack();
      if (e.fit === 0) throw new Error(`${c.name} is full: all ${e.limit} of its modes are no longer selected. Tick "Remove modes no longer selected" to make room.`);
      // A new collection splits by category; one that existed keeps the modes that fit and continues in numbered parts.
      const parts = !e.existed && canSplitByCategory(c) ? byCategory(c) : chunks(c, e.fit, e.limit);
      out.warnings.push(`${c.name}: ${e.message}; split into ${parts.length} collections`);
      for (const part of parts) await apply(part);
    }
  };

  for (const c of spec.collections) {
    try {
      await apply(c);
      // Parts of this collection from earlier runs that this run did not touch: report their modes as no longer selected.
      for (const key of byKey.keys()) {
        if ((key === c.key || key.startsWith(`${c.key}/`)) && !applied.has(key)) await apply(subset(c, key, byKey.get(key)!.name, []));
      }
    } catch (e) {
      if (e instanceof NoEditAccess) {
        out.errors.push({ collection: '*', message: EDIT_ACCESS });
        break;
      }
      await takeBack();
      out.errors.push({ collection: c.key, message: e instanceof Error ? e.message : String(e) });
    }
  }
  api.commitUndo();
  return out;
}

/** The Dobra key of a collection Dobra wrote (`size-classes/android`, `devices/phone`…), or ''. */
export const dobraKeyOf = (c: VariableCollection): string => c.getSharedPluginData?.(NAMESPACE, KEY.collection) ?? '';

/** Whether this file already holds collections Dobra wrote. */
export async function hasDobraVariables(api: FigmaApi): Promise<boolean> {
  return (await api.variables.getLocalVariableCollectionsAsync()).some((c) => !!c.getSharedPluginData?.(NAMESPACE, KEY.collection));
}

/** Dobra's device collections and their mode ids by target key, for Adapt. */
export async function deviceModes(api: FigmaApi): Promise<{ collection: VariableCollection; modes: Record<string, string> }[]> {
  return (await api.variables.getLocalVariableCollectionsAsync())
    .filter((c) => (c.getSharedPluginData?.(NAMESPACE, KEY.collection) ?? '').startsWith('devices'))
    .map((c) => ({ collection: c, modes: readJson<Record<string, string>>(c.getSharedPluginData(NAMESPACE, KEY.modes), {}) }));
}
