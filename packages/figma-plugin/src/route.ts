// Routes panel messages. The panel says 'ready' once it listens; only then does the main thread send
// the opening view, so the first reply cannot arrive before the panel can receive it.
import type { FigmaApi } from './api';
import { handle } from './handlers';
import type { Command, ToMain, ToUi } from './messages';

const OPENING: Record<Command, ToMain> = {
  presets: { type: 'list-targets' },
  tag: { type: 'scan-tags' },
  coverage: { type: 'coverage' },
};

export function commandOf(command: string): Command {
  return command === 'tag' || command === 'coverage' ? command : 'presets';
}

export async function route(api: FigmaApi, command: string, msg: ToMain): Promise<ToUi | null> {
  if (msg.type !== 'ready') return handle(api, msg);
  const opening = commandOf(command);
  const reply = await handle(api, OPENING[opening]);
  return reply && { ...reply, command: opening };
}
