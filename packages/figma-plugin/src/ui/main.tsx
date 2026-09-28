import { createRoot } from 'react-dom/client';
import '@dobra/brand/fonts.css';
import '@dobra/brand/tokens.css';
import { App } from './App';
import { followFigmaTheme } from './theme';

const html = document.documentElement;
followFigmaTheme(html, (onChange) => {
  const observer = new MutationObserver(onChange);
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
});
createRoot(document.getElementById('root')!).render(<App />);
