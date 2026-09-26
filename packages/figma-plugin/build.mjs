// Bundles the plugin's main thread (the code that talks to the Figma document) into dist/code.js.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  format: 'iife',
  target: 'es2017',
  logLevel: 'info',
});
