import type { ReactNode, RefObject } from 'react';
import type { ScreenSpec, SimulatorConfig } from '@dobra/core/config/types';
import type { Environment } from '@dobra/core/engine/environment';
import type { Layout } from '@dobra/core/engine/layout';
import type { ModalKind } from '@dobra/core/engine/modal';
import type { TextSettings } from '@dobra/core/engine/typography';
import { AndroidChrome } from '../sample/androidChrome';
import type { Collision } from '../sample/collisions';
import { Screen } from '../sample/Screen';
import { DeviceFrame, type Zoom } from './DeviceFrame';
import { Overlays, type OverlayToggles } from './Overlays';
import type { Theme } from './urlState';

interface StageProps {
  config: SimulatorConfig;
  env: Environment;
  layout: Layout;
  screen: ScreenSpec;
  theme: Theme;
  zoom: Zoom;
  rtl: boolean;
  overlays: OverlayToggles;
  text: TextSettings;
  modal: ModalKind | null;
  onCloseModal: () => void;
  onCollisions: (collisions: Collision[]) => void;
  onResize?: (width: number, height: number) => void;
  onResizeWindow?: (width: number, height: number) => void;
  /** The element the sample screen renders into, for measuring what is on screen. */
  hostRef?: RefObject<HTMLDivElement | null>;
  /** Shown in place of the sample screen, such as a frame from Figma. */
  content?: ReactNode;
}

/** One device frame with the sample screen inside it. The canvas shows one, or two when comparing platforms. */
export function Stage({ config, env, layout, screen, theme, zoom, rtl, overlays, text, modal, onCloseModal, onCollisions, onResize, onResizeWindow, hostRef, content }: StageProps) {
  return (
    <DeviceFrame
      env={env}
      zoom={zoom}
      onResize={onResize}
      onResizeWindow={onResizeWindow}
      displayChrome={<AndroidChrome env={env} />}
      overlay={<Overlays env={env} layout={layout} show={overlays} />}
    >
      <div className="sample" ref={hostRef} data-theme={theme} style={{ position: 'absolute', inset: 0 }}>
        {content ?? <Screen config={config} env={env} layout={layout} screen={screen} rtl={rtl} modal={modal} onCloseModal={onCloseModal} onCollisions={onCollisions} text={text} />}
      </div>
    </DeviceFrame>
  );
}
