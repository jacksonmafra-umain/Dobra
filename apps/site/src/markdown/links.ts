// Links written between guide files (04-web.md#x) become site routes (/guide/web/#x).
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { guideHref, guideSlug } from '../lib/guide';

const GUIDE_FILE = /^(?:\.\/)?(\d{2}-[a-z0-9-]+)\.md(#.*)?$/;

export function remarkGuideLinks() {
  return (tree: Root) => {
    visit(tree, 'link', (node) => {
      const m = GUIDE_FILE.exec(node.url);
      if (m) node.url = guideHref(guideSlug(m[1])) + (m[2] ?? '');
    });
  };
}
