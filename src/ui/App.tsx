import { useEffect, useMemo, useRef, useState } from 'react';
import { PLATFORMS, type SimulatorConfig } from '../config/types';
import { describeChanges, type Snapshot } from '../engine/diff';
import { findDevice, resolveEnvironment, type Selection } from '../engine/environment';
import { resolveLayout } from '../engine/layout';
import type { ModalKind } from '../engine/modal';
import type { Collision } from '../sample/collisions';
import { Screen } from '../sample/Screen';
import { DeviceFrame, type Zoom } from './DeviceFrame';
import { Inspector } from './Inspector';
import { Overlays, type OverlayToggles } from './Overlays';
import { clampFree, FREE_MAX, FREE_MIN, readUrlState, writeUrlState, type Theme } from './urlState';
import { WhatChanged, type ChangeEntry } from './WhatChanged';

export function App({ config }: { config: SimulatorConfig }) {
  const initial = useMemo(() => readUrlState(), []);
  const [sel, setSel] = useState<Selection>(initial.selection);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [screenId, setScreenId] = useState(initial.screenId);
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [zoom, setZoom] = useState<Zoom>(initial.zoom);
  const [rtl, setRtl] = useState(initial.rtl);
  const [overlays, setOverlays] = useState<OverlayToggles>(initial.overlays);
  const [change, setChange] = useState<ChangeEntry | null>(null);

  const devices = config.devices.filter((d) => d.enabled);
  const screens = config.screens.filter((s) => s.enabled);
  const screen = screens.find((s) => s.id === screenId) ?? screens[0];
  const device = findDevice(config, sel.deviceId);
  const displayIds = Object.keys(device.displays);
  const rotationSupported = device.platform === 'android' && Object.values(device.displays).some((d) => d.rotation.supported);
  const env = resolveEnvironment(config, sel);
  const layout = resolveLayout(config, env, screen);

  const previous = useRef<Snapshot | null>(null);
  const label = env.isFree
    ? `Free resize ${env.width}×${env.height} ${env.unit}`
    : `${env.deviceName}${env.pose ? ` ${env.pose.label.toLowerCase()}` : ''} ${env.orientation}${env.cameraActive ? ' · camera on' : ''}${env.liveActivity ? ' · Live Activity' : ''}`;
  // While dragging a free-resize frame, only report when a rule outcome changes.
  const changeKey = env.isFree
    ? JSON.stringify([env.sizeClass, layout.rule.id, layout.perRow, layout.margin, layout.tabItem, layout.bars?.compression, layout.navigation.pattern])
    : label;

  useEffect(() => {
    const next: Snapshot = { label, env, layout };
    if (previous.current) {
      setChange({ label: `${previous.current.label} → ${next.label}`, changes: describeChanges(config, previous.current, next, screen.components) });
    }
    previous.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeKey]);

  useEffect(() => {
    try {
      history.replaceState(null, '', writeUrlState({ selection: sel, screenId: screen.id, theme, zoom, rtl, overlays }, env));
    } catch {
      // Sandboxed previews can refuse history access.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, env.orientation, screen.id, theme, zoom, rtl, overlays]);

  const toggleOverlay = (key: keyof OverlayToggles) => setOverlays((o) => ({ ...o, [key]: !o[key] }));
  const resizeFree = (w: number, h: number) => setSel((s) => ({ ...s, free: clampFree(w, h) }));
  const onOuter = env.pose?.display === 'outer';

  return (
    <div className="app" data-theme={theme}>
      <header className="topbar">
        <h1 className="topbar__title">
          Size-Class Simulator <span className="tag">step 4</span>
          <span className="topbar__version" title="Version and build date of this copy">
            v{config.version} · {__BUILD_DATE__}
          </span>
        </h1>
        <div className="controls">
          <label className="control">
            <span>Device</span>
            <select
              value={sel.deviceId}
              disabled={!!sel.free}
              onChange={(e) =>
                setSel((s) => ({
                  ...s,
                  deviceId: e.target.value,
                  displayId: Object.keys(findDevice(config, e.target.value).displays)[0],
                }))
              }
            >
              {PLATFORMS.map((p) => (
                <optgroup label={config.platforms[p].label} key={p}>
                  {devices
                    .filter((d) => d.platform === p)
                    .map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          {env.poses.length > 0 ? (
            <>
              <div className="control">
                <span>Pose</span>
                <div className="seg">
                  {env.poses.map((p) => (
                    <button
                      aria-pressed={env.pose?.id === p.id}
                      disabled={!!sel.free}
                      onClick={() => setSel((s) => ({ ...s, pose: p.id }))}
                      title={p.estimated ? 'Estimated interpretation, see config' : undefined}
                      key={p.id}
                    >
                      {p.label}
                      {p.estimated ? ' *' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div className="control">
                <span>Fold</span>
                <button
                  className="seg-single seg-single--accent"
                  disabled={!!sel.free}
                  onClick={() => setSel((s) => ({ ...s, pose: onOuter ? 'open' : 'closed' }))}
                >
                  {onOuter ? 'Open device' : 'Close device'}
                </button>
              </div>
              <div className="control">
                <span>Reserved regions</span>
                <div className="seg">
                  <button
                    aria-pressed={!!sel.cameraActive}
                    disabled={onOuter || !!sel.free}
                    onClick={() => setSel((s) => ({ ...s, cameraActive: !s.cameraActive }))}
                    title="Inner front camera in use"
                  >
                    Camera on
                  </button>
                  <button
                    aria-pressed={!!sel.liveActivity}
                    disabled={!onOuter || !!sel.free}
                    onClick={() => setSel((s) => ({ ...s, liveActivity: !s.liveActivity }))}
                    title="Outer camera expands into the Dynamic Island"
                  >
                    Live Activity
                  </button>
                </div>
              </div>
            </>
          ) : displayIds.length > 1 ? (
            <div className="control">
              <span>Display</span>
              <div className="seg">
                {displayIds.map((id) => (
                  <button
                    aria-pressed={sel.displayId === id}
                    disabled={!!sel.free}
                    onClick={() => setSel((s) => ({ ...s, displayId: id }))}
                    key={id}
                  >
                    {device.displays[id]!.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {env.platform === 'android' && !sel.free && (
            <>
              <div className="control">
                <span>Rotation</span>
                <div className="seg">
                  {([0, 90] as const).map((r) => (
                    <button
                      aria-pressed={(env.android?.rotation ?? 0) === r}
                      disabled={r === 90 && env.android?.rotation !== 90 && !rotationSupported}
                      onClick={() => setSel((s) => ({ ...s, rotation: r }))}
                      title={r === 0 ? 'Natural orientation of the display' : 'Rotated 90° from natural'}
                      key={r}
                    >
                      {r}°{(env.android?.rotation ?? 0) === r ? ` · ${env.orientation}` : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div className="control">
                <span>System navigation</span>
                <div className="seg">
                  <button aria-pressed={env.android?.navMode === 'gesture'} onClick={() => setSel((s) => ({ ...s, navMode: 'gesture' }))}>
                    Gesture
                  </button>
                  <button aria-pressed={env.android?.navMode === 'three-button'} onClick={() => setSel((s) => ({ ...s, navMode: 'three-button' }))}>
                    3-button
                  </button>
                </div>
              </div>
            </>
          )}
          <div className="control" hidden={env.platform === 'android' && !sel.free}>
            <span>Orientation</span>
            <div className="seg">
              {(['portrait', 'landscape'] as const).map((o) => (
                <button
                  aria-pressed={env.orientation === o}
                  disabled={!!sel.free || !env.supportedOrientations.includes(o)}
                  title={env.supportedOrientations.includes(o) ? undefined : 'Not supported by this display in the config'}
                  onClick={() => setSel((s) => ({ ...s, orientation: o }))}
                  key={o}
                >
                  {o === 'portrait' ? 'Portrait' : 'Landscape'}
                </button>
              ))}
            </div>
          </div>
          <div className="control">
            <span>Free resize</span>
            <div className="free-resize">
              <button
                className="seg-single"
                aria-pressed={!!sel.free}
                onClick={() => setSel((s) => (s.free ? { ...s, free: null } : { ...s, free: clampFree(env.width, env.height) }))}
              >
                {sel.free ? 'On' : 'Off'}
              </button>
              {sel.free && (
                <>
                  <input
                    type="number"
                    aria-label={`Width in ${env.unit}`}
                    value={sel.free.width}
                    min={FREE_MIN.width}
                    max={FREE_MAX.width}
                    onChange={(e) => resizeFree(+e.target.value, sel.free!.height)}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    aria-label={`Height in ${env.unit}`}
                    value={sel.free.height}
                    min={FREE_MIN.height}
                    max={FREE_MAX.height}
                    onChange={(e) => resizeFree(sel.free!.width, +e.target.value)}
                  />
                  <span className="muted">{env.unit}</span>
                  <div className="seg" title="Size-class vocabulary for the device-less window">
                    {PLATFORMS.map((p) => (
                      <button
                        aria-pressed={env.platform === p}
                        onClick={() => setSel((s) => ({ ...s, freePlatform: p }))}
                        key={p}
                      >
                        {config.platforms[p].label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <label className="control">
            <span>Screen</span>
            <select value={screen.id} onChange={(e) => setScreenId(e.target.value)}>
              {screens.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                  {s.figma ? '' : ' (not in Figma)'}
                </option>
              ))}
            </select>
          </label>
          <div className="control">
            <span>Overlays</span>
            <div className="seg">
              <button aria-pressed={overlays.safeArea} onClick={() => toggleOverlay('safeArea')}>
                Safe areas
              </button>
              <button aria-pressed={overlays.margins} onClick={() => toggleOverlay('margins')}>
                Margins
              </button>
              <button aria-pressed={overlays.grid} onClick={() => toggleOverlay('grid')}>
                Grid
              </button>
              <button aria-pressed={overlays.reserved} onClick={() => toggleOverlay('reserved')}>
                Reserved
              </button>
              <button aria-pressed={overlays.fold} onClick={() => toggleOverlay('fold')}>
                Fold
              </button>
            </div>
          </div>
          <div className="control">
            <span>Present</span>
            <div className="seg">
              <button aria-pressed={modal === 'alert'} onClick={() => setModal((m) => (m === 'alert' ? null : 'alert'))}>
                Alert
              </button>
              <button aria-pressed={modal === 'sheet'} onClick={() => setModal((m) => (m === 'sheet' ? null : 'sheet'))}>
                Sheet
              </button>
            </div>
          </div>
          <div className="control">
            <span>Zoom</span>
            <div className="seg">
              <button aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
                Fit
              </button>
              <button aria-pressed={zoom === 'actual'} onClick={() => setZoom('actual')}>
                100%
              </button>
            </div>
          </div>
          <div className="control">
            <span>Appearance</span>
            <div className="seg">
              <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
                Light
              </button>
              <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
                Dark
              </button>
            </div>
          </div>
          <div className="control">
            <span>Direction</span>
            <div className="seg">
              <button aria-pressed={!rtl} onClick={() => setRtl(false)}>
                LTR
              </button>
              <button aria-pressed={rtl} onClick={() => setRtl(true)}>
                RTL
              </button>
            </div>
          </div>
        </div>
      </header>
      <div className="workspace">
        <main className="canvas">
          <DeviceFrame
            env={env}
            zoom={zoom}
            onResize={sel.free ? resizeFree : undefined}
            overlay={<Overlays env={env} layout={layout} show={overlays} />}
          >
            <div className="sample" data-theme={theme} style={{ position: 'absolute', inset: 0 }}>
              <Screen
                config={config}
                env={env}
                layout={layout}
                screen={screen}
                rtl={rtl}
                modal={modal}
                onCloseModal={() => setModal(null)}
                onCollisions={setCollisions}
              />
            </div>
          </DeviceFrame>
        </main>
        <aside className="sidebar">
          <Inspector config={config} env={env} layout={layout} screen={screen} collisions={collisions} modal={modal} rtl={rtl} />
          <WhatChanged entry={change} />
        </aside>
      </div>
    </div>
  );
}
