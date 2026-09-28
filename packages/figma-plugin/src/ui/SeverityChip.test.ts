import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeverityChip, severityLabel } from './SeverityChip';

describe('SeverityChip', () => {
  it('labels each severity like the web report', () => {
    expect(severityLabel('error')).toBe('ERROR');
    expect(severityLabel('warn')).toBe('WARN');
    expect(severityLabel('info')).toBe('INFO');
    expect(severityLabel('fatal')).toBe('INFO');
  });
  it('renders a chip with a class per severity', () => {
    expect(renderToStaticMarkup(createElement(SeverityChip, { severity: 'warn' }))).toBe('<span class="chip chip--warn">WARN</span>');
  });
});
