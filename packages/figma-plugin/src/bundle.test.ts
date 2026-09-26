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

  it('builds one self-contained UI file', () => {
    expect(readFileSync(dist('ui.html'), 'utf8')).not.toMatch(/<script[^>]+src=/);
  });
});
