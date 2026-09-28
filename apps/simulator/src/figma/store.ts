// The Figma file and frames the user picked, remembered in this browser. Only ids and names are
// kept: the token, images and layers never reach storage.
export interface StoredFrame {
  id: string;
  name: string;
  page: string;
  width: number;
  height: number;
}

export interface StoredFigmaScreens {
  version: 1;
  fileKey: string;
  fileName: string;
  frames: StoredFrame[];
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'dobra.figmaScreens';

const isFrame = (f: unknown): f is StoredFrame => {
  const x = f as StoredFrame;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.page === 'string' && typeof x.width === 'number' && typeof x.height === 'number';
};

export function readFigmaScreens(storage: Storage): StoredFigmaScreens | null {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? 'null') as StoredFigmaScreens | null;
    if (!v || v.version !== 1 || typeof v.fileKey !== 'string' || typeof v.fileName !== 'string' || !Array.isArray(v.frames) || !v.frames.every(isFrame)) return null;
    return { version: 1, fileKey: v.fileKey, fileName: v.fileName, frames: v.frames.map(({ id, name, page, width, height }) => ({ id, name, page, width, height })) };
  } catch {
    return null;
  }
}

export function writeFigmaScreens(storage: Storage, value: StoredFigmaScreens): void {
  try {
    storage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the picked frames last for this visit only.
  }
}

export function clearFigmaScreens(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
