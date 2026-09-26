// Messages between the plugin panel (UI iframe) and the main thread (document access).
import type { CoverageMatrix } from '@hinge/core/coverage';
import type { Finding } from '@hinge/core/engine/checks';

export type ToMain =
  | { type: 'ready' }
  | { type: 'list-targets' }
  | { type: 'create-presets'; keys: string[] }
  | { type: 'scan-tags' }
  | { type: 'apply-tag'; frameId: string; key: string }
  | { type: 'coverage' }
  | { type: 'create-missing' }
  | { type: 'check'; scope: 'selection' | 'page' | 'all-pages' }
  | { type: 'select-node'; nodeId: string };

export interface TagCandidate {
  id: string;
  name: string;
  by: 'tag' | 'name' | 'size' | 'none';
  candidates: string[];
  nearest?: string;
}

export type Command = 'presets' | 'tag' | 'coverage' | 'check';

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
  | { type: 'error'; message: string }
) & { command?: Command };
