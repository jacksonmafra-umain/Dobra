// Builds the plugin panel into one self-contained HTML file (Figma loads it as a string).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src/ui',
  plugins: [react(), viteSingleFile()],
  build: { outDir: '../../dist', emptyOutDir: false },
});
