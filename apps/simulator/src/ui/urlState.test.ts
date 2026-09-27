// src/ui/urlState.test.ts
import { describe, expect, it } from 'vitest';
import { rawConfig as raw } from '@hinge/core/config/load';
import { parseConfig } from '@hinge/core/config/schema';
import { findDevice, resolveEnvironment } from '@hinge/core/engine/environment';
import { validCounterpart } from './parity';
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
    const again = readUrlState(writeUrlState(state, env, findDevice(config, state.selection.deviceId)));
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
    expect(readUrlState(writeUrlState(state, env, findDevice(config, state.selection.deviceId))).text).toEqual(state.text);
    expect(readUrlState('?device=pixel-9').text).toEqual({ fontScale: 1, bold: false, reducedMotion: false });
  });

  it('round-trips full screen on a device whose default window mode is desktop', () => {
    const state = readUrlState('?device=chromebook&screen=home');
    state.selection.windowMode = 'fullscreen';
    const env = resolveEnvironment(config, state.selection);
    expect(readUrlState(writeUrlState(state, env, findDevice(config, state.selection.deviceId))).selection.windowMode).toBe('fullscreen');
  });

  it('round-trips media overrides', () => {
    const state = readUrlState('?device=pixel-tablet&ptr=fine&kbd=physical&dist=medium&cam=0&mic=0&screen=home');
    expect(state.media).toEqual({ pointer: 'fine', keyboard: 'physical', viewingDistance: 'medium', hasCamera: false, hasMicrophone: false });
    const env = resolveEnvironment(config, state.selection);
    const device = findDevice(config, 'pixel-tablet');
    expect(readUrlState(writeUrlState(state, env, device)).media).toEqual(state.media);
  });

  it('ignores unknown media values', () => {
    expect(readUrlState('?device=pixel-9&ptr=blunt&dist=far-away&cam=yes').media).toEqual({});
  });

  it('does not write an override equal to the device value', () => {
    const state = readUrlState('?device=pixel-9&ptr=coarse&screen=home');
    const env = resolveEnvironment(config, state.selection);
    expect(writeUrlState(state, env, findDevice(config, 'pixel-9'))).not.toContain('ptr=');
  });

  it('round-trips the parity counterpart', () => {
    const state = readUrlState('?device=iphone-17&vs=pixel-9&screen=home');
    expect(state.vs).toBe('pixel-9');
    const env = resolveEnvironment(config, state.selection);
    expect(writeUrlState(state, env, findDevice(config, 'iphone-17'))).toContain('vs=pixel-9');
  });

  it('drops a counterpart on the same platform or an unknown one', () => {
    expect(validCounterpart(config, 'iphone-17', readUrlState('?device=iphone-17&vs=iphone-air').vs)).toBeUndefined();
    expect(validCounterpart(config, 'iphone-17', readUrlState('?device=iphone-17&vs=bogus').vs)).toBeUndefined();
    expect(validCounterpart(config, 'iphone-17', 'pixel-9')).toBe('pixel-9');
  });
});
