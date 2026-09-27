// What a variables run reports. Shared by the main thread and the panel, so it holds types only.
import type { VarValue } from '@dobra/core/variables';

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
