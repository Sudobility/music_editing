/**
 * What a press on the score was: a tap, a long press, or a drag.
 *
 * Both apps answer this at the end of every press, and they answered it with
 * different numbers in different files — the web's `DRAG_THRESHOLD` inside the
 * notation view, the native app's `LONG_PRESS_MS`/`LONG_PRESS_SLOP` inside its
 * scrolling score. The question is what a press *means* — a tap, a menu, a
 * drag — so it lives here, beside `score-press.ts`, which answers what that
 * press then does. The hit-testing that says what lies under it stays with the
 * canvas, in music_drawing.
 *
 * ## Mouse and touch differ, on purpose
 *
 * A mouse is still: a click that moved more than 3px was meant to move, which
 * is exactly where the web's box select has always started. A finger is not —
 * a deliberate tap on a phone routinely lands several points from where it
 * touched down, and holding a finger to 3px would turn a good share of taps
 * into drags. So a touch gets `TOUCH_TAP_SLOP`, the same allowance a long press
 * already had: a press that stays put long enough to be a long press would
 * otherwise have been a *drag* had it been released a moment sooner, which is
 * not a distinction a thumb can make.
 *
 * A mouse never long-presses. It has a secondary button for the context menu,
 * and a click held while the reader looks at something is not a request for
 * one — reading it as one would change what an ordinary slow click does on the
 * web. React Native on macOS passes `'touch'`, because its gesture model is the
 * touch one: the long press is how it opens the menu.
 *
 * ## Distance
 *
 * Measured per axis (the larger of |dx| and |dy|), which is the web's existing
 * rule to the pixel. The native app used the straight-line distance; per axis
 * lets a diagonal wander up to √2 further, which is under five points at a
 * 12pt slop and not something a hand can aim at.
 *
 * The caller latches: once a press has classified as a drag it stays one even
 * if the pointer comes back, which is how the web's `drag.moved` behaves. This
 * function answers for one moment and keeps no state.
 */

import type { PointerKind, PressKind } from '@sudobility/music_types';

/** How far a mouse press may move and still be a click, in px (web). */
export const TAP_SLOP = 3;

/** How far a finger may move and still be a tap, in pt. */
export const TOUCH_TAP_SLOP = 12;

/** How long a press is held to be a long press — iOS's and Android's own threshold. */
export const LONG_PRESS_MS = 500;

/** How far a long press may wander — about a thumb's width. */
export const LONG_PRESS_SLOP = 12;

/** The tap slop for a pointer kind. */
export function tapSlopFor(pointer: PointerKind): number {
  return pointer === 'touch' ? TOUCH_TAP_SLOP : TAP_SLOP;
}

export type PressMeasure = {
  /** Movement since the press began, either sign. */
  dx: number;
  dy: number;
  /** How long the press has been (or was) held. */
  heldMs: number;
  /** Defaults to `'mouse'`, the web's rule. */
  pointer?: PointerKind;
};

/**
 * `'longPress'` if a touch was held `LONG_PRESS_MS` within `LONG_PRESS_SLOP`;
 * otherwise `'tap'` if it moved no more than the tap slop; otherwise `'drag'`.
 */
export function classifyPress({
  dx,
  dy,
  heldMs,
  pointer = 'mouse',
}: PressMeasure): PressKind {
  const moved = Math.max(Math.abs(dx), Math.abs(dy));
  if (
    pointer === 'touch' &&
    heldMs >= LONG_PRESS_MS &&
    moved <= LONG_PRESS_SLOP
  ) {
    return 'longPress';
  }
  return moved <= tapSlopFor(pointer) ? 'tap' : 'drag';
}
