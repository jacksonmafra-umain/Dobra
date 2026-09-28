// The Figma screens the simulator shows: the remembered file and frames, the tab's token, and the
// images and layers loaded for the frame on screen, keyed by frame and scale.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFigmaClient } from '@dobra/core/figmaClient';
import type { NamePatterns } from '@dobra/core/figmaRest';
import { filePatterns, loadFrames, type FileListing, type LoadedFrame } from './loader';
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

/**
 * The cache key for the frame on screen, or null when nothing should load: no list, no token, a
 * frame that isn't on the list (a link can name any id), or `paused` while the token is being typed.
 * The token's generation is part of the key, so a refusal under an old token doesn't stick.
 */
export function frameLoadKey(o: { stored: StoredFigmaScreens | null; selectedId: string | null; token: string; generation: number; scale: number; paused: boolean }): string | null {
  if (o.paused || !o.stored || !o.selectedId || !o.token.trim()) return null;
  if (!o.stored.frames.some((f) => f.id === o.selectedId)) return null;
  return `${o.selectedId}@${o.scale}#${o.generation}`;
}

export function useFigmaScreens(selectedId: string | null, scale: number, paused = false) {
  const tokens = useMemo(() => figmaTokenStore(session), []);
  const [stored, setStored] = useState<StoredFigmaScreens | null>(() => readFigmaScreens(local ?? noStorage));
  const [token, setTokenState] = useState(tokens.read);
  const [remember, setRemember] = useState(() => tokens.read() !== '');
  // The file's name words: from the picker, or read once per file (a failure falls back to defaults).
  const patterns = useRef<{ fileKey: string; value: Promise<NamePatterns | undefined> } | null>(null);
  const [loaded, setLoaded] = useState<Record<string, LoadedFrame>>({});
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);

  const setToken = useCallback(
    (t: string, keep: boolean) => {
      setTokenState(t);
      setGeneration((g) => g + 1);
      setRemember(keep);
      if (keep) tokens.remember(t);
      else tokens.forget();
    },
    [tokens],
  );

  const add = useCallback((listing: FileListing, picked: string[]) => {
    const frames = listing.pages.flatMap((p) => p.frames).filter((f) => picked.includes(f.id)).map(({ id, name, page, width, height }) => ({ id, name, page, width, height }));
    const next: StoredFigmaScreens = { version: 1, fileKey: listing.fileKey, fileName: listing.fileName, frames };
    patterns.current = { fileKey: listing.fileKey, value: Promise.resolve(listing.patterns) };
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

  const key = frameLoadKey({ stored, selectedId, token, generation, scale, paused });
  useEffect(() => {
    if (!stored || !selectedId || !key || loaded[key]) return;
    let live = true;
    const client = createFigmaClient(token);
    if (patterns.current?.fileKey !== stored.fileKey)
      patterns.current = { fileKey: stored.fileKey, value: filePatterns(client, stored.fileKey).catch(() => undefined) };
    const words = patterns.current.value;
    (async () => {
      const p = await words;
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
