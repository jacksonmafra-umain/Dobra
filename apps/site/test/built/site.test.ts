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

  it('renders every guide image with alt text and a file that exists', () => {
    for (const f of readdirSync(guideDir).filter((x) => x.endsWith('.md'))) {
      const refs = [...readFileSync(join(guideDir, f), 'utf8').matchAll(/!\[[^\]]*\]\((images\/[^)\s]+)\)/g)];
      if (!refs.length) continue;
      const slug = f.replace(/\.md$/, '').replace(/^\d{2}-/, '');
      const page = readFileSync(join(dist, slug === 'index' ? 'guide' : `guide/${slug}`, 'index.html'), 'utf8');
      const article = page.slice(page.indexOf('<article'), page.indexOf('</article>'));
      const imgs = [...article.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      expect(imgs, f).toHaveLength(refs.length);
      for (const img of imgs) {
        expect(img, `${f}: ${img}`).toMatch(/\salt="[^"]+"/);
        const src = /\ssrc="([^"]+)"/.exec(img)?.[1] ?? '';
        expect(src.startsWith('data:') || existsSync(join(dist, src.split('?')[0])), `${f}: ${src}`).toBe(true);
      }
    }
  });

  // The site's own links (header, landing page); guide articles keep their links as written.
  it('opens the tools and outside sites in a new tab, safely', () => {
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      const chrome = html.includes('<article') ? html.slice(0, html.indexOf('<article')) + html.slice(html.indexOf('</article>')) : html;
      for (const [a, href] of chrome.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)) {
        if (!/^(\/simulator\/|\/report\/|https?:)/.test(href)) continue;
        expect(a, `${route(file)} ${href}`).toContain('target="_blank"');
        expect(a, `${route(file)} ${href}`).toMatch(/rel="noopener[^"]*"/);
      }
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

  it('shows designers the one-line installer on the landing page', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(html).toContain('curl -fsSL https://raw.githubusercontent.com/jacksonmafra-umain/Dobra/main/install.sh');
    expect(html).toContain('dobra plugin');
    expect(html).toContain('Import plugin from manifest');
    expect(html).toContain('packages/figma-plugin/manifest.json');
  });

  it('loads no fonts from the network', () => {
    for (const file of pages) expect(readFileSync(file, 'utf8')).not.toContain('fonts.googleapis');
  });

  it('builds the Generator page with a script for the first device', () => {
    const html = readFileSync(join(dist, 'generator/index.html'), 'utf8');
    expect(html).toContain('#!/bin/sh');
    expect(html).toContain('dobra emulator create');
    expect(html).toContain('Download script');
    expect(html).toContain('<details class="generator__script"');
    expect(html).toContain('<input type="checkbox" name="device"');
  });

  it('presents the dobra Claude Code skill on the landing page and its own page', () => {
    const home = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(home).toContain('href="/claude-code/"');
    expect(home).toContain('Claude Code');
    const page = readFileSync(join(dist, 'claude-code/index.html'), 'utf8');
    expect(page).toContain('/plugin marketplace add jacksonmafra-umain/Dobra');
    expect(page).toContain('/plugin install dobra@dobra');
    expect(page).toContain('~/.claude/skills/dobra');
    expect(page).toContain('dobra check site');
    expect(page).toContain('dobra emulator create');
  });
});
