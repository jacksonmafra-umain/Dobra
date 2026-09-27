import { describe, expect, it } from 'vitest';
import type { VariableSpec } from '@dobra/core/variables';
import { createFakeFigma, type FakeFigma } from './test/fakeFigma';
import { applyVariables } from './variables';

const spec = (margin = 16): VariableSpec => ({
  collections: [
    {
      key: 'size-classes/android',
      name: 'Dobra · Size classes · Android',
      modes: [
        { key: 'compact', name: 'Compact' },
        { key: 'medium', name: 'Medium' },
      ],
      variables: [
        { key: 'layout/margin', name: 'layout/margin', type: 'FLOAT', scopes: ['GAP'], description: 'Material 3', values: { compact: margin, medium: 24 } },
        { key: 'layout/columns', name: 'layout/columns', type: 'FLOAT', scopes: ['ALL_SCOPES'], description: 'Material 3 (estimated)', values: { compact: 4, medium: 8 } },
      ],
    },
  ],
});
const OFF = { overwrite: false, removeStale: false };
const variablesOf = async (api: FakeFigma, collectionIndex = 0) => {
  const c = (await api.variables.getLocalVariableCollectionsAsync())[collectionIndex];
  return Promise.all(c.variableIds.map(async (id) => (await api.variables.getVariableByIdAsync(id))!));
};

describe('applyVariables', () => {
  it('creates the collection, renames the first mode and writes every value', async () => {
    const api = createFakeFigma();
    const s = await applyVariables(api, spec(), OFF);
    const [c] = await api.variables.getLocalVariableCollectionsAsync();
    expect(c.name).toBe('Dobra · Size classes · Android');
    expect(c.modes.map((m) => m.name)).toEqual(['Compact', 'Medium']);
    const margin = (await variablesOf(api)).find((v) => v.name === 'layout/margin')!;
    expect(margin.valuesByMode[c.modes[0].modeId]).toBe(16);
    expect(margin.scopes).toEqual(['GAP']);
    expect(margin.description).toBe('Material 3');
    expect(s.collections[0]).toMatchObject({ modes: 2, variables: 2, created: 2, updated: 0 });
  });

  it('changes nothing on an unchanged second run', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    expect((await applyVariables(api, spec(), OFF)).collections[0]).toMatchObject({ created: 0, updated: 0, removed: [], keptEdits: [] });
  });

  it('updates a value the catalog changed', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(16), OFF);
    expect((await applyVariables(api, spec(20), OFF)).collections[0].updated).toBe(1);
  });

  it('keeps a value the designer edited, unless told to overwrite', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(16), OFF);
    const [c] = await api.variables.getLocalVariableCollectionsAsync();
    const margin = (await variablesOf(api)).find((v) => v.name === 'layout/margin')!;
    margin.setValueForMode(c.modes[0].modeId, 12);
    const kept = await applyVariables(api, spec(20), OFF);
    expect(kept.collections[0].keptEdits).toEqual([{ variable: 'layout/margin', mode: 'Compact', dobra: 20, current: 12 }]);
    expect(margin.valuesByMode[c.modes[0].modeId]).toBe(12);
    await applyVariables(api, spec(20), { overwrite: true, removeStale: false });
    expect(margin.valuesByMode[c.modes[0].modeId]).toBe(20);
  });

  it('finds renamed collections and variables by key and keeps the new names', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    const [c] = await api.variables.getLocalVariableCollectionsAsync();
    c.name = 'My layout';
    const margin = (await variablesOf(api)).find((v) => v.name === 'layout/margin')!;
    margin.name = 'spacing/page';
    const s = await applyVariables(api, spec(), OFF);
    expect((await api.variables.getLocalVariableCollectionsAsync()).length).toBe(1);
    expect(c.name).toBe('My layout');
    expect(margin.name).toBe('spacing/page');
    expect(s.collections[0].created).toBe(0);
  });

  it('keeps modes no longer selected unless told to remove them, and never removes the last mode', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    const fewer: VariableSpec = { collections: [{ ...spec().collections[0], modes: [{ key: 'compact', name: 'Compact' }] }] };
    expect((await applyVariables(api, fewer, OFF)).collections[0].stale).toEqual(['Medium']);
    expect((await applyVariables(api, fewer, { overwrite: false, removeStale: true })).collections[0].removed).toEqual(['Medium']);
    const none: VariableSpec = { collections: [{ ...spec().collections[0], modes: [] }] };
    const s = await applyVariables(api, none, { overwrite: false, removeStale: true });
    expect(s.collections[0].removed).toEqual([]);
    expect(s.warnings.join('\n')).toMatch(/needs at least one mode/);
  });

  it('lists variables Dobra no longer writes without deleting them', async () => {
    const api = createFakeFigma();
    await applyVariables(api, spec(), OFF);
    const one: VariableSpec = { collections: [{ ...spec().collections[0], variables: [spec().collections[0].variables[0]] }] };
    const s = await applyVariables(api, one, OFF);
    expect(s.collections[0].orphanVariables).toEqual(['layout/columns']);
    expect((await variablesOf(api)).length).toBe(2);
  });
});

const devices = (n: number, categories: string[]): VariableSpec => ({
  collections: [
    {
      key: 'devices',
      name: 'Dobra · Devices',
      modes: Array.from({ length: n }, (_, i) => ({ key: `t${i}`, name: `Target ${i}` })),
      modeCategory: Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, categories[i % categories.length]])),
      variables: [
        { key: 'window/width', name: 'window/width', type: 'FLOAT', scopes: ['WIDTH_HEIGHT'], description: 'Dobra catalog', values: Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, 300 + i])) },
      ],
    },
  ],
});

describe('limits and errors', () => {
  it('splits devices by category, then into numbered parts, and explains it', async () => {
    const api = createFakeFigma();
    api.modeLimit = 4;
    const s = await applyVariables(api, devices(10, ['foldable-book', 'foldable-flip']), OFF);
    const names = (await api.variables.getLocalVariableCollectionsAsync()).map((c) => c.name).sort();
    expect(names).toEqual(['Dobra · Devices · Foldable book', 'Dobra · Devices · Foldable book 2', 'Dobra · Devices · Foldable flip', 'Dobra · Devices · Foldable flip 2']);
    expect(s.warnings.join('\n')).toMatch(/Limited to 4 modes/);
    expect(s.errors).toEqual([]);
  });

  it('goes straight to the split form on the next run', async () => {
    const api = createFakeFigma();
    api.modeLimit = 4;
    await applyVariables(api, devices(10, ['foldable-book', 'foldable-flip']), OFF);
    const s = await applyVariables(api, devices(10, ['foldable-book', 'foldable-flip']), OFF);
    expect((await api.variables.getLocalVariableCollectionsAsync()).length).toBe(4);
    expect(s.collections.every((c) => c.created === 0 && c.updated === 0)).toBe(true);
  });

  it('survives a limit of one mode', async () => {
    const api = createFakeFigma();
    api.modeLimit = 1;
    const s = await applyVariables(api, { collections: [...spec().collections, ...devices(2, ['phone']).collections] }, OFF);
    expect(s.errors).toEqual([]);
    const all = await api.variables.getLocalVariableCollectionsAsync();
    expect(all.length).toBe(4);
    expect(all.every((c) => c.modes.length === 1)).toBe(true);
  });

  it('leaves a collection it did not create alone and makes its own next to it', async () => {
    const api = createFakeFigma();
    api.variables.createVariableCollection('Dobra · Size classes · Android');
    const s = await applyVariables(api, spec(), OFF);
    expect((await api.variables.getLocalVariableCollectionsAsync()).map((c) => c.name)).toContain('Dobra · Size classes · Android (Dobra)');
    expect(s.warnings.join('\n')).toMatch(/already has a collection/);
  });

  it('writes nothing without edit access', async () => {
    for (const block of ['dev', 'readOnly'] as const) {
      const api = createFakeFigma();
      if (block === 'dev') api.editorType = 'dev';
      else api.readOnly = true;
      const s = await applyVariables(api, spec(), OFF);
      expect(s.errors[0].message).toBe('You need edit access to create variables');
      expect(await api.variables.getLocalVariableCollectionsAsync()).toEqual([]);
    }
  });

  it('keeps writing other collections when one fails, and commits one undo step', async () => {
    const api = createFakeFigma();
    const good = spec().collections[0];
    const broken: VariableSpec = { collections: [{ ...good, key: 'bad', name: 'Broken', variables: [{ ...good.variables[0], type: 'BROKEN' as never }] }, good] };
    const s = await applyVariables(api, broken, OFF);
    expect(s.errors.map((e) => e.collection)).toEqual(['bad']);
    expect(s.collections.map((c) => c.key)).toEqual(['size-classes/android']);
    expect((await api.variables.getLocalVariableCollectionsAsync()).map((c) => c.name)).toEqual(['Dobra · Size classes · Android']);
    expect(api.undoCommits).toBe(1);
  });
});

describe('review fixes', () => {
  const sizeClasses = (n: number): VariableSpec => ({
    collections: [
      {
        key: 'size-classes/android',
        name: 'Dobra · Size classes · Android',
        modes: Array.from({ length: n }, (_, i) => ({ key: `c${i}`, name: `C${i}` })),
        variables: [{ key: 'layout/margin', name: 'layout/margin', type: 'FLOAT', scopes: ['GAP'], description: 'x', values: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, i])) }],
      },
    ],
  });
  const modeTotal = async (api: FakeFigma) => (await api.variables.getLocalVariableCollectionsAsync()).reduce((n, c) => n + c.modes.length, 0);

  it('splits an existing collection that grows past the limit, without looping', async () => {
    const api = createFakeFigma();
    api.modeLimit = 4;
    await applyVariables(api, sizeClasses(3), OFF);
    const s = await applyVariables(api, sizeClasses(5), OFF);
    expect(s.errors).toEqual([]);
    const all = await api.variables.getLocalVariableCollectionsAsync();
    expect(all.map((c) => c.modes.length)).toEqual([4, 1]);
    expect(all.map((c) => c.name)).toEqual(['Dobra · Size classes · Android', 'Dobra · Size classes · Android 2']);
    expect(await applyVariables(api, sizeClasses(5), OFF)).toMatchObject({ errors: [] });
    expect(await modeTotal(api)).toBe(5);
  });

  it('never duplicates a mode when an existing device collection overflows', async () => {
    const api = createFakeFigma();
    api.modeLimit = 4;
    await applyVariables(api, devices(3, ['phone', 'tablet']), OFF);
    await applyVariables(api, devices(5, ['phone', 'tablet']), OFF);
    await applyVariables(api, devices(5, ['phone', 'tablet']), OFF);
    expect(await modeTotal(api)).toBe(5);
  });

  it('lists and removes device modes when every device is deselected', async () => {
    const api = createFakeFigma();
    await applyVariables(api, devices(2, ['phone']), OFF);
    const none: VariableSpec = { collections: [{ ...devices(0, ['phone']).collections[0] }] };
    expect((await applyVariables(api, none, OFF)).collections[0].stale).toEqual(['Target 0', 'Target 1']);
    const s = await applyVariables(api, none, { overwrite: false, removeStale: true });
    expect(s.collections[0].removed).toEqual(['Target 0']);
    expect(s.warnings.join('\n')).toMatch(/needs at least one mode/);
  });

  it('does not create an empty collection', async () => {
    const api = createFakeFigma();
    await applyVariables(api, devices(0, ['phone']), OFF);
    expect(await api.variables.getLocalVariableCollectionsAsync()).toEqual([]);
  });

  it('keeps using the category parts after a split, even for one category, and reports parts no longer selected', async () => {
    const api = createFakeFigma();
    api.modeLimit = 2;
    const three: VariableSpec = {
      collections: [{ ...devices(3, ['phone']).collections[0], modeCategory: { t0: 'phone', t1: 'phone', t2: 'tablet' } }],
    };
    await applyVariables(api, three, OFF);
    const phones: VariableSpec = { collections: [{ ...devices(2, ['phone']).collections[0] }] };
    const s = await applyVariables(api, phones, OFF);
    const names = (await api.variables.getLocalVariableCollectionsAsync()).map((c) => c.name).sort();
    expect(names).toEqual(['Dobra · Devices · Phone', 'Dobra · Devices · Tablet']);
    expect(s.collections.find((c) => c.name === 'Dobra · Devices · Tablet')?.stale).toEqual(['Target 2']);
  });
});
