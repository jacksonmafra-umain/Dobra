import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import raw from '../config/simulator.config.json';
import { asset, hasAsset } from './assets';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });
}

// Every image name the app can ask for: literals in the source, tab icons from the config, and
// the two Home tab icons that tabBar.tsx picks by name.
const literal = /asset\(\s*['"]([^'"]+)['"]\s*\)|['"]([\w-]+\.svg)['"]/g;
const used = new Set<string>(['ic_logo_filled_32.svg', 'ic_logo_default_mask_32.svg']);
for (const file of sources(fileURLToPath(new URL('..', import.meta.url)))) {
  for (const m of readFileSync(file, 'utf8').matchAll(literal)) used.add(m[1] ?? m[2]);
}
for (const item of raw.tabBar.items) {
  used.add(`${item.icon}.svg`);
  if (item.iconSelected) used.add(`${item.iconSelected}.svg`);
}

describe('sample art', () => {
  it.each([...used].sort())('resolves %s', (name) => {
    expect(hasAsset(name)).toBe(true);
    expect(asset(name)).toMatch(/^data:image\/svg\+xml,/);
  });

  it('resolves .png names to the same art as the name without extension', () => {
    expect(asset('reward_fries.png')).toBe(asset('reward_fries.svg'));
  });

  it('throws on unknown names', () => {
    expect(() => asset('nope.svg')).toThrow(/Missing sample asset "nope.svg"/);
  });
});
