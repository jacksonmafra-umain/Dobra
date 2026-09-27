import type { Root } from 'mdast';
import { describe, expect, it } from 'vitest';
import { remarkGuideLinks } from './links';

const tree = (...urls: string[]): Root => ({ type: 'root', children: [{ type: 'paragraph', children: urls.map((url) => ({ type: 'link', url, children: [{ type: 'text', value: 'x' }] })) }] });
const urls = (t: Root) => (t.children[0] as unknown as { children: { url: string }[] }).children.map((l) => l.url);

describe('remarkGuideLinks', () => {
  it('rewrites links between guide files to site routes, keeping anchors', () => {
    const t = tree('04-web.md', './02-android.md#foldables-and-postures', '00-index.md');
    remarkGuideLinks()(t);
    expect(urls(t)).toEqual(['/guide/web/', '/guide/android/#foldables-and-postures', '/guide/']);
  });
  it('leaves other links alone', () => {
    const t = tree('https://developer.android.com/x.md', '#local', 'README.md');
    remarkGuideLinks()(t);
    expect(urls(t)).toEqual(['https://developer.android.com/x.md', '#local', 'README.md']);
  });
});
