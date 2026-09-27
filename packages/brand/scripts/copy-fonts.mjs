// Copies the Latin variable woff2 files and their licences from @fontsource into fonts/.
// Run after changing a @fontsource version: node packages/brand/scripts/copy-fonts.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = new URL('../fonts/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const [source, name] of [
  ['@fontsource-variable/geist', 'geist'],
  ['@fontsource-variable/inter', 'inter'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono'],
]) {
  const file = `${name}-latin-wght-normal.woff2`;
  copyFileSync(require.resolve(`${source}/files/${file}`), new URL(file, out));
  copyFileSync(require.resolve(`${source}/LICENSE`), new URL(`OFL-${name}.txt`, out));
}
