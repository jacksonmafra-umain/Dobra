import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const pkg = (p: string) => new URL(`../${p}`, import.meta.url);
const css = readFileSync(pkg('fonts.css'), 'utf8');

const FONTS = [
  ['Geist', '@fontsource-variable/geist', 'geist-latin-wght-normal.woff2', 'OFL-geist.txt'],
  ['Inter', '@fontsource-variable/inter', 'inter-latin-wght-normal.woff2', 'OFL-inter.txt'],
  ['JetBrains Mono', '@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2', 'OFL-jetbrains-mono.txt'],
] as const;

describe('fonts.css', () => {
  it('points only at files that exist in the package', () => {
    const urls = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((m) => m[1]);
    expect(urls).toHaveLength(3);
    for (const u of urls) expect(existsSync(pkg(u)), u).toBe(true);
  });

  it.each(FONTS)('declares %s as a variable Latin face', (family, _source, file) => {
    const face = css.split('@font-face').find((b) => b.includes(`font-family: '${family}'`));
    expect(face).toBeDefined();
    expect(face).toContain(`url('./fonts/${file}') format('woff2')`);
    expect(face).toContain('font-weight: 100 900');
    expect(face).toContain('font-display: swap');
    expect(face).toContain('unicode-range: U+0000-00FF');
  });
});

describe.each(FONTS)('the bundled %s', (_family, source, file, licence) => {
  it('matches the installed @fontsource file byte for byte', () => {
    const installed = readFileSync(require.resolve(`${source}/files/${file}`));
    expect(readFileSync(pkg(`fonts/${file}`)).equals(installed)).toBe(true);
  });

  it('ships its OFL licence', () => {
    expect(readFileSync(pkg(`fonts/${licence}`), 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});
