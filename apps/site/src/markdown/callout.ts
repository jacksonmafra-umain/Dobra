// "[unverified — confirm before use]" marks a claim the guide could not confirm. It renders as an
// amber inline callout wherever it appears (paragraphs, table cells, list items), and the paragraph
// that holds it gets a class so the whole claim can be highlighted.
import type { Nodes, Paragraph, PhrasingContent, Root, Text } from 'mdast';
import { SKIP, visitParents } from 'unist-util-visit-parents';

const MARK = '[unverified — confirm before use]';
const HTML = '<mark class="unverified">unverified — confirm before use</mark>';

function tag(p: Paragraph) {
  // hProperties is read by mdast-util-to-hast when the tree becomes HTML.
  const data = (p.data ?? {}) as { hProperties?: Record<string, unknown> };
  p.data = { ...data, hProperties: { ...data.hProperties, className: ['has-unverified'] } } as Paragraph['data'];
}

export function remarkUnverifiedCallout() {
  return (tree: Root) => {
    visitParents(tree, 'text', (node: Text, ancestors: Nodes[]) => {
      if (!node.value.includes(MARK)) return;
      const parent = ancestors.at(-1) as { children: PhrasingContent[] };
      const parts = node.value.split(MARK).flatMap((part, i): PhrasingContent[] => [
        ...(i ? [{ type: 'html', value: HTML } as PhrasingContent] : []),
        ...(part ? [{ type: 'text', value: part } as PhrasingContent] : []),
      ]);
      const at = parent.children.indexOf(node);
      parent.children.splice(at, 1, ...parts);
      const paragraph = [...ancestors].reverse().find((a): a is Paragraph => a.type === 'paragraph');
      if (paragraph) tag(paragraph);
      return [SKIP, at + parts.length];
    });
  };
}
