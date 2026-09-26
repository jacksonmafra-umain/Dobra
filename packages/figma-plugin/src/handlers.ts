// Answers the panel's messages. Every branch returns a reply; errors become an 'error' message.
import { loadCatalog } from '@hinge/core/catalog/load';
import { coverage, representativeTarget, type PresentFrame } from '@hinge/core/coverage';
import type { EnvConfig } from '@hinge/core/engine/environment';
import { matchFrame } from '@hinge/core/match';
import { presetSpec } from '@hinge/core/presets';
import { enumerateTargets, envConfigOf, parseTargetKey, targetKey, type Target } from '@hinge/core/targets';
import type { FigmaApi } from './api';
import type { ToMain, ToUi } from './messages';
import { applyPreset, NAMESPACE } from './presets';
import { applyTag, tagCandidates, topLevelFrames } from './tagging';

const catalog = loadCatalog();
const config = envConfigOf(catalog);

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

export async function handle(api: FigmaApi, msg: ToMain): Promise<ToUi | null> {
  try {
    switch (msg.type) {
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
