import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportNotes } from './ReportNotes';

const render = (notes?: string[]) => renderToStaticMarkup(createElement(ReportNotes, { notes }));

describe('ReportNotes', () => {
  it('lists each note under a Notes heading', () => {
    const html = render(['Zoomed out to fit 1 target.', 'Chromium 153']);
    expect(html).toContain('<h2>Notes</h2>');
    expect(html).toContain('<li>Zoomed out to fit 1 target.</li>');
    expect(html).toContain('<li>Chromium 153</li>');
  });
  it('renders nothing when the report has no notes', () => {
    expect(render(undefined)).toBe('');
    expect(render([])).toBe('');
  });
});
