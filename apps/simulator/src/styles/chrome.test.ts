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

// The declarations of the first rule whose selector is exactly `selector`.
function rule(css: string, selector: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`));
  if (start < 0) throw new Error(`No rule for ${selector}`);
  const open = clean.indexOf('{', start);
  return new Map(declarations(clean.slice(open + 1, clean.indexOf('}', open))));
}

describe('simulated system UI', () => {
  // The other app in split screen and the divider are drawn by the simulated OS. They must stand
  // out from the screen behind them in both themes, so they use the strong border, never the
  // translucent panel tones or the canvas color; the divider uses muted text, which reads in both themes.
  it('draws the other app and the split divider in a tone that contrasts with the screen', () => {
    const css = read('./app.css');
    expect(rule(css, '.window-other').get('background')).toMatch(/var\(--dobra-border-strong\)/);
    expect(rule(css, '.window-divider').get('background')).toBe('var(--dobra-muted)');
  });
});

describe('narrow windows', () => {
  // Below 960 px the top bar wraps and can be taller than the window; the page must scroll as a
  // whole, or the canvas and inspector get no height at all.
  it('lets the whole page scroll instead of fixing the app to the window height', () => {
    const css = read('./app.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const start = css.indexOf('@media (width<=960px) {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n}\n', start));
    const app = new Map(declarations(block.slice(block.indexOf('.app {'), block.indexOf('}', block.indexOf('.app {')) + 1)));
    expect(app.get('height')).toBe('auto');
    expect(app.get('min-height')).toBe('100%');
  });
});

describe('primary action', () => {
  // Spec §4: the export button is the solid fold-colored primary.
  it('styles Export report as the accent button', () => {
    const app = readFileSync(new URL('../ui/App.tsx', import.meta.url), 'utf8');
    const button = app.slice(app.lastIndexOf('<button', app.indexOf('onClick={exportReport}')), app.indexOf('onClick={exportReport}'));
    expect(button).toContain('className="seg-single seg-single--accent"');
  });
});

describe('Figma screens', () => {
  // The modal and the frame view ship plain class names; each needs a rule in app.css.
  it.each([
    'figma-screens', 'figma-screens__step', 'figma-screens__search', 'figma-screens__page', 'figma-screens__frame',
    'figma-screens__thumb', 'figma-screens__meta', 'figma-screens__actions', 'figma-screens__error',
    'figma-screen', 'figma-screen__canvas', 'figma-screen__image', 'figma-screen__banner', 'figma-screen__state',
  ])('.%s has a rule', (cls) => {
    expect(read('./app.css')).toMatch(new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{`));
  });
});

describe('Figma screens dialog contents', () => {
  // The dialog's title, fields and buttons are plain elements; they are styled from inside the step.
  it.each(['.figma-screens__step h2', '.figma-screens__step label', ".figma-screens__step input[type='url']", '.figma-screens__actions button'])('%s has a rule', (sel) => {
    expect(read('./app.css')).toContain(`${sel}`);
  });
});

describe('monospace ligatures', () => {
  // JetBrains Mono would draw "://" and "--" as single glyphs, so a typed URL reads as "http: /".
  it('turns contextual ligatures off on every element', () => {
    expect(read('./app.css')).toMatch(/\*, ::before, ::after \{ font-variant-ligatures: no-contextual !important; \}/);
  });
});
