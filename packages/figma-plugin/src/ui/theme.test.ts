import { describe, expect, it } from 'vitest';
import { figmaTheme, followFigmaTheme } from './theme';

describe('figmaTheme', () => {
  it('reads Figma dark from the html class', () => {
    expect(figmaTheme('figma-dark')).toBe('dark');
    expect(figmaTheme('foo figma-dark bar')).toBe('dark');
  });
  it('treats anything else as light', () => {
    expect(figmaTheme('figma-light')).toBe('light');
    expect(figmaTheme('')).toBe('light');
    expect(figmaTheme('figma-darker')).toBe('light');
  });
});

describe('followFigmaTheme', () => {
  it('applies the theme now and again whenever Figma changes the class', () => {
    const root = { className: 'figma-light', dataset: {} as DOMStringMap };
    let fire = () => {};
    const stop = followFigmaTheme(root, (cb) => ((fire = cb), () => (fire = () => {})));
    expect(root.dataset.theme).toBe('light');
    root.className = 'figma-dark';
    fire();
    expect(root.dataset.theme).toBe('dark');
    stop();
    root.className = 'figma-light';
    fire();
    expect(root.dataset.theme).toBe('dark');
  });
});
