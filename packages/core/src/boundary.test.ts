import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Core runs in the simulator, the Figma plugin sandbox and Node, so it must not reach for React
// or the DOM. The tsconfig blocks DOM globals; this blocks imports the hoisted node_modules allows.
const FORBIDDEN = /from\s+['"](react|react-dom|react\/[^'"]*|react-dom\/[^'"]*)['"]|import\(\s*['"]react/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });
}

describe('@dobra/core boundary', () => {
  it.each(sources(fileURLToPath(new URL('.', import.meta.url))))('%s imports no React', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(FORBIDDEN);
  });
});
