import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SiteCheckForm } from './SiteCheckForm';

const html = (health: unknown) => renderToStaticMarkup(createElement(SiteCheckForm, { health: health as never, onReport: () => {} }));

describe('SiteCheckForm', () => {
  it('says it is looking for an endpoint while the probe runs', () => {
    expect(html(undefined)).toContain('Looking for a check endpoint');
  });
  it('shows the command hand-off when no endpoint answers', () => {
    const out = html(null);
    expect(out).toContain('site-check__handoff');
    expect(out).toContain('<code');
    expect(out).toContain('npm run dobra -- check site');
    expect(out).toContain('npx playwright install --with-deps chromium');
    expect(out).toContain('npm run dobra -- report');
  });
  it('gives the hand-off a copy button, the setup it needs, and the right way back to this page', () => {
    const out = html(null);
    expect(out).toContain('site-check__copy');
    expect(out).toContain('npm run build:cli');
    expect(out).toContain('npx playwright install chromium');
    expect(out).not.toContain('check from this page');
    expect(out).toMatch(/open the address it prints/);
  });
  it('keeps the address and device fields in the hand-off, so the command is for the right site', () => {
    const out = html(null);
    expect(out).toContain('site-check__url');
    expect(out).toContain('site-check__targets');
    expect(out).not.toContain('site-check__submit');
  });
  it('shows the form when a local endpoint answers', () => {
    const out = html({ ok: true, mode: 'local', maxTargets: null, maxSeconds: null });
    for (const c of ['site-check', 'site-check__url', 'site-check__targets', 'site-check__submit']) expect(out).toContain(c);
    expect(out).toContain('Check site');
    expect(out).toContain('Representative set');
  });
  it('states the device limit of a hosted endpoint', () => {
    expect(html({ ok: true, mode: 'hosted', maxTargets: 6, maxSeconds: 50 })).toContain('up to 6 devices');
  });
});
