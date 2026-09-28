import { describe, expect, it } from 'vitest';
import { safeAreaVars } from './FigmaStage';

describe('safeAreaVars', () => {
  // A Figma screen renders outside the sample Screen, so its host sets the insets its states pad by.
  it('turns the device safe area into the --sa-* variables the Figma states read', () => {
    expect(safeAreaVars({ top: 40, right: 0, bottom: 24, left: 12 })).toEqual({ '--sa-top': '40px', '--sa-right': '0px', '--sa-bottom': '24px', '--sa-left': '12px' });
  });
});
