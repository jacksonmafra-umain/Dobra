// Brand choices that depend on state: which logo reads on the current theme, which icon a
// finding gets, and how each kind of fold is drawn.
import type { FoldFeature } from '@dobra/core/engine/folds';
import logoDark from '@dobra/brand/logo.svg';
import logoLight from '@dobra/brand/logo-light.svg';
import type { Theme } from './urlState';

/** logo.svg has light letters for dark backgrounds; logo-light.svg has dark letters. */
export function logoFor(theme: Theme): string {
  return theme === 'dark' ? logoDark : logoLight;
}

export type StatusKind = 'error' | 'warn' | 'info';

/** The icon for a finding's severity; anything unrecognised reads as information. */
export function statusIcon(severity: string): StatusKind {
  return severity === 'error' || severity === 'warn' ? severity : 'info';
}

/** The data-kind that colors a finding's line: red for errors, amber for warnings, plain for information. */
export function findingKind(severity: string): 'overfull' | 'text-in-vertical' | 'info' {
  const kind = statusIcon(severity);
  return kind === 'error' ? 'overfull' : kind === 'warn' ? 'text-in-vertical' : 'info';
}

/** A gap that hides content is a hinge (rose); a separating crease is a fold line (cyan); a flat crease stays dashed. */
export function foldOverlayClass(fold: Pick<FoldFeature, 'axis' | 'separating' | 'occludes'>): string {
  const kind = fold.occludes ? 'occludes' : fold.separating ? 'line' : 'flat';
  return `ov-fold ov-fold--${fold.axis} ov-fold--${kind}`;
}
