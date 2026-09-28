// The Figma token lives in memory; with "Remember for this tab" it also sits in the tab's session
// storage, and is removed the moment that is unticked. It never goes to localStorage or the URL.
const KEY = 'dobra.figmaToken';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function figmaTokenStore(storage: Storage | undefined) {
  return {
    read(): string {
      try {
        return storage?.getItem(KEY) ?? '';
      } catch {
        return '';
      }
    },
    remember(token: string): void {
      try {
        storage?.setItem(KEY, token.trim());
      } catch {
        // Storage blocked: the token lasts until the tab closes, in memory only.
      }
    },
    forget(): void {
      try {
        storage?.removeItem(KEY);
      } catch {
        // Nothing stored.
      }
    },
  };
}
