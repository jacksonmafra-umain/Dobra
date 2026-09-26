import { describe, expect, it } from 'vitest';
import { OVERLAY_NAME } from './presets';
import { roleOf, toGeo } from './geo';
import { createFakeFigma } from './test/fakeFigma';

describe('toGeo', () => {
  it('maps text, chrome and containers with frame-relative rects, skipping the overlay', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    frame.resize(400, 800);
    frame.x = 1000;
    const bar = api.createFrame();
    bar.name = 'Bottom navigation';
    bar.resize(400, 80);
    frame.appendChild(bar);
    bar.y = 720;
    const title = api.createText();
    title.characters = 'Welcome back to your account';
    title.fontSize = 24;
    frame.appendChild(title as never);
    title.x = 16;
    title.y = 40;
    const overlay = api.createFrame();
    overlay.name = OVERLAY_NAME;
    frame.appendChild(overlay);
    const geo = await toGeo(frame as never);
    expect(geo.map((g) => [g.name, g.role])).toEqual([
      ['Bottom navigation', 'chrome'],
      [title.name, 'text'],
    ]);
    expect(geo[1]).toMatchObject({ rect: { x: 16, y: 40 }, fontSize: 24, chars: 28 });
  });

  it('treats instances and button-like names as interactive', () => {
    const api = createFakeFigma();
    const btn = api.createFrame();
    btn.name = 'Primary CTA';
    expect(roleOf(btn as never)).toBe('interactive');
    expect(roleOf(api.createInstance() as never)).toBe('interactive');
  });

  it('reads scrolling and auto-layout direction', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    const list = api.createFrame();
    list.overflowDirection = 'VERTICAL';
    list.layoutMode = 'HORIZONTAL';
    frame.appendChild(list);
    expect((await toGeo(frame as never))[0]).toMatchObject({ scrollAxis: 'y', layout: 'horizontal' });
  });

  it('skips hidden layers and yields on big trees', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    const hidden = api.createFrame();
    hidden.visible = false;
    frame.appendChild(hidden);
    for (let i = 0; i < 2000; i++) frame.appendChild(api.createRectangle());
    let progress = 0;
    const geo = await toGeo(frame as never, () => progress++, 500);
    expect(geo.find((g) => g.id === hidden.id)).toBeUndefined();
    expect(progress).toBeGreaterThanOrEqual(4);
  });
});
