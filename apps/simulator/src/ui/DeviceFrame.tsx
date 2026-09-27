import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Rect } from '../config/types';
import type { Environment } from '../engine/environment';

const BEZEL = 12;

export type Zoom = 'fit' | 'actual';

type Resize = (width: number, height: number) => void;

interface DeviceFrameProps {
  env: Environment;
  zoom: Zoom;
  children: ReactNode;
  overlay: ReactNode;
  /** System chrome drawn on the display (Android status and navigation bars), not in the window. */
  displayChrome?: ReactNode;
  /** Present while free resize is on: the frame gets drag handles. */
  onResize?: Resize;
  /** Present for a freeform window: the window gets drag handles. */
  onResizeWindow?: Resize;
}

const rectStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

export function DeviceFrame({ env, zoom, children, overlay, displayChrome, onResize, onResizeWindow }: DeviceFrameProps) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 800 });
  // Scale is frozen while dragging so the handle stays under the pointer.
  const [dragScale, setDragScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const outerW = env.display.width + BEZEL * 2;
  const outerH = env.display.height + BEZEL * 2;
  const fit = Math.max(0.1, Math.min((box.w - 32) / outerW, (box.h - 56) / outerH));
  const scale = dragScale ?? (zoom === 'fit' ? fit : 1);

  const startDrag = (resize: Resize | undefined, axis: 'x' | 'y' | 'xy') => (e: PointerEvent) => {
    if (!resize) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const w0 = env.width;
    const h0 = env.height;
    const s = scale;
    setDragScale(s);
    const move = (ev: globalThis.PointerEvent) => {
      resize(axis === 'y' ? w0 : w0 + (ev.clientX - x0) / s, axis === 'x' ? h0 : h0 + (ev.clientY - y0) / s);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragScale(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handles = (resize: Resize) => (
    <>
      <div className="resize-handle resize-handle--x" onPointerDown={startDrag(resize, 'x')} title="Drag to change width" />
      <div className="resize-handle resize-handle--y" onPointerDown={startDrag(resize, 'y')} title="Drag to change height" />
      <div className="resize-handle resize-handle--xy" onPointerDown={startDrag(resize, 'xy')} title="Drag to resize" />
    </>
  );

  const win = env.window;
  const windowed = win.mode !== 'fullscreen' || env.display.width !== env.width || env.display.height !== env.height;

  return (
    <div className={`device-host device-host--${zoom}`} ref={host}>
      <div className="device-scaler" style={{ width: outerW * scale, height: outerH * scale }}>
        <div
          className={`device${env.isFree ? ' device--free' : ''}`}
          style={{
            width: outerW,
            height: outerH,
            padding: BEZEL,
            borderRadius: env.cornerRadius ? env.cornerRadius + BEZEL : 16,
            transform: `scale(${scale})`,
          }}
        >
          <div
            className={`device__screen${win.floating ? ' device__screen--desktop' : ''}`}
            style={{ width: env.display.width, height: env.display.height, borderRadius: env.cornerRadius || 4 }}
          >
            {win.other && (
              <div className="window-other" style={rectStyle(win.other)}>
                Other app
              </div>
            )}
            {win.divider && <div className="window-divider" style={rectStyle(win.divider)} />}
            <div className={`window${win.floating ? ' window--floating' : ''}`} style={rectStyle(win.rect)} data-window-mode={win.mode}>
              {win.captionBar > 0 && (
                <div className="caption-bar" style={{ height: win.captionBar }} aria-hidden>
                  <span>{env.deviceName}</span>
                  <span className="caption-bar__buttons">— ▢ ✕</span>
                </div>
              )}
              {children}
              {overlay}
              {win.mode === 'freeform' && onResizeWindow && handles(onResizeWindow)}
            </div>
            {displayChrome}
          </div>
        </div>
        {onResize && handles(onResize)}
      </div>
      <div className="device-caption">
        {env.deviceName}
        {!env.isFree && env.pose && ` · ${env.pose.label}`}
        {!env.isFree && !env.pose && env.displayLabel !== 'Display' && ` · ${env.displayLabel}`}
        {` · ${env.width}×${env.height} ${env.unit}`}
        {windowed && ` window on ${env.display.width}×${env.display.height} ${env.unit}`}
        {env.estimated && <span className="tag tag--warn">estimated</span>}
        <span className="device-caption__scale">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}
