import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from './MarkdownView';

const html = (markdown: string, images: Record<string, string> = {}) => renderToStaticMarkup(createElement(MarkdownView, { markdown, images }));

describe('MarkdownView', () => {
  it('renders the headings, tables, lists and emphasis a report uses', () => {
    const out = html(
      [
        '# Foldable check — site',
        '',
        'Generated today',
        '',
        '| Category | Covered |',
        '|---|---|',
        '| phone | 1/1 |',
        '',
        '## Frames',
        '',
        '### Pixel (exact)',
        '- ⛔ **hinge-content** Text crosses the hinge _(estimated)_ in `main`',
      ].join('\n'),
    );
    expect(out).toContain('<h1>Foldable check — site</h1>');
    expect(out).toContain('<p>Generated today</p>');
    expect(out).toContain('<th>Category</th><th>Covered</th>');
    expect(out).toContain('<td>phone</td><td>1/1</td>');
    expect(out).toContain('<h2>Frames</h2>');
    expect(out).toContain('<h3>Pixel (exact)</h3>');
    expect(out).toContain('<li>⛔ <strong>hinge-content</strong> Text crosses the hinge <em>(estimated)</em> in <code>main</code></li>');
  });

  it("shows a package's own screenshots", () => {
    const out = html('![Pixel \\[main\\]](screenshots/001-pixel.png)', { 'screenshots/001-pixel.png': 'blob:abc' });
    expect(out).toContain('<img class="markdown__shot" src="blob:abc" alt="Pixel [main]"');
  });

  it('never loads an image from outside the package', () => {
    const out = html('![tracker](https://evil.example/pixel.png)\n\n![gone](screenshots/002-x.png)');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('evil.example/pixel.png"');
    expect(out).toContain('tracker');
  });

  it('shows HTML and links as text, never as markup', () => {
    const out = html('<script>alert(1)</script>\n\n- [click](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<a');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('[click](javascript:alert(1))');
  });
});
