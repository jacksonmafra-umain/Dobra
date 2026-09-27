import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// The guide lives in docs/guide at the repository root; it is read in place, never copied.
export const collections = {
  guide: defineCollection({ loader: glob({ pattern: '*.md', base: '../../docs/guide' }) }),
};
