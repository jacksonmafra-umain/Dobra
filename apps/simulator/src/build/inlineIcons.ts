// The single-file build inlines scripts, styles and images, but vite-plugin-singlefile leaves
// <link rel="icon"> files beside index.html. This swaps each for a data URL so the HTML stands alone.
import type { Plugin } from 'vite';

const MIME: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png' };

export function inlineIconLinks(html: string, files: Record<string, string | Uint8Array>): { html: string; inlined: string[] } {
  const inlined: string[] = [];
  const out = html.replace(/(<link rel="icon"[^>]*href=")\.\/([^"]+)"/g, (whole, head: string, name: string) => {
    const file = files[name];
    const mime = MIME[name.split('.').pop() ?? ''];
    if (file === undefined || !mime) return whole;
    inlined.push(name);
    return `${head}data:${mime};base64,${Buffer.from(file).toString('base64')}"`;
  });
  return { html: out, inlined };
}

export function inlineIcons(): Plugin {
  return {
    name: 'dobra-inline-icons',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') return;
      const files: Record<string, string | Uint8Array> = {};
      for (const [name, item] of Object.entries(bundle)) if (item.type === 'asset') files[name] = item.source;
      const { html, inlined } = inlineIconLinks(String(page.source), files);
      page.source = html;
      for (const name of inlined) delete bundle[name];
    },
  };
}
