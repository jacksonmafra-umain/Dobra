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
