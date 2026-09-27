// The Dobra site: landing page and guide, static output, deployed to Vercel.
import sitemap from '@astrojs/sitemap';
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
    remarkPlugins: [remarkGuideLinks, remarkGlossaryTable, remarkUnverifiedCallout, remarkSourcesBlock],
    rehypePlugins: [rehypeHeadingAnchors],
  },
});
