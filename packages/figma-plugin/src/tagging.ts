// Tag frames: suggest a target for frames the plugin did not create, then store the designer's choice.
import type { EnvConfig } from '@hinge/core/engine/environment';
import { matchFrame } from '@hinge/core/match';
import { parseTargetKey, targetKey } from '@hinge/core/targets';
import type { FigmaApi } from './api';
import type { TagCandidate } from './messages';
import { NAMESPACE } from './presets';

/**
 * Artboards on the page: frames at the top level or inside Sections and Groups, where designers
 * organise them. Frames inside an artboard (its overlay, its content) are not artboards.
 */
export function topLevelFrames(api: FigmaApi): FrameNode[] {
  const out: FrameNode[] = [];
  const walk = (nodes: readonly SceneNode[]) => {
    for (const n of nodes) {
      if (n.type === 'FRAME') out.push(n);
      else if (n.type === 'SECTION' || n.type === 'GROUP') walk(n.children);
    }
  };
  walk(api.currentPage.children);
  return out;
}

/** Frames without a valid tag (untagged, or tagged for a device the catalog no longer has). */
export function tagCandidates(api: FigmaApi, config: EnvConfig): TagCandidate[] {
  return topLevelFrames(api).flatMap((f) => {
    const tag = f.getSharedPluginData(NAMESPACE, 'target');
    const m = matchFrame({ tag: tag || undefined, name: f.name, width: f.width, height: f.height }, config);
    if (m.by === 'tag') return [];
    return [{ id: f.id, name: f.name, by: m.by, candidates: m.targets.map(targetKey), ...(m.nearest ? { nearest: m.nearest.key } : {}) }];
  });
}

export async function applyTag(api: FigmaApi, frameId: string, key: string, catalogVersion: string): Promise<void> {
  const node = await api.getNodeByIdAsync(frameId);
  if (!node || node.type !== 'FRAME') throw new Error(`Frame ${frameId} not found`);
  if (!parseTargetKey(key)) throw new Error(`"${key}" is not a target key`);
  node.setSharedPluginData(NAMESPACE, 'target', key);
  node.setSharedPluginData(NAMESPACE, 'catalogVersion', catalogVersion);
}
