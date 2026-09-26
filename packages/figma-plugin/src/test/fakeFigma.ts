// An in-memory stand-in for the parts of the Figma plugin API the plugin uses. Nodes behave like
// Figma's: created on the current page, re-parented by appendChild, shared plugin data defaults to ''.
import type { FigmaApi } from '../api';

type NodeType = 'FRAME' | 'RECTANGLE' | 'SECTION' | 'GROUP' | 'TEXT' | 'INSTANCE';

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
  constraints: { horizontal: string; vertical: string };
  overflowDirection: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing: number;
  layoutGrow: number;
  primaryAxisSizingMode: string;
  counterAxisSizingMode: string;
  characters: string;
  fontSize: number;
  componentProperties: Record<string, { type: string; value: string | boolean }>;
  variantOptions: Record<string, string[]>;
  relaunch: Record<string, string> | null;
  explicitModes: Record<string, string>;
  readonly absoluteBoundingBox: { x: number; y: number; width: number; height: number };
  resize(width: number, height: number): void;
  appendChild(child: FakeNode): void;
  insertChild(index: number, child: FakeNode): void;
  clone(): FakeNode;
  remove(): void;
  setProperties(props: Record<string, string | boolean>): void;
  setRelaunchData(data: Record<string, string>): void;
  setExplicitVariableModeForCollection(collection: { id: string }, modeId: string): void;
  setSharedPluginData(namespace: string, key: string, value: string): void;
  getSharedPluginData(namespace: string, key: string): string;
}

export interface FakePage {
  type: 'PAGE';
  children: FakeNode[];
  selection: FakeNode[];
  appendChild(child: FakeNode): void;
  insertChild(index: number, child: FakeNode): void;
  findAllWithCriteria(criteria: { types?: NodeType[]; sharedPluginData?: { namespace: string; keys?: string[] } }): FakeNode[];
}

export interface FakeCollection {
  id: string;
  name: string;
  modes: { modeId: string; name: string }[];
}

export type FakeFigma = FigmaApi & {
  page: FakePage;
  zoomedTo: unknown;
  collections: FakeCollection[];
  container(type: 'SECTION' | 'GROUP'): FakeNode;
  createText(): FakeNode;
  createInstance(): FakeNode;
};

function detach(child: FakeNode) {
  const parent = child.parent;
  if (parent) parent.children.splice(parent.children.indexOf(child), 1);
  child.parent = null;
}

export function createFakeFigma(): FakeFigma {
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
    insertChild(index, child) {
      detach(child);
      child.parent = page;
      page.children.splice(index, 0, child);
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

  const DEFAULT_NAME: Record<NodeType, string> = {
    FRAME: 'Frame',
    RECTANGLE: 'Rectangle',
    SECTION: 'Section',
    GROUP: 'Group',
    TEXT: 'Text',
    INSTANCE: 'Instance',
  };

  const make = (type: NodeType, append = true): FakeNode => {
    const data = new Map<string, string>();
    const node: FakeNode = {
      id: `1:${next++}`,
      type,
      name: DEFAULT_NAME[type],
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
      overflowDirection: 'NONE',
      layoutMode: 'NONE',
      itemSpacing: 0,
      layoutGrow: 0,
      primaryAxisSizingMode: 'FIXED',
      counterAxisSizingMode: 'FIXED',
      characters: '',
      fontSize: 12,
      componentProperties: {},
      variantOptions: {},
      relaunch: null,
      explicitModes: {},
      get absoluteBoundingBox() {
        let x = node.x;
        let y = node.y;
        let up = node.parent;
        while (up && up.type !== 'PAGE') {
          x += up.x;
          y += up.y;
          up = up.parent;
        }
        return { x, y, width: node.width, height: node.height };
      },
      resize(width, height) {
        node.width = width;
        node.height = height;
      },
      appendChild(child) {
        detach(child);
        child.parent = node;
        node.children.push(child);
      },
      insertChild(index, child) {
        detach(child);
        child.parent = node;
        node.children.splice(index, 0, child);
      },
      clone() {
        const copy = make(node.type, false);
        const { id: _id, parent: _p, children, absoluteBoundingBox: _a, ...rest } = node as FakeNode & Record<string, unknown>;
        for (const [k, v] of Object.entries(rest)) {
          if (typeof v !== 'function') (copy as unknown as Record<string, unknown>)[k] = structuredClone(v);
        }
        for (const [k, v] of data) copy.setSharedPluginData(k.split(':')[0], k.split(':').slice(1).join(':'), v);
        for (const c of children) copy.appendChild(c.clone());
        const parent = node.parent;
        if (parent) parent.appendChild(copy);
        return copy;
      },
      remove() {
        detach(node);
      },
      setProperties(props) {
        for (const [k, value] of Object.entries(props)) {
          if (node.componentProperties[k]) node.componentProperties[k] = { ...node.componentProperties[k], value };
        }
      },
      setRelaunchData(d) {
        node.relaunch = d;
      },
      setExplicitVariableModeForCollection(collection, modeId) {
        node.explicitModes[collection.id] = modeId;
      },
      setSharedPluginData(ns, key, value) {
        data.set(`${ns}:${key}`, value);
      },
      getSharedPluginData(ns, key) {
        return data.get(`${ns}:${key}`) ?? '';
      },
    };
    if (append) page.appendChild(node);
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
    collections: [] as FakeCollection[],
    currentPage: page,
    root: { children: [page] },
    skipInvisibleInstanceChildren: false,
    loadAllPagesAsync: async () => {},
    createFrame: () => make('FRAME'),
    createRectangle: () => make('RECTANGLE'),
    createText: () => make('TEXT'),
    createInstance: () => make('INSTANCE'),
    /** Test-only: a Section or Group to move frames into. */
    container: (type: 'SECTION' | 'GROUP') => make(type),
    viewport: {
      scrollAndZoomIntoView(nodes: unknown) {
        api.zoomedTo = nodes;
      },
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => api.collections,
    },
    getNodeByIdAsync: async (id: string) => find(id, page.children),
  };
  return api as unknown as FakeFigma;
}
