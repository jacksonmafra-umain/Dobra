import { describe, expect, it } from 'vitest';
import { DEFAULT_PATTERNS, nameRole, parsePatterns } from './namePatterns';

describe('name patterns', () => {
  it('classifies by the default words, chrome before controls, as whole words in any case', () => {
    expect(nameRole('Buy Button', DEFAULT_PATTERNS)).toBe('interactive');
    expect(nameRole('Tab bar', DEFAULT_PATTERNS)).toBe('chrome');
    expect(nameRole('tabbar', DEFAULT_PATTERNS)).toBe('chrome');
    expect(nameRole('Tab', DEFAULT_PATTERNS)).toBe('interactive');
    expect(nameRole('Buttonless card art', { controls: ['button'], chrome: [] })).toBeNull();
    expect(nameRole('Hero', DEFAULT_PATTERNS)).toBeNull();
  });

  it('uses words a team adds, and treats them as plain text, not regular expressions', () => {
    const team = { controls: ['cta', 'pill (small)'], chrome: ['masthead'] };
    expect(nameRole('Masthead', team)).toBe('chrome');
    expect(nameRole('pill (small)', team)).toBe('interactive');
    expect(nameRole('pill small', team)).toBeNull();
    expect(nameRole('Button', team)).toBeNull();
  });

  it('reads a stored list, keeping defaults for a missing or broken field', () => {
    expect(parsePatterns('')).toEqual(DEFAULT_PATTERNS);
    expect(parsePatterns('{nope')).toEqual(DEFAULT_PATTERNS);
    expect(parsePatterns(JSON.stringify({ controls: [' cta ', '', 3], chrome: 'x' }))).toEqual({ controls: ['cta'], chrome: DEFAULT_PATTERNS.chrome });
  });
});
