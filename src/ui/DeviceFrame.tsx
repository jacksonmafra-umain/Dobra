import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Environment } from '../engine/environment';

const BEZEL = 12;

export type Zoom = 'fit' | 'actual';

interface DeviceFrameProps {
  env: Environment;
  zoom: Zoom;
  children: ReactNode;
  overlay: ReactNode;
  /** Present while free resize is on: the frame gets drag handles. */
  onResize?: (width: number, height: number) => void;
}

export function DeviceFrame({ env, zoom, children, overlay, onResize }: DeviceFrameProps) {
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

  const outerW = env.width + BEZEL * 2;
  const outerH = env.height + BEZEL * 2;
  const fit = Math.max(0.1, Math.min((box.w - 32) / outerW, (box.h - 56) / outerH));
  const scale = dragScale ?? (zoom === 'fit' ? fit : 1);

  const startDrag = (axis: 'x' | 'y' | 'xy') => (e: PointerEvent) => {
    if (!onResize) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const w0 = env.width;
    const h0 = env.height;
    const s = scale;
    setDragScale(s);
    const move = (ev: globalThis.PointerEvent) => {
      onResize(axis === 'y' ? w0 : w0 + (ev.clientX - x0) / s, axis === 'x' ? h0 : h0 + (ev.clientY - y0) / s);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragScale(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

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
            className="device__screen"
            style={{ width: env.width, height: env.height, borderRadius: env.cornerRadius || 4 }}
          >
            {children}
            {overlay}
          </div>
        </div>
        {onResize && (
          <>
            <div className="resize-handle resize-handle--x" onPointerDown={startDrag('x')} title="Drag to change width" />
            <div className="resize-handle resize-handle--y" onPointerDown={startDrag('y')} title="Drag to change height" />
            <div className="resize-handle resize-handle--xy" onPointerDown={startDrag('xy')} title="Drag to resize" />
          </>
        )}
      </div>
      <div className="device-caption">
        {env.deviceName}
        {!env.isFree && env.pose && ` · ${env.pose.label}`}
        {!env.isFree && !env.pose && env.displayLabel !== 'Display' && ` · ${env.displayLabel}`}
        {` · ${env.width}×${env.height} pt`}
        {env.estimated && <span className="tag tag--warn">estimated</span>}
        <span className="device-caption__scale">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}
