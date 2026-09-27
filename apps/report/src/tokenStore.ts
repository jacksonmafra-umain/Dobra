// The personal access token lives in memory; this keeps it in the tab's session storage only while
// "Remember for this tab" is ticked, and removes it the moment it is unticked.
const KEY = 'hinge.token';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function tokenStore(storage: Storage) {
  return {
    read(): string {
      try {
        return storage.getItem(KEY) ?? '';
      } catch {
        return '';
      }
    },
    remember(token: string): void {
      try {
        storage.setItem(KEY, token.trim());
      } catch {
        // Storage blocked (private mode): the token is simply not remembered.
      }
    },
    forget(): void {
      try {
        storage.removeItem(KEY);
      } catch {
        // Nothing stored.
      }
    },
  };
}
