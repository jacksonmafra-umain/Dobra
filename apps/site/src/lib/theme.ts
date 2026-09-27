// The site's theme: the system setting unless the visitor chose one, remembered per browser.
// Storage can be blocked (private windows, cookies off), so every access is guarded.

export type ThemeChoice = 'light' | 'dark' | null;
const KEY = 'dobra.theme';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function themeStore(storage: Store | null) {
  return {
    read(): ThemeChoice {
      try {
        const v = storage?.getItem(KEY);
        return v === 'light' || v === 'dark' ? v : null;
      } catch {
        return null;
      }
    },
    write(choice: ThemeChoice): void {
      try {
        if (choice) storage?.setItem(KEY, choice);
        else storage?.removeItem(KEY);
      } catch {
        // Not remembered; the choice still applies to this page.
      }
    },
  };
}

/** Runs in <head> before first paint so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(() => {
  let choice = null;
  try { choice = localStorage.getItem('${KEY}'); } catch {}
  if (choice !== 'light' && choice !== 'dark') choice = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = choice;
})();`;
