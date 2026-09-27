import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Default build: assets split into hashed files and loaded on demand.
// `--mode single`: one self-contained HTML file (fonts and images inlined).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile()] : [])],
    define: {
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
      __BUILD_MODE__: JSON.stringify(single ? 'single' : 'split'),
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
    },
  };
});
