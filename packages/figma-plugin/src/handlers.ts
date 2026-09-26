// Answers the panel's messages. Every branch returns a reply; errors become an 'error' message.
import { loadCatalog } from '@hinge/core/catalog/load';
import { presetSpec } from '@hinge/core/presets';
import { enumerateTargets, envConfigOf, targetKey } from '@hinge/core/targets';
import type { FigmaApi } from './api';
import type { ToMain, ToUi } from './messages';

const catalog = loadCatalog();
const config = envConfigOf(catalog);

export async function handle(_api: FigmaApi, msg: ToMain): Promise<ToUi | null> {
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
      default:
        return { type: 'error', message: `Not implemented: ${msg.type}` };
    }
  } catch (e) {
    return { type: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
