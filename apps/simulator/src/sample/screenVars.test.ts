import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '@dobra/core/config/load';
import { parseConfig } from '@dobra/core/config/schema';
import { resolveEnvironment } from '@dobra/core/engine/environment';
import { resolveLayout } from '@dobra/core/engine/layout';
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
