// A visible "#" link after each section heading, so any section can be linked directly. The "#" is
// drawn in CSS: Astro reads heading text for the sidebar, and a text node would end up there.
import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

export function rehypeHeadingAnchors() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (!['h2', 'h3', 'h4'].includes(node.tagName)) return;
      const id = node.properties?.id;
      if (typeof id !== 'string' || !id) return;
      node.children.push({ type: 'element', tagName: 'a', properties: { className: ['anchor'], href: `#${id}`, ariaLabel: 'Link to this section' }, children: [] });
    });
  };
}
