// src/ui/urlState.test.ts
import { describe, expect, it } from 'vitest';
import raw from '@hinge/core/config/simulator.config.json';
import { parseConfig } from '@hinge/core/config/schema';
import { resolveEnvironment } from '@hinge/core/engine/environment';
import { readUrlState, writeUrlState } from './urlState';

const config = parseConfig(raw);

describe('URL state', () => {
  it('round-trips the window state fields', () => {
    const search =
      '?device=pixel-tablet&display=main&rot=0&win=freeform&ws=700x500&dsize=large&rlock=1&kb=1&portrait=1&sdk=35&screen=home&theme=light&zoom=fit&ov=safe';
    const state = readUrlState(search);
    expect(state.selection).toMatchObject({
      windowMode: 'freeform',
      windowSize: { width: 700, height: 500 },
      displayScale: 'large',
      rotationLock: true,
      ime: true,
      appPortrait: true,
      targetSdk: 35,
    });
    const env = resolveEnvironment(config, state.selection);
    const again = readUrlState(writeUrlState(state, env));
    expect(again.selection).toMatchObject(state.selection);
  });

  it('writes split ratio and side', () => {
    const state = readUrlState('?device=pixel-9&win=split&ratio=0.333&side=2&screen=home');
    expect(state.selection).toMatchObject({ windowMode: 'split', splitRatio: 0.333, splitSide: 'secondary' });
  });

  it('round-trips text size, bold text and reduced motion', () => {
    const state = readUrlState('?device=pixel-9&fs=1.3&bold=1&motion=reduced&screen=home');
    expect(state.text).toEqual({ fontScale: 1.3, bold: true, reducedMotion: true });
    const env = resolveEnvironment(config, state.selection);
    expect(readUrlState(writeUrlState(state, env)).text).toEqual(state.text);
    expect(readUrlState('?device=pixel-9').text).toEqual({ fontScale: 1, bold: false, reducedMotion: false });
  });

  it('round-trips full screen on a device whose default window mode is desktop', () => {
    const state = readUrlState('?device=chromebook&screen=home');
    state.selection.windowMode = 'fullscreen';
    const env = resolveEnvironment(config, state.selection);
    expect(readUrlState(writeUrlState(state, env)).selection.windowMode).toBe('fullscreen');
  });
});
