import { describe, expect, it } from 'vitest';
import type { CollectionSummary, VariablesSummary } from '../variableTypes';
import { summaryLines } from './variablesSummary';

const col = (extra: Partial<CollectionSummary> = {}): CollectionSummary => ({
  key: 'size-classes/android',
  name: 'Dobra · Size classes · Android',
  modes: 5,
  variables: 6,
  created: 6,
  updated: 0,
  keptEdits: [],
  stale: [],
  removed: [],
  orphanVariables: [],
  ...extra,
});
const summary = (collections: CollectionSummary[], warnings: string[] = [], errors: VariablesSummary['errors'] = []): VariablesSummary => ({ collections, warnings, errors });

describe('summaryLines', () => {
  it('describes a first run', () => {
    expect(summaryLines(summary([col()]))).toEqual(['Dobra · Size classes · Android: 5 modes, 6 variables · 6 created, 0 updated']);
  });

  it('lists kept edits, modes no longer selected, removed modes and variables Dobra no longer writes', () => {
    const s = summary([col({ created: 0, keptEdits: [{ variable: 'layout/margin', mode: 'Compact', dobra: 20, current: 12 }], stale: ['Medium'], removed: ['Large'], orphanVariables: ['layout/old'] })]);
    expect(summaryLines(s)).toEqual([
      'Dobra · Size classes · Android: 5 modes, 6 variables · 0 created, 0 updated',
      'Kept your edit: layout/margin in Compact (Dobra value: 20)',
      'No longer selected: Medium',
      'Removed: Large',
      'No longer written by Dobra: layout/old',
    ]);
  });

  it('adds warnings and errors', () => {
    expect(summaryLines(summary([], ['Dobra · Devices: in addMode: Limited to 4 modes only; split into 2 collections'], [{ collection: 'devices', message: 'boom' }]))).toEqual([
      'Dobra · Devices: in addMode: Limited to 4 modes only; split into 2 collections',
      'Could not write devices: boom',
    ]);
  });
});
