import { describe, expect, it } from 'vitest';
import { createFakeFigma } from './fakeFigma';

describe('fake variables', () => {
  it('creates collections with a first mode, adds modes up to the limit and stores values', async () => {
    const api = createFakeFigma();
    api.modeLimit = 2;
    const c = api.variables.createVariableCollection('X');
    expect(c.modes.map((m) => m.name)).toEqual(['Mode 1']);
    const m2 = c.addMode('B');
    expect(() => c.addMode('C')).toThrow(/Limited to 2 modes/);
    const v = api.variables.createVariable('a', c, 'FLOAT');
    v.setValueForMode(m2, 5);
    expect((await api.variables.getVariableByIdAsync(v.id))!.valuesByMode[m2]).toBe(5);
    expect(c.variableIds).toEqual([v.id]);
    expect(await api.variables.getLocalVariableCollectionsAsync()).toContain(c);
  });

  it('keeps plugin data, refuses to remove the last mode and rejects unknown types', () => {
    const api = createFakeFigma();
    const c = api.variables.createVariableCollection('X');
    c.setSharedPluginData('dobra', 'k', 'v');
    expect(c.getSharedPluginData('dobra', 'k')).toBe('v');
    expect(() => c.removeMode(c.modes[0].modeId)).toThrow();
    expect(() => api.variables.createVariable('a', c, 'BROKEN' as never)).toThrow(/Unknown variable type/);
    api.commitUndo();
    expect(api.undoCommits).toBe(1);
    expect(api.editorType).toBe('figma');
  });
});
