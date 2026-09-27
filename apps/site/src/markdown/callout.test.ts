import type { Root } from 'mdast';
import { describe, expect, it } from 'vitest';
import { remarkUnverifiedCallout } from './callout';

const MARK = '[unverified — confirm before use]';

describe('remarkUnverifiedCallout', () => {
  it('turns the marker into an inline callout and tags its paragraph', () => {
    const t: Root = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: `Stage Manager title bar ${MARK}; see below.` }] }] };
    remarkUnverifiedCallout()(t);
    const p = t.children[0] as unknown as { data?: { hProperties?: { className?: string[] } }; children: { type: string; value: string }[] };
    expect(p.children.map((c) => c.type)).toEqual(['text', 'html', 'text']);
    expect(p.children[1].value).toBe('<mark class="unverified">unverified — confirm before use</mark>');
    expect(p.data?.hProperties?.className).toContain('has-unverified');
  });
  it('handles two markers in one text node and ignores look-alikes', () => {
    const t: Root = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: `${MARK} and ${MARK} but not [unverified - confirm before use]` }] }] };
    remarkUnverifiedCallout()(t);
    const html = (t.children[0] as unknown as { children: { type: string }[] }).children.filter((c) => c.type === 'html');
    expect(html).toHaveLength(2);
  });
  it('marks claims inside table cells and list items too', () => {
    const t: Root = {
      type: 'root',
      children: [
        { type: 'table', children: [{ type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: `Stage Manager ${MARK}` }] }] }] },
        { type: 'list', children: [{ type: 'listItem', children: [{ type: 'paragraph', children: [{ type: 'emphasis', children: [{ type: 'text', value: `x ${MARK}` }] }] }] }] },
      ],
    };
    remarkUnverifiedCallout()(t);
    expect(JSON.stringify(t).match(/mark class=\\"unverified\\"/g)).toHaveLength(2);
    expect(JSON.stringify(t)).not.toContain(MARK);
  });
});
