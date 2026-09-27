import { describe, expect, it } from 'vitest';
import { splitRegions as viaShim } from './engine/folds';
import { splitRegions } from '@hinge/core/engine/folds';
import { loadConfig } from '@hinge/core/config/load';
import raw from '@hinge/core/config/simulator.config.json';

describe('@hinge/core', () => {
  it('is what the old engine path re-exports', () => {
    expect(viaShim).toBe(splitRegions);
  });

  it('serves the config JSON and a validated config', () => {
    expect(loadConfig().devices.length).toBe(raw.devices.length);
  });
});
