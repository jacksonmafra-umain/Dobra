// The simulator's view of a device's media-query facts: the catalog value, then the user's override.
import { mediaFacts, type MediaFacts } from '@hinge/core/catalog/media';
import type { DeviceSpec } from '@hinge/core/config/types';
import type { Environment } from '@hinge/core/engine/environment';

export type MediaOverrides = Partial<MediaFacts>;
export type WindowPosture = 'Flat' | 'Book' | 'Tabletop';

export interface ResolvedMedia extends MediaFacts {
  windowPosture: WindowPosture;
  overridden: (keyof MediaFacts)[];
  /** True when the device has no media block, so the facts are category defaults. */
  estimated: boolean;
}

const KEYS: (keyof MediaFacts)[] = ['pointer', 'keyboard', 'viewingDistance', 'hasCamera', 'hasMicrophone'];

export function resolveMedia(device: DeviceSpec, env: Environment, overrides: MediaOverrides): ResolvedMedia {
  const base = mediaFacts(device);
  const sep = env.folds.find((f) => f.separating);
  return {
    ...base,
    ...overrides,
    windowPosture: !sep ? 'Flat' : sep.axis === 'horizontal' ? 'Tabletop' : 'Book',
    overridden: KEYS.filter((k) => overrides[k] !== undefined && overrides[k] !== base[k]),
    estimated: !device.media,
  };
}
