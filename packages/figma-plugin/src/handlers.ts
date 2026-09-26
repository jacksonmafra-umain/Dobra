// Answers the panel's messages. Every branch returns a reply; errors become an 'error' message.
import { coverage, representativeTarget, type PresentFrame } from '@hinge/core/coverage';
import type { EnvConfig } from '@hinge/core/engine/environment';
import { matchFrame } from '@hinge/core/match';
import { check } from '@hinge/core/rules';
import { presetSpec } from '@hinge/core/presets';
import { enumerateTargets, parseTargetKey, targetKey, type Target } from '@hinge/core/targets';
import { adaptFrame } from './adapt';
import type { FigmaApi } from './api';
import { catalog, config } from './catalog';
import { toGeo } from './geo';
import type { AdaptResult, FrameFindings, ToMain, ToUi } from './messages';
import { applyPreset, NAMESPACE } from './presets';
import { applyTag, tagCandidates, topLevelFrames } from './tagging';


/** Frames on the page that stand for a target: tagged ones first-class, the rest by name or size. */
export function presentFrames(api: FigmaApi, env: EnvConfig): PresentFrame[] {
  return topLevelFrames(api).flatMap((f) => {
    const tag = f.getSharedPluginData(NAMESPACE, 'target');
    const m = matchFrame({ tag: tag || undefined, name: f.name, width: f.width, height: f.height }, env);
    return m.by === 'none' ? [] : [{ frameId: f.id, targets: m.targets, confidence: m.by }];
  });
}

function create(api: FigmaApi, targets: Target[]): ToUi {
  const frames = targets.map((t) => applyPreset(api, presetSpec(config, t), catalog.version));
  if (frames.length) {
    api.currentPage.selection = frames;
    api.viewport.scrollAndZoomIntoView(frames);
  }
  return { type: 'created', frameIds: frames.map((f) => f.id) };
}

/** The artboards a check covers: those the selection is in (or the page when nothing is selected), or every page. */
async function framesToCheck(api: FigmaApi, scope: 'selection' | 'page' | 'all-pages'): Promise<FrameNode[]> {
  if (scope === 'all-pages') {
    await api.loadAllPagesAsync();
    return api.root.children.flatMap((page) => topLevelFrames({ ...api, currentPage: page } as FigmaApi));
  }
  const artboards = topLevelFrames(api);
  if (scope === 'page' || api.currentPage.selection.length === 0) return artboards;
  const set = new Set<BaseNode>(artboards);
  const picked = new Set<FrameNode>();
  for (const node of api.currentPage.selection) {
    let up: BaseNode | null = node;
    while (up && !set.has(up)) up = up.parent;
    if (up) picked.add(up as FrameNode);
  }
  return artboards.filter((f) => picked.has(f));
}

async function checkFrames(api: FigmaApi, scope: 'selection' | 'page' | 'all-pages', onProgress?: (visited: number) => void): Promise<FrameFindings[]> {
  const out: FrameFindings[] = [];
  for (const frame of await framesToCheck(api, scope)) {
    const tag = frame.getSharedPluginData(NAMESPACE, 'target');
    const m = matchFrame({ tag: tag || undefined, name: frame.name, width: frame.width, height: frame.height }, config);
    if (m.by === 'none') continue;
    const root = await toGeo(frame, onProgress);
    const subject = { source: 'figma' as const, ref: frame.id, targets: m.targets, confidence: m.by, width: frame.width, height: frame.height, root };
    out.push({ frameId: frame.id, name: frame.name, confidence: m.by, findings: check(subject, config) });
  }
  return out;
}

export async function handle(api: FigmaApi, msg: ToMain, onProgress?: (visited: number) => void): Promise<ToUi | null> {
  try {
    switch (msg.type) {
      case 'ready':
        return null;
      case 'list-targets':
        return {
          type: 'targets',
          items: enumerateTargets(config).map((t) => ({
            key: targetKey(t),
            name: presetSpec(config, t).name,
            category: config.devices.find((d) => d.id === t.deviceId)!.category,
          })),
        };
      case 'create-presets': {
        const targets = msg.keys.map((key) => {
          const t = parseTargetKey(key);
          if (!t) throw new Error(`"${key}" is not a target key`);
          presetSpec(config, t); // throws with the key when the target is unknown, before anything is created
          return t;
        });
        return create(api, targets);
      }
      case 'scan-tags':
        return { type: 'tag-candidates', frames: tagCandidates(api, config) };
      case 'apply-tag':
        await applyTag(api, msg.frameId, msg.key, catalog.version);
        return { type: 'tag-candidates', frames: tagCandidates(api, config) };
      case 'coverage':
        return { type: 'coverage', matrix: coverage(catalog, presentFrames(api, config)) };
      case 'check':
        return { type: 'findings', frames: await checkFrames(api, msg.scope, onProgress) };
      case 'select-node': {
        const node = await api.getNodeByIdAsync(msg.nodeId);
        if (!node || !('visible' in node)) throw new Error(`Layer ${msg.nodeId} not found`);
        // A finding from another page (all-pages check) needs its page shown before it can be selected.
        let page: BaseNode | null = node;
        while (page && page.type !== 'PAGE') page = page.parent;
        if (page && page !== api.currentPage) await api.setCurrentPageAsync(page as PageNode);
        api.currentPage.selection = [node as SceneNode];
        api.viewport.scrollAndZoomIntoView([node as SceneNode]);
        return null;
      }
      case 'adapt': {
        const targets = msg.keys.map((key) => {
          const t = parseTargetKey(key);
          if (!t) throw new Error(`"${key}" is not a target key`);
          presetSpec(config, t); // throws with the key when the target is unknown, before anything is copied
          return t;
        });
        const results: AdaptResult[] = [];
        for (const t of targets) {
          const { frame, plan, findings } = await adaptFrame(api, msg.frameId, t, { split: msg.split });
          results.push({ key: targetKey(t), frameId: frame.id, name: frame.name, plan, findings });
        }
        return { type: 'adapted', results };
      }
      case 'create-missing': {
        const matrix = coverage(catalog, presentFrames(api, config));
        const targets = matrix.cells
          .filter((c) => c.requirement.level === 'required' && c.status === 'missing')
          .map((c) => representativeTarget(catalog, c.requirement))
          .filter((t): t is Target => t !== null);
        return create(api, targets);
      }
    }
  } catch (e) {
    return { type: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
