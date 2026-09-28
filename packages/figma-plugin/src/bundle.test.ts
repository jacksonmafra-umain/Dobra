import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = (f: string) => fileURLToPath(new URL(`../dist/${f}`, import.meta.url));

// Runs after a build (the build script calls it); skipped when dist/ is missing.
describe.skipIf(!existsSync(dist('code.js')))('bundle', () => {
  it('ships the catalog and no app profile', () => {
    const code = readFileSync(dist('code.js'), 'utf8');
    expect(code).toContain('surface-duo-2');
    // Profile data, not schema code: the profile's own comment and a sample component.
    expect(code).not.toContain('Sample app profile');
    expect(code).not.toContain('pickup_option_item');
    expect(code).not.toContain('Sample design system');
  });

  it('has no text the Figma sandbox rejects', () => {
    // Figma rejects plugin code containing "import(" or HTML comment markers anywhere, comments included.
    const code = readFileSync(dist('code.js'), 'utf8');
    expect(code).not.toMatch(/\bimport\s*\(/);
    expect(code).not.toMatch(/<!--|-->/);
  });

  it('carries the brand fonts inside ui.html and fetches nothing', () => {
    const ui = readFileSync(dist('ui.html'), 'utf8');
    expect(ui.match(/font\/woff2/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(ui).not.toMatch(/fonts\.googleapis|https?:\/\/[^"')\s]+\.(woff2?|css)/);
  });

  it('builds one self-contained UI file', () => {
    expect(readFileSync(dist('ui.html'), 'utf8')).not.toMatch(/<script[^>]+src=/);
  });
});
