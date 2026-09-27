import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Width and height live in the IHDR chunk, bytes 16–23 of a PNG.
const size = (file: string) => {
  const b = readFileSync(new URL(`../png/${file}`, import.meta.url));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('png', () => {
  it.each([
    ['favicon-32.png', 32],
    ['icon-128.png', 128],
    ['icon-512.png', 512],
  ])('%s is %i px square', (file, px) => {
    expect(size(file)).toEqual([px, px]);
  });
});
