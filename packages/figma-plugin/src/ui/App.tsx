import { useEffect, useState } from 'react';
import type { ToMain, ToUi } from '../messages';

type Tab = 'presets' | 'tag' | 'coverage';

const post = (msg: ToMain) => parent.postMessage({ pluginMessage: msg }, '*');

export function App() {
  const [tab, setTab] = useState<Tab>('presets');
  const [last, setLast] = useState<ToUi | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage as (ToUi & { command?: Tab }) | undefined;
      if (!msg) return;
      if (msg.command) setTab(msg.command);
      setLast(msg);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const open = (t: Tab) => {
    setTab(t);
    post(t === 'presets' ? { type: 'list-targets' } : t === 'tag' ? { type: 'scan-tags' } : { type: 'coverage' });
  };

  return (
    <main>
      <nav>
        {(['presets', 'tag', 'coverage'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => open(t)}>
            {t === 'presets' ? 'Artboards' : t === 'tag' ? 'Tag frames' : 'Coverage'}
          </button>
        ))}
      </nav>
      <pre>{last ? last.type : 'Loading…'}</pre>
    </main>
  );
}
