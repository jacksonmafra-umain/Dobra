import { defineConfig } from 'vitest/config';

// Runs against apps/site/dist; build first with npm run build:site.
export default defineConfig({
  test: { include: ['test/built/**/*.test.ts'], environment: 'node' },
});
