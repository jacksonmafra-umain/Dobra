// A Figma screen as a Stage's content, with the collision checker measuring its hit boxes.
import { useRef } from 'react';
import type { Environment } from '@dobra/core/engine/environment';
import { useCollisions, type Collision } from '../sample/collisions';
import { FigmaScreen, type FigmaScreenProps } from './FigmaScreen';

/** The device's safe-area insets as the --sa-* variables the sample screens use; geometry, no colours. */
export function safeAreaVars(safe: { top: number; right: number; bottom: number; left: number }): Record<string, string> {
  return { '--sa-top': `${safe.top}px`, '--sa-right': `${safe.right}px`, '--sa-bottom': `${safe.bottom}px`, '--sa-left': `${safe.left}px` };
}

export function FigmaStage({ env, onCollisions, ...screen }: Omit<FigmaScreenProps, 'windowWidth'> & { env: Environment; onCollisions(c: Collision[]): void }) {
  const root = useRef<HTMLDivElement>(null);
  useCollisions(root, env, [env, screen.frame.id, screen.loaded], onCollisions);
  return (
    <div ref={root} className="figma-screen__host" style={safeAreaVars(env.safeArea)}>
      {/* .screen__scroll tells the collision checker the frame scrolls under the fold, and re-measures on scroll. */}
      <div className="screen__scroll figma-screen__scroll">
        <FigmaScreen {...screen} windowWidth={env.width} />
      </div>
    </div>
  );
}
