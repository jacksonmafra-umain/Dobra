// Plugin main thread: shows the panel and answers its messages.
import type { ToMain } from './messages';
import { route } from './route';
import { topLevelFrames } from './tagging';

// The checker walks many layers; hidden layers inside instances are never checked.
figma.skipInvisibleInstanceChildren = true;
figma.showUI(__html__, { width: 380, height: 600, themeColors: true });

/** Tells the panel which artboards are selected, for Adapt frame. */
function postSelection() {
  const artboards = new Set<BaseNode>(topLevelFrames(figma));
  const frames = figma.currentPage.selection.filter((n) => artboards.has(n)).map((n) => ({ id: n.id, name: n.name }));
  figma.ui.postMessage({ type: 'selection', frames });
}

figma.on('selectionchange', postSelection);

figma.ui.onmessage = async (msg: ToMain) => {
  const reply = await route(figma, figma.command, msg, (visited) => figma.ui.postMessage({ type: 'progress', visited }));
  if (reply) figma.ui.postMessage(reply);
  if (msg.type === 'ready') postSelection();
};
