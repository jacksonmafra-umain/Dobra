import { describe, expect, it } from 'vitest';
import { NAMESPACE, OVERLAY_NAME } from './presets';
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
    const inst = api.createInstance();
    inst.resize(120, 48);
    expect(roleOf(inst as never)).toBe('interactive');
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

  it('treats small or thin instances (icons, dividers) as decoration, and reads text inside instances', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    const icon = api.createInstance();
    icon.resize(24, 24);
    const divider = api.createInstance();
    divider.resize(411, 1);
    const card = api.createInstance();
    card.resize(141, 120);
    const label = api.createText();
    label.characters = 'A long description that wraps';
    card.appendChild(label);
    for (const n of [icon, divider, card]) frame.appendChild(n as never);
    const geo = await toGeo(frame as never);
    expect(geo.map((g) => g.role)).toEqual(['container', 'container', 'interactive']);
    expect(geo[2].children?.[0]).toMatchObject({ role: 'text', chars: 29 });
  });

  it('records clipping frames', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    const crop = api.createFrame();
    crop.clipsContent = true;
    frame.appendChild(crop);
    expect((await toGeo(frame as never))[0].clips).toBe(true);
  });

  it('follows a team\'s name words and the layers marked important or not important', async () => {
    const api = createFakeFigma();
    const frame = api.createFrame();
    frame.resize(1100, 756);
    const add = (name: string, parent = frame) => {
      const n = api.createFrame();
      n.name = name;
      n.resize(100, 50);
      parent.appendChild(n);
      return n;
    };
    add('Masthead');
    add('Chart').setSharedPluginData(NAMESPACE, 'importance', 'important');
    const decor = add('Decor');
    decor.setSharedPluginData(NAMESPACE, 'importance', 'ignore');
    add('Swirl button', decor);
    const geo = await toGeo(frame as never, undefined, 500, { controls: ['button'], chrome: ['masthead'] });
    expect(geo.map((g) => [g.name, g.role, g.important ?? false, g.ignore ?? false])).toEqual([
      ['Masthead', 'chrome', false, false],
      ['Chart', 'container', true, false],
      ['Decor', 'container', false, true],
    ]);
    expect(geo[2].children![0]).toMatchObject({ role: 'interactive', ignore: true });
  });
});
