import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const guideDir = fileURLToPath(new URL('../../../../docs/guide/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return dir === dist && (name === 'simulator' || name === 'report') ? [] : htmlFiles(p);
    return name.endsWith('.html') ? [p] : [];
  });
}
const pages = htmlFiles(dist);
const route = (file: string) => '/' + file.slice(dist.length).replace(/index\.html$/, '');

describe('built site', () => {
  it('has a page for every guide file', () => {
    const expected = readdirSync(guideDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const slug = f.replace(/\.md$/, '').replace(/^\d{2}-/, '');
        return slug === 'index' ? '/guide/' : `/guide/${slug}/`;
      });
    const routes = pages.map(route);
    for (const r of expected) expect(routes, r).toContain(r);
  });

  it.each(pages.map((p) => [route(p), p]))('%s has unique heading ids, each anchored on guide pages', (r, file) => {
    const html = readFileSync(file, 'utf8');
    const ids = [...html.matchAll(/<h[2-4][^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    // Landing-page headings carry ids only for aria-labelledby; guide sections are the linkable ones.
    if (r.startsWith('/guide/')) for (const id of ids) expect(html).toContain(`href="#${id}"`);
  });

  it.each(pages.map((p) => [route(p), p]))('%s links only to pages and anchors that exist', (r, file) => {
    const html = readFileSync(file, 'utf8');
    for (const [, href] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [path, hash] = href.split('#');
      const target = path ? path : r;
      const targetFile = join(dist, target, target.endsWith('/') ? 'index.html' : '');
      expect(existsSync(targetFile), `${href} from ${r}`).toBe(true);
      if (hash) expect(readFileSync(targetFile, 'utf8'), `#${hash} from ${r}`).toContain(`id="${hash}"`);
    }
  });

  it('bundles the simulator and the report with their assets', () => {
    const sim = readFileSync(join(dist, 'simulator/index.html'), 'utf8');
    const assets = [...sim.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);
    expect(assets.length).toBeGreaterThan(0);
    for (const src of assets) expect(existsSync(join(dist, 'simulator', src)), src).toBe(true);
    expect(existsSync(join(dist, 'report/index.html'))).toBe(true);
  });

  it('points the canonical URL and the sitemap at dobra-five.vercel.app', () => {
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toContain('<link rel="canonical" href="https://dobra-five.vercel.app/"');
    expect(readFileSync(join(dist, 'sitemap-0.xml'), 'utf8')).toContain('https://dobra-five.vercel.app/guide/');
  });

  it('asks Vercel to redirect to trailing slashes, so /simulator loads its relative assets', () => {
    expect(JSON.parse(readFileSync(join(dist, 'vercel.json'), 'utf8'))).toMatchObject({ trailingSlash: true });
  });

  it('loads no fonts from the network', () => {
    for (const file of pages) expect(readFileSync(file, 'utf8')).not.toContain('fonts.googleapis');
  });
});
