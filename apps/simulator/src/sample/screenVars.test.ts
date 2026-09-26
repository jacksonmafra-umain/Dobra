import { describe, expect, it } from 'vitest';
import raw from '@hinge/core/config/simulator.config.json';
import { parseConfig } from '@hinge/core/config/schema';
import { resolveEnvironment } from '@hinge/core/engine/environment';
import { resolveLayout } from '@hinge/core/engine/layout';
import { screenVars } from './screenVars';

const config = parseConfig(raw);

describe('screenVars', () => {
  it('does not count the keyboard twice: the lifted column gets no keyboard bottom inset', () => {
    const env = resolveEnvironment(config, { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait', free: null, ime: true });
    const layout = resolveLayout(config, env, config.screens[0]);
    const vars = screenVars(env, layout, false);
    expect(vars['--sa-bottom']).toBe('0px');
  });

  it('keeps the home-indicator inset when the keyboard is hidden', () => {
    const env = resolveEnvironment(config, { deviceId: 'iphone-17', displayId: 'main', orientation: 'portrait', free: null });
    expect(screenVars(env, resolveLayout(config, env, config.screens[0]), false)['--sa-bottom']).toBe('34px');
  });
});
