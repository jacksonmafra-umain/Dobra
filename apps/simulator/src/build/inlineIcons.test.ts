import { describe, expect, it } from 'vitest';
import { inlineIconLinks } from './inlineIcons';

const html = [
  '<link rel="icon" type="image/svg+xml" href="./favicon-abc.svg" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="./favicon-32-def.png" />',
  '<link rel="stylesheet" href="./style.css" />',
].join('\n');

describe('inlineIconLinks', () => {
  it('turns each icon link into a data URL and names the files it used', () => {
    const out = inlineIconLinks(html, { 'favicon-abc.svg': '<svg/>', 'favicon-32-def.png': new Uint8Array([1, 2, 3]) });
    expect(out.html).toContain('href="data:image/svg+xml;base64,PHN2Zy8+"');
    expect(out.html).toContain('href="data:image/png;base64,AQID"');
    expect(out.html).toContain('href="./style.css"');
    expect(out.inlined.sort()).toEqual(['favicon-32-def.png', 'favicon-abc.svg']);
  });

  it('leaves a link alone when the file is not in the bundle', () => {
    expect(inlineIconLinks(html, {}).html).toBe(html);
  });
});
