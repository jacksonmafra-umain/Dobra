import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;

// Every declaration in a stylesheet, with comments removed, as [property, value].
function declarations(css: string): [string, string][] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[^{}]*\{/g, ';').replace(/\}/g, ';');
  return body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
}

describe('simulator chrome styles', () => {
  it('imports the brand fonts and tokens before the chrome', () => {
    const lines = read('./index.css').split('\n').filter((l) => l.startsWith('@import'));
    expect(lines).toEqual([
      '@import "tailwindcss";',
      '@import "@dobra/brand/fonts.css";',
      '@import "@dobra/brand/tokens.css";',
      '@import "./sample-app.css";',
      '@import "./app.css";',
    ]);
  });

  it('uses no color literal outside a --ui-* or --ov-* custom property', () => {
    const offenders = declarations(read('./app.css')).filter(
      ([prop, value]) => COLOR.test(value) && !/^--(ui|ov)-/.test(prop),
    );
    expect(offenders).toEqual([]);
  });

  it('builds every --ui-* and --ov-* color from a brand token', () => {
    const custom = declarations(read('./app.css')).filter(([prop]) => /^--(ui|ov)-/.test(prop));
    expect(custom.length).toBeGreaterThan(20);
    for (const [prop, value] of custom) expect(value, prop).toMatch(/var\(--dobra-/);
  });
});

describe('simulator page', () => {
  it('links the brand favicon in SVG and PNG', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="../../packages/brand/favicon.svg" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="../../packages/brand/png/favicon-32.png" />');
  });
});
