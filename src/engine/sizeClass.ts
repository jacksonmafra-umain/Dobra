import type { AndroidProfile, SizeClassValue } from '../config/types';

/** A size class in the vocabulary of the platform it came from. */
export type SizeClass =
  | { system: 'uikit'; horizontal: SizeClassValue; vertical: SizeClassValue; estimated?: boolean }
  | { system: 'window'; width: string; height: string };

/** androidx.window WindowSizeClass: the largest breakpoint the window reaches, per axis. */
export function windowSizeClass(profile: AndroidProfile, width: number, height: number): SizeClass {
  const pick = (list: AndroidProfile['sizeClasses']['width'], value: number) =>
    [...list].reverse().find((b) => value >= b.min)?.id ?? list[0].id;
  return { system: 'window', width: pick(profile.sizeClasses.width, width), height: pick(profile.sizeClasses.height, height) };
}

export function formatSizeClass(sc: SizeClass, profile?: AndroidProfile): string {
  if (sc.system === 'uikit') return `w${cap(sc.horizontal)} · h${cap(sc.vertical)}`;
  const label = (list: AndroidProfile['sizeClasses']['width'] | undefined, id: string) =>
    list?.find((b) => b.id === id)?.label ?? cap(id);
  return `Width ${label(profile?.sizeClasses.width, sc.width)} · Height ${label(profile?.sizeClasses.height, sc.height)}`;
}

export function sameSizeClass(a: SizeClass, b: SizeClass): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
