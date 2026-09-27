// The part of the Figma plugin API the plugin uses. The real `figma` global satisfies it, and so
// does the in-memory fake in src/test/fakeFigma.ts.
export type FigmaApi = Pick<
  PluginAPI,
  'createFrame' | 'createRectangle' | 'currentPage' | 'viewport' | 'getNodeByIdAsync' | 'loadAllPagesAsync' | 'root' | 'variables' | 'setCurrentPageAsync' | 'commitUndo' | 'editorType'
>;
