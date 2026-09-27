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
  layoutPositioning: 'AUTO' | 'ABSOLUTE';
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
  getMainComponentAsync(): Promise<{ parent: { type: 'COMPONENT_SET'; componentPropertyDefinitions: Record<string, { type: 'VARIANT'; variantOptions: string[] }> } } | null>;
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

/** A variable collection as the fake's own tests and helpers see it. */
export interface FakeVariableCollection extends FakeCollection {
  defaultModeId: string;
  variableIds: string[];
  addMode(name: string): string;
  renameMode(modeId: string, name: string): void;
  removeMode(modeId: string): void;
  remove(): void;
  setSharedPluginData(namespace: string, key: string, value: string): void;
  getSharedPluginData(namespace: string, key: string): string;
}

export interface FakeVariable {
  id: string;
  name: string;
  resolvedType: 'FLOAT' | 'BOOLEAN' | 'STRING' | 'COLOR';
  scopes: string[];
  description: string;
  valuesByMode: Record<string, unknown>;
  variableCollectionId: string;
  setValueForMode(modeId: string, value: unknown): void;
  remove(): void;
  setSharedPluginData(namespace: string, key: string, value: string): void;
  getSharedPluginData(namespace: string, key: string): string;
}

export type FakeFigma = Omit<FigmaApi, 'editorType'> & {
  /** Writable here so tests can open the plugin in Dev Mode. */
  editorType: FigmaApi['editorType'];
  /** Modes a collection may hold before addMode throws, as a Figma plan does. */
  modeLimit: number;
  /** When true, creating a collection throws, as in a file without edit access. */
  readOnly: boolean;
  undoCommits: number;
  page: FakePage;
  addPage(): FakePage;
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
  let nextVar = 1;
  const variables = new Map<string, FakeVariable>();
  const makePage = (): FakePage => {
    const pg: FakePage = {
      type: 'PAGE',
      children: [],
      selection: [],
      appendChild(child) {
        detach(child);
        child.parent = pg;
        pg.children.push(child);
      },
      insertChild(index, child) {
        detach(child);
        child.parent = pg;
        pg.children.splice(index, 0, child);
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
        walk(pg.children);
        return out;
      },
    };
    return pg;
  };
  const page = makePage();
  const pages: FakePage[] = [page];

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
      layoutPositioning: 'AUTO',
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
      async getMainComponentAsync() {
        if (node.type !== 'INSTANCE') return null;
        const defs = Object.fromEntries(Object.entries(node.variantOptions).map(([k, v]) => [k, { type: 'VARIANT' as const, variantOptions: v }]));
        return { parent: { type: 'COMPONENT_SET' as const, componentPropertyDefinitions: defs } };
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
    if (append) api.currentPage.appendChild(node);
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
    root: (() => {
      const data = new Map<string, string>();
      return {
        children: pages,
        setSharedPluginData: (ns: string, key: string, value: string) => void data.set(`${ns}:${key}`, value),
        getSharedPluginData: (ns: string, key: string) => data.get(`${ns}:${key}`) ?? '',
      };
    })(),
    addPage: () => {
      const pg = makePage();
      pages.push(pg);
      return pg;
    },
    setCurrentPageAsync: async (pg: FakePage) => {
      api.currentPage = pg;
    },
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
    modeLimit: 40,
    readOnly: false,
    undoCommits: 0,
    editorType: 'figma',
    commitUndo() {
      api.undoCommits++;
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => api.collections,
      getVariableByIdAsync: async (id: string) => variables.get(id) ?? null,
      createVariableCollection(name: string): FakeVariableCollection {
        if (api.readOnly) throw new Error('Cannot write in read-only mode');
        const data = new Map<string, string>();
        const first = `m${nextVar++}`;
        const c: FakeVariableCollection = {
          id: `VariableCollectionId:${nextVar++}`,
          name,
          modes: [{ modeId: first, name: 'Mode 1' }],
          defaultModeId: first,
          variableIds: [],
          addMode(modeName) {
            if (c.modes.length >= api.modeLimit) throw new Error(`in addMode: Limited to ${api.modeLimit} modes only`);
            const modeId = `m${nextVar++}`;
            c.modes.push({ modeId, name: modeName });
            return modeId;
          },
          renameMode(modeId, modeName) {
            const m = c.modes.find((x) => x.modeId === modeId);
            if (!m) throw new Error(`No mode ${modeId}`);
            m.name = modeName;
          },
          removeMode(modeId) {
            if (c.modes.length <= 1) throw new Error('in removeMode: A collection needs at least one mode');
            c.modes = c.modes.filter((m) => m.modeId !== modeId);
            if (c.defaultModeId === modeId) c.defaultModeId = c.modes[0].modeId;
            for (const id of c.variableIds) delete variables.get(id)!.valuesByMode[modeId];
          },
          remove() {
            for (const id of c.variableIds) variables.delete(id);
            api.collections.splice(api.collections.indexOf(c), 1);
          },
          setSharedPluginData: (ns, key, value) => void data.set(`${ns}:${key}`, value),
          getSharedPluginData: (ns, key) => data.get(`${ns}:${key}`) ?? '',
        };
        api.collections.push(c);
        return c;
      },
      createVariable(name: string, collection: FakeVariableCollection, type: FakeVariable['resolvedType']): FakeVariable {
        if (!['FLOAT', 'BOOLEAN', 'STRING', 'COLOR'].includes(type)) throw new Error('Unknown variable type');
        const data = new Map<string, string>();
        const v: FakeVariable = {
          id: `VariableID:${nextVar++}`,
          name,
          resolvedType: type,
          scopes: ['ALL_SCOPES'],
          description: '',
          valuesByMode: {},
          variableCollectionId: collection.id,
          setValueForMode(modeId, value) {
            if (!collection.modes.some((m) => m.modeId === modeId)) throw new Error(`No mode ${modeId}`);
            v.valuesByMode[modeId] = value;
          },
          remove() {
            variables.delete(v.id);
            collection.variableIds.splice(collection.variableIds.indexOf(v.id), 1);
          },
          setSharedPluginData: (ns, key, value) => void data.set(`${ns}:${key}`, value),
          getSharedPluginData: (ns, key) => data.get(`${ns}:${key}`) ?? '',
        };
        variables.set(v.id, v);
        collection.variableIds.push(v.id);
        return v;
      },
    },
    getNodeByIdAsync: async (id: string) => pages.map((pg) => find(id, pg.children)).find(Boolean) ?? null,
  };
  return api as unknown as FakeFigma;
}
