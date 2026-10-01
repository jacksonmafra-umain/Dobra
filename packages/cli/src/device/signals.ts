// What Chrome on the device says about the window and the fold, read in the page.
import type { FrameSignals } from '@dobra/core/signals';
import type { Page } from 'playwright';

export async function readSignals(page: Page, deviceState: FrameSignals['deviceState']): Promise<FrameSignals> {
  const s = await page.evaluate(() => {
    const vp = (window as unknown as { viewport?: { segments?: DOMRect[] } }).viewport;
    const posture = (navigator as unknown as { devicePosture?: { type?: string } }).devicePosture?.type;
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      devicePosture: posture === 'continuous' || posture === 'folded' ? posture : null,
      segments: vp?.segments ? [...vp.segments].map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })) : null,
      mq: {
        horizontalSegments2: matchMedia('(horizontal-viewport-segments: 2)').matches,
        verticalSegments2: matchMedia('(vertical-viewport-segments: 2)').matches,
        postureFolded: matchMedia('(device-posture: folded)').matches,
      },
    };
  });
  return { ...s, deviceState } as FrameSignals;
}
