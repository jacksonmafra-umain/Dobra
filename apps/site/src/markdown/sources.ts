// Each guide page ends with "## Sources". Wrapping that section lets it render as its own block.
import type { Root } from 'mdast';

export function remarkSourcesBlock() {
  return (tree: Root) => {
    const at = tree.children.findIndex((n) => n.type === 'heading' && n.depth === 2 && n.children.some((c) => c.type === 'text' && c.value.trim() === 'Sources'));
    if (at < 0) return;
    let end = at + 1;
    while (end < tree.children.length && !(tree.children[end].type === 'heading' && (tree.children[end] as { depth: number }).depth <= 2)) end++;
    tree.children.splice(end, 0, { type: 'html', value: '</section>' });
    tree.children.splice(at, 0, { type: 'html', value: '<section class="sources">' });
  };
}
