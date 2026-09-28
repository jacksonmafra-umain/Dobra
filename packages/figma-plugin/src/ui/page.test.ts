import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

describe('panel page', () => {
  // The module script runs after the first paint; this inline script sets the theme before it, so
  // the panel never flashes the wrong theme when it opens.
  it('sets data-theme from Figma\'s class in an inline script before the app script', () => {
    const inline = html.indexOf('<script>');
    expect(inline).toBeGreaterThan(-1);
    expect(inline).toBeLessThan(html.indexOf('<script type="module"'));
    const body = html.slice(inline, html.indexOf('</script>', inline));
    expect(body).toContain("classList.contains('figma-dark')");
    expect(body).toContain('dataset.theme');
  });
});
