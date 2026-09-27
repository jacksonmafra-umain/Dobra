import { useEffect, useMemo, useRef, useState } from 'react';
import { PLATFORMS, type SimulatorConfig } from '@hinge/core/config/types';
import { runLayoutChecks, targetOf } from '@hinge/core/engine/checks';
import { describeChanges, type Snapshot } from '@hinge/core/engine/diff';
import { findDevice, resolveEnvironment, type Selection } from '@hinge/core/engine/environment';
import { resolveLayout } from '@hinge/core/engine/layout';
import type { ModalKind } from '@hinge/core/engine/modal';
import type { TextSettings } from '@hinge/core/engine/typography';
import { collisionsToFindings } from '@hinge/core/collisions';
import type { Collision } from '../sample/collisions';
import type { Zoom } from './DeviceFrame';
import { Inspector } from './Inspector';
import { resolveMedia, type MediaOverrides } from './media';
import type { OverlayToggles } from './Overlays';
import { counterpartOf, counterpartSelection, parityRows, validCounterpart } from './parity';
import { ParityTable } from './ParityTable';
import { Stage } from './Stage';
import { clampFree, FREE_MAX, FREE_MIN, readUrlState, writeUrlState, type Theme } from './urlState';
import { WhatChanged, type ChangeEntry } from './WhatChanged';

const WINDOW_LABEL = { fullscreen: 'Full screen', split: 'Split', freeform: 'Desktop', popup: 'Pop-up', pip: 'PiP' } as const;

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
  const [text, setText] = useState<TextSettings>(initial.text);
  // Overrides stay when the device changes: a mouse on one tablet is a mouse on the next.
  const [mediaOverrides, setMediaOverrides] = useState<MediaOverrides>(initial.media);
  const [change, setChange] = useState<ChangeEntry | null>(null);
  const [vsId, setVsId] = useState(() => validCounterpart(config, initial.selection.deviceId, initial.vs));
  const [collisionsB, setCollisionsB] = useState<Collision[]>([]);

  const devices = config.devices.filter((d) => d.enabled);
  const screens = config.screens.filter((s) => s.enabled);
  const screen = screens.find((s) => s.id === screenId) ?? screens[0];
  const device = findDevice(config, sel.deviceId);
  const displayIds = Object.keys(device.displays);
  const env = resolveEnvironment(config, sel);
  const layout = resolveLayout(config, env, screen);
  const target = targetOf(sel, env);
  const media = resolveMedia(device, env, mediaOverrides);
  const findings = [...runLayoutChecks(config, env, layout, screen, target), ...collisionsToFindings(collisions, target, env)];

  // Comparing platforms: the counterpart follows side A's screen, state and orientation.
  // A counterpart left on the same platform after a device change is replaced by the nearest peer.
  const vs = vsId && !env.isFree ? (validCounterpart(config, sel.deviceId, vsId) ?? counterpartOf(config, device).id) : undefined;
  const selB = vs ? counterpartSelection(config, sel, vs, env.orientation) : null;
  const envB = selB ? resolveEnvironment(config, selB) : null;
  const layoutB = envB ? resolveLayout(config, envB, screen) : null;
  const findingsB =
    selB && envB && layoutB
      ? [...runLayoutChecks(config, envB, layoutB, screen, targetOf(selB, envB)), ...collisionsToFindings(collisionsB, targetOf(selB, envB), envB)]
      : [];

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
      history.replaceState(null, '', writeUrlState({ selection: sel, screenId: screen.id, theme, zoom, rtl, overlays, text, media: mediaOverrides, vs }, env, device));
    } catch {
      // Sandboxed previews can refuse history access.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, env.orientation, screen.id, theme, zoom, rtl, overlays, text, mediaOverrides, vs]);

  const toggleOverlay = (key: keyof OverlayToggles) => setOverlays((o) => ({ ...o, [key]: !o[key] }));
  const resizeFree = (w: number, h: number) => setSel((s) => ({ ...s, free: clampFree(w, h) }));
  const onOuter = env.pose?.display === 'outer';
  // The first pose is the closed one; "open" is the first pose on another display.
  const closedPose = env.poses[0];
  const openPose = env.poses.find((p) => p.display !== closedPose?.display);
  const isClosed = !!closedPose && env.pose?.display === closedPose.display;

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
          <div className="control" hidden={!!sel.free}>
            <span>Compare platforms</span>
            <div className="seg">
              <button aria-pressed={!!vs} onClick={() => setVsId(vs ? undefined : counterpartOf(config, device).id)}>
                {vs ? 'On' : 'Off'}
              </button>
              {vs && (
                <select aria-label="Compare with" value={vs} onChange={(e) => setVsId(e.target.value)}>
                  {devices
                    .filter((d) => d.platform !== device.platform)
                    .map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>
          {env.poses.length > 0 ? (
            <>
              <div className="control">
                <span>{env.platform === 'android' ? 'Posture' : 'Pose'}</span>
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
                  onClick={() => setSel((s) => ({ ...s, pose: (isClosed ? openPose : closedPose)?.id }))}
                >
                  {isClosed ? 'Open device' : 'Close device'}
                </button>
              </div>
              <div className="control" hidden={env.platform !== 'ios'}>
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
                      disabled={!!env.android?.rotationLocked && (env.android?.rotation ?? 0) !== r}
                      onClick={() => setSel((s) => ({ ...s, rotation: r }))}
                      title={env.android?.rotationLocked ? 'Fixed by the posture or display' : r === 0 ? 'Natural orientation of the display' : 'Rotated 90° from natural'}
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
              <div className="control">
                <span>Window</span>
                <div className="seg">
                  {(['fullscreen', 'split', 'freeform', 'popup', 'pip'] as const).map((m) => (
                    <button
                      aria-pressed={env.window.mode === m}
                      disabled={device.platform !== 'android' || !device.windowModes.includes(m)}
                      onClick={() => setSel((s) => ({ ...s, windowMode: m }))}
                      key={m}
                    >
                      {WINDOW_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              {env.window.mode === 'split' && (
                <div className="control">
                  <span>Split</span>
                  <div className="seg">
                    {config.platforms.android.windowModes.split.ratios.map((r) => (
                      <button aria-pressed={(sel.splitRatio ?? 0.5) === r} onClick={() => setSel((s) => ({ ...s, splitRatio: r }))} key={r}>
                        {Math.round(r * 100)}%
                      </button>
                    ))}
                    <button onClick={() => setSel((s) => ({ ...s, splitSide: s.splitSide === 'secondary' ? 'primary' : 'secondary' }))}>
                      {sel.splitSide === 'secondary' ? 'Other half' : 'This half'}
                    </button>
                  </div>
                </div>
              )}
              <label className="control">
                <span>Display size</span>
                <select value={sel.displayScale ?? 'default'} onChange={(e) => setSel((s) => ({ ...s, displayScale: e.target.value }))}>
                  {config.platforms.android.displaySize.steps.map((st) => (
                    <option value={st.id} key={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="control">
                <span>App</span>
                <div className="seg">
                  <button aria-pressed={!!sel.rotationLock} onClick={() => setSel((s) => ({ ...s, rotationLock: !s.rotationLock }))}>
                    Rotation lock
                  </button>
                  <button aria-pressed={!!sel.appPortrait} onClick={() => setSel((s) => ({ ...s, appPortrait: !s.appPortrait }))}>
                    Portrait only
                  </button>
                  <button
                    aria-pressed={(sel.targetSdk ?? config.app.android.targetSdk) >= 36}
                    onClick={() => setSel((s) => ({ ...s, targetSdk: (s.targetSdk ?? config.app.android.targetSdk) >= 36 ? 35 : 36 }))}
                  >
                    targetSdk {(sel.targetSdk ?? config.app.android.targetSdk) >= 36 ? 36 : 35}
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
            <span>Text size · {env.typeUnit}</span>
            <div className="free-resize">
              <input
                type="range"
                min={config.platforms[env.platform].fontScale?.min ?? 1}
                max={config.platforms[env.platform].fontScale?.max ?? 2}
                step={config.platforms[env.platform].fontScale?.step ?? 0.05}
                value={text.fontScale}
                onChange={(e) => setText((t) => ({ ...t, fontScale: Number(e.target.value) }))}
                aria-label="Font scale"
              />
              <span className="tnum">{text.fontScale.toFixed(2)}×</span>
              <button className="seg-single" onClick={() => setText((t) => ({ ...t, fontScale: config.platforms[env.platform].fontScale?.max ?? 2 }))}>
                Large text
              </button>
            </div>
          </div>
          <div className="control">
            <span>Accessibility</span>
            <div className="seg">
              <button aria-pressed={text.bold} onClick={() => setText((t) => ({ ...t, bold: !t.bold }))}>
                Bold text
              </button>
              <button aria-pressed={text.reducedMotion} onClick={() => setText((t) => ({ ...t, reducedMotion: !t.reducedMotion }))}>
                Reduced motion
              </button>
            </div>
          </div>
          <div className="control">
            <span>Keyboard</span>
            <button className="seg-single" aria-pressed={!!sel.ime} onClick={() => setSel((s) => ({ ...s, ime: !s.ime }))}>
              {sel.ime ? 'Shown' : 'Hidden'}
            </button>
          </div>
          <div className="control">
            <span>Pointer</span>
            <div className="seg">
              {(['coarse', 'fine'] as const).map((v) => (
                <button key={v} aria-pressed={media.pointer === v} onClick={() => setMediaOverrides((o) => ({ ...o, pointer: v }))}>
                  {v === 'coarse' ? 'Coarse' : 'Fine'}
                </button>
              ))}
            </div>
          </div>
          <div className="control">
            <span>Keyboard kind</span>
            <div className="seg">
              {(['virtual', 'physical'] as const).map((v) => (
                <button key={v} aria-pressed={media.keyboard === v} onClick={() => setMediaOverrides((o) => ({ ...o, keyboard: v }))}>
                  {v === 'virtual' ? 'Virtual' : 'Physical'}
                </button>
              ))}
            </div>
          </div>
          <div className="control">
            <span>Distance</span>
            <div className="seg">
              {(['near', 'medium', 'far'] as const).map((v) => (
                <button key={v} aria-pressed={media.viewingDistance === v} onClick={() => setMediaOverrides((o) => ({ ...o, viewingDistance: v }))}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="control">
            <span>Sensors</span>
            <div className="seg">
              <button aria-pressed={media.hasCamera} onClick={() => setMediaOverrides((o) => ({ ...o, hasCamera: !media.hasCamera }))}>
                Camera
              </button>
              <button aria-pressed={media.hasMicrophone} onClick={() => setMediaOverrides((o) => ({ ...o, hasMicrophone: !media.hasMicrophone }))}>
                Mic
              </button>
            </div>
          </div>
          {media.overridden.length > 0 && (
            <div className="control">
              <span>Media</span>
              <button className="seg-single" onClick={() => setMediaOverrides({})}>
                Reset
              </button>
            </div>
          )}
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
        {selB && envB && layoutB ? (
          <main className="canvas canvas--parity">
            <section className="parity-side" aria-label={env.deviceName}>
              <h2 className="parity-side__title">{env.deviceName}</h2>
              <div className="parity-side__stage">
              <Stage
                config={config}
                env={env}
                layout={layout}
                screen={screen}
                theme={theme}
                zoom={zoom}
                rtl={rtl}
                overlays={overlays}
                text={text}
                modal={modal}
                onCloseModal={() => setModal(null)}
                onCollisions={setCollisions}
                onResize={sel.free ? resizeFree : undefined}
                onResizeWindow={
                  env.window.mode === 'freeform'
                    ? (w, h) => setSel((s) => ({ ...s, windowSize: { width: Math.round(w), height: Math.round(h) } }))
                    : undefined
                }
              />
              </div>
            </section>
            <section className="parity-side" aria-label={envB.deviceName}>
              <h2 className="parity-side__title">{envB.deviceName}</h2>
              <div className="parity-side__stage">
                <Stage
                  config={config}
                  env={envB}
                  layout={layoutB}
                  screen={screen}
                  theme={theme}
                  zoom={zoom}
                  rtl={rtl}
                  overlays={overlays}
                  text={text}
                  modal={modal}
                  onCloseModal={() => setModal(null)}
                  onCollisions={setCollisionsB}
                />
              </div>
            </section>
            <ParityTable
              a={env.deviceName}
              b={envB.deviceName}
              rows={parityRows({ env, layout, findings }, { env: envB, layout: layoutB, findings: findingsB })}
            />
          </main>
        ) : (
          <main className="canvas">
          <Stage
            config={config}
            env={env}
            layout={layout}
            screen={screen}
            theme={theme}
            zoom={zoom}
            rtl={rtl}
            overlays={overlays}
            text={text}
            modal={modal}
            onCloseModal={() => setModal(null)}
            onCollisions={setCollisions}
            onResize={sel.free ? resizeFree : undefined}
            onResizeWindow={
              env.window.mode === 'freeform'
                ? (w, h) => setSel((s) => ({ ...s, windowSize: { width: Math.round(w), height: Math.round(h) } }))
                : undefined
            }
          />
          </main>
        )}
        <aside className="sidebar">
          <Inspector
            config={config}
            env={env}
            layout={layout}
            screen={screen}
            collisions={collisions}
            findings={findings}
            modal={modal}
            rtl={rtl}
            media={media}
          />
          <WhatChanged entry={change} />
        </aside>
      </div>
    </div>
  );
}
