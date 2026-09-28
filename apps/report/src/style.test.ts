import { readFileSync } from 'node:fs';
import { tokens } from '@dobra/brand/tokens';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const OWN = /^--(bg|panel|flyout|field|text|muted|border|border-strong|accent|on-accent|accent-soft|bad|bad-soft|warn|warn-soft|ok|ok-soft|info|info-soft)$/;

function declarations(source: string): [string, string][] {
  return source
    .replace(/[^{}]*\{/g, ';')
    .replace(/\}/g, ';')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]);
}

describe('report.css', () => {
  it('uses no color literal outside its own custom properties', () => {
    expect(declarations(css).filter(([p, v]) => COLOR.test(v) && !OWN.test(p))).toEqual([]);
  });
  it('builds each of its custom properties from a brand token', () => {
    const own = declarations(css).filter(([p]) => OWN.test(p));
    expect(own.length).toBeGreaterThanOrEqual(19);
    for (const [p, v] of own) expect(v, p).toMatch(/var\(--dobra-/);
  });
  it('leaves theming to the page root instead of a media query', () => {
    expect(css).not.toContain('prefers-color-scheme');
  });
});

// Chips draw colored text on a tint of the same color over the panel. Each theme's tint strength
// comes from report.css (the light block overrides the base one), and the text must stay at 4.5:1.
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => c.map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v * t + b[i] * (1 - t));
function tint(block: string, name: string): number {
  const m = new RegExp(`--${name}-soft: color-mix\\(in srgb, var\\(--dobra-[a-z0-9-]+\\) (\\d+)%`).exec(block);
  if (!m) throw new Error(`no --${name}-soft in block`);
  return Number(m[1]) / 100;
}
const blockOf = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)));
const CHIPS = [['bad', 'hinge'], ['warn', 'warn'], ['ok', 'pass'], ['info', 'accent-2']] as const;

describe.each([['dark', ':root'], ['light', ":root[data-theme='light']"]] as const)('chip contrast in %s', (theme, selector) => {
  const t = tokens[theme];
  const bg = rgb(t.bg);
  const panelMatch = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(t.panel)!;
  const panel = mix([+panelMatch[1], +panelMatch[2], +panelMatch[3]], bg, +panelMatch[4]);
  it.each(CHIPS)('--%s text reads on its own tint', (name, token) => {
    const block = theme === 'light' && css.includes(`${selector} {`) && blockOf(selector).includes(`--${name}-soft`) ? blockOf(selector) : blockOf(':root');
    const fg = rgb(t[token]);
    expect(ratio(fg, mix(fg, panel, tint(block, name)))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('narrow screens', () => {
  // A Figma file name is shown in an h2; one long word must wrap, not widen a 375 px page.
  it('wraps long headings', () => {
    const h2Rules = [...css.matchAll(/(?:^|\n)h2 \{([^}]*)\}/g)].flatMap((m) => declarations(m[1]));
    expect(h2Rules).toContainEqual(['overflow-wrap', 'anywhere']);
  });
});

describe('website input', () => {
  // SiteCheckForm and the Figma/Website switch ship unstyled class names; each needs a rule here.
  it.each(['input-switch', 'site-check', 'site-check__url', 'site-check__targets', 'site-check__submit', 'site-check__handoff', 'site-check__copy', 'site-check__error', 'site-check__probing'])(
    '.%s has a rule',
    (cls) => {
      expect(css).toMatch(new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{`));
    },
  );
});

describe('report packages', () => {
  // The ZIP download is a plain button in the downloads row and inherits the button style; the
  // "read in this browser only" note under the drop zone needs its own caption style.
  it('styles the ZIP note', () => {
    expect(css).toMatch(/\.report-zip__note(?![\w-])[^{]*\{/);
  });
});
