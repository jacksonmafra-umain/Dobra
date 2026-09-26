// An in-memory stand-in for the parts of the Figma plugin API the plugin uses. Nodes behave like
// Figma's: created on the current page, re-parented by appendChild, shared plugin data defaults to ''.
import type { FigmaApi } from '../api';

type NodeType = 'FRAME' | 'RECTANGLE' | 'SECTION' | 'GROUP';

export interface FakeNode {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent: FakeNode | FakePage | null;
  children: FakeNode[];
  fills: unknown[];
  locked: boolean;
  visible: boolean;
  layoutGrids: unknown[];
  cornerRadius: number;
  clipsContent: boolean;
  constraints: unknown;
  resize(width: number, height: number): void;
  appendChild(child: FakeNode): void;
  setSharedPluginData(namespace: string, key: string, value: string): void;
  getSharedPluginData(namespace: string, key: string): string;
}

export interface FakePage {
  type: 'PAGE';
  children: FakeNode[];
  selection: FakeNode[];
  appendChild(child: FakeNode): void;
  findAllWithCriteria(criteria: { types?: NodeType[]; sharedPluginData?: { namespace: string; keys?: string[] } }): FakeNode[];
}

function detach(child: FakeNode) {
  const parent = child.parent;
  if (parent) parent.children.splice(parent.children.indexOf(child), 1);
}

export function createFakeFigma(): FigmaApi & { page: FakePage; zoomedTo: unknown; container(type: 'SECTION' | 'GROUP'): FakeNode } {
  let next = 1;
  const page: FakePage = {
    type: 'PAGE',
    children: [],
    selection: [],
    appendChild(child) {
      detach(child);
      child.parent = page;
      page.children.push(child);
    },
    findAllWithCriteria({ types, sharedPluginData }) {
      const out: FakeNode[] = [];
      const walk = (nodes: FakeNode[]) => {
        for (const n of nodes) {
          const typeOk = !types || types.includes(n.type);
          const dataOk = !sharedPluginData || (sharedPluginData.keys ?? []).every((k) => n.getSharedPluginData(sharedPluginData.namespace, k) !== '');
          if (typeOk && dataOk) out.push(n);
          walk(n.children);
        }
      };
      walk(page.children);
      return out;
    },
  };

  const make = (type: NodeType): FakeNode => {
    const data = new Map<string, string>();
    const node: FakeNode = {
      id: `1:${next++}`,
      type,
      name: type === 'FRAME' ? 'Frame' : type === 'RECTANGLE' ? 'Rectangle' : type === 'SECTION' ? 'Section' : 'Group',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      parent: null,
      children: [],
      fills: [],
      locked: false,
      visible: true,
      layoutGrids: [],
      cornerRadius: 0,
      clipsContent: false,
      constraints: { horizontal: 'MIN', vertical: 'MIN' },
      resize(width, height) {
        node.width = width;
        node.height = height;
      },
      appendChild(child) {
        detach(child);
        child.parent = node;
        node.children.push(child);
      },
      setSharedPluginData(ns, key, value) {
        data.set(`${ns}:${key}`, value);
      },
      getSharedPluginData(ns, key) {
        return data.get(`${ns}:${key}`) ?? '';
      },
    };
    page.appendChild(node);
    return node;
  };

  const find = (id: string, nodes: FakeNode[]): FakeNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = find(id, n.children);
      if (hit) return hit;
    }
    return null;
  };

  const api = {
    page,
    zoomedTo: null as unknown,
    currentPage: page,
    createFrame: () => make('FRAME'),
    createRectangle: () => make('RECTANGLE'),
    /** Test-only: a Section or Group to move frames into. */
    container: (type: 'SECTION' | 'GROUP') => make(type),
    viewport: {
      scrollAndZoomIntoView(nodes: unknown) {
        api.zoomedTo = nodes;
      },
    },
    getNodeByIdAsync: async (id: string) => find(id, page.children),
  };
  return api as unknown as FigmaApi & { page: FakePage; zoomedTo: unknown; container(type: 'SECTION' | 'GROUP'): FakeNode };
}
