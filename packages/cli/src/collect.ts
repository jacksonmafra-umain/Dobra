// The page's layout as GeoNodes, in document coordinates. The collector runs inside the page, so
// the function passed to page.evaluate is self-contained: no imports inside it.
import type { GeoNode } from '@dobra/core/geo';
import type { Page } from 'playwright';

export interface CollectedLayout {
  root: GeoNode[];
  scrollWidth: number;
  truncated: boolean;
  /** The visual viewport's zoom: below 1 when mobile emulation zooms out to fit wide content. */
  scale: number;
}

export async function collectLayout(page: Page, cap = 4000): Promise<CollectedLayout> {
  // Under mobile emulation Chrome widens the layout viewport to wide content, so the window width
  // comes from the emulated viewport, not innerWidth.
  const viewport = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  // The tree goes back as JSON text: Playwright refuses results nested deeper than about 100 references.
  const json = await page.evaluate(
    ({ limit, width }) => {
      const TEXT = 'h1,h2,h3,h4,h5,h6,p,li,label,dt,dd,td,th,figcaption,blockquote';
      const INTERACTIVE =
        'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[tabindex]:not([tabindex="-1"])';
      const CHROME = 'header,nav,footer,[role=banner],[role=navigation],[role=contentinfo]';
      const MEDIA = 'img,video,picture,canvas,svg,iframe';
      let count = 0;
      let truncated = false;
      const fixed: GeoNode[] = [];
      // Rects are read at the top of the page, so fixed elements and the document share coordinates.
      scrollTo(0, 0);
      /** What an element renders: its shadow tree, a slot's assigned elements, or its children. */
      const childrenOf = (el: Element): Element[] => {
        if (el.shadowRoot) return Array.from(el.shadowRoot.children);
        if (el instanceof HTMLSlotElement && el.assignedElements().length) return el.assignedElements();
        return Array.from(el.children);
      };
      /** Skip links, off-canvas drawers and screen-reader-only text: in the DOM, not on screen. */
      const offScreen = (style: CSSStyleDeclaration, r: DOMRect): boolean =>
        (r.width <= 1 && r.height <= 1) ||
        r.right <= 0 ||
        r.bottom <= 0 ||
        /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(style.clip) ||
        style.clipPath === 'inset(50%)';
      const roleOf = (el: Element, style: CSSStyleDeclaration, rect: DOMRect): GeoNode['role'] | null => {
        // A fixed chat button or FAB is still something people tap.
        if (el.matches(INTERACTIVE)) return 'interactive';
        if (el.matches(CHROME) || style.position === 'fixed' || style.position === 'sticky') return 'chrome';
        if (el.matches(MEDIA)) return 'media';
        if (el.matches(TEXT) && textStart(el, 1)) return 'text';
        if (style.display.includes('flex') || style.display.includes('grid') || /auto|scroll|hidden|clip/.test(style.overflowX + style.overflowY)) return 'container';
        // A plain box that runs past the window is kept, so overflow-x can report it.
        if (rect.right + scrollX > width + 1) return 'container';
        return null;
      };
      /**
       * The first `n` non-blank characters of an element's text. It stops early, instead of reading
       * textContent, which on a big container copies all the text below it: quadratic on long pages.
       */
      const textStart = (el: Element, n: number): string => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let out = '';
        // Leading blanks are dropped as they come, so whitespace-only nodes never fill the budget.
        for (let t = walker.nextNode(); t && out.length < n; t = walker.nextNode()) out = (out + (t.nodeValue ?? '')).replace(/^\s+/, '');
        return out.slice(0, n).trimEnd();
      };
      const nameOf = (el: Element): string => {
        const text = textStart(el, 24);
        const base = el.getAttribute('aria-label') || el.getAttribute('alt') || el.id || el.tagName.toLowerCase();
        return base + (text ? ` "${text.slice(0, 24)}"` : '');
      };
      /** `path` is the element's id: tag:index steps from the body, built as the walk goes down. */
      const convert = (el: Element, path: string): GeoNode[] => {
        const out: GeoNode[] = [];
        const children = childrenOf(el);
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const id = `${path ? `${path}/` : ''}${child.tagName.toLowerCase()}:${i}`;
          if (count >= limit) {
            truncated = true;
            break;
          }
          const style = getComputedStyle(child);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const r = child.getBoundingClientRect();
          const role = roleOf(child, style, r);
          // A zero-size wrapper (a custom element, a positioned child's parent) still renders its children.
          if (role && offScreen(style, r)) continue;
          // Count a node before its children, so a container never lands past the cap.
          if (role) count++;
          const inner = role === 'media' ? [] : convert(child, id);
          if (!role) {
            out.push(...inner);
            continue;
          }
          const g: GeoNode = {
            id,
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
      const content = convert(document.body, '');
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
      const scale = window.visualViewport?.scale ?? 1;
      return JSON.stringify({ root: [doc, ...fixed], scrollWidth: document.documentElement.scrollWidth, truncated, scale });
    },
    { limit: cap, width: viewport.width },
  );
  return JSON.parse(json) as CollectedLayout;
}
