// Plugin main thread: shows the panel and answers its messages.
import type { ToMain } from './messages';
import { route } from './route';

figma.showUI(__html__, { width: 380, height: 600, themeColors: true });

figma.ui.onmessage = async (msg: ToMain) => {
  const reply = await route(figma, figma.command, msg);
  if (reply) figma.ui.postMessage(reply);
};
