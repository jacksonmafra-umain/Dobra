import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportHeader } from './ReportHeader';

const html = <P extends object>(el: (props: P) => unknown, props: P) => renderToStaticMarkup(createElement(el as never, props as never));

describe('ReportHeader', () => {
  it('shows the logo for each system theme, the heading and the catalog badge', () => {
    const out = html(ReportHeader, { catalogVersion: '0.5.0' });
    expect(out).toContain('<picture');
    expect(out).toContain('media="(prefers-color-scheme: light)"');
    expect(out).toContain('alt="Dobra"');
    expect(out).toContain('<h1>Foldable Check</h1>');
    expect(out).toContain('catalog 0.5.0');
  });
});
