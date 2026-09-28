// A Figma screen as a Stage's content, with the collision checker measuring its hit boxes.
import { useRef } from 'react';
import type { Environment } from '@dobra/core/engine/environment';
import { useCollisions, type Collision } from '../sample/collisions';
import { FigmaScreen, type FigmaScreenProps } from './FigmaScreen';

export function FigmaStage({ env, onCollisions, ...screen }: Omit<FigmaScreenProps, 'windowWidth'> & { env: Environment; onCollisions(c: Collision[]): void }) {
  const root = useRef<HTMLDivElement>(null);
  useCollisions(root, env, [env, screen.frame.id, screen.loaded], onCollisions);
  return (
    <div ref={root} className="figma-screen__host">
      <FigmaScreen {...screen} windowWidth={env.width} />
    </div>
  );
}
