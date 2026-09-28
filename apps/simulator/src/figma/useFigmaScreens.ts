// The Figma screens the simulator shows: the remembered file and frames, the tab's token, and the
// images and layers loaded for the frame on screen, keyed by frame and scale.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFigmaClient } from '@dobra/core/figmaClient';
import type { NamePatterns } from '@dobra/core/figmaRest';
import { listFrames, loadFrames, type FileListing, type LoadedFrame } from './loader';
import { clearFigmaScreens, readFigmaScreens, writeFigmaScreens, type StoredFigmaScreens } from './store';
import { figmaTokenStore } from './token';

const local = (() => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
})();
const session = (() => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
})();
const noStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

export function useFigmaScreens(selectedId: string | null, scale: number) {
  const tokens = useMemo(() => figmaTokenStore(session), []);
  const [stored, setStored] = useState<StoredFigmaScreens | null>(() => readFigmaScreens(local ?? noStorage));
  const [token, setTokenState] = useState(tokens.read);
  const [remember, setRemember] = useState(() => tokens.read() !== '');
  const [patterns, setPatterns] = useState<NamePatterns | undefined>(undefined);
  const [loaded, setLoaded] = useState<Record<string, LoadedFrame>>({});
  const [attempt, setAttempt] = useState(0);

  const setToken = useCallback(
    (t: string, keep: boolean) => {
      setTokenState(t);
      setRemember(keep);
      if (keep) tokens.remember(t);
      else tokens.forget();
    },
    [tokens],
  );

  const add = useCallback((listing: FileListing, picked: string[]) => {
    const frames = listing.pages.flatMap((p) => p.frames).filter((f) => picked.includes(f.id)).map(({ id, name, page, width, height }) => ({ id, name, page, width, height }));
    const next: StoredFigmaScreens = { version: 1, fileKey: listing.fileKey, fileName: listing.fileName, frames };
    setPatterns(listing.patterns);
    setLoaded({});
    if (frames.length) writeFigmaScreens(local ?? noStorage, next);
    else clearFigmaScreens(local ?? noStorage);
    setStored(frames.length ? next : null);
  }, []);

  const remove = useCallback(
    (id: string) => {
      if (!stored) return;
      const frames = stored.frames.filter((f) => f.id !== id);
      const next = { ...stored, frames };
      if (frames.length) writeFigmaScreens(local ?? noStorage, next);
      else clearFigmaScreens(local ?? noStorage);
      setStored(frames.length ? next : null);
    },
    [stored],
  );

  const key = selectedId ? `${selectedId}@${scale}` : null;
  useEffect(() => {
    if (!stored || !selectedId || !token.trim() || !key || loaded[key]) return;
    let live = true;
    const client = createFigmaClient(token);
    (async () => {
      // The name words live on the document: read them once per file when the picker didn't.
      const p = patterns ?? (await listFrames(client, `https://www.figma.com/design/${stored.fileKey}`).then((l) => l.patterns).catch(() => undefined));
      if (p && !patterns) setPatterns(p);
      const result = await loadFrames(client, stored.fileKey, [selectedId], scale, p).catch((e) => new Map([[selectedId, { image: null, geo: null, reason: e instanceof Error ? e.message : String(e) } as LoadedFrame]]));
      if (live) setLoaded((m) => ({ ...m, [key]: result.get(selectedId) ?? { image: null, geo: null, reason: 'Figma returned no data for this frame.' } }));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, selectedId, token, key, attempt]);

  const retry = useCallback(() => {
    if (key) setLoaded(({ [key]: _gone, ...rest }) => rest);
    setAttempt((n) => n + 1);
  }, [key]);

  return { stored, token, remember, setToken, add, remove, retry, loaded: key ? loaded[key] : undefined };
}
