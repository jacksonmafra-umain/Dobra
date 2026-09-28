import { describe, expect, it } from 'vitest';
import { IGNORED_CONTAINERS } from './collisions';

describe('collision checker', () => {
  it('skips the simulator\'s own Figma messages, such as the Sign in to load button', () => {
    expect(IGNORED_CONTAINERS.split(',').map((s) => s.trim())).toContain('.figma-screen__state');
  });
});
