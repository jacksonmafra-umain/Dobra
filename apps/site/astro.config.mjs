// The Dobra site: landing page and guide, static output, deployed to Vercel.
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dobra-five.vercel.app',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
