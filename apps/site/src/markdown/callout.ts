// "[unverified — confirm before use]" marks a claim the guide could not confirm. It renders as an
// amber inline callout, and its paragraph gets a class so the whole claim can be highlighted.
import type { Paragraph, PhrasingContent, Root } from 'mdast';
import { visit } from 'unist-util-visit';

const MARK = '[unverified — confirm before use]';
const HTML = '<mark class="unverified">unverified — confirm before use</mark>';

export function remarkUnverifiedCallout() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (p: Paragraph) => {
      let found = false;
      p.children = p.children.flatMap((node): PhrasingContent[] => {
        if (node.type !== 'text' || !node.value.includes(MARK)) return [node];
        found = true;
        return node.value.split(MARK).flatMap((part, i) => [
          ...(i ? [{ type: 'html', value: HTML } as PhrasingContent] : []),
          ...(part ? [{ type: 'text', value: part } as PhrasingContent] : []),
        ]);
      });
      // hProperties is read by mdast-util-to-hast when the tree becomes HTML.
      const data = (p.data ?? {}) as { hProperties?: Record<string, unknown> };
      if (found) p.data = { ...data, hProperties: { ...data.hProperties, className: ['has-unverified'] } } as Paragraph['data'];
    });
  };
}
