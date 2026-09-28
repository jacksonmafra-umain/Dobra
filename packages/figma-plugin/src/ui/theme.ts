// Figma adds figma-dark or figma-light to <html> when the plugin opens with themeColors: true,
// and swaps it when the user changes Figma's theme. The brand tokens switch on data-theme.

export function figmaTheme(className: string): 'dark' | 'light' {
  return className.split(/\s+/).includes('figma-dark') ? 'dark' : 'light';
}

export function followFigmaTheme(root: { className: string; dataset: DOMStringMap }, observe: (onChange: () => void) => () => void): () => void {
  const apply = () => (root.dataset.theme = figmaTheme(root.className));
  apply();
  return observe(apply);
}
