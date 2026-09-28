import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const OWN = /^--(bg|panel|field|text|muted|border|border-strong|accent|on-accent|accent-soft|bad|bad-soft|warn|warn-soft|ok|ok-soft|info|info-soft)$/;

function declarations(source: string): [string, string][] {
  return source
    .replace(/[^{}]*\{/g, ';')
    .replace(/\}/g, ';')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
}

describe('app.css', () => {
  it('uses no color literal outside its own custom properties', () => {
    expect(declarations(css).filter(([p, v]) => COLOR.test(v) && !OWN.test(p))).toEqual([]);
  });
  it('builds its custom properties from brand tokens, not Figma variables', () => {
    const own = declarations(css).filter(([p]) => OWN.test(p));
    expect(own.length).toBeGreaterThanOrEqual(18);
    for (const [p, v] of own) expect(v, p).toMatch(/var\(--dobra-/);
    expect(css).not.toContain('--figma-color');
  });
});

describe('inputs', () => {
  // The Name words fields in the Check tab are <input> with no type attribute.
  it('styles text inputs that have no type attribute', () => {
    expect(css).toMatch(/input:not\(\[type\]\)[^{]*\{[^}]*background: var\(--field\)/);
  });
});
