// The Dobra site: landing page and guide, static output, deployed to Vercel.
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import rehypeSlug from 'rehype-slug';
import { defineConfig } from 'astro/config';
import { rehypeHeadingAnchors } from './src/markdown/anchors';
import { remarkUnverifiedCallout } from './src/markdown/callout';
import { remarkGlossaryTable } from './src/markdown/glossary';
import { remarkGuideLinks } from './src/markdown/links';
import { remarkSourcesBlock } from './src/markdown/sources';

export default defineConfig({
  site: 'https://dobra-five.vercel.app',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: {
    // Astro 7 defaults to the Sätteri processor; the guide's plugins are remark/rehype, so the site
    // uses the unified processor from @astrojs/markdown-remark.
    processor: unified({
      remarkPlugins: [remarkGuideLinks, remarkGlossaryTable, remarkUnverifiedCallout, remarkSourcesBlock],
      // Astro assigns heading ids after these plugins run, so rehype-slug gives them ids first.
      rehypePlugins: [rehypeSlug, rehypeHeadingAnchors],
    }),
  },
});
