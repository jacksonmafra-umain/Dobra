// Plugin main thread: shows the panel and answers its messages.
import type { ToMain } from './messages';
import { route } from './route';

// The checker walks many layers; hidden layers inside instances are never checked.
figma.skipInvisibleInstanceChildren = true;
figma.showUI(__html__, { width: 380, height: 600, themeColors: true });

figma.ui.onmessage = async (msg: ToMain) => {
  const reply = await route(figma, figma.command, msg, (visited) => figma.ui.postMessage({ type: 'progress', visited }));
  if (reply) figma.ui.postMessage(reply);
};
