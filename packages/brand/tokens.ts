// The theme tokens of tokens.css for code that has no CSS, such as the Figma plugin's main
// thread. Names drop the `--dobra-` prefix. A test keeps these equal to tokens.css.

export const THEME_TOKENS = [
  'bg', 'panel', 'flyout', 'field', 'text', 'muted', 'border', 'border-strong',
  'fold', 'on-fold', 'accent-2', 'pass', 'warn', 'hinge', 'glow', 'shadow-2',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeTokens = Record<ThemeToken, string>;

export const tokens: { dark: ThemeTokens; light: ThemeTokens } = {
  dark: {
    bg: '#0B0F17',
    panel: 'rgb(17 24 39 / 0.85)',
    flyout: 'rgb(31 41 55 / 0.92)',
    field: '#0F172A',
    text: '#DFE2EE',
    muted: '#9AA8B8',
    border: 'rgb(255 255 255 / 0.08)',
    'border-strong': '#334155',
    fold: '#00F0FF',
    'on-fold': '#0B0F17',
    'accent-2': '#818CF8',
    pass: '#10B981',
    warn: '#F59E0B',
    hinge: '#EC4899',
    glow: '0 0 12px rgb(0 240 255 / 0.35)',
    'shadow-2': '0 8px 32px -4px rgb(0 0 0 / 0.6)',
  },
  light: {
    bg: '#F6F7FA',
    panel: 'rgb(255 255 255 / 0.85)',
    flyout: 'rgb(255 255 255 / 0.96)',
    field: '#FFFFFF',
    text: '#0F131C',
    muted: '#4B5565',
    border: 'rgb(15 19 28 / 0.12)',
    'border-strong': '#CBD2DC',
    fold: '#007C85',
    'on-fold': '#FFFFFF',
    'accent-2': '#4F46E5',
    pass: '#047857',
    warn: '#B45309',
    hinge: '#BE185D',
    glow: '0 0 0 1px rgb(0 124 133 / 0.35)',
    'shadow-2': '0 8px 24px -8px rgb(15 19 28 / 0.18)',
  },
};
