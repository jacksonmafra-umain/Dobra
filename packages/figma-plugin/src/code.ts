// Plugin main thread: shows the panel and answers its messages.
import { handle } from './handlers';
import type { ToMain } from './messages';

const OPENING: Record<string, ToMain> = {
  presets: { type: 'list-targets' },
  tag: { type: 'scan-tags' },
  coverage: { type: 'coverage' },
};

figma.showUI(__html__, { width: 380, height: 600, themeColors: true });

figma.ui.onmessage = async (msg: ToMain) => {
  const reply = await handle(figma, msg);
  if (reply) figma.ui.postMessage(reply);
};

void handle(figma, OPENING[figma.command] ?? OPENING.presets).then((reply) => {
  if (reply) figma.ui.postMessage({ ...reply, command: figma.command });
});
