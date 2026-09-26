import { describe, expect, it } from 'vitest';
import { outermost, walk, type GeoNode } from './geo';

const n = (id: string, role: GeoNode['role'], x: number, children: GeoNode[] = [], extra: Partial<GeoNode> = {}): GeoNode => ({
  id, name: id, role, rect: { x, y: 0, width: 50, height: 50 }, children, ...extra,
});

describe('geometry tree', () => {
  const tree = [n('list', 'container', 0, [n('card', 'interactive', 0, [n('button', 'interactive', 10), n('label', 'text', 10)])], { scrollAxis: 'y' })];

  it('walks depth first and remembers the nearest scrolling ancestor', () => {
    expect(walk(tree).map((p) => [p.node.id, p.depth, p.scrolls])).toEqual([
      ['list', 0, 'none'],
      ['card', 1, 'y'],
      ['button', 2, 'y'],
      ['label', 2, 'y'],
    ]);
  });

  it('keeps only the outermost node of a nested pick', () => {
    expect(outermost(walk(tree), (g) => g.role === 'interactive').map((p) => p.node.id)).toEqual(['card']);
  });
});
