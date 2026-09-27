// The page's layout as GeoNodes, in document coordinates. The collector runs inside the page, so
// the function passed to page.evaluate is self-contained: no imports inside it.
import type { GeoNode } from '@hinge/core/geo';
import type { Page } from 'playwright';

export interface CollectedLayout {
  root: GeoNode[];
  scrollWidth: number;
  truncated: boolean;
}

export async function collectLayout(page: Page, cap = 4000): Promise<CollectedLayout> {
  // Under mobile emulation Chrome widens the layout viewport to wide content, so the window width
  // comes from the emulated viewport, not innerWidth.
  const viewport = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  return page.evaluate(
    ({ limit, width }) => {
      const TEXT = 'h1,h2,h3,h4,h5,h6,p,li,label,dt,dd,td,th,figcaption,blockquote';
      const INTERACTIVE =
        'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[tabindex]:not([tabindex="-1"])';
      const CHROME = 'header,nav,footer,[role=banner],[role=navigation],[role=contentinfo]';
      const MEDIA = 'img,video,picture,canvas,svg,iframe';
      let count = 0;
      let truncated = false;
      const fixed: GeoNode[] = [];
      const pathOf = (el: Element): string => {
        const parts: string[] = [];
        for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
          const i = e.parentElement ? Array.prototype.indexOf.call(e.parentElement.children, e) : 0;
          parts.unshift(`${e.tagName.toLowerCase()}:${i}`);
        }
        return parts.join('/');
      };
      const roleOf = (el: Element, style: CSSStyleDeclaration, rect: DOMRect): GeoNode['role'] | null => {
        if (el.matches(CHROME) || style.position === 'fixed' || style.position === 'sticky') return 'chrome';
        if (el.matches(INTERACTIVE)) return 'interactive';
        if (el.matches(MEDIA)) return 'media';
        if (el.matches(TEXT) && (el.textContent ?? '').trim()) return 'text';
        if (style.display.includes('flex') || style.display.includes('grid') || /auto|scroll|hidden|clip/.test(style.overflowX + style.overflowY)) return 'container';
        // A plain box that runs past the window is kept, so overflow-x can report it.
        if (rect.right + scrollX > width + 1) return 'container';
        return null;
      };
      const nameOf = (el: Element): string => {
        const text = (el.textContent ?? '').trim();
        const base = el.getAttribute('aria-label') || el.getAttribute('alt') || el.id || el.tagName.toLowerCase();
        return base + (text ? ` "${text.slice(0, 24)}"` : '');
      };
      const convert = (el: Element): GeoNode[] => {
        const out: GeoNode[] = [];
        for (const child of Array.from(el.children)) {
          if (count >= limit) {
            truncated = true;
            break;
          }
          const style = getComputedStyle(child);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const r = child.getBoundingClientRect();
          const role = roleOf(child, style, r);
          const inner = role === 'media' ? [] : convert(child);
          if (!role) {
            out.push(...inner);
            continue;
          }
          count++;
          const g: GeoNode = {
            id: pathOf(child),
            name: nameOf(child),
            role,
            rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
            scrollAxis:
              /auto|scroll/.test(style.overflowX) && child.scrollWidth > child.clientWidth
                ? 'x'
                : /auto|scroll/.test(style.overflowY) && child.scrollHeight > child.clientHeight
                  ? 'y'
                  : 'none',
            layout: style.display.includes('flex')
              ? style.flexDirection.startsWith('row')
                ? 'horizontal'
                : 'vertical'
              : style.display.includes('grid')
                ? 'horizontal'
                : 'none',
            ...(/hidden|clip/.test(style.overflowX + style.overflowY) ? { clips: true } : {}),
          };
          if (role === 'text') {
            g.chars = (child.textContent ?? '').trim().length;
            g.fontSize = parseFloat(style.fontSize);
          }
          if (inner.length) g.children = inner;
          // Fixed elements stay put while the document scrolls, so they sit outside the document node.
          if (style.position === 'fixed') fixed.push(g);
          else out.push(g);
        }
        return out;
      };
      const content = convert(document.body);
      const scrollHeight = document.documentElement.scrollHeight;
      // The document scrolls vertically: content below the first screen can still pass the hinge.
      const doc: GeoNode = {
        id: 'document',
        name: 'document',
        role: 'container',
        rect: { x: 0, y: 0, width, height: scrollHeight },
        scrollAxis: scrollHeight > innerHeight ? 'y' : 'none',
        layout: 'vertical',
        children: content,
      };
      return { root: [doc, ...fixed], scrollWidth: document.documentElement.scrollWidth, truncated };
    },
    { limit: cap, width: viewport.width },
  );
}
