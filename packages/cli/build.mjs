// Bundles the CLI to one Node file. Playwright stays external: it ships its own browser drivers.
import { chmodSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/dobra.mjs',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  bundle: true,
  external: ['playwright', 'playwright-core'],
  banner: { js: '#!/usr/bin/env node' },
});
chmodSync('dist/dobra.mjs', 0o755);
