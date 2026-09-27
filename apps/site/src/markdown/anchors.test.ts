import type { Root } from 'hast';
import { describe, expect, it } from 'vitest';
import { rehypeHeadingAnchors } from './anchors';

describe('rehypeHeadingAnchors', () => {
  it('adds an anchor link to h2–h4 headings that have an id', () => {
    const t: Root = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'h2', properties: { id: 'testing' }, children: [{ type: 'text', value: 'Testing' }] },
        { type: 'element', tagName: 'h1', properties: { id: 'title' }, children: [] },
        { type: 'element', tagName: 'h3', properties: {}, children: [] },
      ],
    };
    rehypeHeadingAnchors()(t);
    const h2 = t.children[0] as unknown as { children: { tagName?: string; properties?: { href?: string } }[] };
    expect(h2.children.at(-1)).toMatchObject({ tagName: 'a', properties: { href: '#testing' } });
    // No text inside the link: Astro reads heading text for the sidebar, so the "#" is drawn in CSS.
    expect((h2.children.at(-1) as { children: unknown[] }).children).toEqual([]);
    expect((t.children[1] as unknown as { children: unknown[] }).children).toHaveLength(0);
    expect((t.children[2] as unknown as { children: unknown[] }).children).toHaveLength(0);
  });
});
