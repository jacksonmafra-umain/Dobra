// The guide's "## Glossary entries" section is one entry per line, fields separated by " | ".
// This turns those lines into a five-column table. A pipe inside inline code is not a separator;
// a line with the wrong number of fields stays visible as a paragraph after the table.
import type { Paragraph, PhrasingContent, Root, RootContent, Table, TableCell, TableRow } from 'mdast';

const HEADER = ['Term', 'Definition', 'Platforms', 'Elsewhere', 'Source'];

/** Splits a paragraph's inline nodes into lines, then each line into fields at "|" outside code. */
function entries(p: Paragraph): PhrasingContent[][][] {
  const lines: PhrasingContent[][][] = [[[]]];
  for (const node of p.children) {
    if (node.type !== 'text') {
      lines.at(-1)!.at(-1)!.push(node);
      continue;
    }
    node.value.split('\n').forEach((segment, i) => {
      if (i > 0) lines.push([[]]);
      segment.split('|').forEach((part, j) => {
        if (j > 0) lines.at(-1)!.push([]);
        if (part) lines.at(-1)!.at(-1)!.push({ type: 'text', value: part });
      });
    });
  }
  return lines.map((fields) => fields.map(trim)).filter((fields) => fields.some((f) => f.length));
}

function trim(field: PhrasingContent[]): PhrasingContent[] {
  const out = field.map((n) => ({ ...n }));
  const first = out[0];
  const last = out.at(-1);
  if (first?.type === 'text') first.value = first.value.trimStart();
  if (last?.type === 'text') last.value = last.value.trimEnd();
  return out.filter((n) => n.type !== 'text' || n.value !== '');
}

const cell = (children: PhrasingContent[]): TableCell => ({ type: 'tableCell', children });
const row = (cells: PhrasingContent[][]): TableRow => ({ type: 'tableRow', children: cells.map(cell) });
const isSection = (n: RootContent, title: string) => n.type === 'heading' && n.depth === 2 && n.children.some((c) => c.type === 'text' && c.value.trim() === title);

export function remarkGlossaryTable() {
  return (tree: Root) => {
    const at = tree.children.findIndex((n) => isSection(n, 'Glossary entries'));
    if (at < 0) return;
    let end = at + 1;
    while (end < tree.children.length && !(tree.children[end].type === 'heading' && (tree.children[end] as { depth: number }).depth <= 2)) end++;
    const rows: TableRow[] = [];
    const leftovers: RootContent[] = [];
    for (const node of tree.children.slice(at + 1, end)) {
      if (node.type !== 'paragraph') {
        leftovers.push(node);
        continue;
      }
      for (const fields of entries(node)) {
        if (fields.length === 5) rows.push(row(fields));
        else leftovers.push({ type: 'paragraph', children: fields.flatMap((f, i) => (i ? [{ type: 'text', value: ' | ' } as PhrasingContent, ...f] : f)) });
      }
    }
    const table: Table = { type: 'table', align: HEADER.map(() => null), children: [row(HEADER.map((h) => [{ type: 'text', value: h }])), ...rows], data: { hProperties: { className: ['glossary'] } } };
    tree.children.splice(at + 1, end - at - 1, table, ...leftovers);
  };
}
