import type { Root, Table } from 'mdast';
import { describe, expect, it } from 'vitest';
import { remarkGlossaryTable } from './glossary';

const heading = (text: string, depth: 1 | 2 = 2) => ({ type: 'heading' as const, depth, children: [{ type: 'text' as const, value: text }] });
const para = (...lines: (string | { code: string })[]) => ({
  type: 'paragraph' as const,
  children: lines.map((l) => (typeof l === 'string' ? { type: 'text' as const, value: l } : { type: 'inlineCode' as const, value: l.code })),
});

describe('remarkGlossaryTable', () => {
  it('turns each entry line into a table row', () => {
    const t: Root = { type: 'root', children: [heading('Glossary entries'), para('compact | Smallest class | Android | iOS: compact | https://a\nbook posture | Half-open | Android | Web: segments | https://b'), heading('Sources')] };
    remarkGlossaryTable()(t);
    const table = t.children[1] as Table;
    expect(table.type).toBe('table');
    expect(table.children).toHaveLength(3);
    expect(table.children[1].children.map((c) => (c.children[0] as { value: string }).value)).toEqual(['compact', 'Smallest class', 'Android', 'iOS: compact', 'https://a']);
  });

  it('does not split on a pipe inside inline code', () => {
    const t: Root = { type: 'root', children: [heading('Glossary entries'), para('or | Either ', { code: 'a | b' }, ' | Web | none | https://c')] };
    remarkGlossaryTable()(t);
    const row = (t.children[1] as Table).children[1];
    expect(row.children).toHaveLength(5);
    expect(row.children[1].children.some((n) => n.type === 'inlineCode' && n.value === 'a | b')).toBe(true);
  });

  it('keeps a malformed line visible instead of dropping it', () => {
    const t: Root = { type: 'root', children: [heading('Glossary entries'), para('good | a | b | c | d\nbroken | only three | fields')] };
    remarkGlossaryTable()(t);
    expect(t.children[1].type).toBe('table');
    expect(t.children[2].type).toBe('paragraph');
    expect(JSON.stringify(t.children[2])).toContain('broken');
  });

  it('leaves other sections alone', () => {
    const t: Root = { type: 'root', children: [heading('Testing'), para('a | b | c | d | e')] };
    remarkGlossaryTable()(t);
    expect(t.children[1].type).toBe('paragraph');
  });
});
