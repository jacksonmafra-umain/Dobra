// Brand choices that depend on state: which logo reads on the current theme.
import logoDark from '@dobra/brand/logo.svg';
import logoLight from '@dobra/brand/logo-light.svg';
import type { Theme } from './urlState';

/** logo.svg has light letters for dark backgrounds; logo-light.svg has dark letters. */
export function logoFor(theme: Theme): string {
  return theme === 'dark' ? logoDark : logoLight;
}
