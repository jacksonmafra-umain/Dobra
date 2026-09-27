// After `astro build`, puts the simulator's and the report's production builds under the site's
// output, so the whole site deploys as one static folder. Build those two apps first
// (npm run build:site does, in order).
import { cpSync, existsSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const out = new URL('../dist/', import.meta.url);

for (const [app, to] of [['apps/simulator/dist/', 'simulator/'], ['apps/report/dist/', 'report/']]) {
  const from = new URL(app, root);
  if (!existsSync(new URL('index.html', from))) throw new Error(`${app}index.html is missing: build that app before the site`);
  cpSync(from, new URL(to, out), { recursive: true });
}
