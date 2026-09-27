import { defineConfig } from 'vitest/config';

// Browser tests start Chromium, so they get a long timeout.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node', testTimeout: 60_000 },
});
