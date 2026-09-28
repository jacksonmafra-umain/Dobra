import { createRoot } from 'react-dom/client';
import favicon from '@dobra/brand/favicon.svg';
import '@dobra/brand/fonts.css';
import '@dobra/brand/tokens.css';
import { addFavicon, followSystemTheme } from './page';
import { ReportApp } from './ReportApp';
import './report.css';

followSystemTheme(window, document.documentElement);
addFavicon(document, favicon);
createRoot(document.getElementById('root')!).render(<ReportApp />);
