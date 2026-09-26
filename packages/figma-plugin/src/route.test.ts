import { describe, expect, it } from 'vitest';
import { route } from './route';
import { createFakeFigma } from './test/fakeFigma';

describe('route', () => {
  it('answers the panel being ready with the opening view of the command that launched the plugin', async () => {
    expect(await route(createFakeFigma(), 'coverage', { type: 'ready' })).toMatchObject({ type: 'coverage', command: 'coverage' });
    expect(await route(createFakeFigma(), 'tag', { type: 'ready' })).toMatchObject({ type: 'tag-candidates', command: 'tag' });
    expect(await route(createFakeFigma(), '', { type: 'ready' })).toMatchObject({ type: 'targets', command: 'presets' });
  });

  it('passes every other message to the handlers', async () => {
    expect(await route(createFakeFigma(), 'presets', { type: 'scan-tags' })).toMatchObject({ type: 'tag-candidates' });
  });
});
