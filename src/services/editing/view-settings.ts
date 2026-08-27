/**
 * How far a score may be zoomed, and the grids a quantize offers.
 *
 * Neither is a fact about a toolbar. The limits decide what a *layout* will be
 * asked to produce — below a quarter scale the staves stop being readable and
 * above four the system count makes scrolling useless — and the grid list is
 * the set of note values a performance can meaningfully be snapped to. Two
 * toolbars stating them separately is how the web and the native app come to
 * disagree about what 400% means.
 */
import type { DurationName } from '@sudobility/music_types';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/**
 * One press of zoom.
 *
 * A ratio rather than an increment, so a step out of 200% is the same visual
 * change as a step out of 50%.
 */
export const ZOOM_STEP = 1.25;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomIn(zoom: number): number {
  return clampZoom(zoom * ZOOM_STEP);
}

export function zoomOut(zoom: number): number {
  return clampZoom(zoom / ZOOM_STEP);
}

/**
 * The grids a quantize is offered on.
 *
 * Stops at a thirty-second: below that a grid is finer than the deviations a
 * human performance actually has, so snapping to it changes nothing while
 * looking like it did something.
 */
export const QUANTIZE_GRIDS = [
  'quarter',
  'eighth',
  'sixteenth',
  'thirtysecond',
] as const satisfies readonly DurationName[];

export type QuantizeGrid = (typeof QUANTIZE_GRIDS)[number];

/** The short label a grid is written as on a bar: `1/16`. */
export const QUANTIZE_GRID_SHORT: Record<QuantizeGrid, string> = {
  quarter: '1/4',
  eighth: '1/8',
  sixteenth: '1/16',
  thirtysecond: '1/32',
};
