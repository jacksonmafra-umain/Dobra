// Routes panel messages. The panel says 'ready' once it listens; only then does the main thread send
// the opening view, so the first reply cannot arrive before the panel can receive it.
import type { FigmaApi } from './api';
import { handle } from './handlers';
import type { Command, ToMain, ToUi } from './messages';

const OPENING: Record<Command, ToMain> = {
  presets: { type: 'list-targets' },
  tag: { type: 'scan-tags' },
  coverage: { type: 'coverage' },
  check: { type: 'check', scope: 'selection' },
};

export function commandOf(command: string): Command {
  return command === 'tag' || command === 'coverage' || command === 'check' ? command : 'presets';
}

export async function route(api: FigmaApi, command: string, msg: ToMain, onProgress?: (visited: number) => void): Promise<ToUi | null> {
  if (msg.type !== 'ready') return handle(api, msg, onProgress);
  const opening = commandOf(command);
  const reply = await handle(api, OPENING[opening], onProgress);
  return reply && { ...reply, command: opening };
}
