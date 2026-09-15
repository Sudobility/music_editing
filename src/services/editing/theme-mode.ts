/**
 * The colour scheme to draw in, from the one a reader asked for.
 *
 * Both apps resolve `system` against the device, and both draw the canvas in
 * a scheme the CSS or native theme cannot tell it — VexFlow paints literal
 * colours — so the answer has to be one value that every surface reads. The
 * web resolved it inside `app/theme.ts` with the media query baked in; the
 * question of *how* to ask the device is the host's, the rule for what the
 * answer means is this.
 */
import type { ThemeMode } from '../../store/slices/ui-slice.js';

/** A scheme that can actually be drawn: never `system`. */
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export function resolveThemeMode(
  mode: ThemeMode,
  systemIsDark: boolean
): ResolvedThemeMode {
  if (mode === 'system') return systemIsDark ? 'dark' : 'light';
  return mode;
}
