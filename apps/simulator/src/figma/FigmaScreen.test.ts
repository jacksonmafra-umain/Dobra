import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FigmaScreen, type FigmaScreenProps } from './FigmaScreen';

const base: FigmaScreenProps = {
  frame: { id: '1:1', name: 'Home', page: 'Screens', width: 402, height: 874 },
  loaded: { image: 'https://img/1', geo: [{ id: 't', name: 'Title', role: 'text', rect: { x: 20, y: 40, width: 200, height: 30 } }] },
  windowWidth: 402,
  signedIn: true,
  onSignIn: () => {},
  onRemove: () => {},
  onRetry: () => {},
};
const html = (over: Partial<FigmaScreenProps>) => renderToStaticMarkup(createElement(FigmaScreen, { ...base, ...over }));

describe('FigmaScreen', () => {
  it('shows the image and an invisible hit box per important layer', () => {
    const out = html({});
    expect(out).toContain('class="figma-screen__image"');
    expect(out).toContain('src="https://img/1"');
    expect(out).toContain('class="figma-screen__hit"');
    expect(out).toContain('data-name="Title"');
    expect(out).not.toContain('figma-screen__banner');
  });
  it('scales hit boxes to the window and explains the scaling', () => {
    const out = html({ windowWidth: 201 });
    expect(out).toContain('left:10px;top:20px;width:100px;height:15px');
    expect(out).toContain('figma-screen__banner');
    expect(out).toMatch(/402 wide.*201/);
  });
  it('asks to sign in when there is no token', () => {
    expect(html({ signedIn: false, loaded: undefined })).toMatch(/Sign in to load/);
  });
  it('says loading, gone and unavailable', () => {
    expect(html({ loaded: undefined })).toMatch(/Loading/);
    expect(html({ loaded: { image: null, geo: null, reason: 'Figma returned no data for this frame.' } })).toMatch(/No longer in the file/);
    expect(html({ loaded: { image: null, geo: base.loaded!.geo, reason: 'Image unavailable: 500' } })).toMatch(/Image unavailable/);
  });

  it('shows a load error with Retry rather than calling the frame gone', () => {
    const out = html({ loaded: { image: null, geo: null, reason: 'Figma refused the token: check it is valid.' } });
    expect(out).not.toMatch(/No longer in the file/);
    expect(out).toMatch(/Figma refused the token/);
    expect(out).toContain('Retry');
  });
});
