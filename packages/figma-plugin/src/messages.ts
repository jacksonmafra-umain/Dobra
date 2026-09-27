// Messages between the plugin panel (UI iframe) and the main thread (document access).
import type { AdaptPlan } from '@dobra/core/adapt';
import type { CoverageMatrix } from '@dobra/core/coverage';
import type { Finding } from '@dobra/core/engine/checks';

export type ToMain =
  | { type: 'ready' }
  | { type: 'list-targets' }
  | { type: 'create-presets'; keys: string[] }
  | { type: 'scan-tags' }
  | { type: 'apply-tag'; frameId: string; key: string }
  | { type: 'coverage' }
  | { type: 'create-missing' }
  | { type: 'check'; scope: 'selection' | 'page' | 'all-pages' }
  | { type: 'select-node'; nodeId: string }
  | { type: 'adapt'; frameId: string; keys: string[]; split: boolean };

export interface TagCandidate {
  id: string;
  name: string;
  by: 'tag' | 'name' | 'size' | 'none';
  candidates: string[];
  nearest?: string;
}

export type Command = 'presets' | 'tag' | 'coverage' | 'check' | 'adapt';

export interface AdaptResult {
  key: string;
  frameId: string;
  name: string;
  plan: AdaptPlan;
  findings: Finding[];
}

export interface FrameFindings {
  frameId: string;
  name: string;
  confidence: 'tag' | 'name' | 'size';
  findings: Finding[];
}

export type ToUi = (
  | { type: 'targets'; items: { key: string; name: string; category: string }[] }
  | { type: 'created'; frameIds: string[] }
  | { type: 'tag-candidates'; frames: TagCandidate[] }
  | { type: 'coverage'; matrix: CoverageMatrix }
  | { type: 'findings'; frames: FrameFindings[] }
  | { type: 'progress'; visited: number }
  | { type: 'adapted'; results: AdaptResult[] }
  | { type: 'selection'; frames: { id: string; name: string }[] }
  | { type: 'error'; message: string }
) & { command?: Command };
