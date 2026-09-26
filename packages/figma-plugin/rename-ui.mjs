// Vite names the page index.html; the manifest points at dist/ui.html.
import { renameSync } from 'node:fs';

renameSync('dist/index.html', 'dist/ui.html');
