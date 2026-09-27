import type { Root } from 'mdast';
import { describe, expect, it } from 'vitest';
import { remarkSourcesBlock } from './sources';

const h = (text: string, depth: 1 | 2 | 3 = 2) => ({ type: 'heading' as const, depth, children: [{ type: 'text' as const, value: text }] });
const p = (text: string) => ({ type: 'paragraph' as const, children: [{ type: 'text' as const, value: text }] });

describe('remarkSourcesBlock', () => {
  it('wraps the Sources section up to the next h2', () => {
    const t: Root = { type: 'root', children: [h('Testing'), p('a'), h('Sources'), p('https://x'), h('Sub', 3), p('y'), h('After')] };
    remarkSourcesBlock()(t);
    expect(t.children.map((n) => (n.type === 'html' ? n.value : n.type))).toEqual(['heading', 'paragraph', '<section class="sources">', 'heading', 'paragraph', 'heading', 'paragraph', '</section>', 'heading']);
  });
  it('wraps to the end when Sources is last, and does nothing without it', () => {
    const t: Root = { type: 'root', children: [h('Sources'), p('https://x')] };
    remarkSourcesBlock()(t);
    expect((t.children.at(-1) as { value: string }).value).toBe('</section>');
    const u: Root = { type: 'root', children: [h('Testing'), p('a')] };
    remarkSourcesBlock()(u);
    expect(u.children).toHaveLength(2);
  });
});
