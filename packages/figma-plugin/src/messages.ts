// Messages between the plugin panel (UI iframe) and the main thread (document access).
import type { CoverageMatrix } from '@hinge/core/coverage';

export type ToMain =
  | { type: 'list-targets' }
  | { type: 'create-presets'; keys: string[] }
  | { type: 'scan-tags' }
  | { type: 'apply-tag'; frameId: string; key: string }
  | { type: 'coverage' }
  | { type: 'create-missing' };

export interface TagCandidate {
  id: string;
  name: string;
  by: 'tag' | 'name' | 'size' | 'none';
  candidates: string[];
  nearest?: string;
}

export type ToUi =
  | { type: 'targets'; items: { key: string; name: string; category: string }[] }
  | { type: 'created'; frameIds: string[] }
  | { type: 'tag-candidates'; frames: TagCandidate[] }
  | { type: 'coverage'; matrix: CoverageMatrix }
  | { type: 'error'; message: string };
