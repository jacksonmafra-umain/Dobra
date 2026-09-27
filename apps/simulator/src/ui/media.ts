// The simulator's view of the media-query facts core resolved for this window (Environment.media),
// with which facts the user overrode and whether they are category defaults.
import { DEFAULT_MEDIA, mediaFacts, type MediaFacts } from '@hinge/core/catalog/media';
import type { DeviceSpec } from '@hinge/core/config/types';
import type { Environment } from '@hinge/core/engine/environment';

export type MediaOverrides = Partial<MediaFacts>;
export type WindowPosture = 'Flat' | 'Book' | 'Tabletop';

export interface ResolvedMedia extends MediaFacts {
  windowPosture: WindowPosture;
  overridden: (keyof MediaFacts)[];
  /** True when the facts are category defaults: the device has no media block, or the window is free. */
  estimated: boolean;
}

const KEYS: (keyof MediaFacts)[] = ['pointer', 'keyboard', 'viewingDistance', 'hasCamera', 'hasMicrophone'];

/** The facts a window has before any override. Core gives a free window the phone defaults. */
export function baseMedia(device: DeviceSpec, env: Pick<Environment, 'isFree'>): MediaFacts {
  return env.isFree ? DEFAULT_MEDIA.phone : mediaFacts(device);
}

export function resolveMedia(device: DeviceSpec, env: Environment): ResolvedMedia {
  const base = baseMedia(device, env);
  const sep = env.folds.find((f) => f.separating);
  return {
    ...env.media,
    windowPosture: !sep ? 'Flat' : sep.axis === 'horizontal' ? 'Tabletop' : 'Book',
    overridden: KEYS.filter((k) => env.media[k] !== base[k]),
    estimated: env.isFree || !device.media,
  };
}
