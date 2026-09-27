// CSS variables the sample screen lays out with: insets, page margins and toolbar insets.
import type { Environment } from '@hinge/core/engine/environment';
import type { Layout } from '@hinge/core/engine/layout';

/** Toolbar content never sits closer than this to the window edge. */
export const TOOLBAR_MIN_INSET = 16;

export function screenVars(env: Environment, layout: Layout, rtl: boolean): Record<string, string> {
  const safe = env.safeArea;
  const nav = layout.navigation;
  const iosRail = nav.pattern === 'ios-rail';
  const floatingBar = nav.pattern === 'bar' && nav.floating;
  // Space the leading rail or drawer takes, including the inset it sits in.
  const leading = layout.leadingNav ? safe.left + layout.leadingNav : 0;
  const right = iosRail ? 0 : safe.right;
  // Physical LTR margins inside the content column; RTL mirrors them.
  const marginStart = layout.margin.left - leading;
  const marginEnd = layout.margin.right - layout.railWidth;
  return {
    '--sa-top': `${safe.top}px`,
    '--sa-right': `${right}px`,
    // The column already sits above the keyboard, which covers the bottom inset.
    '--sa-bottom': `${env.ime ? 0 : safe.bottom}px`,
    '--sa-left': `${leading ? 0 : safe.left}px`,
    '--margin-left': `${rtl ? marginEnd : marginStart}px`,
    '--margin-right': `${rtl ? marginStart : marginEnd}px`,
    '--toolbar-inset-left': `${leading ? TOOLBAR_MIN_INSET : Math.max(TOOLBAR_MIN_INSET, safe.left)}px`,
    '--toolbar-inset-right': `${Math.max(TOOLBAR_MIN_INSET, right)}px`,
    '--camera-left': `${env.reservedRegions.find((r) => r.kind === 'camera' && r.rect.x === 0)?.rect.width ?? 0}px`,
    '--floating-bar-clearance': floatingBar ? `${nav.size + nav.inset}px` : '0px',
  };
}
